import { describe, expect, it } from "vitest";
import { EMPTY_HISTORY, appliedOps, canRedo, canUndo, record, redo, undo } from "./history";

describe("edit history", () => {
  it("undoes and redoes", () => {
    let h = record(EMPTY_HISTORY, { type: "setText", elementId: "p1-t0", text: "a" }, 0);
    h = record(h, { type: "move", elementId: "p1-t0", dx: 1, dy: 0 }, 5000);
    expect(appliedOps(h)).toHaveLength(2);
    h = undo(h);
    expect(appliedOps(h)).toEqual([{ type: "setText", elementId: "p1-t0", text: "a" }]);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(appliedOps(h)).toHaveLength(2);
    h = undo(undo(h));
    expect(canUndo(h)).toBe(false);
  });

  it("merges rapid edits of the same element into one step", () => {
    let h = record(EMPTY_HISTORY, { type: "setText", elementId: "p1-t0", text: "R" }, 0);
    h = record(h, { type: "setText", elementId: "p1-t0", text: "Ro" }, 200);
    h = record(h, { type: "move", elementId: "p1-t0", dx: 1, dy: 0 }, 300);
    h = record(h, { type: "move", elementId: "p1-t0", dx: 2, dy: -1 }, 400);
    expect(h.ops).toEqual([
      { type: "setText", elementId: "p1-t0", text: "Ro" },
      { type: "move", elementId: "p1-t0", dx: 3, dy: -1 },
    ]);
  });

  it("does not merge after an undo, across elements, or after the window", () => {
    let h = record(EMPTY_HISTORY, { type: "setText", elementId: "p1-t0", text: "a" }, 0);
    h = record(h, { type: "setText", elementId: "p1-t1", text: "b" }, 10);
    h = record(h, { type: "setText", elementId: "p1-t1", text: "c" }, 5000);
    expect(h.ops).toHaveLength(3);
    h = undo(h);
    h = record(h, { type: "setText", elementId: "p1-t1", text: "d" }, 5100);
    expect(h.ops.map((o) => (o.type === "setText" ? o.text : ""))).toEqual(["a", "b", "d"]);
    expect(canRedo(h)).toBe(false); // a new edit discards the redo branch
  });
});
