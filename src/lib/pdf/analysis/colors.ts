/**
 * Colour tracking for the content interpreter. Only device-like spaces with a
 * known component count are converted to hex; Pattern, Separation, DeviceN,
 * Indexed and Lab colours are reported as unknown rather than approximated.
 */
import { PDFArray, PDFDict, PDFName, PDFRawStream, type PDFContext } from "pdf-lib";
import { dictGet, lookup, nameValue, numberValue } from "@/lib/pdf/pdflib/objects";

export type ColorSpaceKind = "gray" | "rgb" | "cmyk" | "unknown";

export interface ColorState {
  space: ColorSpaceKind;
  /** #rrggbb, or undefined when the colour cannot be represented reliably. */
  hex?: string;
}

export const INITIAL_COLOR: ColorState = { space: "gray", hex: "#000000" };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toHexByte = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");

export function rgbHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

export function colorFromComponents(space: ColorSpaceKind, comps: number[]): ColorState {
  switch (space) {
    case "gray":
      return comps.length === 1 ? { space, hex: rgbHex(comps[0], comps[0], comps[0]) } : { space };
    case "rgb":
      return comps.length === 3 ? { space, hex: rgbHex(comps[0], comps[1], comps[2]) } : { space };
    case "cmyk": {
      if (comps.length !== 4) return { space };
      const [c, m, y, k] = comps;
      // Naive conversion (no ICC profile) — close for typical document colours.
      return { space, hex: rgbHex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)) };
    }
    default:
      return { space };
  }
}

export function initialColorFor(space: ColorSpaceKind): ColorState {
  switch (space) {
    case "gray":
      return colorFromComponents("gray", [0]);
    case "rgb":
      return colorFromComponents("rgb", [0, 0, 0]);
    case "cmyk":
      return colorFromComponents("cmyk", [0, 0, 0, 1]);
    default:
      return { space };
  }
}

export function resolveColorSpace(
  context: PDFContext,
  resources: PDFDict | undefined,
  name: string,
): ColorSpaceKind {
  switch (name) {
    case "DeviceGray":
    case "G":
    case "CalGray":
      return "gray";
    case "DeviceRGB":
    case "RGB":
    case "CalRGB":
      return "rgb";
    case "DeviceCMYK":
    case "CMYK":
      return "cmyk";
    case "Pattern":
      return "unknown";
  }
  const csDict = dictGet(context, resources, "ColorSpace");
  const entry = csDict instanceof PDFDict ? lookup(context, csDict.get(PDFName.of(name))) : undefined;
  return colorSpaceFromObject(context, entry);
}

function colorSpaceFromObject(context: PDFContext, obj: unknown): ColorSpaceKind {
  if (obj instanceof PDFName) return resolveColorSpace(context, undefined, obj.decodeText());
  if (!(obj instanceof PDFArray) || obj.size() === 0) return "unknown";
  const family = nameValue(lookup(context, obj.get(0)));
  switch (family) {
    case "CalGray":
      return "gray";
    case "CalRGB":
      return "rgb";
    case "ICCBased": {
      const stream = lookup(context, obj.get(1));
      const n = stream instanceof PDFRawStream ? numberValue(dictGet(context, stream.dict, "N")) : undefined;
      return n === 1 ? "gray" : n === 3 ? "rgb" : n === 4 ? "cmyk" : "unknown";
    }
    default:
      return "unknown";
  }
}
