import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { PdfUserError } from "@/lib/pdf/errors";
import { baseName, formatBytes, loadPdfDoc, safePdfName } from "@/lib/pdf/tools/common";
import { DEFAULT_IMAGE_OPTIONS, buildImagesPdf, computePlacement } from "@/lib/pdf/tools/images";
import { directEmbed, inspectJpeg, inspectPng } from "@/lib/pdf/tools/imageFormat";
import { mergePdfs } from "@/lib/pdf/tools/merge";
import { organizePdf } from "@/lib/pdf/tools/organize";
import { chunkRanges, parsePageRanges, rangeIndices } from "@/lib/pdf/tools/ranges";
import { extractPages } from "@/lib/pdf/tools/split";
import { uniqueNames, zipFiles } from "@/lib/pdf/tools/zip";
import { allStreamText, fixture, imageCounts, imageFixture, makeDoc, pageSizes, pageTexts } from "./helpers";

describe("merge", () => {
  it("joins documents in order and stamps our producer", async () => {
    const [a, b, c] = [await makeDoc("A", 2), await makeDoc("B", 3), await makeDoc("C", 1)];
    const docs = await Promise.all([a, b, c].map((bytes, i) => loadPdfDoc(bytes, `file ${i}`)));
    const merged = await mergePdfs([{ doc: docs[1] }, { doc: docs[0] }, { doc: docs[2] }]);
    expect(await pageTexts(merged)).toEqual(["B p1", "B p2", "B p3", "A p1", "A p2", "C p1"]);
    const out = await loadPdfDoc(merged, "out");
    expect(out.getProducer()).toBe("KillMyPDF");
  });

  it("merges real-world files and keeps fonts working", async () => {
    const employee = await loadPdfDoc(fixture("employee-info.pdf"), "employee");
    const multi = await loadPdfDoc(fixture("multipage.pdf"), "multi");
    const merged = await mergePdfs([{ doc: employee }, { doc: multi }]);
    const texts = await pageTexts(merged);
    expect(texts).toHaveLength(6);
    expect(texts[0]).toContain("Mohit Sharma");
    expect(texts[0]).toContain("₹15,00,000"); // embedded subset font survived the copy
    expect(texts[5]).toContain("Page 5 heading");
  });

  it("refuses to merge nothing", async () => {
    await expect(mergePdfs([])).rejects.toBeInstanceOf(PdfUserError);
  });
});

describe("loadPdfDoc", () => {
  it("explains encrypted and corrupted files", async () => {
    await expect(loadPdfDoc(fixture("password.pdf"), "secret.pdf")).rejects.toMatchObject({ code: "encrypted" });
    await expect(loadPdfDoc(fixture("corrupted.pdf"), "bad.pdf")).rejects.toMatchObject({ code: "corrupted" });
  });
});

describe("organize", () => {
  it("reorders, deletes, duplicates and rotates", async () => {
    const doc = await loadPdfDoc(await makeDoc("D", 4), "d");
    const out = await organizePdf(doc, [
      { source: 3, rotate: 0 },
      { source: 0, rotate: 90 },
      { source: 0, rotate: 270 }, // duplicate with its own rotation
      { source: 2, rotate: 180 },
    ]);
    expect(await pageTexts(out)).toEqual(["D p4", "D p1", "D p1", "D p3"]);
    expect((await pageSizes(out)).map((s) => s.rotation)).toEqual([0, 90, 270, 180]);
  });

  it("adds to a page's existing rotation", async () => {
    const doc = await loadPdfDoc(await makeDoc("R", 2, { rotateFirst: 90 }), "r");
    const out = await organizePdf(doc, [
      { source: 0, rotate: 90 },
      { source: 0, rotate: 0 },
      { source: 1, rotate: 0 },
    ]);
    expect((await pageSizes(out)).map((s) => s.rotation)).toEqual([180, 90, 0]);
  });

  it("really removes dropped pages from the file", async () => {
    const source = await makeDoc("KEEP", 1);
    const doc = await loadPdfDoc(await makeDoc("SECRET-7", 3), "d");
    const out = await organizePdf(doc, [{ source: 1, rotate: 0 }]);
    expect(await pageTexts(out)).toEqual(["SECRET-7 p2"]);
    const streams = await allStreamText(out);
    expect(streams).toContain("SECRET-7 p2".slice(0, 0) + "Tj"); // page content present
    // the other two pages' text is gone from every stream, not just hidden
    const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();
    expect(streams.toUpperCase()).not.toContain(hex("SECRET-7 p1"));
    expect(streams.toUpperCase()).not.toContain(hex("SECRET-7 p3"));
    expect(source.length).toBeGreaterThan(0);
  });

  it("rejects empty and out-of-range plans", async () => {
    const doc = await loadPdfDoc(await makeDoc("D", 2), "d");
    await expect(organizePdf(doc, [])).rejects.toBeInstanceOf(PdfUserError);
    await expect(organizePdf(doc, [{ source: 5, rotate: 0 }])).rejects.toBeInstanceOf(PdfUserError);
  });
});

describe("page ranges", () => {
  const ok = (text: string, pages = 10) => {
    const r = parsePageRanges(text, pages);
    if (!r.ok) throw new Error(r.error);
    return r.ranges;
  };

  it("parses singles, ranges and open ends", () => {
    expect(ok("1-3, 5, 8-")).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 8, end: 10 },
    ]);
    expect(ok("-2")).toEqual([{ start: 1, end: 2 }]);
    expect(ok("2 – 4; 7")).toEqual([
      { start: 2, end: 4 },
      { start: 7, end: 7 },
    ]);
  });

  it("explains mistakes", () => {
    const err = (t: string, n = 10) => {
      const r = parsePageRanges(t, n);
      return r.ok ? "" : r.error;
    };
    expect(err("")).toMatch(/Type some pages/);
    expect(err("abc")).toMatch(/isn't a page or a range/);
    expect(err("0")).toMatch(/start at 1/);
    expect(err("4-2")).toMatch(/runs backwards/);
    expect(err("11")).toMatch(/only has 10 pages/);
    expect(err("1-", 1)).toBe("");
  });

  it("chunks evenly and expands to indices", () => {
    expect(chunkRanges(10, 4)).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 8 },
      { start: 9, end: 10 },
    ]);
    expect(chunkRanges(3, 10)).toEqual([{ start: 1, end: 3 }]);
    expect(rangeIndices({ start: 3, end: 5 })).toEqual([2, 3, 4]);
  });
});

describe("split + zip", () => {
  it("extracts pages and zips parts with unique names", async () => {
    const doc = await loadPdfDoc(await makeDoc("S", 6), "s");
    const parts = [await extractPages(doc, [0, 1]), await extractPages(doc, [4, 5]), await extractPages(doc, [2])];
    expect(await Promise.all(parts.map(pageTexts))).toEqual([["S p1", "S p2"], ["S p5", "S p6"], ["S p3"]]);

    const zip = zipFiles(parts.map((bytes) => ({ name: "part.pdf", bytes })));
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(["part.pdf", "part (2).pdf", "part (3).pdf"]);
    expect(await pageTexts(files["part (2).pdf"])).toEqual(["S p5", "S p6"]);
    expect(uniqueNames(["a", "a", "b"])).toEqual(["a", "a (2)", "b"]);
  });

  it("needs at least one page", async () => {
    const doc = await loadPdfDoc(await makeDoc("S", 2), "s");
    await expect(extractPages(doc, [])).rejects.toBeInstanceOf(PdfUserError);
  });
});

describe("image sniffing", () => {
  it("reads JPEG and PNG headers", () => {
    expect(inspectJpeg(imageFixture("photo.jpg"))).toMatchObject({ width: 248, height: 351, components: 3, sof: 0xc0, orientation: 1 });
    expect(inspectJpeg(imageFixture("progressive.jpg"))).toMatchObject({ sof: 0xc2, orientation: 1 });
    expect(inspectJpeg(imageFixture("photo-exif-6.jpg"))).toMatchObject({ orientation: 6, width: 248 });
    expect(inspectPng(imageFixture("logo.png"))).toEqual({ width: 120, height: 80, bitDepth: 8, colorType: 6, interlaced: false });
    expect(inspectJpeg(imageFixture("not-an-image.jpg"))).toBeNull();
  });

  it("only passes images through when nothing needs to change", () => {
    expect(directEmbed(imageFixture("photo.jpg"), 0)).toMatchObject({ kind: "jpg" });
    expect(directEmbed(imageFixture("progressive.jpg"), 0)).toMatchObject({ kind: "jpg" });
    expect(directEmbed(imageFixture("logo.png"), 0)).toMatchObject({ kind: "png", width: 120, height: 80 });
    expect(directEmbed(imageFixture("photo.jpg"), 90)).toBeNull(); // user rotation → canvas
    expect(directEmbed(imageFixture("photo-exif-6.jpg"), 0)).toBeNull(); // EXIF rotation → canvas
    expect(directEmbed(imageFixture("not-an-image.jpg"), 0)).toBeNull();
  });
});

describe("images → PDF layout", () => {
  const A4 = { w: 595.28, h: 841.89 };

  it("fits a portrait photo on A4 with margins, centred", () => {
    const p = computePlacement(1000, 2000, { pageSize: "a4", orientation: "auto", margin: "small" });
    expect([p.pageWidth, p.pageHeight]).toEqual([A4.w, A4.h]);
    expect(p.height).toBeCloseTo(A4.h - 48, 5); // limited by height
    expect(p.x).toBeCloseTo((A4.w - p.width) / 2, 5);
    expect(p.y).toBeCloseTo(24, 5);
  });

  it("flips to landscape for wide images when orientation is auto", () => {
    const p = computePlacement(2000, 1000, { pageSize: "a4", orientation: "auto", margin: "none" });
    expect([p.pageWidth, p.pageHeight]).toEqual([A4.h, A4.w]);
    expect(p.width).toBeCloseTo(A4.h, 5);
  });

  it("honours a forced orientation and Letter size", () => {
    const p = computePlacement(2000, 1000, { pageSize: "letter", orientation: "portrait", margin: "none" });
    expect([p.pageWidth, p.pageHeight]).toEqual([612, 792]);
    expect(p.width).toBeCloseTo(612, 5);
  });

  it("matches the image size, capped at an A4 length", () => {
    const small = computePlacement(300, 200, { pageSize: "auto", orientation: "auto", margin: "none" });
    expect([small.pageWidth, small.pageHeight]).toEqual([300, 200]);
    const big = computePlacement(4000, 3000, { pageSize: "auto", orientation: "auto", margin: "small" });
    expect(big.width).toBeCloseTo(842, 5);
    expect(big.pageWidth).toBeCloseTo(842 + 48, 5);
    expect(big.height / big.width).toBeCloseTo(0.75, 5);
  });
});

describe("images → PDF", () => {
  it("builds one page per image, in order, embedding photos untouched", async () => {
    const photo = imageFixture("photo.jpg");
    const pdf = await buildImagesPdf(
      [
        { name: "photo.jpg", kind: "jpg", bytes: photo, width: 248, height: 351 },
        { name: "logo.png", kind: "png", bytes: imageFixture("logo.png"), width: 120, height: 80 },
        { name: "progressive.jpg", kind: "jpg", bytes: imageFixture("progressive.jpg"), width: 248, height: 351 },
      ],
      DEFAULT_IMAGE_OPTIONS,
    );
    const sizes = await pageSizes(pdf);
    expect(sizes).toHaveLength(3);
    expect(sizes[0]).toMatchObject({ width: 595.28, height: 841.89 }); // portrait photo
    expect(sizes[1]).toMatchObject({ width: 841.89, height: 595.28 }); // landscape logo
    expect(await imageCounts(pdf)).toEqual([1, 1, 1]);
    // The JPEG's own bytes are inside the PDF, so no quality was lost.
    const needle = Buffer.from(photo.subarray(100, 200));
    expect(Buffer.from(pdf).includes(needle)).toBe(true);
  });

  it("reports an unreadable image by name", async () => {
    await expect(
      buildImagesPdf([{ name: "broken.jpg", kind: "jpg", bytes: new Uint8Array([1, 2, 3]), width: 1, height: 1 }], DEFAULT_IMAGE_OPTIONS),
    ).rejects.toMatchObject({ code: "unsupported-image", userMessage: expect.stringContaining("broken.jpg") });
  });
});

describe("naming helpers", () => {
  it("cleans names and formats sizes", () => {
    expect(safePdfName("  my: file?.PDF ")).toBe("my- file-.pdf");
    expect(safePdfName("   ")).toBe("document.pdf");
    expect(baseName("report.final.pdf")).toBe("report.final");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
