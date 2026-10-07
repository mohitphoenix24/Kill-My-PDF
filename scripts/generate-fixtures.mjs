// Generates the test fixtures. The generated files are committed, so this only
// needs re-running when fixtures change.
// Encrypted fixtures additionally need Ghostscript (`gs`) on PATH.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

console.log(`Fixtures written to ${fixtures}`);
