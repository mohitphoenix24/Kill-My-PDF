/**
 * The single place where PDF user space (origin bottom-left, y up, unit = 1/72 in)
 * is converted to screen/CSS space (origin top-left, y down, unit = CSS px).
 *
 * The page-to-screen matrix reproduces pdf.js's PageViewport so overlays line up
 * with what pdf.js paints: it accounts for the view box (CropBox) offset, /Rotate,
 * /UserUnit and the zoom scale. Device pixel ratio only affects the canvas backing
 * store, never CSS coordinates, so it is deliberately not part of this transform.
 */
import {
  type Matrix,
  type Point,
  type Rect,
  applyToPoint,
  boundsOfPoints,
  invert,
  multiply,
  transformRectCorners,
} from "./matrix";

export interface PageGeometry {
  /** Visible region in PDF user space: [x0, y0, x1, y1] (pdf.js `page.view`). */
  viewBox: readonly [number, number, number, number];
  /** Page /Rotate, a multiple of 90. */
  rotation: number;
  /** /UserUnit (1 for nearly every PDF). */
  userUnit: number;
}

export interface PageTransform {
  /** CSS pixel size of the page at this scale. */
  width: number;
  height: number;
  scale: number;
  pdfToScreen: Matrix;
  screenToPdf: Matrix;
}

/** Same rules as pdf.js PageViewport (dontFlip = false, no offsets). */
export function createPageTransform(geometry: PageGeometry, scale: number): PageTransform {
  const { viewBox, userUnit } = geometry;
  const s = scale * userUnit;
  const centerX = (viewBox[2] + viewBox[0]) / 2;
  const centerY = (viewBox[3] + viewBox[1]) / 2;

  let rotation = geometry.rotation % 360;
  if (rotation < 0) rotation += 360;
  let ra: number, rb: number, rc: number, rd: number;
  switch (rotation) {
    case 0:
      [ra, rb, rc, rd] = [1, 0, 0, -1];
      break;
    case 90:
      [ra, rb, rc, rd] = [0, 1, 1, 0];
      break;
    case 180:
      [ra, rb, rc, rd] = [-1, 0, 0, 1];
      break;
    case 270:
      [ra, rb, rc, rd] = [0, -1, -1, 0];
      break;
    default:
      throw new Error(`Invalid page rotation ${geometry.rotation}`);
  }

  let offsetX: number, offsetY: number, width: number, height: number;
  if (ra === 0) {
    offsetX = Math.abs(centerY - viewBox[1]) * s;
    offsetY = Math.abs(centerX - viewBox[0]) * s;
    width = (viewBox[3] - viewBox[1]) * s;
    height = (viewBox[2] - viewBox[0]) * s;
  } else {
    offsetX = Math.abs(centerX - viewBox[0]) * s;
    offsetY = Math.abs(centerY - viewBox[1]) * s;
    width = (viewBox[2] - viewBox[0]) * s;
    height = (viewBox[3] - viewBox[1]) * s;
  }

  const pdfToScreen: Matrix = [
    ra * s,
    rb * s,
    rc * s,
    rd * s,
    offsetX - ra * s * centerX - rc * s * centerY,
    offsetY - rb * s * centerX - rd * s * centerY,
  ];
  return { width, height, scale, pdfToScreen, screenToPdf: invert(pdfToScreen) };
}

export function pdfToScreenCoordinates(t: PageTransform, p: Point): Point {
  return applyToPoint(t.pdfToScreen, p);
}

export function screenToPdfCoordinates(t: PageTransform, p: Point): Point {
  return applyToPoint(t.screenToPdf, p);
}

/** Axis-aligned screen rect covering a PDF rect (exact for 0/90/180/270 rotations). */
export function pdfRectToScreenRect(t: PageTransform, r: Rect): Rect {
  return boundsOfPoints(transformRectCorners(t.pdfToScreen, r));
}

export function screenRectToPdfRect(t: PageTransform, r: Rect): Rect {
  return boundsOfPoints(transformRectCorners(t.screenToPdf, r));
}

/** Converts a distance in screen px to PDF units (page rotation does not change length). */
export function screenDeltaToPdfDelta(t: PageTransform, dx: number, dy: number): Point {
  const m = t.screenToPdf;
  return { x: m[0] * dx + m[2] * dy, y: m[1] * dx + m[3] * dy };
}

/**
 * CSS `transform` matrix for a box laid out in an element's local text space.
 *
 * The box is a div with its top-left at the CSS origin, `width` local units wide and
 * `ascent - descent` tall. Local text space has y up with the baseline at y = 0, so
 * CSS (u, v) maps to local (u, ascent - v), then through the element's matrix into
 * PDF user space, then to screen space.
 */
export function localBoxCssMatrix(
  t: PageTransform,
  elementMatrix: Matrix,
  ascent: number,
): Matrix {
  const flip: Matrix = [1, 0, 0, -1, 0, ascent];
  return multiply(multiply(flip, elementMatrix), t.pdfToScreen);
}

export function toCssMatrix(m: Matrix): string {
  return `matrix(${m.map((v) => +v.toFixed(6)).join(",")})`;
}
