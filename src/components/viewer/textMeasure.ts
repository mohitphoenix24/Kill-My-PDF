import type { FontInfo, TextElement } from "@/lib/model/types";
import { type WordSpan, wordAtFraction } from "@/lib/text/words";

const CSS_FAMILY: Record<NonNullable<FontInfo["family"]>, string> = {
  serif: '"Times New Roman", Times, serif',
  sans: "Helvetica, Arial, sans-serif",
  mono: '"Courier New", Courier, monospace',
};

/** A CSS font family that looks roughly like the PDF font (used for typing and for tap targeting). */
export function cssFamilyFor(font: FontInfo | undefined): string {
  return CSS_FAMILY[font?.family ?? "sans"];
}

let ctx: CanvasRenderingContext2D | null | undefined;

/**
 * Cumulative widths per character boundary for `text` in a font that looks like the element's.
 * Only proportions matter (they're scaled to the element's real width), so the stand-in font
 * doesn't have to match exactly.
 */
export function characterBoundaries(element: TextElement, font: FontInfo | undefined, text = element.content): number[] {
  if (ctx === undefined) ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  const chars = Array.from(text);
  if (!ctx) return chars.map((_, i) => i).concat(chars.length);
  const italic = element.style.fontStyle === "italic" ? "italic " : "";
  ctx.font = `${italic}${element.style.fontWeight ?? 400} 100px ${cssFamilyFor(font)}`;
  const boundaries = [0];
  let acc = "";
  for (const ch of chars) {
    acc += ch;
    boundaries.push(ctx.measureText(acc).width);
  }
  return boundaries;
}

/** The word under a tap, `fraction` of the way along the element's line. */
export function wordAtTap(element: TextElement, font: FontInfo | undefined, fraction: number): WordSpan | null {
  return wordAtFraction(element.content, characterBoundaries(element, font), fraction);
}
