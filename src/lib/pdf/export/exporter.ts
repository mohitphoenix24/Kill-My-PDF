/**
 * Original PDF bytes + edited document model → new PDF bytes.
 *
 * The export never flattens or rasterises anything. For each changed text
 * element it picks the most faithful strategy that is known to be correct:
 *
 *  in-place          The string operand is rewritten in the original operator,
 *                    in the original font. Everything else (position, clipping,
 *                    transparency, z-order, tagging) is untouched. Used when only
 *                    the text changed and the original font can draw it.
 *  redraw-original   The original operator is neutralised and the text is drawn
 *                    again with the *original* font at the new position/size/colour.
 *  redraw-substitute As above, with a substitute font, when the original font
 *                    cannot draw the new characters (e.g. a subset font).
 *  removed           The text was cleared.
 *
 * "Neutralised" means the show-text operator is replaced by a TJ kerning number of
 * exactly the same advance, so any text that continues after it on the same line
 * keeps its position — and the old text is really gone from the file, not hidden
 * under a white box.
 */
import { PDFArray, PDFDocument, PDFName, PDFRef, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DocumentModel, FontInfo, TextElement, TextRun } from "@/lib/model/types";
import { changedElements, changesOf } from "@/lib/editor/operations";
import {
  type ContentOperation,
  applyByteEdits,
  asciiBytes,
  hexStringToken,
  parseContentStream,
} from "@/lib/pdf/content/parser";
import { type EncodedText, encodeWithFont } from "@/lib/pdf/fonts/encoding";
import { type SubstituteFont, chooseSubstituteFont } from "@/lib/pdf/fonts/substitute";
import { readPageContent } from "@/lib/pdf/pdflib/objects";
import { PdfUserError } from "@/lib/pdf/errors";

export type ExportStrategy = "in-place" | "redraw-original" | "redraw-substitute" | "removed";

export interface ElementExportReport {
  elementId: string;
  pageNumber: number;
  strategy: ExportStrategy;
  /** Font the new text is drawn with. */
  fontName?: string;
  /** Final advance width of the new text, in the element's local units (ems). */
  width: number;
  notes: string[];
}

export interface ExportResult {
  bytes: Uint8Array;
  reports: ElementExportReport[];
}

/** Loads a bundled font file (e.g. "DejaVuSans.ttf"). */
export type FontFileLoader = (file: string) => Promise<Uint8Array>;

export interface ExportInput {
  originalBytes: Uint8Array;
  model: DocumentModel;
  loadFontFile: FontFileLoader;
}

interface ByteEdit {
  start: number;
  end: number;
  bytes: Uint8Array;
}

export async function exportPdf(input: ExportInput): Promise<ExportResult> {
  try {
    return await runExport(input);
  } catch (error) {
    if (error instanceof PdfUserError) throw error;
    throw new PdfUserError("export-failed", "The edited PDF could not be created.", { cause: error });
  }
}

async function runExport({ originalBytes, model, loadFontFile }: ExportInput): Promise<ExportResult> {
  const doc = await PDFDocument.load(originalBytes.slice(), { updateMetadata: false, ignoreEncryption: false });
  doc.registerFontkit(fontkit);
  const reports: ElementExportReport[] = [];
  const fontCache = new Map<string, PDFFont>();

  const byPage = new Map<number, TextElement[]>();
  for (const element of changedElements(model)) {
    if (!element.editability.allowed || element.source.context !== "page") continue;
    const list = byPage.get(element.pageNumber) ?? [];
    list.push(element);
    byPage.set(element.pageNumber, list);
  }

  const replacedStreams: PDFRef[] = [];
  for (const [pageNumber, elements] of byPage) {
    const page = doc.getPage(pageNumber - 1);
    const content = readPageContent(page);
    const { operations } = parseContentStream(content.bytes);
    const edits: ByteEdit[] = [];
    const appended: string[] = [];

    for (const element of elements) {
      for (const run of element.source.runs) assertRunMatches(run, operations, element.id);
      const font = element.fontKey ? model.fonts[element.fontKey] : undefined;
      const report = await exportElement(element, font, operations, edits, appended, {
        doc,
        page,
        fontCache,
        loadFontFile,
      });
      reports.push(report);
    }

    const body = applyByteEdits(content.bytes, edits);
    // Wrap the original content in q/Q so the appended drawing starts from the
    // default graphics state regardless of what the original content left behind.
    const prefix = asciiBytes("q\n");
    const suffix = asciiBytes(`\nQ\n${appended.join("\n")}\n`);
    const combined = new Uint8Array(prefix.length + body.length + suffix.length);
    combined.set(prefix, 0);
    combined.set(body, prefix.length);
    combined.set(suffix, prefix.length + body.length);

    page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.flateStream(combined)));
    replacedStreams.push(...content.streamRefs);
  }

  removeUnreferencedStreams(doc, replacedStreams);
  const bytes = await doc.save();
  return { bytes, reports };
}

/** The analyser and exporter read the same bytes; refuse to edit if they ever disagree. */
function assertRunMatches(run: TextRun, operations: ContentOperation[], elementId: string): void {
  const op = operations[run.opIndex];
  if (!op || op.operator !== run.operator || op.start !== run.opStart || op.end !== run.opEnd) {
    throw new PdfUserError(
      "export-failed",
      "The PDF content changed unexpectedly during export, so no changes were written.",
      { cause: new Error(`Run mismatch for ${elementId}`) },
    );
  }
}

interface ExportContext {
  doc: PDFDocument;
  page: PDFPage;
  fontCache: Map<string, PDFFont>;
  loadFontFile: FontFileLoader;
}

async function exportElement(
  element: TextElement,
  font: FontInfo | undefined,
  operations: ContentOperation[],
  edits: ByteEdit[],
  appended: string[],
  ctx: ExportContext,
): Promise<ElementExportReport> {
  const changes = changesOf(element);
  const ts = element.source.textState;
  const base = { elementId: element.id, pageNumber: element.pageNumber };
  const notes: string[] = [];

  if (element.content === "") {
    for (const run of element.source.runs) edits.push(neutralize(run, operations, ts));
    return { ...base, strategy: "removed", width: 0, notes };
  }

  const encoded = font ? encodeWithFont(font, element.content) : undefined;
  const ownFontUsable = encoded?.ok === true && font!.subtype !== "Type3";

  // 1. In place: only the text changed and the original font has every glyph.
  if (ownFontUsable && !changes.geometry && !changes.color) {
    const value = (encoded as { ok: true; value: EncodedText }).value;
    const [first, ...rest] = element.source.runs;
    edits.push({ start: first.start, end: first.end, bytes: asciiBytes(hexStringToken(value.bytes)) });
    for (const run of rest) edits.push({ start: run.start, end: run.end, bytes: asciiBytes("<>") });
    return { ...base, strategy: "in-place", fontName: font!.displayName, width: widthOf(value, ts), notes };
  }

  // 2/3. Redraw: remove the original glyphs, then draw the text again.
  for (const run of element.source.runs) edits.push(neutralize(run, operations, ts));

  const color = element.style.color;
  if (!color) notes.push("The original colour couldn't be determined, so black was used.");
  const fill = hexToRgbOperands(color ?? "#000000");
  const stroked = [1, 2, 5, 6].includes(ts.renderMode);
  const colorOps = `${fill} rg${stroked ? ` ${fill} RG` : ""}`;
  const renderOp = ts.renderMode !== 0 && ts.renderMode !== 3 ? ` ${ts.renderMode} Tr` : "";
  // Font size is folded into the text matrix (Tf size 1), so spacing is expressed in ems.
  const tc = ts.fontSize ? ts.charSpacing / ts.fontSize : 0;
  const tw = ts.fontSize ? ts.wordSpacing / ts.fontSize : 0;
  const tm = element.matrix.map(fmt).join(" ");

  if (ownFontUsable) {
    const value = (encoded as { ok: true; value: EncodedText }).value;
    const resource = PDFName.of(element.source.fontResource).toString();
    appended.push(
      `q BT ${colorOps}${renderOp} ${resource} 1 Tf ${fmt(tc)} Tc ${fmt(tw)} Tw ${tm} Tm ${hexStringToken(value.bytes)} Tj ET Q`,
    );
    return { ...base, strategy: "redraw-original", fontName: font!.displayName, width: widthOf(value, ts), notes };
  }

  const substitute = chooseSubstituteFont(font, element.style, element.content);
  const pdfFont = await embedSubstitute(substitute, ctx);
  const key = ctx.page.node.newFontDictionary(substitute.name, pdfFont.ref);
  const hex = pdfFont.encodeText(element.content).toString();
  const chars = Array.from(element.content);
  // Word spacing only applies to single-byte code 32 — i.e. the standard fonts here.
  const spaces = substitute.kind === "standard" ? chars.filter((c) => c === " ").length : 0;
  const width = pdfFont.widthOfTextAtSize(element.content, 1) + chars.length * tc + spaces * tw;
  appended.push(
    `q BT ${colorOps}${renderOp} ${key.toString()} 1 Tf ${fmt(tc)} Tc ${fmt(substitute.kind === "standard" ? tw : 0)} Tw ${tm} Tm ${hex} Tj ET Q`,
  );
  const missing = encoded && !encoded.ok ? encoded.missing : undefined;
  notes.push(
    font
      ? `"${font.displayName}" can't draw ${missing ? `"${missing}"` : "this text"}${font.subset ? " (it is embedded as a subset)" : ""}, so ${substitute.name} was used.`
      : `The original font is unavailable, so ${substitute.name} was used.`,
  );
  return { ...base, strategy: "redraw-substitute", fontName: substitute.name, width, notes };
}

function widthOf(value: EncodedText, ts: TextElement["source"]["textState"]): number {
  if (!ts.fontSize) return value.glyphWidth;
  return value.glyphWidth + (value.charCount * ts.charSpacing + value.wordSpaceCount * ts.wordSpacing) / ts.fontSize;
}

async function embedSubstitute(sub: SubstituteFont, ctx: ExportContext): Promise<PDFFont> {
  const cacheKey = sub.kind === "standard" ? `std:${sub.name}` : `file:${sub.file}`;
  let font = ctx.fontCache.get(cacheKey);
  if (!font) {
    font =
      sub.kind === "standard"
        ? await ctx.doc.embedFont(sub.name)
        : await ctx.doc.embedFont(await ctx.loadFontFile(sub.file), { subset: true });
    ctx.fontCache.set(cacheKey, font);
  }
  return font;
}

/**
 * Replaces a run with a kerning-only TJ of the same advance: the glyphs disappear
 * from the file, while anything drawn after it in the same text object stays put.
 */
function neutralize(
  run: TextRun,
  operations: ContentOperation[],
  ts: TextElement["source"]["textState"],
): ByteEdit {
  const scale = ts.fontSize * ts.horizontalScaling;
  const kern = scale !== 0 ? fmt((-run.advance * 1000) / scale) : "0";
  switch (run.operator) {
    case "TJ":
      return { start: run.start, end: run.end, bytes: asciiBytes(kern) };
    case "Tj":
      return { start: run.opStart, end: run.opEnd, bytes: asciiBytes(`[${kern}] TJ`) };
    case "'":
      return { start: run.opStart, end: run.opEnd, bytes: asciiBytes(`T* [${kern}] TJ`) };
    case '"': {
      const [aw, ac] = operations[run.opIndex].operands;
      const num = (o: typeof aw) => (o?.kind === "number" ? fmt(o.value) : "0");
      return { start: run.opStart, end: run.opEnd, bytes: asciiBytes(`${num(aw)} Tw ${num(ac)} Tc T* [${kern}] TJ`) };
    }
  }
}

/** Deletes replaced content streams that no other page uses, so old text doesn't linger in the file. */
function removeUnreferencedStreams(doc: PDFDocument, refs: PDFRef[]): void {
  if (refs.length === 0) return;
  const stillUsed = new Set<string>();
  for (const page of doc.getPages()) {
    const contents = page.node.get(PDFName.of("Contents"));
    const list = contents instanceof PDFRef ? [contents, doc.context.lookup(contents)] : [contents];
    for (const item of list) {
      if (item instanceof PDFRef) stillUsed.add(item.toString());
      if (item instanceof PDFArray) item.asArray().forEach((r) => r instanceof PDFRef && stillUsed.add(r.toString()));
    }
  }
  for (const ref of refs) if (!stillUsed.has(ref.toString())) doc.context.delete(ref);
}

function hexToRgbOperands(hex: string): string {
  const v = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "000000";
  return [0, 2, 4].map((i) => fmt(parseInt(v.slice(i, i + 2), 16) / 255)).join(" ");
}

/** PDF number formatting: no exponent notation, at most 6 decimals. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const s = n.toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}
