// Captures README screenshots and generates the social/OG images from the real app.
// Usage: npm run build && npm run capture
// Needs a Playwright Chromium (npx playwright-core install chromium).
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { serveOut } from "../tests/e2e/server.mjs";

const root = process.cwd();
const shots = join(root, "docs", "screenshots");
const appDir = join(root, "src", "app");
rmSync(shots, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });

const { server, base } = serveOut(root);
const fx = (...p) => join(root, "tests", "fixtures", ...p);
const browser = await chromium.launch();
const poly = (page, text) => page.locator("polygon", { has: page.locator(`title:text-is("${text}")`) });

async function settle(page, ms = 700) {
  await page.waitForFunction(() => !document.body.innerText.includes("Updating preview"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

// ---- Desktop -------------------------------------------------------------
{
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
  await page.goto(`${base}/`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(shots, "home.png") });

  // The text editor, on a fictional invoice — no real names or personal data in public images.
  await page.goto(`${base}/edit-pdf/`);
  await page.waitForTimeout(500);
  await page.locator('input[type="file"]').setInputFiles(fx("showcase-invoice.pdf"));
  const target = poly(page, "Acme Corporation");
  await target.waitFor({ timeout: 20000 });
  const box = await target.boundingBox();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  await settle(page);
  await page.screenshot({ path: join(shots, "editor.png") });
  await page.mouse.dblclick(box.x + box.width * 0.12, box.y + box.height / 2); // double-click "Acme": only that word is picked
  await page.getByLabel("Edit text inline").waitFor();
  await page.keyboard.type("Globex");
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, "inline-editing.png") });
  await page.keyboard.press("Enter");
  await settle(page, 1200);

  await page.goto(`${base}/merge-pdf/`);
  await page.locator('input[type="file"]').setInputFiles([fx("showcase-invoice.pdf"), fx("multipage.pdf"), fx("employee-info.pdf")]);
  await page.getByRole("heading", { name: "Your files" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(shots, "merge.png") });

  await page.goto(`${base}/organize-pdf/`);
  await page.locator('input[type="file"]').setInputFiles(fx("multipage.pdf"));
  await page.getByText("Tap pages to select them").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Select page 2" }).click();
  await page.getByRole("button", { name: "Rotate right" }).click();
  await page.getByRole("button", { name: "Select page 4" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, "organize.png") });

  await page.goto(`${base}/split-pdf/`);
  await page.locator('input[type="file"]').setInputFiles(fx("multipage.pdf"));
  await page.getByText("How do you want to slice it?").first().waitFor({ timeout: 20000 });
  await page.getByRole("radio", { name: /Custom ranges/ }).click();
  await page.getByLabel("Pages to pull out").fill("1-2, 4-");
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(shots, "split.png") });

  await page.goto(`${base}/images-to-pdf/`);
  await page.locator('input[type="file"]').setInputFiles([fx("images", "photo.jpg"), fx("images", "logo.png"), fx("images", "progressive.jpg")]);
  await page.getByRole("heading", { name: "Your images" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(shots, "images.png") });
  await page.context().close();
}

// ---- Phone ----------------------------------------------------------------
{
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  ).newPage();
  await page.goto(`${base}/`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(shots, "mobile-home.png") });

  await page.goto(`${base}/edit-pdf/`);
  await page.locator('input[type="file"]').setInputFiles(fx("showcase-invoice.pdf"));
  const target = poly(page, "Acme Corporation");
  await target.waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  await page.getByText("Tap a word to select its line").waitFor();
  await page.getByRole("button", { name: "Dismiss" }).first().tap();
  const box = await target.boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.getByTestId("word-marker").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, "mobile-editor.png") });
  await page.touchscreen.tap(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.getByRole("group", { name: "Edit text" }).waitFor();
  await page.keyboard.type("Fabrikam");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, "mobile-editing.png") });
  await page.context().close();
}

// ---- Social card (1200×630 OG image and 1280×640 GitHub preview) ------------
const editorShot = readFileSync(join(shots, "editor.png")).toString("base64");
const logo = readFileSync(join(appDir, "icon.svg"), "utf8");
const name = /name: "([^"]+)"/.exec(readFileSync(join(root, "src", "config", "site.ts"), "utf8"))[1];
const builtHtml = readFileSync(join(root, "out", "index.html"), "utf8");
const stylesheets = [...new Set(builtHtml.match(/\/_next\/static\/[^"]+\.css/g) ?? [])];
const htmlClass = /<html[^>]*class="([^"]+)"/.exec(builtHtml)?.[1] ?? "";
const splitAt = name.endsWith("PDF") ? name.length - 3 : name.length;

async function socialCard(width, height, files) {
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${base}/`); // same origin, so the app's fonts load
  await page.setContent(`<!doctype html><html class="${htmlClass}"><head>
  ${stylesheets.map((href) => `<link rel="stylesheet" href="${base}${href}">`).join("")}
  <style>
    body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#0d0d0f;font-family:var(--font-geist-sans),system-ui,sans-serif;color:#fff;position:relative}
    .glow{position:absolute;border-radius:50%;filter:blur(120px)}
    .g1{width:760px;height:380px;left:-100px;top:-190px;background:rgba(198,241,53,.30)}
    .g2{width:520px;height:380px;right:-140px;bottom:-200px;background:rgba(198,241,53,.14)}
    .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 80% 80% at 30% 40%,#000 20%,transparent 100%)}
    .copy{position:absolute;left:72px;top:0;bottom:0;width:${Math.round(width * 0.5)}px;display:flex;flex-direction:column;justify-content:center}
    .brand{display:flex;align-items:center;gap:14px;font-family:var(--font-display);font-size:30px;font-weight:800;letter-spacing:-.02em}
    .brand svg{width:50px;height:50px}.brand em{font-style:normal;color:#c6f135}
    h1{margin:34px 0 0;font-family:var(--font-display);font-size:${width > 1250 ? 66 : 62}px;line-height:1.02;letter-spacing:-.04em;font-weight:800}
    h1 span{color:#c6f135}
    p{margin:24px 0 0;font-size:24px;line-height:1.4;color:#a3a3ab}
    .chips{display:flex;gap:10px;margin-top:32px;flex-wrap:wrap}
    .chip{font-size:17px;color:#d4d4d9;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}
    .shot{position:absolute;left:${Math.round(width * 0.56)}px;top:84px;width:${Math.round(width * 0.62)}px;border-radius:18px;border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 120px -20px rgba(0,0,0,.9),0 0 0 8px rgba(255,255,255,.03);transform:perspective(1600px) rotateY(-14deg) rotateX(4deg);transform-origin:left center}
  </style></head><body>
  <div class="glow g1"></div><div class="glow g2"></div><div class="grid"></div>
  <img class="shot" src="data:image/png;base64,${editorShot}">
  <div class="copy">
    <div class="brand">${logo}<span>${name.slice(0, splitAt)}<em>${name.slice(splitAt)}</em></span></div>
    <h1>Kill the PDF hassle. <span>Free tools, right in your browser.</span></h1>
    <p>Edit text · merge · split · reorder pages · images to PDF</p>
    <div class="chips"><span class="chip">No sign-up</span><span class="chip">No watermarks</span><span class="chip">Original fonts kept</span></div>
  </div>
  </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: files[0] });
  for (const f of files.slice(1)) copyFileSync(files[0], f);
  await page.context().close();
}

await socialCard(1200, 630, [join(appDir, "opengraph-image.png"), join(appDir, "twitter-image.png")]);
await socialCard(1280, 640, [join(root, "docs", "social-preview.png")]);

// ---- Apple touch icon ------------------------------------------------------
{
  const page = await (await browser.newContext({ viewport: { width: 180, height: 180 } })).newPage();
  await page.setContent(`<html><body style="margin:0;background:#aedb1e">${logo.replace("<svg ", '<svg width="180" height="180" ')}</body></html>`);
  await page.screenshot({ path: join(appDir, "apple-icon.png") });
  await page.context().close();
}

await browser.close();
server.close();
console.log("Captured screenshots in docs/screenshots and social images in src/app.");
