/**
 * Undo/redo as a cursor over an operation log. The edited model is always
 * `applyOperations(analysedModel, ops.slice(0, cursor))`, so undo never has to
 * reverse an operation, and lazily analysed pages are never "undone".
 */
import type { EditOperation } from "./operations";

export interface EditHistory {
  readonly ops: readonly EditOperation[];
  /** Number of operations currently applied. */
  readonly cursor: number;
  /** When the last operation was recorded (ms), for merging rapid edits. */
  readonly lastAt: number;
}

export const EMPTY_HISTORY: EditHistory = { ops: [], cursor: 0, lastAt: 0 };

/** Consecutive edits of the same kind to the same element within this window merge into one undo step. */
const MERGE_WINDOW_MS = 1000;

function merge(previous: EditOperation, next: EditOperation): EditOperation | null {
  if (previous.elementId !== next.elementId || previous.type !== next.type) return null;
  if (previous.type === "setText" && next.type === "setText") return next;
  if (previous.type === "move" && next.type === "move") {
    return { ...previous, dx: previous.dx + next.dx, dy: previous.dy + next.dy };
  }
  if (previous.type === "setStyle" && next.type === "setStyle") {
    const sameKeys = Object.keys(previous.style).sort().join() === Object.keys(next.style).sort().join();
    return sameKeys ? { ...previous, style: { ...previous.style, ...next.style } } : null;
  }
  return null;
}

export function record(history: EditHistory, op: EditOperation, now: number): EditHistory {
  const applied = history.ops.slice(0, history.cursor);
  const last = applied[applied.length - 1];
  if (last && history.cursor === history.ops.length && now - history.lastAt < MERGE_WINDOW_MS) {
    const merged = merge(last, op);
    if (merged) {
      applied[applied.length - 1] = merged;
      return { ops: applied, cursor: applied.length, lastAt: now };
    }
  }
  applied.push(op);
  return { ops: applied, cursor: applied.length, lastAt: now };
}

export const canUndo = (h: EditHistory) => h.cursor > 0;
export const canRedo = (h: EditHistory) => h.cursor < h.ops.length;

export function undo(h: EditHistory): EditHistory {
  return canUndo(h) ? { ...h, cursor: h.cursor - 1, lastAt: 0 } : h;
}

export function redo(h: EditHistory): EditHistory {
  return canRedo(h) ? { ...h, cursor: h.cursor + 1, lastAt: 0 } : h;
}

export function appliedOps(h: EditHistory): readonly EditOperation[] {
  return h.ops.slice(0, h.cursor);
}
