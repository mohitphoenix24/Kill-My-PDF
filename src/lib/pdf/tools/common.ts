/** Helpers shared by the page-level tools (merge, organize, split, images → PDF). */
import { EncryptedPDFError, PDFDocument } from "pdf-lib";
import { PdfUserError } from "@/lib/pdf/errors";

export const PRODUCER = "KillMyPDF";

/** Opens a PDF for page-level work, turning pdf-lib failures into messages users can act on. */
export async function loadPdfDoc(bytes: Uint8Array, label: string): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false, throwOnInvalidObject: false });
    // pdf-lib is lenient: garbage can "load" and only fail (or come out empty) once pages are read.
    if (doc.getPageCount() === 0) throw new PdfUserError("corrupted", `${label} looks damaged or has no pages.`);
  } catch (error) {
    if (error instanceof PdfUserError) throw error;
    // Some pdf-lib builds throw a plain Error here instead of EncryptedPDFError, so check the message too.
    const encrypted = error instanceof EncryptedPDFError || (error instanceof Error && /\bis encrypted\b/i.test(error.message));
    if (encrypted) {
      throw new PdfUserError(
        "encrypted",
        `${label} is password-protected or encrypted, so its pages can't be copied. Remove the protection first and try again.`,
        { cause: error },
      );
    }
    throw new PdfUserError("corrupted", `${label} looks damaged or isn't a valid PDF.`, { cause: error });
  }
  return doc;
}

/** A fresh output document, stamped with our name instead of pdf-lib's. */
export async function createOutputDoc(): Promise<PDFDocument> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  const now = new Date();
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  return doc;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "") || "document";
}

/** Strips characters that are unsafe in file names and makes sure the name ends in `.pdf`. */
export function safePdfName(name: string, fallback = "document"): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\.pdf$/i, "")
    .trim();
  return `${cleaned || fallback}.pdf`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
