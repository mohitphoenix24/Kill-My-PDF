/**
 * Walks a page's content stream, tracking the graphics and text state, and
 * produces positioned text runs that remember exactly which bytes drew them.
 *
 * Glyph widths and unicode come from pdf.js (which has already parsed the fonts);
 * positions, text state and byte ranges come from our own parse. Each text
 * operator is cross-checked against pdf.js's character codes, and any mismatch
 * aborts with a CorrelationError so the caller can fall back to read-only text
 * instead of editing the wrong bytes.
 */
import { PDFDict, PDFName, PDFRawStream, PDFRef, type PDFContext } from "pdf-lib";
import { type Matrix, IDENTITY, multiply, translate } from "@/lib/geometry/matrix";
import type { FontInfo, TextRun, TextStateSnapshot } from "@/lib/model/types";
import { type ContentOperation, type Operand, parseContentStream } from "@/lib/pdf/content/parser";
import {
  arrayValues,
  decodeStream,
  dictGet,
  lookup,
  lookupDict,
  nameValue,
  numberValue,
} from "@/lib/pdf/pdflib/objects";
import type { PdfjsFontProps, PdfjsGlyph, ShowTextEntry } from "@/lib/pdf/pdfjs/operatorGlyphs";
import {
  type ColorSpaceKind,
  type ColorState,
  INITIAL_COLOR,
  colorFromComponents,
  initialColorFor,
  resolveColorSpace,
} from "./colors";

/** A TJ kerning gap at least this wide (in ems) starts a new run. */
export const RUN_SPLIT_GAP_EM = 1.0;
/** A TJ kerning gap at least this wide (in ems) is read as a word space. */
export const SPACE_GAP_EM = 0.2;
const MAX_FORM_DEPTH = 12;

export class CorrelationError extends Error {}

export interface RawTextRun {
  context: "page" | "form";
  fontKey: string;
  fontResource: string;
  pdfjsFontId?: string;
  textState: TextStateSnapshot;
  /** Local em space → user space at the run's first glyph. */
  matrix: Matrix;
  /** Advance width in ems. */
  width: number;
  run: TextRun;
  color?: string;
  /** False when bytes could not be verified against pdf.js (e.g. non-Identity CMaps). */
  verified: boolean;
  vertical: boolean;
}

export interface RawImage {
  name?: string;
  /** Image space (unit square) → user space. */
  matrix: Matrix;
}

export interface FontResolver {
  /** Returns FontInfo for a font dictionary, creating and caching it on first use. */
  resolve(fontDict: PDFDict, ref: PDFRef | undefined, resourceName: string): FontInfo;
}

export interface InterpretInput {
  context: PDFContext;
  operations: ContentOperation[];
  resources: PDFDict | undefined;
  showTexts: ShowTextEntry[];
  pdfjsFonts: Map<string, PdfjsFontProps>;
  fonts: FontResolver;
}

export interface InterpretResult {
  runs: RawTextRun[];
  images: RawImage[];
  warnings: string[];
}

interface TextParams {
  charSpacing: number;
  wordSpacing: number;
  horizontalScaling: number;
  leading: number;
  rise: number;
  renderMode: number;
  fontSize: number;
  fontResource?: string;
  font?: FontInfo;
}

interface GraphicsState {
  ctm: Matrix;
  fill: ColorState;
  stroke: ColorState;
  text: TextParams;
}

const num = (o: Operand | undefined): number => (o?.kind === "number" ? o.value : 0);

function isGlyph(item: PdfjsGlyph | number): item is PdfjsGlyph {
  return typeof item !== "number";
}

export function interpretPage(input: InterpretInput): InterpretResult {
  return new Interpreter(input).runPage();
}

class Interpreter {
  private showIndex = 0;
  private readonly runs: RawTextRun[] = [];
  private readonly images: RawImage[] = [];
  private readonly warnings: string[] = [];
  private readonly formChain = new Set<string>();

  constructor(private readonly input: InterpretInput) {}

  runPage(): InterpretResult {
    const state: GraphicsState = {
      ctm: IDENTITY,
      fill: INITIAL_COLOR,
      stroke: INITIAL_COLOR,
      text: {
        charSpacing: 0,
        wordSpacing: 0,
        horizontalScaling: 1,
        leading: 0,
        rise: 0,
        renderMode: 0,
        fontSize: 0,
      },
    };
    this.execute(this.input.operations, this.input.resources, state, "page", 0);
    if (this.showIndex !== this.input.showTexts.length) {
      throw new CorrelationError(
        `pdf.js evaluated ${this.input.showTexts.length} text operations but the content stream has ${this.showIndex}`,
      );
    }
    return { runs: this.runs, images: this.images, warnings: this.warnings };
  }

  private execute(
    operations: ContentOperation[],
    resources: PDFDict | undefined,
    initial: GraphicsState,
    context: "page" | "form",
    depth: number,
  ): void {
    const { context: pdf } = this.input;
    let gs: GraphicsState = { ...initial, text: { ...initial.text } };
    const stack: GraphicsState[] = [];
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;

    const setColor = (target: "fill" | "stroke", space: ColorSpaceKind, comps: number[]) => {
      gs = { ...gs, [target]: colorFromComponents(space, comps) };
    };
    const nextLine = (tx: number, ty: number) => {
      tlm = multiply(translate(tx, ty), tlm);
      tm = tlm;
    };

    for (let opIndex = 0; opIndex < operations.length; opIndex++) {
      const op = operations[opIndex];
      const o = op.operands;
      switch (op.operator) {
        case "q":
          stack.push(gs);
          gs = { ...gs, text: { ...gs.text } };
          break;
        case "Q":
          if (stack.length > 0) gs = stack.pop()!;
          break;
        case "cm":
          if (o.length === 6) {
            gs = { ...gs, ctm: multiply(o.map(num) as unknown as Matrix, gs.ctm) };
          }
          break;

        // Colour
        case "g":
          setColor("fill", "gray", o.map(num));
          break;
        case "G":
          setColor("stroke", "gray", o.map(num));
          break;
        case "rg":
          setColor("fill", "rgb", o.map(num));
          break;
        case "RG":
          setColor("stroke", "rgb", o.map(num));
          break;
        case "k":
          setColor("fill", "cmyk", o.map(num));
          break;
        case "K":
          setColor("stroke", "cmyk", o.map(num));
          break;
        case "cs":
        case "CS": {
          const space = o[0]?.kind === "name" ? resolveColorSpace(pdf, resources, o[0].value) : "unknown";
          gs = { ...gs, [op.operator === "cs" ? "fill" : "stroke"]: initialColorFor(space) };
          break;
        }
        case "sc":
        case "scn":
        case "SC":
        case "SCN": {
          const target = op.operator.startsWith("s") ? "fill" : "stroke";
          const hasPatternName = o.some((x) => x.kind === "name");
          const space = gs[target].space;
          gs = {
            ...gs,
            [target]: hasPatternName ? { space: "unknown" } : colorFromComponents(space, o.map(num)),
          };
          break;
        }

        // Text object and state
        case "BT":
          tm = IDENTITY;
          tlm = IDENTITY;
          break;
        case "ET":
          break;
        case "Tc":
          gs.text.charSpacing = num(o[0]);
          break;
        case "Tw":
          gs.text.wordSpacing = num(o[0]);
          break;
        case "Tz":
          gs.text.horizontalScaling = num(o[0]) / 100;
          break;
        case "TL":
          gs.text.leading = num(o[0]);
          break;
        case "Ts":
          gs.text.rise = num(o[0]);
          break;
        case "Tr":
          gs.text.renderMode = num(o[0]);
          break;
        case "Tf": {
          const name = o[0]?.kind === "name" ? o[0].value : undefined;
          gs.text.fontSize = num(o[1]);
          gs.text.fontResource = name;
          gs.text.font = name ? this.resolveFont(resources, name) : undefined;
          break;
        }
        case "Td":
          nextLine(num(o[0]), num(o[1]));
          break;
        case "TD":
          gs.text.leading = -num(o[1]);
          nextLine(num(o[0]), num(o[1]));
          break;
        case "Tm":
          if (o.length === 6) {
            tlm = o.map(num) as unknown as Matrix;
            tm = tlm;
          }
          break;
        case "T*":
          nextLine(0, -gs.text.leading);
          break;

        // Text showing
        case "Tj":
          tm = this.showText(op, opIndex, gs, tm, context);
          break;
        case "TJ":
          tm = this.showText(op, opIndex, gs, tm, context);
          break;
        case "'":
          nextLine(0, -gs.text.leading);
          tm = this.showText(op, opIndex, gs, tm, context);
          break;
        case '"':
          gs.text.wordSpacing = num(o[0]);
          gs.text.charSpacing = num(o[1]);
          nextLine(0, -gs.text.leading);
          tm = this.showText(op, opIndex, gs, tm, context);
          break;

        // XObjects and inline images
        case "Do":
          if (o[0]?.kind === "name") this.doXObject(o[0].value, resources, gs, depth);
          break;
        case "BI":
          this.images.push({ matrix: gs.ctm });
          break;
      }
    }
  }

  private resolveFont(resources: PDFDict | undefined, name: string): FontInfo | undefined {
    const { context } = this.input;
    const fonts = lookupDict(context, resources?.get(PDFName.of("Font")));
    const raw = fonts?.get(PDFName.of(name));
    const dict = lookupDict(context, raw);
    if (!dict) {
      this.warnings.push(`Font resource /${name} is missing`);
      return undefined;
    }
    return this.input.fonts.resolve(dict, raw instanceof PDFRef ? raw : undefined, name);
  }

  private doXObject(name: string, resources: PDFDict | undefined, gs: GraphicsState, depth: number): void {
    const { context } = this.input;
    const xobjects = lookupDict(context, resources?.get(PDFName.of("XObject")));
    const raw = xobjects?.get(PDFName.of(name));
    const stream = lookup(context, raw);
    if (!(stream instanceof PDFRawStream)) return;
    const subtype = nameValue(dictGet(context, stream.dict, "Subtype"));
    if (subtype === "Image") {
      this.images.push({ name, matrix: gs.ctm });
      return;
    }
    if (subtype !== "Form") return;

    const key = raw instanceof PDFRef ? `${raw.objectNumber}/${raw.generationNumber}` : name;
    if (depth >= MAX_FORM_DEPTH || this.formChain.has(key)) {
      this.warnings.push(`Skipped nested Form XObject /${name}`);
      return;
    }
    const matrixValues = arrayValues(context, stream.dict.get(PDFName.of("Matrix"))).map(numberValue);
    const formMatrix: Matrix =
      matrixValues.length === 6 && matrixValues.every((v) => v !== undefined)
        ? (matrixValues as unknown as Matrix)
        : IDENTITY;
    const formResources = lookupDict(context, stream.dict.get(PDFName.of("Resources"))) ?? resources;
    let bytes: Uint8Array;
    try {
      bytes = decodeStream(stream);
    } catch {
      this.warnings.push(`Could not decode Form XObject /${name}`);
      throw new CorrelationError(`Undecodable Form XObject /${name}`);
    }
    this.formChain.add(key);
    const parsed = parseContentStream(bytes);
    this.execute(
      parsed.operations,
      formResources,
      { ...gs, ctm: multiply(formMatrix, gs.ctm), text: { ...gs.text } },
      "form",
      depth + 1,
    );
    this.formChain.delete(key);
  }

  /** Shows text for Tj / TJ / ' / ", records runs, and returns the advanced text matrix. */
  private showText(
    op: ContentOperation,
    opIndex: number,
    gs: GraphicsState,
    tm: Matrix,
    context: "page" | "form",
  ): Matrix {
    const ts = gs.text;
    // pdf.js skips text shown before any Tf, so it must not consume an entry either.
    if (!ts.fontResource) return tm;
    const entry = this.input.showTexts[this.showIndex++];
    if (!entry) throw new CorrelationError("pdf.js evaluated fewer text operations than the content stream has");

    const font = ts.font;
    const props = entry.fontId ? this.input.pdfjsFonts.get(entry.fontId) : undefined;
    const fontMatrixX = props?.fontMatrix[0] ?? 0.001;
    const vertical = props?.vertical ?? font?.vertical ?? false;

    // Our view of the operator: a list of strings and kerning numbers with byte spans.
    const operand = op.operands[op.operands.length - 1];
    const parts: Operand[] =
      op.operator === "TJ" ? (operand?.kind === "array" ? operand.items : []) : operand ? [operand] : [];

    // Align pdf.js items with our parts, verifying character codes when we can decode them.
    const codeBytes = font?.codeBytes;
    let verified = codeBytes !== undefined;
    const pdfjsItems = entry.items;
    let cursor = 0;
    interface Piece {
      part: Operand;
      glyphs: PdfjsGlyph[];
      kern?: number;
    }
    const pieces: Piece[] = [];
    for (const part of parts) {
      if (part.kind === "number") {
        const item = pdfjsItems[cursor];
        if (typeof item !== "number" && part.value !== 0) {
          throw new CorrelationError(`Kerning mismatch at op ${opIndex}`);
        }
        if (typeof item === "number") cursor++;
        pieces.push({ part, glyphs: [], kern: part.value });
      } else if (part.kind === "string") {
        const glyphs: PdfjsGlyph[] = [];
        if (codeBytes) {
          const count = Math.floor(part.bytes.length / codeBytes);
          for (let i = 0; i < count; i++) {
            const item = pdfjsItems[cursor++];
            const code = codeBytes === 1 ? part.bytes[i] : (part.bytes[2 * i] << 8) | part.bytes[2 * i + 1];
            if (!item || !isGlyph(item) || item.originalCharCode !== code) {
              throw new CorrelationError(`Character code mismatch at op ${opIndex}`);
            }
            glyphs.push(item);
          }
        } else {
          // Variable-length CMap: take glyphs until the next kerning number.
          while (cursor < pdfjsItems.length && isGlyph(pdfjsItems[cursor])) {
            glyphs.push(pdfjsItems[cursor++] as PdfjsGlyph);
          }
        }
        pieces.push({ part, glyphs });
      }
    }
    // pdf.js drops zero kerning numbers in some paths; anything else left over is a mismatch.
    while (cursor < pdfjsItems.length && pdfjsItems[cursor] === 0) cursor++;
    if (cursor !== pdfjsItems.length) {
      if (codeBytes) throw new CorrelationError(`pdf.js produced extra glyphs at op ${opIndex}`);
      verified = false;
    }

    const fontSize = ts.fontSize;
    const th = ts.horizontalScaling;
    const scaleX = fontSize * th;
    const textState: TextStateSnapshot = {
      fontSize,
      charSpacing: ts.charSpacing,
      wordSpacing: ts.wordSpacing,
      horizontalScaling: th,
      rise: ts.rise,
      renderMode: ts.renderMode,
    };
    const color = ts.renderMode === 1 || ts.renderMode === 5 ? gs.stroke.hex : gs.fill.hex;
    const base: Matrix = multiply(tm, gs.ctm);

    // Walk the pieces, splitting TJ arrays into runs at large gaps.
    let advance = 0; // text space units
    let current: { startAdvance: number; startByte: number; endByte: number; codes: number[]; text: string } | null = null;

    const flush = () => {
      if (!current || current.codes.length === 0 || scaleX === 0) {
        current = null;
        return;
      }
      const runAdvance = advance - current.startAdvance;
      const matrix = multiply([scaleX, 0, 0, fontSize, current.startAdvance, ts.rise], base);
      const isTj = op.operator !== "TJ";
      this.runs.push({
        context,
        fontKey: font?.key ?? `missing:${ts.fontResource}`,
        fontResource: ts.fontResource!,
        pdfjsFontId: entry.fontId,
        textState,
        matrix,
        width: runAdvance / scaleX,
        run: {
          opIndex,
          operator: op.operator as TextRun["operator"],
          opStart: op.start,
          opEnd: op.end,
          start: isTj ? operand!.start : current.startByte,
          end: isTj ? operand!.end : current.endByte,
          codes: current.codes,
          text: current.text,
          advance: runAdvance,
        },
        color,
        verified,
        vertical,
      });
      current = null;
    };

    for (const piece of pieces) {
      if (piece.kern !== undefined) {
        const gapEm = -piece.kern / 1000;
        if (current && gapEm >= RUN_SPLIT_GAP_EM) {
          flush();
        } else if (current && gapEm >= SPACE_GAP_EM && !current.text.endsWith(" ")) {
          current.text += " ";
        }
        advance += gapEm * scaleX;
        if (current) current.endByte = piece.part.end;
        continue;
      }
      if (piece.glyphs.length === 0) continue;
      if (!current) {
        current = { startAdvance: advance, startByte: piece.part.start, endByte: piece.part.end, codes: [], text: "" };
      }
      current.endByte = piece.part.end;
      for (const glyph of piece.glyphs) {
        const widthEm = glyph.width * fontMatrixX;
        advance += (widthEm * fontSize + ts.charSpacing + (glyph.isSpace ? ts.wordSpacing : 0)) * th;
        current.codes.push(glyph.originalCharCode);
        current.text += glyph.unicode ?? "";
        // A space the document itself shows is safe to show again even when pdf.js sees no outline for it
        // (generators routinely subset it to an empty glyph); it also gives the font its real space width.
        const shownSpace = glyph.unicode === " ";
        if (font && (glyph.isInFont || props?.missingFile || shownSpace) && glyph.unicode && [...glyph.unicode].length === 1) {
          font.glyphs[glyph.unicode] ??= { code: glyph.originalCharCode, width: widthEm };
        }
      }
    }
    flush();

    return multiply(translate(advance, 0), tm);
  }
}
