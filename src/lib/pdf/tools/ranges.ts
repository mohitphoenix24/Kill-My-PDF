/** Parses page-range text such as "1-3, 5, 8-" into inclusive 1-based ranges. */

export interface PageRange {
  /** 1-based, inclusive. */
  start: number;
  end: number;
}

export type RangeParseResult = { ok: true; ranges: PageRange[] } | { ok: false; error: string };

export function parsePageRanges(input: string, pageCount: number): RangeParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: "Type some pages, like 1-3, 5, 8-" };
  const ranges: PageRange[] = [];
  for (const raw of text.split(/[,;\n]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const match = /^(\d+)?\s*(-|–|—|to)?\s*(\d+)?$/i.exec(token);
    if (!match || (match[1] === undefined && match[3] === undefined)) {
      return { ok: false, error: `"${token}" isn't a page or a range.` };
    }
    const hasDash = match[2] !== undefined;
    const start = match[1] !== undefined ? Number(match[1]) : 1;
    const end = hasDash ? (match[3] !== undefined ? Number(match[3]) : pageCount) : start;
    if (start < 1 || end < 1) return { ok: false, error: "Pages start at 1." };
    if (start > pageCount || end > pageCount) {
      return { ok: false, error: `This PDF only has ${pageCount} page${pageCount === 1 ? "" : "s"} — "${token}" goes past the end.` };
    }
    if (start > end) return { ok: false, error: `"${token}" runs backwards. Did you mean ${end}-${start}?` };
    ranges.push({ start, end });
  }
  if (ranges.length === 0) return { ok: false, error: "Type some pages, like 1-3, 5, 8-" };
  return { ok: true, ranges };
}

/** 0-based page indices for a range. */
export function rangeIndices(range: PageRange): number[] {
  return Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start - 1 + i);
}

export function describeRange(range: PageRange): string {
  return range.start === range.end ? `${range.start}` : `${range.start}–${range.end}`;
}

/** Consecutive chunks of `size` pages: 10 pages, size 4 → 1–4, 5–8, 9–10. */
export function chunkRanges(pageCount: number, size: number): PageRange[] {
  const step = Math.max(1, Math.floor(size));
  const ranges: PageRange[] = [];
  for (let start = 1; start <= pageCount; start += step) {
    ranges.push({ start, end: Math.min(pageCount, start + step - 1) });
  }
  return ranges;
}
