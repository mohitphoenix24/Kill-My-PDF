import { type Matrix, boundsOfPoints, transformRectCorners } from "@/lib/geometry/matrix";
import type { PDFElement, PageContentKind } from "@/lib/model/types";

/** Fraction of the page an image must cover (together) for a text-less page to count as scanned. */
const SCANNED_IMAGE_COVERAGE = 0.5;

export function imageBounds(matrix: Matrix) {
  return boundsOfPoints(transformRectCorners(matrix, { x: 0, y: 0, width: 1, height: 1 }));
}

export function classifyPage(
  elements: PDFElement[],
  viewBox: readonly [number, number, number, number],
): PageContentKind {
  let visibleChars = 0;
  let invisibleChars = 0;
  let imageArea = 0;
  const [x0, y0, x1, y1] = viewBox;
  for (const e of elements) {
    if (e.type === "text") {
      const chars = e.content.trim().length;
      const invisible = e.source.textState.renderMode === 3 || e.source.textState.renderMode === 7;
      if (invisible) invisibleChars += chars;
      else visibleChars += chars;
    } else {
      const b = e.bbox;
      const w = Math.max(0, Math.min(b.x + b.width, x1) - Math.max(b.x, x0));
      const h = Math.max(0, Math.min(b.y + b.height, y1) - Math.max(b.y, y0));
      imageArea += w * h;
    }
  }
  if (visibleChars > 0) return "text";
  const pageArea = Math.max(1, (x1 - x0) * (y1 - y0));
  if (imageArea / pageArea >= SCANNED_IMAGE_COVERAGE) {
    return invisibleChars > 0 ? "scanned-ocr" : "scanned";
  }
  return "no-text";
}
