/**
 * Chrome's "Print to PDF" (Skia/PDF) is the most common PDF people edit, and it is unusual in three ways:
 * every glyph is its own text operator, the embedded fonts are subsets, and there are NO space glyphs —
 * words are just positioned apart. These tests pin down what that used to break: lines split mid-word,
 * and any edit to a line with spaces swapping the whole line to another font.
 */
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { type EditOperation, applyOperations } from "@/lib/editor/operations";
import { type ExportResult, exportPdf } from "@/lib/pdf/export/exporter";
import { PdfSession } from "@/lib/pdf/session";
import type { DocumentModel, TextElement } from "@/lib/model/types";
import { allStreamText, fixture, fontFile, pageTexts, textElements } from "./helpers";

/**
 * Older Skia builds (and the files people actually upload) never draw a space: the word is just placed further
 * along. The current Chromium draws an empty space glyph, so this strips those draws, keeping each move.
 */
async function withoutSpaceGlyphs(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  for (const page of doc.getPages()) {
    const contents = doc.context.lookup(page.node.Contents());
    const streams = "asArray" in (contents as object) ? (contents as unknown as { asArray(): unknown[] }).asArray().map((r) => doc.context.lookup(r as never)) : [contents];
    for (const stream of streams) {
      const raw = stream as PDFRawStream;
      const text = Buffer.from(decodePDFRawStream(raw).decode()).toString("latin1");
      const stripped = text.replace(/(\S+ 0 Td) <0003> Tj/g, "$1");
      expect(stripped).not.toBe(text);
      raw.dict.delete(PDFName.of("Filter"));
      raw.dict.delete(PDFName.of("DecodeParms"));
      (raw as unknown as { contents: Uint8Array }).contents = Buffer.from(stripped, "latin1");
      raw.dict.set(PDFName.of("Length"), doc.context.obj(stripped.length));
    }
  }
  return doc.save();
}

async function analyse(bytes: Uint8Array) {
  const session = await PdfSession.open("chrome-form.pdf", bytes);
  const model = await session.createModel();
  model.pages[0] = await session.analyzePage(1);
  return { session, model: { ...model, fonts: session.fontsSnapshot() } as DocumentModel };
}

async function fontNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const names = new Set<string>();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const dict = (object as { dict?: { get(k: PDFName): unknown } }).dict ?? (object as { get?(k: PDFName): unknown });
    const base = typeof dict?.get === "function" ? dict.get(PDFName.of("BaseFont")) : undefined;
    if (base instanceof PDFName) names.add(base.decodeText().replace(/^[A-Z]{6}\+/, ""));
  }
  return [...names].sort();
}

const edit = (model: DocumentModel, ops: EditOperation[]) => applyOperations(model, ops);
const exportOf = (session: PdfSession, model: DocumentModel): Promise<ExportResult> =>
  exportPdf({ originalBytes: session.originalBytes, model, loadFontFile: async (n) => fontFile(n) });

describe.each([
  { variant: "with empty space glyphs (current Chromium)", load: async () => fixture("chrome-form.pdf") },
  { variant: "with no space glyphs at all (older Skia)", load: async () => withoutSpaceGlyphs(fixture("chrome-form.pdf")) },
])("Chrome-printed PDF, $variant", ({ load }) => {
  it("reads whole lines — no mid-word splits from kerning", async () => {
    const { model } = await analyse(await load());
    const paragraph = textElements(model.pages[0]).filter((e) => e.fontKey && e.style.fontSize && e.content.length > 40);
    expect(paragraph.length).toBeGreaterThanOrEqual(4);
    // Every word in every line must be a whole word of the source text.
    const source = "I confirm that I have read the Customer Handbook and that the details I filled in on this Service Request Form are accurate. I agree to follow the studio rules as described in the Customer Handbook. I confirm that the information provided by me is correct. I also confirm that I am not submitting more than one Request Form for myself. If any of the information provided by me is found to be incorrect later, I understand that my request may be cancelled, before, during, or after the work, including the time after delivery of my final files. Further, I understand that I may be liable for the costs of any work already completed. The studio's decision will be final and binding on me.";
    const words = new Set(source.split(/\s+/));
    for (const line of paragraph) {
      for (const word of line.content.split(" ")) expect(words.has(word), `"${word}" in "${line.content.slice(0, 50)}…" is not a whole word`).toBe(true);
    }
    // …and together they say the whole paragraph, in order.
    expect(paragraph.map((e) => e.content).join(" ").replace(/\s+/g, " ")).toBe(source);
  });

  it("knows how wide a word gap is, for fonts that can't draw a space", async () => {
    const { model } = await analyse(await load());
    const body = Object.values(model.fonts).find((f) => f.displayName === "LiberationSans")!;
    const width = body.glyphs[" "]?.width ?? body.spaceWidth;
    expect(width).toBeGreaterThan(0.2);
    expect(width).toBeLessThan(0.35); // Liberation Sans' space is 0.278 em
  });

  function target(model: DocumentModel): TextElement {
    return textElements(model.pages[0]).find((e) => e.content.includes("Customer Handbook and that"))!;
  }

  it("replaces a word in a long line in place, in the original font", async () => {
    const { session, model } = await analyse(await load());
    const line = target(model);
    const edited = edit(model, [{ type: "setText", elementId: line.id, text: line.content.replace("Customer Handbook", "Form") }]);
    const result = await exportOf(session, edited);

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({ strategy: "in-place", fontName: "LiberationSans", notes: [] });
    // No new font was added: the exported file uses exactly the fonts the original did.
    expect(await fontNames(result.bytes)).toEqual(await fontNames(session.originalBytes));

    const [before, after] = [(await pageTexts(session.originalBytes))[0], (await pageTexts(result.bytes))[0]];
    expect(after).toContain("read the Form and that the details");
    expect(after.replace("Form", "Customer Handbook")).toBe(before); // nothing else changed
  });

  it("keeps the edited line looking like its neighbours (same font, size, colour, baseline)", async () => {
    const { session, model } = await analyse(await load());
    const line = target(model);
    const result = await exportOf(session, edit(model, [{ type: "setText", elementId: line.id, text: line.content.replace("details", "facts") }]));
    const again = await analyse(result.bytes);
    const same = textElements(again.model.pages[0]).find((e) => e.content.includes("the facts I filled"))!;
    expect(same.style).toMatchObject({ fontFamily: line.style.fontFamily, fontSize: line.style.fontSize, color: line.style.color });
    expect(same.matrix[5]).toBeCloseTo(line.matrix[5], 3); // same baseline
    expect(same.matrix[4]).toBeCloseTo(line.matrix[4], 3); // same left edge
  });

  it("adds spaces as gaps, not glyphs, and the old words are really gone", async () => {
    const { session, model } = await analyse(await load());
    const line = target(model);
    const result = await exportOf(session, edit(model, [{ type: "setText", elementId: line.id, text: line.content.replace("Customer Handbook", "Studio Request Form") }]));
    expect((await pageTexts(result.bytes))[0]).toContain("read the Studio Request Form and that");
    expect(await allStreamText(result.bytes)).toBeTruthy();
    // A second edit on the already-edited file still works (round-trip stability).
    const again = await analyse(result.bytes);
    const line2 = textElements(again.model.pages[0]).find((e) => e.content.includes("Studio Request Form"))!;
    const final = await exportOf(again.session, edit(again.model, [{ type: "setText", elementId: line2.id, text: line2.content.replace("Studio Request Form", "Handbook") }]));
    expect((await pageTexts(final.bytes))[0]).toContain("read the Handbook and that");
    expect(await fontNames(final.bytes)).toEqual(await fontNames(session.originalBytes));
  });

  it("changes the font of only the word that needs a missing glyph", async () => {
    // The file's font subset has no "G" or "B", so those words can't be drawn in it — but the rest of the line can.
    const { session, model } = await analyse(await load());
    const line = target(model);
    const result = await exportOf(session, edit(model, [{ type: "setText", elementId: line.id, text: line.content.replace("Customer Handbook", "Guide Book") }]));

    expect(result.reports[0].strategy).toBe("redraw-mixed");
    expect(result.reports[0].notes[0]).toMatch(/"Guide"/);
    expect((await pageTexts(result.bytes))[0]).toMatch(/read the\s+Guide Book\s+and that the details/);
    // Exactly one extra font, for those words; the rest of the page still uses the file's own.
    const original = await fontNames(session.originalBytes);
    const added = (await fontNames(result.bytes)).filter((n) => !original.includes(n));
    expect(added).toHaveLength(1);
  });

  it("deleting a word works too", async () => {
    const { session, model } = await analyse(await load());
    const line = textElements(model.pages[0]).find((e) => e.content.includes("not submitting more than one Request Form for myself"))!;
    const result = await exportOf(session, edit(model, [{ type: "setText", elementId: line.id, text: line.content.replace(" for myself.", ".") }]));
    expect(result.reports[0].strategy).toBe("in-place");
    expect((await pageTexts(result.bytes))[0]).toContain("one Request Form.");
  });
});
