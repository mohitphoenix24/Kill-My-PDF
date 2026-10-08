/**
 * The state behind the "Organize pages" screen: an ordered list of pages (each pointing at a
 * page of the source PDF, with extra rotation) plus undo/redo. Pure functions, so every
 * operation is easy to test.
 */
import { type PagePlanItem, type Rotation, addRotation } from "./organize";

export interface PlanPage extends PagePlanItem {
  /** Stable identity for this tile — duplicates of the same source page get their own. */
  id: string;
}

export interface PlanHistory {
  present: PlanPage[];
  past: PlanPage[][];
  future: PlanPage[][];
}

const MAX_HISTORY = 100;
let counter = 0;
export const newPageId = () => `pg-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function initialPlan(pageCount: number): PlanHistory {
  return {
    present: Array.from({ length: pageCount }, (_, source) => ({ id: newPageId(), source, rotate: 0 as Rotation })),
    past: [],
    future: [],
  };
}

/** Records `next` as the new present (and clears redo). No-op when nothing changed. */
export function commit(history: PlanHistory, next: PlanPage[]): PlanHistory {
  if (next === history.present) return history;
  return { present: next, past: [...history.past, history.present].slice(-MAX_HISTORY), future: [] };
}

export const canUndo = (h: PlanHistory) => h.past.length > 0;
export const canRedo = (h: PlanHistory) => h.future.length > 0;

export function undo(h: PlanHistory): PlanHistory {
  if (!canUndo(h)) return h;
  const past = h.past.slice();
  const present = past.pop()!;
  return { present, past, future: [h.present, ...h.future] };
}

export function redo(h: PlanHistory): PlanHistory {
  if (!canRedo(h)) return h;
  const [present, ...future] = h.future;
  return { present, past: [...h.past, h.present], future };
}

export function rotatePages(pages: PlanPage[], ids: ReadonlySet<string>, delta: number): PlanPage[] {
  if (ids.size === 0) return pages;
  return pages.map((p) => (ids.has(p.id) ? { ...p, rotate: addRotation(p.rotate, delta) } : p));
}

export function deletePages(pages: PlanPage[], ids: ReadonlySet<string>): PlanPage[] {
  if (ids.size === 0) return pages;
  return pages.filter((p) => !ids.has(p.id));
}

/** Puts a copy of each selected page right after it. */
export function duplicatePages(pages: PlanPage[], ids: ReadonlySet<string>): PlanPage[] {
  if (ids.size === 0) return pages;
  return pages.flatMap((p) => (ids.has(p.id) ? [p, { ...p, id: newPageId() }] : [p]));
}

export function reversePages(pages: PlanPage[]): PlanPage[] {
  return pages.length < 2 ? pages : pages.slice().reverse();
}

/**
 * Moves the selected pages one step earlier/later as a group, keeping their order relative
 * to each other. Pages already at the edge stay put (and block the ones behind them).
 */
export function movePages(pages: PlanPage[], ids: ReadonlySet<string>, direction: -1 | 1): PlanPage[] {
  if (ids.size === 0) return pages;
  const next = pages.slice();
  const order = direction === -1 ? next.map((_, i) => i) : next.map((_, i) => next.length - 1 - i);
  let changed = false;
  for (const i of order) {
    const j = i + direction;
    if (!ids.has(next[i].id) || j < 0 || j >= next.length || ids.has(next[j].id)) continue;
    [next[i], next[j]] = [next[j], next[i]];
    changed = true;
  }
  return changed ? next : pages;
}

export function toPlanItems(pages: readonly PlanPage[]): PagePlanItem[] {
  return pages.map(({ source, rotate }) => ({ source, rotate }));
}

/** True when the plan is identical to the untouched PDF. */
export function isUnchanged(pages: readonly PlanPage[], pageCount: number): boolean {
  return pages.length === pageCount && pages.every((p, i) => p.source === i && p.rotate === 0);
}
