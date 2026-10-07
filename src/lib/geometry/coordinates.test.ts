import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, degrees } from "pdf-lib";
import {
  createPageTransform,
  localBoxCssMatrix,
  pdfRectToScreenRect,
  pdfToScreenCoordinates,
  screenRectToPdfRect,
  screenToPdfCoordinates,
} from "./coordinates";
import { applyToPoint, invert, multiply, rotationDegrees, type Matrix } from "./matrix";

const viewBoxes: Array<[number, number, number, number]> = [
  [0, 0, 595, 842],
  [36, 18, 612, 792], // CropBox not at the origin
];

async function pdfjsPage(viewBox: readonly number[], rotation: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([700, 900]);
  page.setCropBox(viewBox[0], viewBox[1], viewBox[2] - viewBox[0], viewBox[3] - viewBox[1]);
  page.setRotation(degrees(rotation));
  const pdf = await getDocument({ data: await doc.save(), verbosity: 0 }).promise;
  return pdf.getPage(1);
}

describe("createPageTransform", () => {
  for (const viewBox of viewBoxes) {
    for (const rotation of [0, 90, 180, 270]) {
      it(`matches pdf.js page.getViewport (viewBox ${viewBox}, rotation ${rotation})`, async () => {
        const page = await pdfjsPage(viewBox, rotation);
        expect(page.view).toEqual(viewBox);
        for (const scale of [1, 1.5, 0.75]) {
          const ours = createPageTransform({ viewBox: page.view as [number, number, number, number], rotation: page.rotate, userUnit: page.userUnit }, scale);
          const theirs = page.getViewport({ scale });
          ours.pdfToScreen.forEach((v, i) => expect(v).toBeCloseTo(theirs.transform[i], 9));
          expect(ours.width).toBeCloseTo(theirs.width, 9);
          expect(ours.height).toBeCloseTo(theirs.height, 9);
        }
      });
    }
  }

  it("normalises negative rotations", () => {
    const a = createPageTransform({ viewBox: [0, 0, 100, 200], rotation: -90, userUnit: 1 }, 1);
    const b = createPageTransform({ viewBox: [0, 0, 100, 200], rotation: 270, userUnit: 1 }, 1);
    expect(a.pdfToScreen).toEqual(b.pdfToScreen);
  });

  it("maps the bottom-left PDF corner to the bottom-left of the screen", () => {
    const t = createPageTransform({ viewBox: [0, 0, 600, 800], rotation: 0, userUnit: 1 }, 2);
    expect(pdfToScreenCoordinates(t, { x: 0, y: 0 })).toEqual({ x: 0, y: 1600 });
    expect(pdfToScreenCoordinates(t, { x: 600, y: 800 })).toEqual({ x: 1200, y: 0 });
  });

  it("round-trips points and rects", () => {
    const t = createPageTransform({ viewBox: [36, 18, 612, 792], rotation: 90, userUnit: 1 }, 1.25);
    const p = { x: 123.4, y: 456.7 };
    const back = screenToPdfCoordinates(t, pdfToScreenCoordinates(t, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    const r = { x: 100, y: 200, width: 50, height: 12 };
    const rb = screenRectToPdfRect(t, pdfRectToScreenRect(t, r));
    expect(rb.x).toBeCloseTo(r.x, 9);
    expect(rb.width).toBeCloseTo(r.width, 9);
    expect(rb.height).toBeCloseTo(r.height, 9);
  });
});

describe("localBoxCssMatrix", () => {
  it("places a text box's top-left at (x, baseline - ascent) for upright text", () => {
    const t = createPageTransform({ viewBox: [0, 0, 595, 842], rotation: 0, userUnit: 1 }, 1);
    // 12pt text at (190, 710): local units are font-size scaled.
    const element: Matrix = [12, 0, 0, 12, 190, 710];
    const css = localBoxCssMatrix(t, element, 0.718);
    const topLeft = applyToPoint(css, { x: 0, y: 0 });
    expect(topLeft.x).toBeCloseTo(190, 9);
    expect(topLeft.y).toBeCloseTo(842 - 710 - 0.718 * 12, 9);
  });

  it("keeps rotation of rotated text", () => {
    const t = createPageTransform({ viewBox: [0, 0, 595, 842], rotation: 0, userUnit: 1 }, 1);
    const angle = Math.PI / 6;
    const element: Matrix = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 100, 100];
    // Screen y points down, so a 30° CCW rotation in PDF is -30° on screen.
    expect(rotationDegrees(localBoxCssMatrix(t, element, 0))).toBeCloseTo(-30, 6);
  });
});

describe("matrix helpers", () => {
  it("inverts", () => {
    const m: Matrix = [2, 1, -1, 3, 10, -4];
    const id = multiply(m, invert(m));
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(id[i]).toBeCloseTo(v, 12));
  });
});
