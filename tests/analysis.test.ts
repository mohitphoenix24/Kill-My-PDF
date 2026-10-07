import { describe, expect, it } from "vitest";
import { applyToPoint } from "@/lib/geometry/matrix";
import { findText, openFixture, textElements } from "./helpers";

describe("analysis: employee sample", () => {
  it("extracts every line with font, size, weight and colour", async () => {
    const session = await openFixture("employee-info.pdf");
    const page = await session.analyzePage(1);
    expect(page.status).toBe("ready");
    expect(page.contentKind).toBe("text");

    const title = findText(page, "Employee Information");
    expect(title.style).toMatchObject({ fontFamily: "Helvetica-Bold", fontSize: 22, fontWeight: 700, color: "#1a3380" });

    const name = findText(page, "Mohit Sharma");
    expect(name.style).toMatchObject({ fontFamily: "Helvetica", fontSize: 12, fontWeight: 400, fontStyle: "normal", color: "#000000" });
    expect(name.rotation).toBe(0);
    expect(name.editability.allowed).toBe(true);
    // Baseline origin at (190, 710), as drawn.
    expect(name.matrix[4]).toBeCloseTo(190, 6);
    expect(name.matrix[5]).toBeCloseTo(710, 6);
    expect(name.bbox.x).toBeCloseTo(190, 6);

    const label = findText(page, "Employee Name:");
    expect(label.id).not.toBe(name.id); // label and value are separate elements

    const salary = findText(page, "₹15,00,000");
    expect(salary.style.fontFamily).toMatch(/DejaVuSans/);
    expect(salary.editability.allowed).toBe(true);
    const font = session.fontsSnapshot()[salary.fontKey!];
    expect(font).toMatchObject({ subtype: "Type0", encoding: "Identity-H", codeBytes: 2, embedded: true });
  });

  it("matches pdf.js text positions and widths", async () => {
    const session = await openFixture("employee-info.pdf");
    const page = await session.analyzePage(1);
    const pdfjsPage = await session.pdfjs.getPage(1);
    const content = await pdfjsPage.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      const element = findText(page, item.str);
      expect(element.matrix[4]).toBeCloseTo(item.transform[4], 4);
      expect(element.matrix[5]).toBeCloseTo(item.transform[5], 4);
      // Width in user space = local width × x-scale.
      expect(element.width * Math.hypot(element.matrix[0], element.matrix[1])).toBeCloseTo(item.width, 3);
    }
  });
});

describe("analysis: operator coverage", () => {
  it("handles TJ kerning, gaps, quote operators, spacing, scaling, rotation and colour", async () => {
    const session = await openFixture("text-features.pdf");
    const page = await session.analyzePage(1);
    const contents = textElements(page).map((e) => e.content);

    expect(contents).toContain("Plain Tj line");
    // Small kerning stays inside a word; -250 becomes a space; -3000 splits the run.
    expect(contents).toContain("Kerned TJ");
    expect(contents).toContain("Far column");
    expect(contents).toContain("First line");
    expect(contents).toContain("Quote line");
    expect(contents).toContain("Double quote line");

    const quote = findText(page, "Quote line");
    const first = findText(page, "First line");
    expect(first.matrix[5] - quote.matrix[5]).toBeCloseTo(16, 6); // ' moved down by TL

    const spaced = findText(page, "Spaced out text");
    expect(spaced.style.letterSpacing).toBeCloseTo(2, 6);
    expect(spaced.style.wordSpacing).toBeCloseTo(5, 6);

    const wide = findText(page, "Wide text");
    expect(wide.matrix[0] / wide.matrix[3]).toBeCloseTo(1.5, 6); // Tz 150

    const rotated = findText(page, "Rotated thirty");
    expect(rotated.rotation).toBeCloseTo(30, 2);
    expect(rotated.style.fontSize).toBeCloseTo(16, 3);
    expect(rotated.style.fontWeight).toBe(700);

    expect(findText(page, "CMYK black").style.color).toBe("#000000");
    // Two Tj runs with the same state on one baseline join into one element.
    const green = findText(page, "Green continued");
    expect(green.style.color).toBe("#008000");
    expect(green.source.runs).toHaveLength(2);
    // A font change splits elements.
    expect(contents).toContain("Before");
    expect(contents).toContain(" bold after");

    const raised = findText(page, "Raised");
    expect(raised.matrix[5]).toBeCloseTo(475, 6); // Ts 5

    // Separate Td on the same baseline far apart → separate elements.
    expect(contents).toContain("Line A");
    expect(contents).toContain("Line B same baseline");
  });

  it("keeps the text matrix in sync with pdf.js for every item", async () => {
    const session = await openFixture("text-features.pdf");
    const page = await session.analyzePage(1);
    const content = await (await session.pdfjs.getPage(1)).getTextContent();
    const starts = textElements(page).flatMap((e) =>
      e.source.runs.map((r) => {
        // Run origins: element origin + run offset along the baseline.
        return { text: r.text, e };
      }),
    );
    expect(starts.length).toBeGreaterThan(0);
    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      const origin = { x: item.transform[4], y: item.transform[5] };
      // Every pdf.js item origin must lie on the baseline of some element.
      const hit = textElements(page).some((e) => {
        const [a, b, c, d, ex, fy] = e.matrix;
        const det = a * d - b * c;
        const lx = (d * (origin.x - ex) - c * (origin.y - fy)) / det;
        const ly = (-b * (origin.x - ex) + a * (origin.y - fy)) / det;
        return Math.abs(ly) < 0.01 && lx > -0.01 && lx < e.width + 0.01;
      });
      expect(hit, `item "${item.str}" at ${origin.x},${origin.y}`).toBe(true);
    }
  });
});

describe("analysis: page geometry and special content", () => {
  it("reports rotation and crop box", async () => {
    const session = await openFixture("rotated-pages.pdf");
    const page = await session.analyzePage(1);
    expect(page.rotation).toBe(90);
    expect(page.viewBox).toEqual([36, 36, 576, 756]);
    expect(findText(page, "Rotated page 90").editability.allowed).toBe(true);
  });

  it("marks Form XObject text read-only but keeps page text editable", async () => {
    const session = await openFixture("form-xobject.pdf");
    const page = await session.analyzePage(1);
    const inForm = findText(page, "Text inside a form");
    expect(inForm.editability.allowed).toBe(false);
    expect(inForm.matrix[4]).toBeCloseTo(72, 6);
    expect(inForm.matrix[5]).toBeCloseTo(650, 6);
    expect(findText(page, "Page text after").editability.allowed).toBe(true);
    expect(page.notices.join(" ")).toMatch(/Form XObject/);
  });

  it("classifies scanned pages", async () => {
    const scanned = await (await openFixture("scanned.pdf")).analyzePage(1);
    expect(scanned.contentKind).toBe("scanned");
    const ocr = await (await openFixture("scanned-ocr.pdf")).analyzePage(1);
    expect(ocr.contentKind).toBe("scanned-ocr");
    expect(findText(ocr, "Invisible OCR text").editability.allowed).toBe(false);
  });

  it("transforms element origins consistently with their bbox", async () => {
    const page = await (await openFixture("employee-info.pdf")).analyzePage(1);
    for (const e of textElements(page)) {
      const origin = applyToPoint(e.matrix, { x: 0, y: 0 });
      expect(origin.x).toBeGreaterThanOrEqual(e.bbox.x - 1e-6);
      expect(origin.y).toBeGreaterThanOrEqual(e.bbox.y - 1e-6);
      expect(origin.y).toBeLessThanOrEqual(e.bbox.y + e.bbox.height + 1e-6);
    }
  });
});

describe("loading errors", () => {
  it.each([
    ["not-a-pdf.pdf", "not-a-pdf"],
    ["corrupted.pdf", "corrupted"],
    ["password.pdf", "password-protected"],
  ])("%s → %s", async (file, code) => {
    await expect(openFixture(file)).rejects.toMatchObject({ code });
  });

  it("opens encrypted PDFs without a user password as view-only", async () => {
    const session = await openFixture("encrypted-no-password.pdf");
    expect(session.editing.allowed).toBe(false);
    const page = await session.analyzePage(1);
    expect(textElements(page).length).toBeGreaterThan(0);
    expect(textElements(page).every((e) => !e.editability.allowed)).toBe(true);
  });
});
