/**
 * Groups consecutive text runs into line elements. Runs join only when they share
 * every property the exporter needs to redraw them as one piece of text (font,
 * size, spacing, colour, orientation) and sit on the same baseline with a gap
 * smaller than RUN_SPLIT_GAP_EM — so "Employee Name:" and a value placed in a
 * separate column stay separate elements.
 */
import {
  type Matrix,
  applyToPoint,
  boundsOfPoints,
  invert,
  rotationDegrees,
  transformRectCorners,
} from "@/lib/geometry/matrix";
import type { Capability, FontInfo, TextElement, TextStyle } from "@/lib/model/types";
import type { PdfjsFontProps } from "@/lib/pdf/pdfjs/operatorGlyphs";
import { type RawTextRun, RUN_SPLIT_GAP_EM, SPACE_GAP_EM } from "./interpreter";

/** Most a glyph may overlap the previous glyph's advance and still be the same line. */
const MAX_KERN_OVERLAP_EM = -0.45;
const DEFAULT_ASCENT = 0.8;
const DEFAULT_DESCENT = -0.2;

function linearPartsEqual(a: Matrix, b: Matrix): boolean {
  const scale = Math.max(Math.hypot(a[0], a[1]), Math.hypot(a[2], a[3]), 1e-9);
  for (let i = 0; i < 4; i++) if (Math.abs(a[i] - b[i]) > scale * 1e-3) return false;
  return true;
}

function sameState(a: RawTextRun, b: RawTextRun): boolean {
  const x = a.textState;
  const y = b.textState;
  return (
    a.context === b.context &&
    a.fontKey === b.fontKey &&
    a.color === b.color &&
    a.vertical === b.vertical &&
    x.fontSize === y.fontSize &&
    x.charSpacing === y.charSpacing &&
    x.wordSpacing === y.wordSpacing &&
    x.horizontalScaling === y.horizontalScaling &&
    x.rise === y.rise &&
    x.renderMode === y.renderMode &&
    linearPartsEqual(a.matrix, b.matrix)
  );
}

interface Group {
  runs: RawTextRun[];
  inverse: Matrix;
  text: string;
  width: number;
}

export function groupRuns(runs: RawTextRun[]): RawTextRun[][] {
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const run of runs) {
    if (current && sameState(current.runs[0], run)) {
      const start = applyToPoint(current.inverse, { x: run.matrix[4], y: run.matrix[5] });
      const gap = start.x - current.width;
      // Kerning can pull a glyph well back over the previous one's advance ("Te", "AV", "y."),
      // so a negative gap is normal; only a big jump back means a different piece of text.
      if (Math.abs(start.y) < 0.05 && gap > MAX_KERN_OVERLAP_EM && gap < RUN_SPLIT_GAP_EM) {
        if (gap >= SPACE_GAP_EM && !current.text.endsWith(" ") && !run.run.text.startsWith(" ")) {
          current.text += " ";
        }
        current.text += run.run.text;
        current.width = Math.max(current.width, start.x + run.width);
        current.runs.push(run);
        continue;
      }
    }
    let inverse: Matrix;
    try {
      inverse = invert(run.matrix);
    } catch {
      continue; // degenerate (zero-size) text cannot be shown or selected
    }
    current = { runs: [run], inverse, text: run.run.text, width: run.width };
    groups.push(current);
  }
  return groups.map((g) => g.runs);
}

export interface ElementBuildContext {
  pageNumber: number;
  fonts: Record<string, FontInfo>;
  pdfjsFonts: Map<string, PdfjsFontProps>;
  documentEditing: Capability;
  /** Called with the width (ems) of each gap that was read as a space, to learn the font's space width. */
  onSpaceGap?: (fontKey: string, gapEm: number) => void;
}

function editabilityOf(runs: RawTextRun[], font: FontInfo | undefined, doc: Capability): Capability {
  if (!doc.allowed) return doc;
  const first = runs[0];
  if (first.context === "form") {
    return { allowed: false, reason: "This text is inside a reusable Form XObject, which isn't editable yet." };
  }
  if (first.vertical) return { allowed: false, reason: "Vertical text isn't supported for editing." };
  if (first.textState.renderMode === 3 || first.textState.renderMode === 7) {
    return { allowed: false, reason: "This is invisible text (typically an OCR layer), so it isn't editable." };
  }
  if (!font) return { allowed: false, reason: "The font used by this text is missing from the PDF." };
  if (runs.some((r) => !r.verified)) {
    return {
      allowed: false,
      reason: "This font uses a multi-byte encoding that couldn't be verified, so editing is disabled to avoid corrupting the text.",
    };
  }
  return { allowed: true };
}

export function buildTextElement(runs: RawTextRun[], index: number, ctx: ElementBuildContext): TextElement | null {
  const first = runs[0];
  const inverse = invert(first.matrix);
  let content = "";
  let width = 0;
  for (const run of runs) {
    const start = applyToPoint(inverse, { x: run.matrix[4], y: run.matrix[5] });
    const gap = start.x - width;
    if (content && gap >= SPACE_GAP_EM && !content.endsWith(" ") && !run.run.text.startsWith(" ")) {
      content += " ";
      ctx.onSpaceGap?.(first.fontKey, gap);
    }
    content += run.run.text;
    width = Math.max(width, start.x + run.width);
  }
  if (content.trim() === "") return null;

  const font = ctx.fonts[first.fontKey];
  const props = first.pdfjsFontId ? ctx.pdfjsFonts.get(first.pdfjsFontId) : undefined;
  let ascent = props?.ascent;
  let descent = props?.descent;
  const metricsEstimated =
    ascent === undefined || descent === undefined || ascent < 0.3 || ascent > 2 || descent > 0 || descent < -1;
  if (metricsEstimated) {
    ascent = DEFAULT_ASCENT;
    descent = DEFAULT_DESCENT;
  }

  const m = first.matrix;
  const bbox = boundsOfPoints(
    transformRectCorners(m, { x: 0, y: descent!, width, height: ascent! - descent! }),
  );
  const fontSizeUser = Math.hypot(m[2], m[3]);
  const userPerTextUnitX = Math.hypot(m[0], m[1]) / Math.abs(first.textState.fontSize || 1);
  const ts = first.textState;

  const bold = font?.bold ?? props?.bold;
  const italic = font?.italic ?? props?.italic;
  const style: TextStyle = {
    fontFamily: font?.displayName ?? props?.name,
    fontSize: round(fontSizeUser, 3),
    fontWeight: font?.weight ?? (bold === undefined ? undefined : bold ? 700 : 400),
    fontStyle: italic === undefined ? undefined : italic ? "italic" : "normal",
    color: first.color,
    letterSpacing: ts.charSpacing ? round(ts.charSpacing * userPerTextUnitX, 4) : undefined,
    wordSpacing: ts.wordSpacing ? round(ts.wordSpacing * userPerTextUnitX, 4) : undefined,
  };

  return {
    id: `p${ctx.pageNumber}-t${index}`,
    type: "text",
    pageNumber: ctx.pageNumber,
    bbox,
    rotation: rotationDegrees(m),
    content,
    style,
    matrix: m,
    width,
    ascent: ascent!,
    descent: descent!,
    metricsEstimated,
    fontKey: font?.key,
    editability: editabilityOf(runs, font, ctx.documentEditing),
    source: {
      context: first.context,
      fontResource: first.fontResource,
      textState: ts,
      runs: runs.map((r) => r.run),
      original: { content, matrix: m, width, color: first.color },
    },
    pdfMetadata: {
      fontResource: first.fontResource,
      fontSubtype: font?.subtype,
      encoding: font?.encoding,
      embedded: font?.embedded,
      subset: font?.subset,
      renderMode: ts.renderMode,
      operators: runs.length,
    },
  };
}

export function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
