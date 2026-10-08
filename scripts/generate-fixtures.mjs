// Generates the test fixtures. The generated files are committed, so this only
// needs re-running when fixtures change.
// Encrypted fixtures additionally need Ghostscript (`gs`) on PATH.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const root = process.cwd();
const fixtures = join(root, "tests", "fixtures");
mkdirSync(fixtures, { recursive: true });

const dejavu = readFileSync(join(root, "public", "fonts", "dejavu", "DejaVuSans.ttf"));

async function save(doc, ...paths) {
  const bytes = await doc.save();
  for (const p of paths) writeFileSync(p, bytes);
  return bytes;
}

/** Replaces a page's content with a raw content stream using the given font resources. */
function setRawContent(doc, page, content, fonts = {}) {
  for (const [name, font] of Object.entries(fonts)) {
    page.node.setFontDictionary(PDFName.of(name), font.ref);
  }
  const stream = doc.context.flateStream(content);
  page.node.set(PDFName.of("Contents"), doc.context.register(stream));
}

// 1. The employee example from the brief.
async function employeeInfo() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle("Employee Information");
  const page = doc.addPage([595, 842]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  // The rupee sign is not in WinAnsi, so the salary uses an embedded (subset) TrueType font.
  const unicode = await doc.embedFont(dejavu, { subset: true });
  page.drawText("Employee Information", { x: 72, y: 760, size: 22, font: bold, color: rgb(0.1, 0.2, 0.5) });
  const rows = [
    ["Employee Name:", "Mohit Sharma"],
    ["Employee ID:", "EMP1024"],
    ["Department:", "Engineering"],
    ["Location:", "Hyderabad"],
  ];
  let y = 710;
  for (const [label, value] of rows) {
    page.drawText(label, { x: 72, y, size: 12, font: bold });
    page.drawText(value, { x: 190, y, size: 12, font: regular });
    y -= 28;
  }
  page.drawText("Salary:", { x: 72, y, size: 12, font: bold });
  page.drawText("₹15,00,000", { x: 190, y, size: 12, font: unicode });
  page.drawText("Generated sample for the PDF editor. All values are fictitious.", {
    x: 72,
    y: 72,
    size: 9,
    font: regular,
    color: rgb(0.4, 0.4, 0.4),
  });
  return save(doc, join(fixtures, "employee-info.pdf"));
}

// 1b. A fictional, presentable invoice used for README screenshots and social images.
async function showcaseInvoice() {
  const doc = await PDFDocument.create();
  doc.setTitle("Invoice INV-2048");
  const page = doc.addPage([595, 842]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.11, 0.12, 0.16);
  const muted = rgb(0.45, 0.47, 0.53);
  const accent = rgb(0.4, 0.52, 0.07); // olive-lime, matching the app's accent on white paper
  const line = rgb(0.88, 0.89, 0.92);

  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: rgb(0.08, 0.08, 0.09) });
  page.drawText("Northwind Studio", { x: 56, y: 811, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText("hello@northwind.example", { x: 400, y: 812, size: 10, font: regular, color: rgb(0.78, 0.94, 0.21) });

  page.drawText("Invoice", { x: 56, y: 730, size: 30, font: bold, color: ink });
  page.drawText("INV-2048", { x: 56, y: 708, size: 12, font: regular, color: muted });

  const meta = [
    ["Issued", "12 March 2026"],
    ["Due", "11 April 2026"],
  ];
  meta.forEach(([k, v], i) => {
    page.drawText(k, { x: 380, y: 732 - i * 20, size: 10, font: regular, color: muted });
    page.drawText(v, { x: 440, y: 732 - i * 20, size: 10, font: bold, color: ink });
  });

  page.drawText("Billed to", { x: 56, y: 650, size: 10, font: regular, color: muted });
  page.drawText("Acme Corporation", { x: 56, y: 632, size: 13, font: bold, color: ink });
  page.drawText("221 Market Street, Springfield", { x: 56, y: 615, size: 10, font: regular, color: muted });

  const rows = [
    ["Brand identity refresh", "1", "$2,400.00"],
    ["Website design — 6 pages", "1", "$3,150.00"],
    ["Illustration set", "12", "$960.00"],
  ];
  let y = 560;
  page.drawText("Description", { x: 56, y, size: 10, font: bold, color: muted });
  page.drawText("Qty", { x: 380, y, size: 10, font: bold, color: muted });
  page.drawText("Amount", { x: 470, y, size: 10, font: bold, color: muted });
  page.drawLine({ start: { x: 56, y: y - 10 }, end: { x: 539, y: y - 10 }, thickness: 1, color: line });
  for (const [desc, qty, amount] of rows) {
    y -= 34;
    page.drawText(desc, { x: 56, y, size: 11, font: regular, color: ink });
    page.drawText(qty, { x: 380, y, size: 11, font: regular, color: ink });
    page.drawText(amount, { x: 470, y, size: 11, font: regular, color: ink });
    page.drawLine({ start: { x: 56, y: y - 14 }, end: { x: 539, y: y - 14 }, thickness: 0.5, color: line });
  }
  y -= 46;
  page.drawText("Total due", { x: 380, y, size: 12, font: bold, color: ink });
  page.drawText("$6,510.00", { x: 470, y, size: 14, font: bold, color: accent });

  page.drawText("Thank you for your business!", { x: 56, y: 120, size: 12, font: bold, color: ink });
  page.drawText("Payment by bank transfer within 30 days. All names and amounts are fictitious.", {
    x: 56,
    y: 102,
    size: 9,
    font: regular,
    color: muted,
  });
  return save(doc, join(fixtures, "showcase-invoice.pdf"));
}

// 2. Operator coverage: TJ kerning and gaps, ' and ", spacing, scaling, rotation, CMYK, rise.
//    Tc/Tw/Tz/colour are deliberately never reset: text state is part of the graphics
//    state and persists across BT/ET, so later lines inherit it (and render spaced/wide).
async function textFeatures() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const content = [
    "BT /F1 14 Tf 72 740 Td (Plain Tj line) Tj ET",
    "BT /F1 12 Tf 72 710 Td [(Ke) 30 (rned) -250 (TJ) -3000 (Far column)] TJ ET",
    "BT /F1 12 Tf 16 TL 72 680 Td (First line) Tj (Quote line) ' 2 0.5 (Double quote line) \" ET",
    "BT /F1 12 Tf 2 Tc 5 Tw 72 620 Td (Spaced out text) Tj ET",
    "BT /F1 12 Tf 150 Tz 72 590 Td (Wide text) Tj ET",
    "q 0.866025 0.5 -0.5 0.866025 300 480 cm BT /F2 16 Tf 0 0 Td (Rotated thirty) Tj ET Q",
    "BT 0 0 0 1 k /F1 12 Tf 72 560 Td (CMYK black) Tj ET",
    "BT 0 0.5 0 rg /F1 12 Tf 72 530 Td (Green ) Tj (continued) Tj ET",
    "BT /F1 12 Tf 72 500 Td (Before) Tj /F2 12 Tf ( bold after) Tj ET",
    "BT /F1 12 Tf 1 0 0 1 72 470 Tm 5 Ts (Raised) Tj ET",
    "BT /F1 12 Tf 72 440 Td (Line A) Tj 200 0 Td (Line B same baseline) Tj ET",
  ].join("\n");
  setRawContent(doc, page, content, { F1: helvetica, F2: helveticaBold });
  return save(doc, join(fixtures, "text-features.pdf"));
}

// 3. Page /Rotate and a CropBox that does not start at the origin.
async function rotatedPage() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (const rotation of [90, 180, 270]) {
    const page = doc.addPage([612, 792]);
    page.setCropBox(36, 36, 540, 720);
    page.setRotation(degrees(rotation));
    page.drawText(`Rotated page ${rotation}`, { x: 100, y: 600, size: 18, font });
    page.drawText("Second line", { x: 100, y: 570, size: 12, font });
  }
  return save(doc, join(fixtures, "rotated-pages.pdf"));
}

// 4. Text inside a Form XObject (read-only) next to normal page text.
async function formXObject() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.context.flateStream("BT /F1 12 Tf 0 0 Td (Text inside a form) Tj ET", {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, 300, 50],
    Resources: { Font: { F1: font.ref } },
  });
  const formRef = doc.context.register(form);
  page.node.setXObject(PDFName.of("Fm1"), formRef);
  setRawContent(
    doc,
    page,
    "BT /F1 12 Tf 72 700 Td (Page text before) Tj ET\nq 1 0 0 1 72 650 cm /Fm1 Do Q\nBT /F1 12 Tf 72 600 Td (Page text after) Tj ET",
    { F1: font },
  );
  return save(doc, join(fixtures, "form-xobject.pdf"));
}

function grayImage(doc, width, height) {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels[y * width + x] = (x * 7 + y * 3) % 64 === 0 ? 40 : 235;
  }
  return doc.context.register(
    doc.context.flateStream(pixels, {
      Type: "XObject",
      Subtype: "Image",
      Width: width,
      Height: height,
      ColorSpace: "DeviceGray",
      BitsPerComponent: 8,
    }),
  );
}

// 5. Scanned pages: an image only, and an image with an invisible (Tr 3) OCR text layer.
async function scanned() {
  for (const withOcr of [false, true]) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.node.setXObject(PDFName.of("Im1"), grayImage(doc, 306, 396));
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const ocr = withOcr ? "\nBT 3 Tr /F1 12 Tf 72 700 Td (Invisible OCR text) Tj ET" : "";
    setRawContent(doc, page, `q 612 0 0 792 0 0 cm /Im1 Do Q${ocr}`, withOcr ? { F1: font } : {});
    await save(doc, join(fixtures, withOcr ? "scanned-ocr.pdf" : "scanned.pdf"));
  }
}

// 6. Several pages, for navigation and lazy analysis.
async function multipage() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i} heading`, { x: 72, y: 760, size: 20, font });
    page.drawText(`Body text on page ${i}.`, { x: 72, y: 720, size: 12, font });
  }
  return save(doc, join(fixtures, "multipage.pdf"));
}

await employeeInfo();
await showcaseInvoice();
await textFeatures();
await rotatedPage();
await formXObject();
await scanned();
await multipage();

// 7. Broken files.
writeFileSync(join(fixtures, "not-a-pdf.pdf"), "This is plain text, not a PDF.\n");
writeFileSync(join(fixtures, "corrupted.pdf"), Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2048, 0x41)]));

// 8. Encrypted files (Ghostscript).
try {
  const src = join(fixtures, "employee-info.pdf");
  const gs = (args) => execFileSync("gs", ["-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", ...args, src], { stdio: "pipe" });
  gs(["-sOwnerPassword=owner", "-sUserPassword=secret", "-dEncryptionR=3", "-dKeyLength=128", `-sOutputFile=${join(fixtures, "password.pdf")}`]);
  gs(["-sOwnerPassword=owner", "-dEncryptionR=3", "-dKeyLength=128", "-dPermissions=-3904", `-sOutputFile=${join(fixtures, "encrypted-no-password.pdf")}`]);
} catch (error) {
  console.warn("Skipped encrypted fixtures (Ghostscript not available):", error.message);
}

// 9. Image fixtures for images → PDF (JPEGs via Poppler; PNGs from a tiny encoder below).
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** 8-bit RGBA PNG with a diagonal gradient and a fully transparent corner. */
function makePng(width, height, interlaced = false) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const i = y * (width * 4 + 1) + 1 + x * 4;
      raw[i] = Math.round((x / width) * 255);
      raw[i + 1] = Math.round((y / height) * 255);
      raw[i + 2] = 180;
      raw[i + 3] = x < width / 4 && y < height / 4 ? 0 : 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[12] = interlaced ? 1 : 0; // (declared only; used to test that interlaced files take the canvas path)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}
/** Inserts an EXIF APP1 segment that sets the orientation tag. */
function withExifOrientation(jpeg, orientation) {
  const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const header = Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]);
  return Buffer.concat([jpeg.subarray(0, 2), header, body, jpeg.subarray(2)]);
}
try {
  const images = join(fixtures, "images");
  rmSync(images, { recursive: true, force: true });
  mkdirSync(images, { recursive: true });
  const src = join(fixtures, "showcase-invoice.pdf");
  const jpegFrom = (name, opts) => {
    execFileSync("pdftoppm", ["-jpeg", "-r", "30", "-singlefile", ...opts, src, join(images, name)]);
    return join(images, `${name}.jpg`);
  };
  const photo = jpegFrom("photo", []);
  jpegFrom("progressive", ["-jpegopt", "progressive=y"]);
  writeFileSync(join(images, "photo-exif-6.jpg"), withExifOrientation(readFileSync(photo), 6));
  writeFileSync(join(images, "logo.png"), makePng(120, 80));
  writeFileSync(join(images, "not-an-image.jpg"), "this is not an image");
} catch (error) {
  console.warn("Skipped image fixtures (Poppler's pdftoppm not available):", error.message);
}

// 10. A Chrome-printed form (Skia/PDF): subset TrueType fonts, one glyph per text operator, and — importantly —
//     no space glyphs at all (words are just positioned apart). Needs a Playwright Chromium.
try {
  const { chromium } = await import("playwright-core");
  const html = `<!doctype html><html><head><style>
    @page { size: A4; margin: 12mm }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9.2pt; line-height: 1.25; color: #000 }
    h2 { font-size: 15pt; margin: 6mm 0 2mm } p { margin: 0 0 1mm }
  </style></head><body>
  <h2>Service Request</h2>
  <div>Northwind Studio<br>12 Harbour Road<br>Springfield 40001<br>support@northwind.example</div>
  <div style="margin-top:36mm">
  <p>I confirm that I have read the Customer Handbook and that the details I filled in on this Service Request Form are accurate. I agree to follow the studio rules as described in the Customer Handbook. I confirm that the information provided by me is correct. I also confirm that I am not submitting more than one Request Form for myself.</p>
  <p>If any of the information provided by me is found to be incorrect later, I understand that my request may be cancelled, before, during, or after the work, including the time after delivery of my final files. Further, I understand that I may be liable for the costs of any work already completed. The studio's decision will be final and binding on me.</p>
  <p><b>e-Signature :</b> Alex Morgan</p></div></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 900 } });
  await page.setContent(html);
  writeFileSync(join(fixtures, "chrome-form.pdf"), await page.pdf({ format: "A4", printBackground: true, width: "170mm" }));
  await browser.close();
} catch (error) {
  console.warn("Skipped chrome-form.pdf (needs Playwright's Chromium):", error.message);
}

console.log(`Fixtures written to ${fixtures}`);
