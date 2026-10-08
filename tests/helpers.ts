import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configurePdfjsAssets } from "@/lib/pdf/pdfjs/pdfjs";
import { PdfSession } from "@/lib/pdf/session";
import type { PDFPage, TextElement } from "@/lib/model/types";

const root = process.cwd();
const pdfjsRoot = join(root, "node_modules", "pdfjs-dist");

// In Node, pdf.js reads these with fs, so they are directory paths (with trailing slash).
configurePdfjsAssets({
  cMapUrl: join(pdfjsRoot, "cmaps") + "/",
  standardFontDataUrl: join(pdfjsRoot, "standard_fonts") + "/",
  wasmUrl: join(pdfjsRoot, "wasm") + "/",
  iccUrl: join(pdfjsRoot, "iccs") + "/",
});

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(root, "tests", "fixtures", name)));
}

export function fontFile(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(root, "public", "fonts", "dejavu", name)));
}

export async function openFixture(name: string) {
  return PdfSession.open(name, fixture(name));
}

export function textElements(page: PDFPage): TextElement[] {
  return page.elements.filter((e): e is TextElement => e.type === "text");
}

export function findText(page: PDFPage, content: string): TextElement {
  const found = textElements(page).find((e) => e.content === content);
  if (!found) {
    throw new Error(`No element "${content}". Have: ${textElements(page).map((e) => JSON.stringify(e.content)).join(", ")}`);
  }
  return found;
}

// ---- Helpers for the page-level tools ---------------------------------------------

import { PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream, degrees } from "pdf-lib";
import { openWithPdfjs, OPS } from "@/lib/pdf/pdfjs/pdfjs";

export function imageFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(root, "tests", "fixtures", "images", name)));
}

/** A PDF whose page n says "<label> p<n>", so order and content can be checked after processing. */
export async function makeDoc(label: string, pages: number, options: { rotateFirst?: number } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`${label} p${i}`, { x: 40, y: 340, size: 24, font });
  }
  if (options.rotateFirst) doc.getPage(0).setRotation(degrees(options.rotateFirst));
  return doc.save();
}

/** Text of every page, as pdf.js extracts it. */
export async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await openWithPdfjs(bytes);
  try {
    const texts: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      texts.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" ").trim());
    }
    return texts;
  } finally {
    await pdf.destroy();
  }
}

/** Number of images painted on each page. */
export async function imageCounts(bytes: Uint8Array): Promise<number[]> {
  const pdf = await openWithPdfjs(bytes);
  try {
    const counts: number[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const ops = await (await pdf.getPage(n)).getOperatorList();
      counts.push(ops.fnArray.filter((fn) => fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject).length);
    }
    return counts;
  } finally {
    await pdf.destroy();
  }
}

/** Page sizes (points, after rotation), as pdf.js sees them. */
export async function pageSizes(bytes: Uint8Array): Promise<Array<{ width: number; height: number; rotation: number }>> {
  const pdf = await openWithPdfjs(bytes);
  try {
    const sizes = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const v = page.getViewport({ scale: 1 });
      sizes.push({ width: Math.round(v.width * 100) / 100, height: Math.round(v.height * 100) / 100, rotation: page.rotate });
    }
    return sizes;
  } finally {
    await pdf.destroy();
  }
}

/** Every decoded stream in the file joined together — to prove text really is gone, not just unseen. */
export async function allStreamText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let text = "";
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) {
      try {
        text += Buffer.from(decodePDFRawStream(object).decode()).toString("latin1") + "\n";
      } catch {
        // binary streams (fonts, images) may not decode to anything useful
      }
    }
  }
  return text;
}
