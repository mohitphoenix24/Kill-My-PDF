/**
 * Reads what a PDF font dictionary says about itself. Nothing here is guessed
 * from rendering: values come from /BaseFont, /Subtype, /Encoding, the
 * FontDescriptor and /Widths. The only convention-based inference is reading
 * "Bold"/"Italic" from the font name, which is recorded via `styleSource`.
 */
import { PDFDict, PDFName, type PDFContext } from "pdf-lib";
import type { FontInfo, FontSubtype } from "@/lib/model/types";
import { arrayValues, dictGet, lookupDict, nameValue, numberValue } from "@/lib/pdf/pdflib/objects";

export const STANDARD_14 = new Set([
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Times-BoldItalic",
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Courier",
  "Courier-Bold",
  "Courier-Oblique",
  "Courier-BoldOblique",
  "Symbol",
  "ZapfDingbats",
]);

// FontDescriptor /Flags bits (ISO 32000-1 Table 123).
const FLAG_FIXED_PITCH = 1 << 0;
const FLAG_SERIF = 1 << 1;
const FLAG_ITALIC = 1 << 6;
const FLAG_FORCE_BOLD = 1 << 18;

const SUBSET_TAG = /^[A-Z]{6}\+/;

export function stripSubsetTag(name: string): string {
  return name.replace(SUBSET_TAG, "");
}

function subtypeOf(name: string | undefined): FontSubtype {
  switch (name) {
    case "Type0":
    case "Type1":
    case "MMType1":
    case "TrueType":
    case "Type3":
      return name;
    default:
      return "unknown";
  }
}

export function classifyFamily(name: string, flags: number | undefined): FontInfo["family"] {
  if (flags !== undefined && flags & FLAG_FIXED_PITCH) return "mono";
  if (/courier|mono|consol|menlo|inconsolata|lucida ?console|code/i.test(name)) return "mono";
  if (/sans|arial|helvet|verdana|calibri|segoe|tahoma|trebuchet|gothic|roboto|open ?sans|lato|inter\b|futura|frutiger|myriad/i.test(name)) {
    return "sans";
  }
  if (flags !== undefined && flags & FLAG_SERIF) return "serif";
  if (/times|serif|georgia|garamond|cambria|palatino|minion|baskerville|bookman|roman|century|caslon/i.test(name)) {
    return "serif";
  }
  return undefined;
}

/** Bold/italic from a font name such as "Arial-BoldItalicMT" or "Calibri,Bold". */
export function styleFromName(name: string): { bold: boolean; italic: boolean; weight: number } {
  const bold = /bold|black|heavy|semibold|demibold|demi\b|extrabold|ultrabold/i.test(name);
  const italic = /italic|oblique|\bit\b|-it$/i.test(name);
  let weight = 400;
  if (/thin|hairline/i.test(name)) weight = 100;
  else if (/extralight|ultralight/i.test(name)) weight = 200;
  else if (/light/i.test(name)) weight = 300;
  else if (/medium/i.test(name)) weight = 500;
  if (/semibold|demibold|demi\b/i.test(name)) weight = 600;
  else if (/extrabold|ultrabold/i.test(name)) weight = 800;
  else if (/black|heavy/i.test(name)) weight = 900;
  else if (bold) weight = 700;
  return { bold, italic, weight };
}

/** Builds FontInfo (without observed glyphs) from a font dictionary. */
export function readFontInfo(context: PDFContext, fontDict: PDFDict, key: string): FontInfo {
  const subtype = subtypeOf(nameValue(dictGet(context, fontDict, "Subtype")));
  const baseFont = nameValue(dictGet(context, fontDict, "BaseFont"));
  const displayName = baseFont ? stripSubsetTag(baseFont) : subtype === "Type3" ? "Type 3 font" : "Unnamed font";

  // Composite fonts keep their descriptor on the descendant CIDFont.
  let descriptorOwner: PDFDict | undefined = fontDict;
  let encodingName: string | undefined;
  let hasDifferences = false;
  let codeBytes: 1 | 2 | undefined;
  let vertical = false;

  const encodingObj = dictGet(context, fontDict, "Encoding");
  if (subtype === "Type0") {
    descriptorOwner = lookupDict(context, arrayValues(context, fontDict.get(PDFName.of("DescendantFonts")))[0]);
    encodingName = nameValue(encodingObj) ?? "custom";
    if (encodingName === "Identity-H" || encodingName === "Identity-V") codeBytes = 2;
    vertical = encodingName.endsWith("-V");
  } else {
    codeBytes = 1;
    if (encodingObj instanceof PDFDict) {
      encodingName = nameValue(dictGet(context, encodingObj, "BaseEncoding")) ?? "custom";
      hasDifferences = arrayValues(context, encodingObj.get(PDFName.of("Differences"))).length > 0;
    } else {
      encodingName = nameValue(encodingObj);
    }
  }

  const descriptor = lookupDict(context, descriptorOwner?.get(PDFName.of("FontDescriptor")));
  const flags = numberValue(dictGet(context, descriptor, "Flags"));
  const fontWeight = numberValue(dictGet(context, descriptor, "FontWeight"));
  const italicAngle = numberValue(dictGet(context, descriptor, "ItalicAngle"));
  const embedded =
    subtype === "Type3" ||
    ["FontFile", "FontFile2", "FontFile3"].some((k) => descriptor?.get(PDFName.of(k)) !== undefined);

  const info: FontInfo = {
    key,
    baseFont,
    displayName,
    subtype,
    embedded,
    subset: baseFont ? SUBSET_TAG.test(baseFont) : false,
    encoding: encodingName,
    hasDifferences,
    codeBytes,
    vertical,
    family: classifyFamily(displayName, flags),
    standardFont: !embedded && baseFont && STANDARD_14.has(baseFont) ? baseFont : undefined,
    glyphs: {},
  };

  if (flags !== undefined || fontWeight !== undefined || italicAngle !== undefined) {
    const nameStyle = styleFromName(displayName);
    info.weight = fontWeight ?? (flags !== undefined && flags & FLAG_FORCE_BOLD ? 700 : nameStyle.weight);
    info.bold = info.weight >= 600;
    info.italic = (flags !== undefined && (flags & FLAG_ITALIC) !== 0) || (italicAngle !== undefined && italicAngle !== 0) || nameStyle.italic;
    info.styleSource = "descriptor";
  } else if (baseFont) {
    const s = styleFromName(displayName);
    Object.assign(info, { bold: s.bold, italic: s.italic, weight: s.weight, styleSource: "name" as const });
  }

  if (subtype !== "Type0") {
    const firstChar = numberValue(dictGet(context, fontDict, "FirstChar"));
    const widths = arrayValues(context, fontDict.get(PDFName.of("Widths")));
    if (firstChar !== undefined && widths.length > 0) {
      info.widths = { firstChar, values: widths.map((w) => (numberValue(w) ?? 0) / 1000) };
    }
  }
  return info;
}
