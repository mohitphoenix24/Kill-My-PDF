import { type PDFDocument, degrees } from "pdf-lib";
import { PdfUserError } from "@/lib/pdf/errors";
import { createOutputDoc } from "./common";

export type Rotation = 0 | 90 | 180 | 270;

/** One page of the output: which source page to copy and how much extra clockwise rotation to add. */
export interface PagePlanItem {
  /** 0-based page index in the source document. */
  source: number;
  rotate: Rotation;
}

/** Normalises any multiple of 90 (including negatives) into 0, 90, 180 or 270. */
export function normalizeRotation(degreesValue: number): Rotation {
  return ((((degreesValue % 360) + 360) % 360) as Rotation);
}

export function addRotation(current: Rotation, delta: number): Rotation {
  return normalizeRotation(current + delta);
}

/**
 * Builds a new document from the plan: pages can be reordered, dropped, duplicated and
 * rotated. Pages are copied into a fresh file rather than deleted in place, so removed
 * pages (and everything only they referenced) are really gone from the output.
 */
export async function organizePdf(doc: PDFDocument, plan: readonly PagePlanItem[]): Promise<Uint8Array> {
  if (plan.length === 0) throw new PdfUserError("invalid-input", "There are no pages left to save.");
  const pageCount = doc.getPageCount();
  if (plan.some((p) => p.source < 0 || p.source >= pageCount)) {
    throw new PdfUserError("invalid-input", "One of the selected pages doesn't exist in this PDF.");
  }
  const baseRotation = doc.getPages().map((p) => normalizeRotation(p.getRotation().angle));
  const out = await createOutputDoc();
  const copies = await out.copyPages(
    doc,
    plan.map((p) => p.source),
  );
  copies.forEach((page, i) => {
    const { source, rotate } = plan[i];
    // Written explicitly from the source's own rotation, so an inherited /Rotate is kept too.
    page.setRotation(degrees(addRotation(baseRotation[source], rotate)));
    out.addPage(page);
  });
  return out.save();
}
