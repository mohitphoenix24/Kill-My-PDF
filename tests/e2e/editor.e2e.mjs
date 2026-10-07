// End-to-end test against the static production build (`out/`, what Netlify serves).
// Usage: npm run build && npm run test:e2e
// Needs a Playwright Chromium (npx playwright-core install chromium).
import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const root = process.cwd();
const outDir = join(root, "out");
const artifacts = join(root, "tests", "e2e", "artifacts");
mkdirSync(artifacts, { recursive: true });

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".pdf": "application/pdf", ".ttf": "font/ttf", ".json": "application/json", ".wasm": "application/wasm", ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream", ".icc": "application/octet-stream" };

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(outDir, path));
  try {
    if (!file.startsWith(outDir) || !statSync(file).isFile()) throw new Error();
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

const step = (name) => console.log(`• ${name}`);
const shot = (name) => page.screenshot({ path: join(artifacts, `${name}.png`) });
const polygon = (text) => page.locator("polygon", { has: page.locator(`title:text-is("${text}")`) });
const idle = () => page.waitForFunction(() => !document.body.innerText.includes("updating preview"), null, { timeout: 15000 });

const openFixture = async (name) => {
  await page.locator('input[type="file"]').setInputFiles(join(root, "tests", "fixtures", name));
};

try {
  step("landing page, then open a PDF");
  await page.goto(base);
  await page.getByRole("button", { name: "Choose a PDF to edit" }).waitFor();
  await shot("00-landing");
  await openFixture("employee-info.pdf");
  await polygon("Mohit Sharma").waitFor({ timeout: 20000 });
  await shot("01-loaded");

  step("hover highlights the element");
  await polygon("Mohit Sharma").hover();
  assert.equal(await polygon("Mohit Sharma").getAttribute("stroke"), "#818cf8");

  step("overlay lines up with the rendered text");
  const box = await polygon("Mohit Sharma").boundingBox();
  assert.ok(box && box.width > 40 && box.height > 8, "overlay has a sensible size");
  await page.screenshot({ path: join(artifacts, "02-overlay-zoom.png"), clip: { x: box.x - 140, y: box.y - 20, width: box.width + 200, height: box.height + 40 } });

  step("click selects: floating toolbar and inspector");
  await polygon("Mohit Sharma").click();
  await page.getByRole("toolbar", { name: "Text actions" }).waitFor();
  const textarea = page.getByLabel("Text content");
  assert.equal(await textarea.inputValue(), "Mohit Sharma");
  const panel = page.getByLabel("Properties", { exact: true });
  for (const expected of ["Helvetica", "Regular", "#000000", "Standard font"]) {
    assert.ok((await panel.innerText()).includes(expected), `inspector shows ${expected}`);
  }
  await shot("02b-selected");

  step("double-click edits inline: Mohit → Rohit");
  await polygon("Mohit Sharma").dblclick({ force: true }); // lands on whatever is on top (the drag handle once selected), like a real mouse
  const inline = page.getByLabel("Edit text inline");
  await inline.waitFor();
  await inline.fill("Rohit Sharma");
  await shot("03a-inline-editing");
  await inline.press("Enter");
  await idle();
  await page.waitForTimeout(500);
  assert.ok((await panel.innerText()).includes("Original font preserved"), "export status shown");
  await shot("03-edited");

  step("undo / redo with the keyboard");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await polygon("Mohit Sharma").waitFor();
  await page.keyboard.press("Control+Shift+z");
  await polygon("Rohit Sharma").waitFor();
  await idle();

  step("edit the salary (needs a substitute font)");
  await polygon("₹15,00,000").dblclick({ force: true }); // lands on whatever is on top (the drag handle once selected), like a real mouse
  await inline.fill("₹18,00,000");
  await inline.press("Enter");
  await idle();
  await page.waitForTimeout(500);
  assert.ok((await panel.innerText()).includes("Using a similar font"), "substitution is reported");

  step("floating toolbar changes the size");
  await page.keyboard.press("Escape"); // the salary's toolbar sits over the row above it
  await polygon("Hyderabad").click();
  await page.getByRole("button", { name: "Larger" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Text actions"]')?.textContent?.includes("13"));
  await page.keyboard.press("Control+z");

  step("download and verify the PDF");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  const saved = join(artifacts, "employee-info-edited.pdf");
  await download.saveAs(saved);
  await page.getByText("Downloaded employee-info-edited.pdf").waitFor({ timeout: 15000 });
  await shot("04-saved");

  const bytes = new Uint8Array(readFileSync(saved));
  const pdf = await getDocument({ data: bytes, verbosity: 0, standardFontDataUrl: join(root, "node_modules/pdfjs-dist/standard_fonts/") }).promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((i) => i.str).join(" ");
  assert.ok(text.includes("Rohit Sharma"), "pdf.js extracts the new name");
  assert.ok(text.includes("₹18,00,000"), "pdf.js extracts the new salary");
  assert.ok(!text.includes("Mohit"), "old name is gone");
  for (const kept of ["Employee ID:", "EMP1024", "Engineering", "Hyderabad"]) assert.ok(text.includes(kept), `${kept} unchanged`);
  try {
    const poppler = execFileSync("pdftotext", ["-layout", saved, "-"], { encoding: "utf8" });
    assert.match(poppler, /Employee Name:\s+Rohit Sharma/);
    assert.match(poppler, /Salary:\s+₹18,00,000/);
    console.log("  poppler (independent reader) agrees");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  step("select-text mode exposes a native text layer");
  await page.getByRole("radio", { name: "Select text" }).click();
  await page.locator(".textLayer span").first().waitFor();
  assert.ok((await page.locator(".textLayer").first().innerText()).includes("Rohit Sharma"), "text layer reflects the edit");
  await page.getByRole("radio", { name: "Edit" }).click();

  step("zoom keeps the overlay aligned");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(800);
  await shot("05-zoomed");
  await page.getByRole("button", { name: "Fit width" }).click();

  step("unsaved changes ask before opening another file");
  await polygon("EMP1024").click();
  await page.keyboard.press("ArrowRight");
  await openFixture("not-a-pdf.pdf");
  await page.getByText("Discard your changes?").waitFor();
  await shot("06a-discard-dialog");
  await page.getByRole("button", { name: "Discard & open" }).click();

  step("error: not a PDF");
  await page.getByText("This file is not a PDF.").waitFor();

  step("error: password-protected");
  await openFixture("password.pdf");
  await page.getByText(/password-protected/).waitFor();
  await shot("06b-error");

  step("error: corrupted");
  await openFixture("corrupted.pdf");
  await page.getByText(/damaged or invalid/).waitFor();

  step("scanned PDF message");
  await openFixture("scanned.pdf");
  await page.getByText("This PDF does not contain editable native text. Scanned PDFs are not currently supported.").waitFor();
  await shot("06-scanned");

  step("rotated text and rotated pages");
  await openFixture("text-features.pdf");
  await polygon("Rotated thirty").waitFor();
  await shot("07-text-features");
  await openFixture("rotated-pages.pdf");
  await polygon("Rotated page 90").waitFor();
  await polygon("Rotated page 90").hover();
  await shot("08-rotated-page");

  step("multi-page navigation: dock and thumbnails");
  await openFixture("multipage.pdf");
  await polygon("Page 1 heading").waitFor();
  await page.getByLabel("Page number").fill("4");
  await page.getByLabel("Page number").press("Enter");
  await polygon("Page 4 heading").waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  assert.ok(await polygon("Page 4 heading").isVisible(), "page 4 scrolled into view");
  await page.getByRole("button", { name: "Go to page 2" }).click();
  await page.waitForTimeout(500);
  assert.ok(await polygon("Page 2 heading").isVisible(), "thumbnail navigates");
  await shot("09-multipage");

  step("logo returns to the start screen; browser Back does too");
  await page.getByRole("button", { name: /back to home/ }).click();
  await page.getByRole("button", { name: "Choose a PDF to edit" }).waitFor();
  await openFixture("employee-info.pdf");
  await polygon("Mohit Sharma").waitFor({ timeout: 20000 });
  await page.goBack();
  await page.getByRole("button", { name: "Choose a PDF to edit" }).waitFor();
  await openFixture("multipage.pdf");
  await polygon("Page 1 heading").waitFor();

  step("keyboard shortcuts dialog");
  await page.keyboard.press("?");
  await page.getByText("Keyboard shortcuts").first().waitFor();
  await shot("10-shortcuts");
  await page.keyboard.press("Escape");

  step("mobile: tap to select, edit inline, bottom sheet");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const m = await phone.newPage();
  m.on("pageerror", (e) => consoleErrors.push(String(e)));
  await m.goto(base);
  await m.waitForTimeout(500);
  await m.screenshot({ path: join(artifacts, "m1-landing.png") });
  await m.locator('input[type="file"]').setInputFiles(join(root, "tests", "fixtures", "employee-info.pdf"));
  const mPoly = (text) => m.locator("polygon", { has: m.locator(`title:text-is("${text}")`) });
  await mPoly("Mohit Sharma").waitFor({ timeout: 20000 });
  await m.waitForTimeout(600);
  await m.screenshot({ path: join(artifacts, "m2-editor.png") });
  await mPoly("Mohit Sharma").tap();
  await m.getByRole("toolbar", { name: "Text actions" }).waitFor();
  await m.screenshot({ path: join(artifacts, "m3-selected.png") });
  await m.getByRole("button", { name: "Edit", exact: true }).tap();
  await m.getByLabel("Edit text inline").fill("Rohit Sharma");
  await m.getByLabel("Edit text inline").press("Enter");
  await mPoly("Rohit Sharma").waitFor();
  await m.getByRole("toolbar", { name: "Text actions" }).waitFor(); // still selected after editing
  await m.getByRole("button", { name: "More options" }).tap();
  await m.getByLabel("Properties", { exact: true }).waitFor();
  await m.waitForTimeout(500);
  await m.screenshot({ path: join(artifacts, "m4-sheet.png") });
  await phone.close();

  const unexpected = consoleErrors.filter((e) => !/Failed to load resource/.test(e));
  assert.deepEqual(unexpected, [], "no console errors");
  console.log(`\nE2E passed. Screenshots in ${artifacts}`);
} catch (error) {
  await shot("failure").catch(() => {});
  console.error("\nE2E FAILED:", error.message);
  if (consoleErrors.length) console.error("Console errors:", consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
