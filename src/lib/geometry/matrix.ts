/**
 * 2D affine matrices in PDF notation: [a, b, c, d, e, f] maps a point (x, y)
 * to (a·x + c·y + e, b·x + d·y + f).
 */
export type Matrix = readonly [number, number, number, number, number, number];

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Returns the matrix that applies `first`, then `second`. */
export function multiply(first: Matrix, second: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

export function applyToPoint(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Applies only the linear part (no translation) — for direction vectors. */
export function applyToVector(m: Matrix, v: Point): Point {
  return { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y };
}

export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) {
    throw new Error("Matrix is not invertible");
  }
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function translate(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty];
}

/** Axis-aligned bounds of the given points. */
export function boundsOfPoints(points: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Corners of `rect` after transforming by `m` (order: bl, br, tr, tl in source space). */
export function transformRectCorners(m: Matrix, rect: Rect): [Point, Point, Point, Point] {
  return [
    applyToPoint(m, { x: rect.x, y: rect.y }),
    applyToPoint(m, { x: rect.x + rect.width, y: rect.y }),
    applyToPoint(m, { x: rect.x + rect.width, y: rect.y + rect.height }),
    applyToPoint(m, { x: rect.x, y: rect.y + rect.height }),
  ];
}

/** Rotation of the matrix's x-axis, in degrees counter-clockwise, normalised to (-180, 180]. */
export function rotationDegrees(m: Matrix): number {
  const deg = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  const rounded = Math.round(deg * 1000) / 1000;
  return rounded === -180 ? 180 : rounded === 0 ? 0 : rounded;
}

/** Length of the transformed unit x / y vectors (scale factors, including skew effects). */
export function axisScales(m: Matrix): { sx: number; sy: number } {
  return { sx: Math.hypot(m[0], m[1]), sy: Math.hypot(m[2], m[3]) };
}

export function matricesAlmostEqual(m1: Matrix, m2: Matrix, epsilon = 1e-6): boolean {
  return m1.every((v, i) => Math.abs(v - m2[i]) <= epsilon * Math.max(1, Math.abs(v), Math.abs(m2[i])));
}
