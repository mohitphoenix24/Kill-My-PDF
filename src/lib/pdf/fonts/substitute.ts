/**
 * Substitute fonts, used only when the original font cannot draw the new text
 * (subset fonts missing a glyph, Type 3 fonts, unencodable characters).
 *
 * Order of preference:
 *  1. The bundled DejaVu family when the original *is* DejaVu (exact family match).
 *  2. A standard 14 font of the same class (serif/sans/mono, bold, italic) when
 *     every character is in WinAnsi — viewers always have these, and their
 *     metrics match the common Times/Helvetica/Courier-compatible fonts.
 *  3. Bundled DejaVu of the same class, embedded as a subset — covers ₹ and most
 *     other Unicode text.
 * The substitution is always reported to the user; it is never silent.
 */
import { Encodings } from "@pdf-lib/standard-fonts";
import { StandardFonts } from "pdf-lib";
import type { FontInfo, TextStyle } from "@/lib/model/types";

export type SubstituteFont =
  | { kind: "standard"; name: StandardFonts }
  | { kind: "bundled"; file: string; name: string };

type Family = "serif" | "sans" | "mono";

const STANDARD: Record<Family, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

const BUNDLED: Record<Family, [string, string, string, string]> = {
  sans: ["DejaVuSans", "DejaVuSans-Bold", "DejaVuSans-Oblique", "DejaVuSans-BoldOblique"],
  serif: ["DejaVuSerif", "DejaVuSerif-Bold", "DejaVuSerif-Italic", "DejaVuSerif-BoldItalic"],
  mono: ["DejaVuSansMono", "DejaVuSansMono-Bold", "DejaVuSansMono-Oblique", "DejaVuSansMono-BoldOblique"],
};

function variantIndex(bold: boolean, italic: boolean): 0 | 1 | 2 | 3 {
  return bold ? (italic ? 3 : 1) : italic ? 2 : 0;
}

export function isWinAnsiText(text: string): boolean {
  return Array.from(text).every((ch) => Encodings.WinAnsi.canEncodeUnicodeCodePoint(ch.codePointAt(0)!));
}

export function chooseSubstituteFont(font: FontInfo | undefined, style: TextStyle, text: string): SubstituteFont {
  const family: Family = font?.family ?? "sans";
  const bold = (style.fontWeight ?? 400) >= 600;
  const italic = style.fontStyle === "italic";
  const variant = variantIndex(bold, italic);
  const bundled = (): SubstituteFont => {
    const name = BUNDLED[family][variant];
    return { kind: "bundled", file: `${name}.ttf`, name };
  };
  if (font && /dejavu/i.test(font.displayName)) return bundled();
  if (isWinAnsiText(text)) return { kind: "standard", name: STANDARD[family][variant] };
  return bundled();
}
