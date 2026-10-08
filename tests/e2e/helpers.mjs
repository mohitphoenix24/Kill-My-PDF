// Shared plumbing for the browser tests: server + browser setup, fixtures, downloads, and PDF inspection.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { serveOut } from "./server.mjs";

export const root = process.cwd();
export const artifacts = join(root, "tests", "e2e", "artifacts");
mkdirSync(artifacts, { recursive: true });

export const fx = (...parts) => join(root, "tests", "fixtures", ...parts);
export const step = (name) => console.log(`• ${name}`);

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Starts the static server and a Chromium page. `phone: true` emulates a touch phone. */
export async function launch({ phone = false } = {}) {
  const { server, base } = serveOut(root);
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...(phone ? PHONE : DESKTOP), acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const shot = (name) => page.screenshot({ path: join(artifacts, `${name}.png`) });
  return {
    page,
    base,
    errors,
    shot,
    context,
    async close() {
      await browser.close();
      server.close();
    },
  };
}

/** Clicks something that triggers a download and returns the downloaded bytes. */
export async function downloadFrom(page, trigger, saveAs) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), trigger()]);
  const path = join(artifacts, saveAs ?? download.suggestedFilename());
  await download.saveAs(path);
  return { bytes: new Uint8Array(readFileSync(path)), name: download.suggestedFilename(), path };
}

const standardFontDataUrl = join(root, "node_modules/pdfjs-dist/standard_fonts/") ;
export async function openPdf(bytes) {
  return getDocument({ data: bytes.slice(), verbosity: 0, standardFontDataUrl }).promise;
}

/** Text of each page, as pdf.js extracts it. */
export async function pdfTexts(bytes) {
  const pdf = await openPdf(bytes);
  const texts = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    texts.push(content.items.map((i) => i.str).join(" ").trim());
  }
  await pdf.destroy();
  return texts;
}

/** Page sizes and rotations. */
export async function pdfPages(bytes) {
  const pdf = await openPdf(bytes);
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const v = page.getViewport({ scale: 1 });
    pages.push({ width: Math.round(v.width), height: Math.round(v.height), rotation: page.rotate });
  }
  await pdf.destroy();
  return pages;
}

/** The on-screen centre of the outline for a text element (found by its content). */
export async function textBox(page, text) {
  const poly = page.locator("polygon", { has: page.locator(`title:text-is("${text}")`) });
  await poly.waitFor({ timeout: 20000 });
  const box = await poly.boundingBox();
  if (!box) throw new Error(`No box for "${text}"`);
  return box;
}

/** A point `fraction` (0–1) of the way along the line, vertically centred. */
export async function pointOn(page, text, fraction = 0.5) {
  const b = await textBox(page, text);
  return { x: b.x + b.width * fraction, y: b.y + b.height / 2, box: b };
}

export async function openFile(page, ...names) {
  await page.locator('input[type="file"]').setInputFiles(names.map((n) => fx(n)));
}

/** A one-finger swipe made of real touch events (dy < 0 scrolls the page down). */
export async function swipe(cdp, x, y, dy) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (dy * i) / 12 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
