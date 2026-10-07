import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type EditOperation, applyOperations, findTextElement } from "@/lib/editor/operations";
import type { DocumentModel } from "@/lib/model/types";
import { exportPdf } from "@/lib/pdf/export/exporter";
import { verifyExport } from "@/lib/pdf/export/verify";
import { PdfSession } from "@/lib/pdf/session";
import { findText, fontFile, openFixture, textElements } from "./helpers";

async function analysedModel(session: PdfSession): Promise<DocumentModel> {
  const model = await session.createModel();
  for (let n = 1; n <= session.pageCount; n++) model.pages[n - 1] = await session.analyzePage(n);
  return { ...model, fonts: session.fontsSnapshot() };
}

async function edit(file: string, ops: (model: DocumentModel) => EditOperation[]) {
  const session = await openFixture(file);
  const base = await analysedModel(session);
  const model = applyOperations(base, ops(base));
  const result = await exportPdf({
    originalBytes: session.originalBytes,
    model,
    loadFontFile: async (name) => fontFile(name),
  });
  const verification = await verifyExport(session.originalBytes, result.bytes, model);
  const reopened = await PdfSession.open("out.pdf", result.bytes);
  const page = await reopened.analyzePage(1);
  return { session, model, result, verification, page, reopened };
}

const idOf = (model: DocumentModel, content: string, page = 1) => findText(model.pages[page - 1], content).id;

/** Text as an independent reader (poppler) extracts it, when available. */
function popplerText(bytes: Uint8Array): string | undefined {
  try {
    const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "pdfedit-"));
    const file = join(dir, "out.pdf");
    writeFileSync(file, bytes);
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  } catch {
    return undefined;
  }
}

describe("export: Mohit Sharma → Rohit Sharma", () => {
  it("rewrites the text in place with the original font", async () => {
    const { result, verification, page, session } = await edit("employee-info.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "Mohit Sharma"), text: "Rohit Sharma" },
    ]);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({ strategy: "in-place", fontName: "Helvetica" });
    expect(verification).toEqual({ ok: true, problems: [] });

    // Re-analysed output: the new text is real, selectable text with the original style and position.
    const rohit = findText(page, "Rohit Sharma");
    expect(rohit.style).toMatchObject({ fontFamily: "Helvetica", fontSize: 12, fontWeight: 400, color: "#000000" });
    expect(rohit.matrix[4]).toBeCloseTo(190, 6);
    expect(rohit.matrix[5]).toBeCloseTo(710, 6);
    expect(rohit.editability.allowed).toBe(true);

    // Every other element is unchanged.
    const before = textElements(await session.analyzePage(1)).map((e) => [e.content, e.matrix, e.style]);
    const after = textElements(page).map((e) => [e.content, e.matrix, e.style]);
    expect(after.filter(([c]) => c !== "Rohit Sharma")).toEqual(before.filter(([c]) => c !== "Mohit Sharma"));

    // The old name is gone from the file, not hidden.
    const poppler = popplerText(result.bytes);
    if (poppler !== undefined) {
      expect(poppler).toMatch(/Employee Name:\s+Rohit Sharma/);
      expect(poppler).not.toContain("Mohit");
    }
  });

  it("substitutes a font when an embedded subset lacks a glyph (₹15 → ₹18)", async () => {
    const { result, verification, page } = await edit("employee-info.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "₹15,00,000"), text: "₹18,00,000" },
    ]);
    expect(result.reports[0].strategy).toBe("redraw-substitute");
    expect(result.reports[0].fontName).toBe("DejaVuSans"); // same family as the original subset
    expect(result.reports[0].notes.join(" ")).toMatch(/"8"/);
    expect(verification.ok).toBe(true);
    const salary = findText(page, "₹18,00,000");
    expect(salary.matrix[4]).toBeCloseTo(190, 4);
    expect(salary.matrix[5]).toBeCloseTo(598, 4);
    expect(salary.style.fontSize).toBeCloseTo(12, 3);
  });

  it("reuses the subset font when all glyphs already exist (₹15,00,000 → ₹10,50,000)", async () => {
    const { result, verification } = await edit("employee-info.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "₹15,00,000"), text: "₹10,50,000" },
    ]);
    expect(result.reports[0].strategy).toBe("in-place");
    expect(verification.ok).toBe(true);
  });

  it("moves, recolours and resizes text with the original font", async () => {
    const { result, verification, page } = await edit("employee-info.pdf", (m) => [
      { type: "move", elementId: idOf(m, "Hyderabad"), dx: 10, dy: -5 },
      { type: "setStyle", elementId: idOf(m, "Hyderabad"), style: { color: "#cc0000", fontSize: 14 } },
      { type: "setText", elementId: idOf(m, "Hyderabad"), text: "Bangalore" },
    ]);
    expect(result.reports[0].strategy).toBe("redraw-original");
    expect(verification.ok).toBe(true);
    const moved = findText(page, "Bangalore");
    expect(moved.matrix[4]).toBeCloseTo(200, 4);
    expect(moved.matrix[5]).toBeCloseTo(621, 4);
    expect(moved.style).toMatchObject({ fontFamily: "Helvetica", color: "#cc0000" });
    expect(moved.style.fontSize).toBeCloseTo(14, 3);
  });

  it("removes text when cleared", async () => {
    const { result, verification, page } = await edit("employee-info.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "EMP1024"), text: "" },
    ]);
    expect(result.reports[0].strategy).toBe("removed");
    expect(verification.ok).toBe(true);
    expect(textElements(page).map((e) => e.content)).not.toContain("EMP1024");
  });

  it("does not modify the original bytes", async () => {
    const session = await openFixture("employee-info.pdf");
    const copy = session.originalBytes.slice();
    const base = await analysedModel(session);
    const model = applyOperations(base, [{ type: "setText", elementId: idOf(base, "Mohit Sharma"), text: "X" }]);
    await exportPdf({ originalBytes: session.originalBytes, model, loadFontFile: async (n) => fontFile(n) });
    expect(session.originalBytes).toEqual(copy);
  });
});

describe("export: operator coverage", () => {
  it("keeps following text in place when a TJ segment is redrawn", async () => {
    const { verification, page, result } = await edit("text-features.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "Kerned TJ"), text: "Kerned ✓" }, // ✓ forces a substitute font
    ]);
    expect(result.reports[0].strategy).toBe("redraw-substitute");
    expect(verification.ok).toBe(true);
    // "Far column" lives in the same TJ array after a large gap — it must not move.
    const far = findText(page, "Far column");
    const original = findText((await (await openFixture("text-features.pdf")).analyzePage(1)), "Far column");
    expect(far.matrix[4]).toBeCloseTo(original.matrix[4], 6);
    expect(far.matrix[5]).toBeCloseTo(original.matrix[5], 6);
  });

  it("edits a TJ segment in place without touching the rest of the array", async () => {
    const { verification, page, result } = await edit("text-features.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "Far column"), text: "Near column" },
    ]);
    expect(result.reports[0].strategy).toBe("in-place");
    expect(verification.ok).toBe(true);
    expect(textElements(page).map((e) => e.content)).toEqual(expect.arrayContaining(["Kerned TJ", "Near column"]));
  });

  it("handles ' and \" operators, spacing, scaling and multi-run elements", async () => {
    const { verification, page } = await edit("text-features.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "Quote line"), text: "Quote edited" },
      { type: "setText", elementId: idOf(m, "Double quote line"), text: "Double edited" },
      { type: "setText", elementId: idOf(m, "Spaced out text"), text: "Spaced edit" },
      { type: "setText", elementId: idOf(m, "Wide text"), text: "Wide edit" },
      { type: "setText", elementId: idOf(m, "Green continued"), text: "Green edited" },
      { type: "move", elementId: idOf(m, "Rotated thirty"), dx: 5, dy: 5 },
    ]);
    expect(verification).toEqual({ ok: true, problems: [] });
    const contents = textElements(page).map((e) => e.content);
    expect(contents).toEqual(
      expect.arrayContaining(["First line", "Quote edited", "Double edited", "Spaced edit", "Wide edit", "Green edited", "Rotated thirty"]),
    );
    // ' still moved to the next line; " still set the spacing for the next lines.
    expect(findText(page, "Quote edited").matrix[5]).toBeCloseTo(664, 6);
    expect(findText(page, "Double edited").matrix[5]).toBeCloseTo(648, 6);
    expect(findText(page, "Spaced edit").style.letterSpacing).toBeCloseTo(2, 6);
    expect(findText(page, "Wide edit").matrix[0] / findText(page, "Wide edit").matrix[3]).toBeCloseTo(1.5, 6);
    expect(findText(page, "Rotated thirty").rotation).toBeCloseTo(30, 2);
  });

  it("edits rotated pages", async () => {
    const { verification } = await edit("rotated-pages.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "Second line"), text: "Edited line" },
    ]);
    expect(verification.ok).toBe(true);
  });

  it("ignores edits to read-only text", async () => {
    const session = await openFixture("form-xobject.pdf");
    const base = await analysedModel(session);
    const id = idOf(base, "Text inside a form");
    const model = applyOperations(base, [{ type: "setText", elementId: id, text: "changed" }]);
    expect(findTextElement(model, id)?.content).toBe("Text inside a form");
  });
});

/** Renders page 1 with poppler at 72 dpi (1 px = 1 pt). Returns undefined without pdftoppm. */
function renderPage(bytes: Uint8Array): { width: number; height: number; data: Uint8Array } | undefined {
  try {
    const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "pdfedit-"));
    const file = join(dir, "in.pdf");
    writeFileSync(file, bytes);
    const ppm = execFileSync("pdftoppm", ["-r", "72", "-f", "1", "-l", "1", "-gray", file]);
    // PGM (P5) header: magic, width, height, maxval, then binary pixels.
    const header = ppm.subarray(0, 64).toString("latin1").split(/\s+/);
    const [width, height] = [Number(header[1]), Number(header[2])];
    return { width, height, data: new Uint8Array(ppm.subarray(ppm.length - width * height)) };
  } catch {
    return undefined;
  }
}

describe("export: visual integrity", () => {
  it("changes no pixels outside the edited text", async () => {
    const { session, model, result } = await edit("employee-info.pdf", (m) => [
      { type: "setText", elementId: idOf(m, "Mohit Sharma"), text: "Rohit Sharma" },
      { type: "setText", elementId: idOf(m, "₹15,00,000"), text: "₹18,00,000" },
    ]);
    const before = renderPage(session.originalBytes);
    const after = renderPage(result.bytes);
    if (!before || !after) return; // poppler not installed
    expect([after.width, after.height]).toEqual([before.width, before.height]);

    const page = model.pages[0];
    const edited = textElements(page).filter((e) => e.content !== e.source.original.content);
    const original = await session.analyzePage(1);
    const boxes = edited.flatMap((e) => [e.bbox, findText(original, e.source.original.content).bbox]);
    const inEditedArea = (x: number, yTop: number) => {
      const y = page.height - yTop; // pixel rows count down from the top
      return boxes.some((b) => x >= b.x - 3 && x <= b.x + b.width + 3 && y >= b.y - 3 && y <= b.y + b.height + 3);
    };

    let changedOutside = 0;
    let changedInside = 0;
    for (let y = 0; y < before.height; y++) {
      for (let x = 0; x < before.width; x++) {
        const i = y * before.width + x;
        if (Math.abs(before.data[i] - after.data[i]) > 8) {
          if (inEditedArea(x + 0.5, y + 0.5)) changedInside++;
          else changedOutside++;
        }
      }
    }
    expect(changedOutside).toBe(0);
    expect(changedInside).toBeGreaterThan(0); // the edit is visible
  });
});
