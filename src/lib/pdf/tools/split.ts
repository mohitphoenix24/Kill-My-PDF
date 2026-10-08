import type { PDFDocument } from "pdf-lib";
import { PdfUserError } from "@/lib/pdf/errors";
import { createOutputDoc } from "./common";

/** Builds one PDF from the given 0-based pages of `doc`, in the order listed. */
export async function extractPages(doc: PDFDocument, pageIndices: readonly number[]): Promise<Uint8Array> {
  if (pageIndices.length === 0) throw new PdfUserError("invalid-input", "Pick at least one page.");
  const out = await createOutputDoc();
  const pages = await out.copyPages(doc, [...pageIndices]);
  for (const page of pages) out.addPage(page);
  return out.save();
}
