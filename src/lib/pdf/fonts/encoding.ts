/**
 * Encoding new text with a font that already exists in the PDF.
 *
 * A character can be written with the original font only when we *know* the font
 * can draw it:
 *  1. the glyph was observed elsewhere in the document (so it exists even in a
 *     subset font), or
 *  2. the font is not embedded, uses WinAnsiEncoding without /Differences, and the
 *     character is in WinAnsi — the viewer supplies these glyphs itself.
 * Anything else returns `ok: false` and the caller substitutes a font.
 *
 * Spaces are special. Many generators (Chrome's "Print to PDF" among them) never draw a
 * space glyph: they just position the next word further along. For those fonts a space is
 * written as a TJ kerning move of the document's own word-gap width, so a line keeps its
 * original font even though the font has no space to reuse.
 */
import { Encodings, Font, type FontNames } from "@pdf-lib/standard-fonts";
import type { FontInfo } from "@/lib/model/types";

/** Used only when a font has no space glyph and the document never showed us a word gap. */
export const DEFAULT_SPACE_EM = 0.278;

export type EncodedPart =
  /** Raw character codes for the content stream. */
  | { kind: "codes"; bytes: Uint8Array }
  /** A horizontal move standing in for a space the font can't draw, in ems. */
  | { kind: "gap"; em: number };

export interface EncodedText {
  parts: EncodedPart[];
  /** Total advance in ems, including gaps (excluding Tc/Tw). */
  glyphWidth: number;
  charCount: number;
  /** Number of single-byte code 32 characters (word spacing applies to these). */
  wordSpaceCount: number;
  /** True when at least one space became a gap, so the text must be shown with TJ. */
  hasGaps: boolean;
}

export type EncodeResult = { ok: true; value: EncodedText } | { ok: false; missing: string };

const metricsCache = new Map<string, Font>();

function standardWidth(fontName: string, glyphName: string): number | undefined {
  let font = metricsCache.get(fontName);
  if (!font) {
    font = Font.load(fontName as FontNames);
    metricsCache.set(fontName, font);
  }
  const width = font.getWidthOfGlyph(glyphName);
  return typeof width === "number" ? width / 1000 : undefined;
}

function widthFromDict(font: FontInfo, code: number): number | undefined {
  if (!font.widths) return undefined;
  const w = font.widths.values[code - font.widths.firstChar];
  return w !== undefined && w > 0 ? w : undefined;
}

function codeBytes(font: FontInfo, codes: number[]): Uint8Array {
  const size = font.codeBytes ?? 1;
  const bytes = new Uint8Array(codes.length * size);
  codes.forEach((code, i) => {
    if (size === 1) bytes[i] = code;
    else {
      bytes[2 * i] = code >> 8;
      bytes[2 * i + 1] = code & 0xff;
    }
  });
  return bytes;
}

export function encodeWithFont(font: FontInfo, text: string): EncodeResult {
  if (font.codeBytes === undefined || font.subtype === "Type3" || font.vertical) {
    return { ok: false, missing: text.slice(0, 1) };
  }
  const parts: EncodedPart[] = [];
  let codes: number[] = [];
  let glyphWidth = 0;
  let wordSpaceCount = 0;
  let hasGaps = false;
  const chars = Array.from(text);
  const flush = () => {
    if (codes.length > 0) parts.push({ kind: "codes", bytes: codeBytes(font, codes) });
    codes = [];
  };

  for (const ch of chars) {
    const known = font.glyphs[ch];
    if (known) {
      codes.push(known.code);
      glyphWidth += known.width;
      if (font.codeBytes === 1 && known.code === 32) wordSpaceCount++;
      continue;
    }

    if (ch === " ") {
      // No space glyph to reuse (Chrome-style PDFs): move instead of drawing.
      const em = font.spaceWidth ?? DEFAULT_SPACE_EM;
      flush();
      parts.push({ kind: "gap", em });
      glyphWidth += em;
      hasGaps = true;
      continue;
    }

    const cp = ch.codePointAt(0)!;
    const viewerSupplied = !font.embedded && font.codeBytes === 1 && !font.hasDifferences && font.encoding === "WinAnsiEncoding";
    if (!viewerSupplied || !Encodings.WinAnsi.canEncodeUnicodeCodePoint(cp)) return { ok: false, missing: ch };
    const { code, name } = Encodings.WinAnsi.encodeUnicodeCodePoint(cp);
    // With a /Widths array, a code outside it would be drawn with /MissingWidth (usually 0).
    const width = widthFromDict(font, code) ?? (font.widths ? undefined : font.standardFont ? standardWidth(font.standardFont, name) : undefined);
    if (width === undefined) return { ok: false, missing: ch };
    codes.push(code);
    glyphWidth += width;
  }
  flush();
  return { ok: true, value: { parts, glyphWidth, charCount: chars.length, wordSpaceCount, hasGaps } };
}

/** The codes of a gap-free encoding as one string, or undefined if it contains gaps. */
export function singleCodeString(value: EncodedText): Uint8Array | undefined {
  if (value.hasGaps) return undefined;
  const only = value.parts[0];
  if (value.parts.length === 0) return new Uint8Array();
  return value.parts.length === 1 && only.kind === "codes" ? only.bytes : undefined;
}
