import { describe, expect, it } from "vitest";
import { toUtf16Range, wordAtFraction } from "@/lib/text/words";

/** Every character 10 units wide, so positions are easy to reason about. */
const uniform = (text: string) => Array.from({ length: Array.from(text).length + 1 }, (_, i) => i * 10);

describe("wordAtFraction", () => {
  const text = "Employee Name: Mohit Sharma"; // 27 chars
  const b = uniform(text);
  const at = (i: number) => (i * 10 + 5) / (27 * 10); // middle of character i
  const word = (fraction: number) => {
    const w = wordAtFraction(text, b, fraction);
    return w ? text.slice(w.start, w.end) : null;
  };

  it("finds the word under the tap", () => {
    expect(word(at(0))).toBe("Employee");
    expect(word(at(5))).toBe("Employee");
    expect(word(at(10))).toBe("Name:");
    expect(word(at(16))).toBe("Mohit");
    expect(word(at(24))).toBe("Sharma");
  });

  it("snaps a tap on a space to the nearer word", () => {
    expect(word((8.2 * 10) / 270)).toBe("Employee"); // early in the space at index 8 → the word on its left
    expect(word((8.9 * 10) / 270)).toBe("Name:"); // late in the space → right word
  });

  it("clamps taps beyond the ends", () => {
    expect(word(-0.5)).toBe("Employee");
    expect(word(2)).toBe("Sharma");
  });

  it("reports where the word sits along the line", () => {
    const w = wordAtFraction(text, b, at(16))!;
    expect(w.from).toBeCloseTo(15 / 27, 6);
    expect(w.to).toBeCloseTo(20 / 27, 6);
  });

  it("works with uneven character widths", () => {
    // "ii ww": narrow i's, wide w's
    const t = "ii ww";
    const widths = [0, 2, 4, 10, 20, 30];
    expect(wordAtFraction(t, widths, 0.05)).toMatchObject({ start: 0, end: 2 });
    expect(wordAtFraction(t, widths, 0.9)).toMatchObject({ start: 3, end: 5 });
  });

  it("handles empty or inconsistent input", () => {
    expect(wordAtFraction("", [0], 0.5)).toBeNull();
    expect(wordAtFraction("abc", [0, 1], 0.5)).toBeNull();
    expect(wordAtFraction("   ", uniform("   "), 0.5)).toBeNull();
  });

  it("converts code-point ranges to UTF-16 offsets", () => {
    expect(toUtf16Range("a😀b c", 2, 3)).toEqual([3, 4]);
    expect(toUtf16Range("abc", 0, 3)).toEqual([0, 3]);
  });
});
