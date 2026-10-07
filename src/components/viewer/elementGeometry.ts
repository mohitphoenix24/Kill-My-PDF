import type { PageTransform } from "@/lib/geometry/coordinates";
import { type Matrix, type Point, type Rect, boundsOfPoints, multiply, transformRectCorners } from "@/lib/geometry/matrix";
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
