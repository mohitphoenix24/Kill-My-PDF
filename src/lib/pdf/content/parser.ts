/**
 * Tokenizer + parser for PDF content streams (ISO 32000-1 §7.8.2).
 *
 * Every operand and operation keeps its byte range in the decoded stream so the
 * exporter can splice replacement bytes into exactly the right place without
 * re-serialising (and possibly altering) the rest of the stream.
 */

interface Span {
  start: number;
  /** Exclusive. */
  end: number;
}

export type Operand =
  | ({ kind: "number"; value: number } & Span)
  | ({ kind: "name"; value: string } & Span)
  | ({ kind: "string"; bytes: Uint8Array; hex: boolean } & Span)
  | ({ kind: "array"; items: Operand[] } & Span)
  | ({ kind: "dict"; entries: Map<string, Operand> } & Span)
  | ({ kind: "boolean"; value: boolean } & Span)
  | ({ kind: "null" } & Span);

export interface ContentOperation extends Span {
  operator: string;
  operands: Operand[];
}

export interface ParsedContent {
  operations: ContentOperation[];
  /** Non-fatal problems (malformed tokens that were skipped). */
  warnings: string[];
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

const isWhitespace = (c: number) => WHITESPACE.has(c);
const isDelimiter = (c: number) => DELIMITERS.has(c);
const isRegular = (c: number) => !isWhitespace(c) && !isDelimiter(c);

function hexValue(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x37;
  if (c >= 0x61 && c <= 0x66) return c - 0x57;
  return -1;
}

type Token =
  | Operand
  | ({ kind: "operator"; value: string } & Span)
  | ({ kind: "arrayStart" } & Span)
  | ({ kind: "arrayEnd" } & Span)
  | ({ kind: "dictStart" } & Span)
  | ({ kind: "dictEnd" } & Span);

class Lexer {
  pos = 0;
  readonly warnings: string[] = [];

  constructor(private readonly data: Uint8Array) {}

  private skipWhitespaceAndComments(): void {
    const d = this.data;
    while (this.pos < d.length) {
      const c = d[this.pos];
      if (isWhitespace(c)) {
        this.pos++;
      } else if (c === 0x25 /* % */) {
        while (this.pos < d.length && d[this.pos] !== 0x0a && d[this.pos] !== 0x0d) this.pos++;
      } else {
        break;
      }
    }
  }

  next(): Token | null {
    this.skipWhitespaceAndComments();
    const d = this.data;
    if (this.pos >= d.length) return null;
    const start = this.pos;
    const c = d[start];

    switch (c) {
      case 0x28 /* ( */:
        return this.readLiteralString();
      case 0x3c /* < */:
        if (d[start + 1] === 0x3c) {
          this.pos += 2;
          return { kind: "dictStart", start, end: this.pos };
        }
        return this.readHexString();
      case 0x3e /* > */:
        if (d[start + 1] === 0x3e) {
          this.pos += 2;
          return { kind: "dictEnd", start, end: this.pos };
        }
        this.pos++;
        this.warnings.push(`Unexpected '>' at byte ${start}`);
        return this.next();
      case 0x5b /* [ */:
        this.pos++;
        return { kind: "arrayStart", start, end: this.pos };
      case 0x5d /* ] */:
        this.pos++;
        return { kind: "arrayEnd", start, end: this.pos };
      case 0x2f /* / */:
        return this.readName();
      case 0x29 /* ) */:
      case 0x7b /* { */:
      case 0x7d /* } */:
        this.pos++;
        this.warnings.push(`Unexpected '${String.fromCharCode(c)}' at byte ${start}`);
        return this.next();
    }

    // Number or keyword: a run of regular characters.
    while (this.pos < d.length && isRegular(d[this.pos])) this.pos++;
    const word = latin1(d.subarray(start, this.pos));
    const numeric = parseNumber(word);
    if (numeric !== null) return { kind: "number", value: numeric, start, end: this.pos };
    if (word === "true" || word === "false") return { kind: "boolean", value: word === "true", start, end: this.pos };
    if (word === "null") return { kind: "null", start, end: this.pos };
    return { kind: "operator", value: word, start, end: this.pos };
  }

  private readName(): Operand {
    const d = this.data;
    const start = this.pos++;
    const bytes: number[] = [];
    while (this.pos < d.length && isRegular(d[this.pos])) {
      const ch = d[this.pos];
      if (ch === 0x23 /* # */ && hexValue(d[this.pos + 1]) >= 0 && hexValue(d[this.pos + 2]) >= 0) {
        bytes.push(hexValue(d[this.pos + 1]) * 16 + hexValue(d[this.pos + 2]));
        this.pos += 3;
      } else {
        bytes.push(ch);
        this.pos++;
      }
    }
    return { kind: "name", value: latin1(Uint8Array.from(bytes)), start, end: this.pos };
  }

  private readLiteralString(): Operand {
    const d = this.data;
    const start = this.pos++;
    const out: number[] = [];
    let depth = 1;
    while (this.pos < d.length) {
      const ch = d[this.pos++];
      if (ch === 0x5c /* \ */) {
        if (this.pos >= d.length) break;
        const esc = d[this.pos++];
        switch (esc) {
          case 0x6e: out.push(0x0a); break; // n
          case 0x72: out.push(0x0d); break; // r
          case 0x74: out.push(0x09); break; // t
          case 0x62: out.push(0x08); break; // b
          case 0x66: out.push(0x0c); break; // f
          case 0x0d: // line continuation: backslash + EOL produces nothing
            if (d[this.pos] === 0x0a) this.pos++;
            break;
          case 0x0a:
            break;
          default:
            if (esc >= 0x30 && esc <= 0x37) {
              let value = esc - 0x30;
              for (let i = 0; i < 2 && d[this.pos] >= 0x30 && d[this.pos] <= 0x37; i++) {
                value = value * 8 + (d[this.pos++] - 0x30);
              }
              out.push(value & 0xff);
            } else {
              out.push(esc); // \( \) \\ and unknown escapes map to the character itself
            }
        }
      } else if (ch === 0x28) {
        depth++;
        out.push(ch);
      } else if (ch === 0x29) {
        if (--depth === 0) {
          return { kind: "string", bytes: Uint8Array.from(out), hex: false, start, end: this.pos };
        }
        out.push(ch);
      } else if (ch === 0x0d) {
        // Unescaped EOL markers inside literal strings are read as a single LF.
        if (d[this.pos] === 0x0a) this.pos++;
        out.push(0x0a);
      } else {
        out.push(ch);
      }
    }
    this.warnings.push(`Unterminated literal string at byte ${start}`);
    return { kind: "string", bytes: Uint8Array.from(out), hex: false, start, end: this.pos };
  }

  private readHexString(): Operand {
    const d = this.data;
    const start = this.pos++;
    const out: number[] = [];
    let high = -1;
    while (this.pos < d.length) {
      const ch = d[this.pos++];
      if (ch === 0x3e) {
        if (high >= 0) out.push(high * 16); // odd digit count: final digit is padded with 0
        return { kind: "string", bytes: Uint8Array.from(out), hex: true, start, end: this.pos };
      }
      const v = hexValue(ch);
      if (v < 0) continue; // whitespace (and junk) is ignored inside hex strings
      if (high < 0) {
        high = v;
      } else {
        out.push(high * 16 + v);
        high = -1;
      }
    }
    this.warnings.push(`Unterminated hex string at byte ${start}`);
    return { kind: "string", bytes: Uint8Array.from(out), hex: true, start, end: this.pos };
  }

  /**
   * Skips inline image data after the `ID` keyword. The data is binary, so the end
   * is found by scanning for whitespace + "EI" + (whitespace | delimiter | EOF).
   * Returns the byte offset just past "EI".
   */
  skipInlineImageData(): number {
    const d = this.data;
    // Exactly one whitespace byte separates ID from the data.
    let i = this.pos + 1;
    for (; i < d.length - 1; i++) {
      if (
        isWhitespace(d[i]) &&
        d[i + 1] === 0x45 &&
        d[i + 2] === 0x49 &&
        (i + 3 >= d.length || isWhitespace(d[i + 3]) || isDelimiter(d[i + 3]))
      ) {
        this.pos = i + 3;
        return this.pos;
      }
    }
    this.warnings.push(`Inline image without EI at byte ${this.pos}`);
    this.pos = d.length;
    return this.pos;
  }
}

function parseNumber(word: string): number | null {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
    // Tolerate the "--5" / "-+5" forms some producers emit (as pdf.js does).
    if (/^[+-]{2,}(\d+\.?\d*|\.\d+)$/.test(word)) {
      return parseNumber(word.replace(/^[+-]+/, word.includes("-") ? "-" : ""));
    }
    return null;
  }
  return Number(word);
}

export function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

type OperatorToken = Extract<Token, { kind: "operator" }>;

/**
 * Reads the value starting at `token`, recursing into arrays and dicts. Returns the
 * operator token instead if one interrupts the value (malformed content), so the
 * caller can still treat it as an operator.
 */
function readValue(lexer: Lexer, token: Token): Operand | OperatorToken | null {
  if (token.kind === "operator") return token;
  if (token.kind === "arrayStart" || token.kind === "dictStart") {
    const isArray = token.kind === "arrayStart";
    const items: Operand[] = [];
    for (let t = lexer.next(); t !== null; t = lexer.next()) {
      if ((isArray && t.kind === "arrayEnd") || (!isArray && t.kind === "dictEnd")) {
        return isArray
          ? { kind: "array", items, start: token.start, end: t.end }
          : { kind: "dict", entries: toDictEntries(items), start: token.start, end: t.end };
      }
      if (t.kind === "arrayEnd" || t.kind === "dictEnd") {
        lexer.warnings.push(`Mismatched '${t.kind === "arrayEnd" ? "]" : ">>"}' at byte ${t.start}`);
        continue;
      }
      const value = readValue(lexer, t);
      if (value === null) break;
      if (value.kind === "operator") {
        lexer.warnings.push(`Operator '${value.value}' inside an unclosed array/dict at byte ${value.start}`);
        return value;
      }
      items.push(value);
    }
    lexer.warnings.push(`Unterminated ${isArray ? "array" : "dict"} at byte ${token.start}`);
    return null;
  }
  if (token.kind === "arrayEnd" || token.kind === "dictEnd") {
    lexer.warnings.push(`Unbalanced '${token.kind === "arrayEnd" ? "]" : ">>"}' at byte ${token.start}`);
    const next = lexer.next();
    return next ? readValue(lexer, next) : null;
  }
  return token;
}

export function parseContentStream(data: Uint8Array): ParsedContent {
  const lexer = new Lexer(data);
  const operations: ContentOperation[] = [];
  let operands: Operand[] = [];

  for (let token = lexer.next(); token !== null; token = lexer.next()) {
    const value = readValue(lexer, token);
    if (value === null) break;
    if (value.kind !== "operator") {
      operands.push(value);
      continue;
    }
    if (value.value === "BI") {
      operations.push(readInlineImage(lexer, value.start));
    } else {
      const start = operands.length > 0 ? operands[0].start : value.start;
      operations.push({ operator: value.value, operands, start, end: value.end });
    }
    operands = [];
  }
  return { operations, warnings: lexer.warnings };
}

function toDictEntries(items: Operand[]): Map<string, Operand> {
  const entries = new Map<string, Operand>();
  for (let i = 0; i + 1 < items.length; i += 2) {
    const key = items[i];
    if (key.kind === "name") entries.set(key.value, items[i + 1]);
  }
  return entries;
}

/** BI <key value pairs> ID <binary data> EI — returned as a single "BI" operation. */
function readInlineImage(lexer: Lexer, start: number): ContentOperation {
  const items: Operand[] = [];
  for (let token = lexer.next(); token !== null; token = lexer.next()) {
    const value = readValue(lexer, token);
    if (value === null) break;
    if (value.kind === "operator") {
      if (value.value === "ID") {
        const end = lexer.skipInlineImageData();
        return {
          operator: "BI",
          operands: [{ kind: "dict", entries: toDictEntries(items), start, end: value.start }],
          start,
          end,
        };
      }
      lexer.warnings.push(`Unexpected operator '${value.value}' in inline image at byte ${value.start}`);
      continue;
    }
    items.push(value);
  }
  lexer.warnings.push(`Inline image without ID at byte ${start}`);
  return { operator: "BI", operands: [], start, end: lexer.pos };
}

/** Replaces byte ranges in `data`. Edits must not overlap. */
export function applyByteEdits(
  data: Uint8Array,
  edits: ReadonlyArray<{ start: number; end: number; bytes: Uint8Array }>,
): Uint8Array {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) throw new Error("Overlapping content stream edits");
  }
  const size = sorted.reduce((n, e) => n + e.bytes.length - (e.end - e.start), data.length);
  const out = new Uint8Array(size);
  let read = 0;
  let write = 0;
  for (const e of sorted) {
    out.set(data.subarray(read, e.start), write);
    write += e.start - read;
    out.set(e.bytes, write);
    write += e.bytes.length;
    read = e.end;
  }
  out.set(data.subarray(read), write);
  return out;
}

/** Encodes bytes as a PDF hex string token, e.g. <48656C6C6F>. */
export function hexStringToken(bytes: Uint8Array): string {
  let s = "<";
  for (const b of bytes) s += b.toString(16).padStart(2, "0").toUpperCase();
  return s + ">";
}

export function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
