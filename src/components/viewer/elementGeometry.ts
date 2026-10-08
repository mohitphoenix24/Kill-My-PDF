import type { PageTransform } from "@/lib/geometry/coordinates";
import { type Matrix, type Point, type Rect, applyToPoint, boundsOfPoints, invert, multiply, transformRectCorners } from "@/lib/geometry/matrix";
import type { TextElement } from "@/lib/model/types";

/** Element local space (ems) → screen CSS pixels. */
export function elementScreenMatrix(element: TextElement, transform: PageTransform): Matrix {
  return multiply(element.matrix, transform.pdfToScreen);
}

/** The element's text box (advance × ascent..descent) as four screen points. */
export function elementScreenQuad(element: TextElement, width: number, transform: PageTransform): Point[] {
  return transformRectCorners(elementScreenMatrix(element, transform), {
    x: 0,
    y: element.descent,
    width: Math.max(width, 0.25),
    height: element.ascent - element.descent,
  });
}

export function elementScreenBounds(element: TextElement, width: number, transform: PageTransform): Rect {
  return boundsOfPoints(elementScreenQuad(element, width, transform));
}

/** A sub-range of the element's line (fractions 0–1 of its width) as four screen points. */
export function lineSegmentQuad(element: TextElement, width: number, from: number, to: number, transform: PageTransform): Point[] {
  const w = Math.max(width, 0.25);
  return transformRectCorners(elementScreenMatrix(element, transform), {
    x: from * w,
    y: element.descent,
    width: Math.max((to - from) * w, 0.05),
    height: element.ascent - element.descent,
  });
}

export interface Hit {
  element: TextElement;
  /** Screen-pixel distance from the point to the element's box (0 when inside). */
  distance: number;
  /** How far along the line the point is, 0–1. */
  fraction: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where a screen point falls along an element's line, as a fraction of its width. */
export function fractionAlongElement(element: TextElement, width: number, transform: PageTransform, point: Point): number {
  try {
    const local = applyToPoint(invert(elementScreenMatrix(element, transform)), point);
    return clamp01(local.x / Math.max(width, 0.25));
  } catch {
    return 0;
  }
}

/**
 * The element a tap/click means. Finds the closest text box within `slop` screen pixels —
 * so a fingertip a little above or beside small text still hits it — and prefers the
 * smaller box when several overlap.
 */
export function hitTest(
  elements: readonly TextElement[],
  widthOf: (element: TextElement) => number,
  transform: PageTransform,
  point: Point,
  slop: number,
): Hit | null {
  let best: Hit | null = null;
  let bestArea = Infinity;
  for (const element of elements) {
    const m = elementScreenMatrix(element, transform);
    let local: Point;
    try {
      local = applyToPoint(invert(m), point);
    } catch {
      continue;
    }
    const width = Math.max(widthOf(element), 0.25);
    const sx = Math.hypot(m[0], m[1]);
    const sy = Math.hypot(m[2], m[3]);
    const dx = Math.max(0, -local.x, local.x - width) * sx;
    const dy = Math.max(0, element.descent - local.y, local.y - element.ascent) * sy;
    const distance = Math.hypot(dx, dy);
    if (distance > slop) continue;
    const area = width * sx * (element.ascent - element.descent) * sy;
    const closer = !best || distance < best.distance - 0.5;
    const tie = best && Math.abs(distance - best.distance) <= 0.5 && area < bestArea;
    if (closer || tie) {
      best = { element, distance, fraction: clamp01(local.x / width) };
      bestArea = area;
    }
  }
  return best;
}
