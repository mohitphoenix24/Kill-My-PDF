/**
 * Word targeting. A text element is a whole line, but people tap a *word*: given how far
 * along the line a tap landed (0–1), these helpers find which word that is.
 * Pure functions over per-character positions, so they work the same in tests and in the browser.
 */

export interface WordSpan {
  /** Character indices (code points) into the text: [start, end). */
  start: number;
  end: number;
  /** Where the word starts/ends along the line, as fractions 0–1. */
  from: number;
  to: number;
}

/**
 * `boundaries[i]` is the position (any units) where character i begins; the last entry is the
 * total width. So a text with n characters has n + 1 boundaries.
 */
export function wordAtFraction(text: string, boundaries: readonly number[], fraction: number): WordSpan | null {
  const chars = Array.from(text);
  if (chars.length === 0 || boundaries.length !== chars.length + 1) return null;
  const total = boundaries[chars.length];
  if (!(total > 0)) return null;

  const x = Math.min(Math.max(fraction, 0), 1) * total;
  // The character whose box contains x.
  let index = chars.length - 1;
  for (let i = 0; i < chars.length; i++) {
    if (x < boundaries[i + 1]) {
      index = i;
      break;
    }
  }

  const isSpace = (i: number) => /\s/.test(chars[i]);
  // A tap on a space snaps to the nearer neighbouring word.
  if (isSpace(index)) {
    let left = index;
    while (left >= 0 && isSpace(left)) left--;
    let right = index;
    while (right < chars.length && isSpace(right)) right++;
    if (left < 0 && right >= chars.length) return null;
    const toLeft = left >= 0 ? x - boundaries[left + 1] : Infinity;
    const toRight = right < chars.length ? boundaries[right] - x : Infinity;
    index = toLeft <= toRight ? left : right;
  }

  let start = index;
  while (start > 0 && !isSpace(start - 1)) start--;
  let end = index + 1;
  while (end < chars.length && !isSpace(end)) end++;

  return { start, end, from: boundaries[start] / total, to: boundaries[end] / total };
}

/** Converts code-point indices to UTF-16 offsets, which is what DOM selection APIs expect. */
export function toUtf16Range(text: string, start: number, end: number): [number, number] {
  const chars = Array.from(text);
  const offset = (n: number) => chars.slice(0, n).join("").length;
  return [offset(start), offset(end)];
}
