import type { PDFDocument } from "pdf-lib";
import { PdfUserError } from "@/lib/pdf/errors";
import { createOutputDoc } from "./common";

export interface MergeInput {
  doc: PDFDocument;
}

/** Appends every page of each document, in the order given. */
export async function mergePdfs(inputs: readonly MergeInput[]): Promise<Uint8Array> {
  if (inputs.length === 0) throw new PdfUserError("invalid-input", "Add at least one PDF to merge.");
  const out = await createOutputDoc();
  for (const { doc } of inputs) {
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  if (out.getPageCount() === 0) throw new PdfUserError("invalid-input", "These PDFs don't contain any pages.");
  return out.save();
}
