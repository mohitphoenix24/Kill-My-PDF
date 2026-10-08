import type { PDFDocument } from "pdf-lib";
import { MAX_FILE_BYTES, PdfUserError, toLoadError } from "@/lib/pdf/errors";
import { type PDFDocumentProxy, openWithPdfjs } from "@/lib/pdf/pdfjs/pdfjs";
import { loadPdfDoc } from "@/lib/pdf/tools/common";

/** A PDF opened for page-level work: pdf.js for previews, pdf-lib for building the output. */
export interface LoadedPdf {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  pdfjs: PDFDocumentProxy;
  doc: PDFDocument;
}

export async function loadPdfFile(file: File): Promise<LoadedPdf> {
  if (file.size === 0) throw new PdfUserError("empty", `${file.name} is empty.`);
  if (file.size > MAX_FILE_BYTES) {
    throw new PdfUserError("too-large", `${file.name} is ${(file.size / 1024 / 1024).toFixed(0)} MB — the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) throw new PdfUserError("not-a-pdf", `${file.name} isn't a PDF.`);

  let pdfjs: PDFDocumentProxy;
  try {
    pdfjs = await openWithPdfjs(bytes);
  } catch (error) {
    const err = toLoadError(error);
    throw err.code === "password-protected"
      ? new PdfUserError("password-protected", `${file.name} is password-protected. Remove the password first, then try again.`, { cause: error })
      : err;
  }
  try {
    const doc = await loadPdfDoc(bytes, file.name);
    return { id: crypto.randomUUID(), name: file.name, size: file.size, pageCount: doc.getPageCount(), pdfjs, doc };
  } catch (error) {
    void pdfjs.destroy();
    throw error;
  }
}

export function disposePdf(pdf: LoadedPdf): void {
  void pdf.pdfjs.destroy();
}
