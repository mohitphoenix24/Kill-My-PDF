/**
 * Re-opens an exported PDF with pdf.js and checks that each edit really landed as
 * extractable text: new text is present, and the replaced text is gone (allowing
 * for other, unedited occurrences on the same page).
 */
import type { DocumentModel } from "@/lib/model/types";
import { changedElements } from "@/lib/editor/operations";
import { type PDFDocumentProxy, openWithPdfjs } from "@/lib/pdf/pdfjs/pdfjs";

export interface VerificationResult {
  ok: boolean;
  problems: string[];
}

const normalize = (s: string) => s.replace(/\s+/g, "");

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count++;
  return count;
}

async function pageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  return normalize(content.items.map((i) => ("str" in i ? i.str : "")).join(""));
}

export async function verifyExport(
  originalBytes: Uint8Array,
  exportedBytes: Uint8Array,
  model: DocumentModel,
): Promise<VerificationResult> {
  const problems: string[] = [];
  let original: PDFDocumentProxy | undefined;
  let exported: PDFDocumentProxy | undefined;
  try {
    original = await openWithPdfjs(originalBytes);
    exported = await openWithPdfjs(exportedBytes);
    if (exported.numPages !== original.numPages) problems.push("The page count changed.");

    const byPage = new Map<number, ReturnType<typeof changedElements>>();
    for (const e of changedElements(model)) byPage.set(e.pageNumber, [...(byPage.get(e.pageNumber) ?? []), e]);

    for (const [pageNumber, elements] of byPage) {
      const before = await pageText(original, pageNumber);
      const after = await pageText(exported, pageNumber);
      for (const e of elements) {
        const oldText = normalize(e.source.original.content);
        const newText = normalize(e.content);
        if (newText && !after.includes(newText)) {
          problems.push(`Page ${pageNumber}: "${e.content}" is not extractable from the exported PDF.`);
        }
        if (oldText && !newText.includes(oldText)) {
          const expected = occurrences(before, oldText) - 1;
          const actual = occurrences(after, oldText) - occurrences(newText, oldText);
          if (actual > expected) {
            problems.push(`Page ${pageNumber}: the original text "${e.source.original.content}" is still present.`);
          }
        }
      }
    }
  } catch {
    problems.push("The exported PDF could not be re-opened for verification.");
  } finally {
    await original?.destroy();
    await exported?.destroy();
  }
  return { ok: problems.length === 0, problems };
}
