/**
 * Editing operations: the only way the document model changes after analysis.
 *
 * They are plain, serialisable data so the same operations can come from the UI
 * today and from an AI command layer later (natural language → operations).
 * `applyOperation` is pure: it returns a new model and never touches the PDF.
 */
import {
  type Matrix,
  boundsOfPoints,
  matricesAlmostEqual,
  rotationDegrees,
  transformRectCorners,
} from "@/lib/geometry/matrix";
import type { DocumentModel, ElementId, FontInfo, PDFPage, TextElement } from "@/lib/model/types";
import { encodeWithFont } from "@/lib/pdf/fonts/encoding";

export type EditOperation =
  | { type: "setText"; elementId: ElementId; text: string }
  /** Translation in PDF user space units (y up). */
  | { type: "move"; elementId: ElementId; dx: number; dy: number }
  | { type: "setStyle"; elementId: ElementId; style: { color?: string; fontSize?: number } }
  | { type: "reset"; elementId: ElementId };

export function pageNumberOf(elementId: ElementId): number {
  const match = /^p(\d+)-/.exec(elementId);
  if (!match) throw new Error(`Malformed element id ${elementId}`);
  return Number(match[1]);
}

export function findTextElement(model: DocumentModel, elementId: ElementId): TextElement | undefined {
  const page = model.pages[pageNumberOf(elementId) - 1];
  const element = page?.elements.find((e) => e.id === elementId);
  return element?.type === "text" ? element : undefined;
}

/** Width of `text` in ems, exact when the original font can draw it, otherwise estimated. */
export function measureText(element: TextElement, font: FontInfo | undefined, text: string): number {
  const ts = element.source.textState;
  const perChar = ts.fontSize ? ts.charSpacing / ts.fontSize : 0;
  const perSpace = ts.fontSize ? ts.wordSpacing / ts.fontSize : 0;
  if (font) {
    const encoded = encodeWithFont(font, text);
    if (encoded.ok) {
      const v = encoded.value;
      return v.glyphWidth + v.charCount * perChar + v.wordSpaceCount * perSpace;
    }
  }
  // Average advance of the original text, applied to the new character count.
  const original = element.source.original;
  const originalChars = Array.from(original.content).length;
  const average = originalChars > 0 ? original.width / originalChars : 0.5;
  return Array.from(text).length * average;
}

/** Recomputes derived geometry (bbox, rotation, font size) after matrix/width changes. */
function withGeometry(element: TextElement, matrix: Matrix, width: number): TextElement {
  return {
    ...element,
    matrix,
    width,
    bbox: boundsOfPoints(
      transformRectCorners(matrix, { x: 0, y: element.descent, width, height: element.ascent - element.descent }),
    ),
    rotation: rotationDegrees(matrix),
    style: { ...element.style, fontSize: Math.round(Math.hypot(matrix[2], matrix[3]) * 1000) / 1000 },
  };
}

function updateElement(
  model: DocumentModel,
  elementId: ElementId,
  update: (element: TextElement, model: DocumentModel) => TextElement,
): DocumentModel {
  const pageIndex = pageNumberOf(elementId) - 1;
  const page = model.pages[pageIndex];
  if (!page) return model;
  let changed = false;
  const elements = page.elements.map((e) => {
    if (e.id !== elementId || e.type !== "text") return e;
    if (!e.editability.allowed) return e;
    changed = true;
    return update(e, model);
  });
  if (!changed) return model;
  const pages = model.pages.slice();
  pages[pageIndex] = { ...page, elements } satisfies PDFPage;
  return { ...model, pages };
}

export function applyOperation(model: DocumentModel, op: EditOperation): DocumentModel {
  switch (op.type) {
    case "setText":
      return updateElement(model, op.elementId, (e, m) => {
        const width = measureText(e, e.fontKey ? m.fonts[e.fontKey] : undefined, op.text);
        return { ...withGeometry(e, e.matrix, width), content: op.text };
      });
    case "move":
      return updateElement(model, op.elementId, (e) => {
        const [a, b, c, d, tx, ty] = e.matrix;
        return withGeometry(e, [a, b, c, d, tx + op.dx, ty + op.dy], e.width);
      });
    case "setStyle":
      return updateElement(model, op.elementId, (e) => {
        let next = e;
        if (op.style.fontSize !== undefined && op.style.fontSize > 0 && e.style.fontSize) {
          const k = op.style.fontSize / e.style.fontSize;
          const [a, b, c, d, tx, ty] = e.matrix;
          next = withGeometry(e, [a * k, b * k, c * k, d * k, tx, ty], e.width);
        }
        if (op.style.color !== undefined) next = { ...next, style: { ...next.style, color: op.style.color } };
        return next;
      });
    case "reset":
      return updateElement(model, op.elementId, (e) => {
        const o = e.source.original;
        const restored = withGeometry(e, o.matrix, o.width);
        return { ...restored, content: o.content, style: { ...restored.style, color: o.color } };
      });
  }
}

export function applyOperations(model: DocumentModel, ops: readonly EditOperation[]): DocumentModel {
  return ops.reduce(applyOperation, model);
}

export interface ElementChanges {
  text: boolean;
  geometry: boolean;
  color: boolean;
  any: boolean;
}

export function changesOf(element: TextElement): ElementChanges {
  const o = element.source.original;
  const text = element.content !== o.content;
  const geometry = !matricesAlmostEqual(element.matrix, o.matrix, 1e-9);
  const color = element.style.color !== o.color;
  return { text, geometry, color, any: text || geometry || color };
}

export function changedElements(model: DocumentModel): TextElement[] {
  return model.pages.flatMap((p) =>
    p.elements.filter((e): e is TextElement => e.type === "text" && changesOf(e).any),
  );
}

export function describeOperation(op: EditOperation): string {
  switch (op.type) {
    case "setText":
      return `Edit text`;
    case "move":
      return "Move text";
    case "setStyle":
      return op.style.color !== undefined ? "Change colour" : "Change font size";
    case "reset":
      return "Reset text";
  }
}
