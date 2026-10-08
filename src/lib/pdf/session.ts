/**
 * A loaded PDF: the immutable original bytes, a pdf.js document (rendering and
 * glyph data) and a pdf-lib document (content-stream access), plus lazy, cached
 * page analysis that produces the document model.
 */
import { PDFDocument, PDFRef, type PDFDict } from "pdf-lib";
import {
  type Matrix,
  IDENTITY,
  axisScales,
  boundsOfPoints,
  multiply,
  rotationDegrees,
  transformRectCorners,
} from "@/lib/geometry/matrix";
import type { Capability, DocumentModel, FontInfo, ImageElement, PDFElement, PDFPage } from "@/lib/model/types";
import { parseContentStream } from "@/lib/pdf/content/parser";
import { readFontInfo } from "@/lib/pdf/fonts/fontInfo";
import { pageResources, readPageContent, refKey } from "@/lib/pdf/pdflib/objects";
import { type PdfjsFontProps, getFontProps, getShowTextEntries } from "@/lib/pdf/pdfjs/operatorGlyphs";
import { type PDFDocumentProxy, type PDFPageProxy, type TextItem, OPS, openWithPdfjs } from "@/lib/pdf/pdfjs/pdfjs";
import { MAX_FILE_BYTES, PdfUserError, toLoadError } from "./errors";
import { classifyPage, imageBounds } from "./analysis/classify";
import { buildTextElement, groupRuns } from "./analysis/grouping";
import { CorrelationError, type FontResolver, interpretPage } from "./analysis/interpreter";

export const SCANNED_PDF_MESSAGE =
  "This PDF does not contain editable native text. Scanned PDFs are not currently supported.";

class FontCatalog implements FontResolver {
  readonly fonts: Record<string, FontInfo> = {};
  private direct = 0;
  private readonly spaceGaps = new Map<string, number[]>();

  /** Notes one measured word gap; the font's space width becomes the median of what's been seen. */
  recordSpaceGap(key: string, gapEm: number): void {
    const font = this.fonts[key];
    if (!font || gapEm > 0.6) return; // very wide gaps are justification or columns, not a space
    const samples = this.spaceGaps.get(key) ?? [];
    if (samples.length < 400) samples.push(gapEm);
    this.spaceGaps.set(key, samples);
    const sorted = samples.slice().sort((a, b) => a - b);
    font.spaceWidth = Math.round(sorted[Math.floor(sorted.length / 2)] * 1000) / 1000;
  }

  constructor(private readonly doc: PDFDocument) {}

  resolve(fontDict: PDFDict, ref: PDFRef | undefined, resourceName: string): FontInfo {
    const key = ref ? refKey(ref) : `direct:${resourceName}:${this.direct++}`;
    return (this.fonts[key] ??= readFontInfo(this.doc.context, fontDict, key));
  }

  snapshot(): Record<string, FontInfo> {
    const copy: Record<string, FontInfo> = {};
    for (const [k, f] of Object.entries(this.fonts)) copy[k] = { ...f, glyphs: { ...f.glyphs } };
    return copy;
  }
}

export class PdfSession {
  private readonly catalog: FontCatalog | undefined;
  private readonly analyses = new Map<number, Promise<PDFPage>>();

  private constructor(
    readonly id: string,
    readonly fileName: string,
    /** The uploaded file. Never modified; every export starts again from these bytes. */
    readonly originalBytes: Uint8Array,
    readonly pdfjs: PDFDocumentProxy,
    private readonly pdfLib: PDFDocument | undefined,
    readonly editing: Capability,
  ) {
    this.catalog = pdfLib ? new FontCatalog(pdfLib) : undefined;
  }

  static async open(fileName: string, bytes: Uint8Array): Promise<PdfSession> {
    if (bytes.length === 0) throw new PdfUserError("empty", "This file is empty.");
    if (bytes.length > MAX_FILE_BYTES) {
      throw new PdfUserError(
        "too-large",
        `This PDF is ${(bytes.length / 1024 / 1024).toFixed(0)} MB. Files up to ${MAX_FILE_BYTES / 1024 / 1024} MB are supported.`,
      );
    }
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
    if (!head.includes("%PDF-")) {
      throw new PdfUserError("not-a-pdf", "This file is not a PDF.");
    }

    const original = bytes.slice();
    let pdfjsDoc: PDFDocumentProxy;
    try {
      pdfjsDoc = await openWithPdfjs(original);
    } catch (error) {
      throw toLoadError(error);
    }

    let pdfLib: PDFDocument | undefined;
    let editing: Capability = { allowed: true };
    try {
      pdfLib = await PDFDocument.load(original.slice(), {
        ignoreEncryption: true,
        updateMetadata: false,
        throwOnInvalidObject: false,
      });
      if (pdfLib.isEncrypted) {
        pdfLib = undefined;
        editing = { allowed: false, reason: "This PDF is encrypted. You can view it, but editing encrypted PDFs isn't supported." };
      }
    } catch {
      editing = {
        allowed: false,
        reason: "This PDF's internal structure couldn't be read for editing. You can still view it.",
      };
    }
    return new PdfSession(crypto.randomUUID(), fileName, original, pdfjsDoc, pdfLib, editing);
  }

  get pageCount(): number {
    return this.pdfjs.numPages;
  }

  /** Model with page geometry filled in and every page pending analysis. */
  async createModel(): Promise<DocumentModel> {
    const pages: PDFPage[] = [];
    for (let n = 1; n <= this.pageCount; n++) {
      const page = await this.pdfjs.getPage(n);
      pages.push(pendingPage(page));
    }
    return {
      id: this.id,
      fileName: this.fileName,
      pageCount: this.pageCount,
      pages,
      fonts: {},
      editing: this.editing,
    };
  }

  fontsSnapshot(): Record<string, FontInfo> {
    return this.catalog?.snapshot() ?? {};
  }

  /** Analyses a page once; concurrent and repeated calls share the result. */
  analyzePage(pageNumber: number): Promise<PDFPage> {
    let pending = this.analyses.get(pageNumber);
    if (!pending) {
      pending = this.runAnalysis(pageNumber).catch(async () => {
        const page = await this.pdfjs.getPage(pageNumber);
        return { ...pendingPage(page), status: "error" as const, error: "This page could not be analysed." };
      });
      this.analyses.set(pageNumber, pending);
    }
    return pending;
  }

  private async runAnalysis(pageNumber: number): Promise<PDFPage> {
    const pdfjsPage = await this.pdfjs.getPage(pageNumber);
    const base = pendingPage(pdfjsPage);
    const notices: string[] = [];
    let elements: PDFElement[];

    if (this.pdfLib && this.catalog) {
      try {
        elements = await this.analyzeContentStream(pdfjsPage, pageNumber, notices);
      } catch (error) {
        if (!(error instanceof CorrelationError)) console.warn(`Page ${pageNumber}: analysis failed`, error);
        notices.push("Text on this page couldn't be matched reliably to the PDF's content, so it is shown read-only.");
        elements = await readOnlyTextElements(pdfjsPage, pageNumber, "Text on this page couldn't be matched to the PDF content reliably.");
        elements.push(...(await imageElementsFromOperatorList(pdfjsPage, pageNumber)));
      }
    } else {
      elements = await readOnlyTextElements(pdfjsPage, pageNumber, this.editing.reason ?? "Editing is unavailable.");
      elements.push(...(await imageElementsFromOperatorList(pdfjsPage, pageNumber)));
    }

    const contentKind = classifyPage(elements, base.viewBox);
    if (contentKind === "scanned" || contentKind === "scanned-ocr") {
      notices.push(
        contentKind === "scanned-ocr"
          ? "This page is a scanned image with an invisible OCR text layer. Scanned pages can't be edited."
          : "This page is a scanned image without native text, so it can't be edited.",
      );
    }
    return { ...base, status: "ready", contentKind, elements, notices };
  }

  private async analyzeContentStream(pdfjsPage: PDFPageProxy, pageNumber: number, notices: string[]): Promise<PDFElement[]> {
    const page = this.pdfLib!.getPage(pageNumber - 1);
    const content = readPageContent(page);
    const parsed = parseContentStream(content.bytes);
    const showTexts = await getShowTextEntries(pdfjsPage);

    const pdfjsFonts = new Map<string, PdfjsFontProps>();
    for (const id of new Set(showTexts.map((s) => s.fontId).filter((id): id is string => !!id))) {
      const props = await getFontProps(pdfjsPage, id);
      if (props) pdfjsFonts.set(id, props);
    }

    const result = interpretPage({
      context: this.pdfLib!.context,
      operations: parsed.operations,
      resources: pageResources(page),
      showTexts,
      pdfjsFonts,
      fonts: this.catalog!,
    });

    const ctx = {
      pageNumber,
      fonts: this.catalog!.fonts,
      pdfjsFonts,
      documentEditing: this.editing,
      onSpaceGap: (key: string, gap: number) => this.catalog!.recordSpaceGap(key, gap),
    };
    const elements: PDFElement[] = [];
    groupRuns(result.runs).forEach((runs) => {
      const element = buildTextElement(runs, elements.length, ctx);
      if (element) elements.push(element);
    });
    result.images.forEach((img, i) => elements.push(imageElement(img.matrix, pageNumber, i, img.name)));

    const formText = elements.filter((e) => e.type === "text" && e.source.context === "form").length;
    if (formText > 0) {
      notices.push(`${formText} text item(s) on this page are inside reusable Form XObjects and are read-only.`);
    }
    if (parsed.warnings.length > 0) {
      notices.push("This page's content has minor syntax errors; editing may be less reliable.");
    }
    return elements;
  }

  async destroy(): Promise<void> {
    await this.pdfjs.destroy();
  }
}

function pendingPage(page: PDFPageProxy): PDFPage {
  const [x0, y0, x1, y1] = page.view;
  return {
    pageNumber: page.pageNumber,
    viewBox: [x0, y0, x1, y1],
    width: x1 - x0,
    height: y1 - y0,
    rotation: page.rotate,
    userUnit: page.userUnit,
    status: "pending",
    elements: [],
    notices: [],
  };
}

function imageElement(matrix: Matrix, pageNumber: number, index: number, name?: string): ImageElement {
  return {
    id: `p${pageNumber}-i${index}`,
    type: "image",
    pageNumber,
    bbox: imageBounds(matrix),
    rotation: 0,
    name,
  };
}

/** Text from pdf.js's text layer only — positions are reliable, but no source bytes, so no editing. */
async function readOnlyTextElements(page: PDFPageProxy, pageNumber: number, reason: string): Promise<PDFElement[]> {
  const content = await page.getTextContent();
  const elements: PDFElement[] = [];
  for (const raw of content.items) {
    const item = raw as TextItem;
    if (!("str" in item) || item.str.trim() === "") continue;
    // pdf.js's item transform maps glyph space in ems to user space, like our element matrix.
    const t = item.transform as number[];
    const matrix: Matrix = [t[0], t[1], t[2], t[3], t[4], t[5]];
    const style = content.styles[item.fontName];
    const ascent = style?.ascent && style.ascent > 0.3 ? style.ascent : 0.8;
    const descent = style?.descent && style.descent < 0 ? style.descent : -0.2;
    const width = item.width / (axisScales(matrix).sx || 1);
    elements.push({
      id: `p${pageNumber}-t${elements.length}`,
      type: "text",
      pageNumber,
      bbox: boundsOfPoints(transformRectCorners(matrix, { x: 0, y: descent, width, height: ascent - descent })),
      rotation: rotationDegrees(matrix),
      content: item.str,
      style: { fontSize: Math.round(axisScales(matrix).sy * 1000) / 1000 },
      matrix,
      width,
      ascent,
      descent,
      metricsEstimated: !style?.ascent,
      editability: { allowed: false, reason },
      source: {
        context: "page",
        fontResource: "",
        textState: { fontSize: 0, charSpacing: 0, wordSpacing: 0, horizontalScaling: 1, rise: 0, renderMode: 0 },
        runs: [],
        original: { content: item.str, matrix, width },
      },
    });
  }
  return elements;
}

async function imageElementsFromOperatorList(page: PDFPageProxy, pageNumber: number): Promise<PDFElement[]> {
  const opList = await page.getOperatorList();
  const images: PDFElement[] = [];
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(opList.argsArray[i] as unknown as Matrix, ctm);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      images.push(imageElement(ctm, pageNumber, images.length));
    }
  }
  return images;
}
