import { describe, expect, it } from "vitest";
import {
  type PlanPage,
  canRedo,
  canUndo,
  commit,
  deletePages,
  duplicatePages,
  initialPlan,
  isUnchanged,
  movePages,
  redo,
  reversePages,
  rotatePages,
  toPlanItems,
  undo,
} from "@/lib/pdf/tools/pagePlan";

const sources = (pages: PlanPage[]) => pages.map((p) => p.source);
const idsOf = (pages: PlanPage[], ...sourceIndexes: number[]) => new Set(pages.filter((p) => sourceIndexes.includes(p.source)).map((p) => p.id));

describe("page plan", () => {
  const start = () => initialPlan(6).present;

  it("starts as the untouched document", () => {
    const pages = start();
    expect(sources(pages)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(isUnchanged(pages, 6)).toBe(true);
    expect(new Set(pages.map((p) => p.id)).size).toBe(6);
  });

  it("rotates (wrapping both ways), deletes, duplicates and reverses", () => {
    const pages = start();
    const rotated = rotatePages(pages, idsOf(pages, 1), 90);
    expect(rotated[1].rotate).toBe(90);
    expect(rotatePages(rotated, idsOf(rotated, 1), -180)[1].rotate).toBe(270);
    expect(rotatePages(pages, idsOf(pages, 0), -90)[0].rotate).toBe(270);

    expect(sources(deletePages(pages, idsOf(pages, 0, 5)))).toEqual([1, 2, 3, 4]);

    const dup = duplicatePages(rotated, idsOf(rotated, 1));
    expect(sources(dup)).toEqual([0, 1, 1, 2, 3, 4, 5]);
    expect(dup[1].rotate).toBe(90);
    expect(dup[2].rotate).toBe(90);
    expect(dup[1].id).not.toBe(dup[2].id);

    expect(sources(reversePages(pages))).toEqual([5, 4, 3, 2, 1, 0]);
    expect(isUnchanged(rotated, 6)).toBe(false);
  });

  it("moves a selection as a group and stops at the edges", () => {
    const pages = start();
    const sel = idsOf(pages, 2, 3);
    expect(sources(movePages(pages, sel, -1))).toEqual([0, 2, 3, 1, 4, 5]);
    expect(sources(movePages(pages, sel, 1))).toEqual([0, 1, 4, 2, 3, 5]);
    // non-adjacent selection keeps its gaps
    expect(sources(movePages(pages, idsOf(pages, 1, 3), 1))).toEqual([0, 2, 1, 4, 3, 5]);
    // already first → nothing changes (same array back)
    const first = idsOf(pages, 0, 1);
    expect(movePages(pages, first, -1)).toBe(pages);
    // the last one is blocked, so the page behind it isn't swapped over it
    expect(sources(movePages(pages, idsOf(pages, 4, 5), 1))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("undoes and redoes, and a new change drops the redo branch", () => {
    let h = initialPlan(3);
    h = commit(h, deletePages(h.present, idsOf(h.present, 0)));
    h = commit(h, reversePages(h.present));
    expect(sources(h.present)).toEqual([2, 1]);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(sources(h.present)).toEqual([1, 2]);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(sources(h.present)).toEqual([2, 1]);
    h = undo(undo(h));
    expect(sources(h.present)).toEqual([0, 1, 2]);
    expect(canUndo(h)).toBe(false);
    h = commit(h, reversePages(h.present));
    expect(canRedo(h)).toBe(false);
    // committing the same array is a no-op (no empty undo steps)
    expect(commit(h, h.present)).toBe(h);
  });

  it("hands the exporter plain items", () => {
    const pages = rotatePages(start(), new Set([start()[0].id]), 0);
    expect(toPlanItems(pages)[0]).toEqual({ source: 0, rotate: 0 });
    expect(Object.keys(toPlanItems(pages)[0])).toEqual(["source", "rotate"]);
  });
});
