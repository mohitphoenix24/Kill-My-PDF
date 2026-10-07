/**
 * Extracts, in content order, every text-showing operation pdf.js evaluated for a
 * page, with per-glyph character codes, unicode and advance widths.
 *
 * pdf.js converts Tj, TJ, ' and " into `showText`, and inlines Form XObjects, so
 * this sequence lines up 1:1 with the show-text operators our own interpreter
 * visits — which is verified glyph by glyph during analysis.
 */
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { AnnotationMode, OPS } from "./pdfjs";

export interface PdfjsGlyph {
  originalCharCode: number;
  unicode: string;
  /** Advance in glyph space units (multiply by fontMatrix[0] to get ems). */
  width: number;
  isSpace: boolean;
  isInFont: boolean;
}

/** A TJ kerning adjustment, in thousandths of text space units. */
export type ShowTextItem = PdfjsGlyph | number;

export interface ShowTextEntry {
  items: ShowTextItem[];
  /** pdf.js internal font id (key into commonObjs). */
  fontId: string | undefined;
}

export interface PdfjsFontProps {
  name?: string;
  bold?: boolean;
  italic?: boolean;
  vertical: boolean;
  missingFile: boolean;
  ascent?: number;
  descent?: number;
  /** Glyph space → text space; [0.001, 0, 0, 0.001, 0, 0] for most fonts. */
  fontMatrix: number[];
}

export async function getShowTextEntries(page: PDFPageProxy): Promise<ShowTextEntry[]> {
  const opList = await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
  const entries: ShowTextEntry[] = [];
  let fontId: string | undefined;
  const fontStack: Array<string | undefined> = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown[] | null;
    switch (fn) {
      case OPS.setFont:
        fontId = args?.[0] as string;
        break;
      case OPS.save:
      case OPS.paintFormXObjectBegin:
        fontStack.push(fontId);
        break;
      case OPS.restore:
      case OPS.paintFormXObjectEnd:
        if (fontStack.length > 0) fontId = fontStack.pop();
        break;
      case OPS.showText:
        entries.push({ items: (args?.[0] as ShowTextItem[]) ?? [], fontId });
        break;
    }
  }
  return entries;
}

const DEFAULT_FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0];

export async function getFontProps(page: PDFPageProxy, fontId: string): Promise<PdfjsFontProps | undefined> {
  const font = await new Promise<Record<string, unknown> | undefined>((resolve) => {
    try {
      if (page.commonObjs.has(fontId)) {
        resolve(page.commonObjs.get(fontId) as Record<string, unknown>);
        return;
      }
    } catch {
      // fall through to the async form
    }
    const timer = setTimeout(() => resolve(undefined), 2000);
    try {
      page.commonObjs.get(fontId, (value: unknown) => {
        clearTimeout(timer);
        resolve(value as Record<string, unknown>);
      });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
  if (!font) return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    name: typeof font.name === "string" ? font.name : undefined,
    bold: typeof font.bold === "boolean" ? font.bold : undefined,
    italic: typeof font.italic === "boolean" ? font.italic : undefined,
    vertical: font.vertical === true,
    missingFile: font.missingFile === true,
    ascent: num(font.ascent),
    descent: num(font.descent),
    fontMatrix: Array.isArray(font.fontMatrix) ? (font.fontMatrix as number[]) : DEFAULT_FONT_MATRIX,
  };
}
