import { describe, expect, it } from "vitest";
import { applyByteEdits, asciiBytes, hexStringToken, latin1, parseContentStream } from "./parser";

const parse = (s: string) => parseContentStream(asciiBytes(s));

describe("parseContentStream", () => {
  it("parses operators with operands and byte ranges", () => {
    const src = "BT /F1 12 Tf 1 0 0 1 72 710 Tm (Hello) Tj ET";
    const { operations, warnings } = parse(src);
    expect(warnings).toEqual([]);
    expect(operations.map((o) => o.operator)).toEqual(["BT", "Tf", "Tm", "Tj", "ET"]);
    const tj = operations[3];
    expect(src.slice(tj.start, tj.end)).toBe("(Hello) Tj");
    const str = tj.operands[0];
    expect(str.kind).toBe("string");
    expect(src.slice(str.start, str.end)).toBe("(Hello)");
  });

  it("decodes literal string escapes, nested parentheses and octal codes", () => {
    const { operations } = parse(String.raw`(a\(b\)c (nested) \101\0617 \\ \n end\
continued) Tj`);
    const op = operations[0].operands[0];
    if (op.kind !== "string") throw new Error("expected string");
    expect(latin1(op.bytes)).toBe("a(b)c (nested) A17 \\ \n endcontinued");
  });

  it("decodes hex strings with whitespace and odd digit counts", () => {
    const { operations } = parse("<48 65 6C6C 6F7> Tj");
    const op = operations[0].operands[0];
    if (op.kind !== "string") throw new Error("expected string");
    expect(Array.from(op.bytes)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x70]);
    expect(op.hex).toBe(true);
  });

  it("parses TJ arrays with kerning numbers", () => {
    const { operations } = parse("[(Wo) -80 (rld) 120.5 <21>] TJ");
    const arr = operations[0].operands[0];
    if (arr.kind !== "array") throw new Error("expected array");
    expect(arr.items.map((i) => i.kind)).toEqual(["string", "number", "string", "number", "string"]);
    expect(arr.items[3]).toMatchObject({ value: 120.5 });
  });

  it("parses names with #xx escapes, dicts, booleans and comments", () => {
    const { operations } = parse("% comment\n/Span <</ActualText (x) /MCID 3 /B true>> BDC /A#20B gs EMC");
    expect(operations.map((o) => o.operator)).toEqual(["BDC", "gs", "EMC"]);
    const dict = operations[0].operands[1];
    if (dict.kind !== "dict") throw new Error("expected dict");
    expect(dict.entries.get("MCID")).toMatchObject({ value: 3 });
    expect(dict.entries.get("B")).toMatchObject({ value: true });
    expect(operations[1].operands[0]).toMatchObject({ kind: "name", value: "A B" });
  });

  it("skips binary inline image data, including arrays in the image dict", () => {
    const binary = "\x00\xffEI\x10)(]";
    const src = `q BI /W 2 /H 1 /BPC 8 /CS /G /D [1 0] ID ${binary} EI Q BT (after) Tj ET`;
    const { operations, warnings } = parse(src);
    expect(warnings).toEqual([]);
    expect(operations.map((o) => o.operator)).toEqual(["q", "BI", "Q", "BT", "Tj", "ET"]);
    const dict = operations[1].operands[0];
    if (dict.kind !== "dict") throw new Error("expected dict");
    expect(dict.entries.get("D")?.kind).toBe("array");
    expect(dict.entries.get("W")).toMatchObject({ value: 2 });
  });

  it("parses numbers in all PDF forms", () => {
    const { operations } = parse("1 -2 +3 .5 -.25 4. 0 0 cm");
    expect(operations[0].operands.map((o) => (o.kind === "number" ? o.value : NaN))).toEqual([1, -2, 3, 0.5, -0.25, 4, 0, 0]);
  });

  it("recovers from malformed tokens", () => {
    const { operations, warnings } = parse("BT ) (ok) Tj ET");
    expect(operations.map((o) => o.operator)).toEqual(["BT", "Tj", "ET"]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("applyByteEdits", () => {
  it("splices replacements at the recorded ranges", () => {
    const src = "BT (Mohit Sharma) Tj (x) Tj ET";
    const { operations } = parse(src);
    const [a, b] = [operations[1].operands[0], operations[2].operands[0]];
    const out = applyByteEdits(asciiBytes(src), [
      { start: b.start, end: b.end, bytes: asciiBytes("<>") },
      { start: a.start, end: a.end, bytes: asciiBytes(hexStringToken(asciiBytes("Rohit"))) },
    ]);
    expect(latin1(out)).toBe("BT <526F686974> Tj <> Tj ET");
  });

  it("rejects overlapping edits", () => {
    expect(() =>
      applyByteEdits(asciiBytes("abcdef"), [
        { start: 0, end: 3, bytes: asciiBytes("x") },
        { start: 2, end: 4, bytes: asciiBytes("y") },
      ]),
    ).toThrow();
  });
});
