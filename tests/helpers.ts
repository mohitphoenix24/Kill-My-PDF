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
