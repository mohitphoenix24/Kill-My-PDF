/**
 * Normalised, serialisable document model.
 *
 * It sits between the PDF parser and everything else (editor UI, exporter, and a
 * future AI command layer). All coordinates are PDF user space: origin at the
 * bottom-left of the MediaBox, y up, 1 unit = 1/72 inch.
 *
 * Values the PDF does not expose are left `undefined` — never guessed.
 */
import type { Matrix } from "@/lib/geometry/matrix";

export type ElementId = string;

export interface DocumentModel {
  id: string;
  fileName: string;
  pageCount: number;
  /** Index i holds page number i + 1. Pages are analysed lazily (see `status`). */
  pages: PDFPage[];
  /** Fonts referenced by analysed text, keyed by `FontInfo.key`. */
  fonts: Record<string, FontInfo>;
  /** Whether content-stream editing is possible at all for this file. */
  editing: Capability;
}

export interface Capability {
  allowed: boolean;
  /** User-facing explanation when not allowed. */
  reason?: string;
}

export type PageStatus = "pending" | "ready" | "error";

/** How a page's content was classified during analysis. */
export type PageContentKind =
  | "text" // has visible native text
  | "scanned" // image(s) without visible native text
  | "scanned-ocr" // image(s) with only an invisible text layer (typical OCR output)
  | "no-text"; // neither text nor raster images (vector-only or blank)

export interface PDFPage {
  pageNumber: number;
  /** Visible region in user space, [x0, y0, x1, y1] (CropBox ∩ MediaBox). */
  viewBox: [number, number, number, number];
  /** Unrotated size of the view box, in user space units. */
  width: number;
  height: number;
  /** /Rotate in degrees (0, 90, 180, 270). */
  rotation: number;
  userUnit: number;
  status: PageStatus;
  /** User-facing message when status is "error". */
  error?: string;
  contentKind?: PageContentKind;
  elements: PDFElement[];
  /** User-facing notes about limitations found on this page. */
  notices: string[];
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextStyle {
  /** Font name from the PDF with any subset tag (ABCDEF+) removed. */
  fontFamily?: string;
  /** Effective size in user space units (Tf size × text/CTM scale). */
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  /** Fill colour as #rrggbb (converted from Gray/CMYK where needed). */
  color?: string;
  /** PDFs store positioned glyphs, not alignment — so this is normally undefined. */
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  /** Character spacing (Tc) in user space units. */
  letterSpacing?: number;
  /** Word spacing (Tw) in user space units. */
  wordSpacing?: number;
}

interface BaseElement {
  id: ElementId;
  pageNumber: number;
  /** Axis-aligned bounds in PDF user space. */
  bbox: BBox;
  /** Degrees counter-clockwise relative to the page's user space. */
  rotation: number;
  pdfMetadata?: Record<string, unknown>;
}

export interface TextElement extends BaseElement {
  type: "text";
  content: string;
  style: TextStyle;
  /**
   * Maps the element's local space to user space. Local space is measured in ems:
   * x runs along the baseline from the first glyph's origin, y is up, and 1 unit
   * equals the font size. Moving or resizing the element changes this matrix.
   */
  matrix: Matrix;
  /** Advance width of the content in local units (ems). */
  width: number;
  /** Font ascent/descent in local units; descent is negative. */
  ascent: number;
  descent: number;
  /** True when ascent/descent were not available from the font and defaults were used. */
  metricsEstimated: boolean;
  fontKey?: string;
  editability: Capability;
  /** Where the text lives in the original PDF — used by the exporter. Never edited. */
  source: TextSource;
}

export interface ImageElement extends BaseElement {
  type: "image";
  /** Image XObject resource name, or undefined for inline images. */
  name?: string;
}

export type PDFElement = TextElement | ImageElement;

/** Text state captured when the element's first run was shown. */
export interface TextStateSnapshot {
  /** Tf size operand (text space). */
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  /** Tz / 100. */
  horizontalScaling: number;
  rise: number;
  renderMode: number;
}

/**
 * One contiguous piece of a text-showing operator. A Tj/'/" operator is one run;
 * a TJ array may be split into several runs at large kerning gaps.
 */
export interface TextRun {
  /** Index of the operator in the parsed (concatenated) page content. */
  opIndex: number;
  operator: "Tj" | "TJ" | "'" | '"';
  /** Byte range of the whole operation (operands + operator). */
  opStart: number;
  opEnd: number;
  /** Byte range of the string (Tj/'/") or the covered TJ array items. */
  start: number;
  end: number;
  /** Character codes shown by this run. */
  codes: number[];
  text: string;
  /** Total horizontal advance in text space units (what Tm moves by). */
  advance: number;
}

export interface TextSource {
  context: "page" | "form";
  /** Font resource name used by Tf, e.g. "F1". */
  fontResource: string;
  textState: TextStateSnapshot;
  runs: TextRun[];
  /** Values as found in the PDF, to detect what the user changed. */
  original: {
    content: string;
    matrix: Matrix;
    width: number;
    color?: string;
  };
}

export type FontSubtype = "Type0" | "Type1" | "MMType1" | "TrueType" | "Type3" | "unknown";

export interface FontInfo {
  /** Indirect reference ("12 0 R") or a page-scoped key for direct font dicts. */
  key: string;
  baseFont?: string;
  /** baseFont without the subset tag. */
  displayName: string;
  subtype: FontSubtype;
  /** Font program embedded in the PDF. */
  embedded: boolean;
  /** Name has a subset tag (ABCDEF+), so it only contains the glyphs originally used. */
  subset: boolean;
  /** Encoding name (WinAnsiEncoding, Identity-H, …) or "custom". */
  encoding?: string;
  hasDifferences: boolean;
  /** Bytes per character code: 1 for simple fonts, 2 for Identity-H/V; undefined if unknown. */
  codeBytes?: 1 | 2;
  vertical: boolean;
  bold?: boolean;
  italic?: boolean;
  weight?: number;
  /** Where bold/italic came from — descriptor flags are reliable; names are a convention. */
  styleSource?: "descriptor" | "pdfjs" | "name";
  family: "serif" | "sans" | "mono" | undefined;
  /** Standard 14 font this font *is* (non-embedded with a standard name). */
  standardFont?: string;
  /** /FirstChar, /LastChar and /Widths (glyph space / 1000) for simple fonts. */
  widths?: { firstChar: number; values: number[] };
  /**
   * Glyphs observed in this document: unicode character → char code and advance (ems).
   * These glyphs are known to exist in the font program, even for subsets.
   */
  glyphs: Record<string, { code: number; width: number }>;
  /**
   * How wide the gap between words is, in ems, measured from the document itself. Needed because
   * many generators (Chrome's "Print to PDF", most browsers and some report tools) never write a
   * space glyph: words are just positioned apart, so the font has no space to reuse.
   */
  spaceWidth?: number;
}

export function isTextElement(e: PDFElement): e is TextElement {
  return e.type === "text";
}
