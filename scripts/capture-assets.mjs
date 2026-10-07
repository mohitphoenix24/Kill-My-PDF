// Captures README screenshots and generates the social/OG images from the real app.
// Usage: npm run build && npm run capture
// Needs a Playwright Chromium (npx playwright-core install chromium).
import { createServer } from "node:http";
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const outDir = join(root, "out");
const shots = join(root, "docs", "screenshots");
const appDir = join(root, "src", "app");
mkdirSync(shots, { recursive: true });

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(outDir, path));
  try {
    if (!file.startsWith(outDir) || !statSync(file).isFile()) throw new Error();
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
// A fictional invoice — no real names or personal data in public images.
const fixture = join(root, "tests", "fixtures", "showcase-invoice.pdf");
const browser = await chromium.launch();

async function settle(page, ms = 700) {
  await page.waitForFunction(() => !document.body.innerText.includes("Updating preview"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

// ---- Desktop -------------------------------------------------------------
{
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
  await page.goto(base);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(shots, "landing.png") });

  await page.locator('input[type="file"]').setInputFiles(fixture);
  const poly = (t) => page.locator("polygon", { has: page.locator(`title:text-is("${t}")`) });
  await poly("Acme Corporation").waitFor({ timeout: 20000 });
  await poly("Acme Corporation").click();
  await settle(page);
  await page.screenshot({ path: join(shots, "editor.png") });

  await poly("Acme Corporation").dblclick({ force: true });
  await page.getByLabel("Edit text inline").fill("Globex Corporation");
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, "inline-editing.png") });
  await page.getByLabel("Edit text inline").press("Enter");
  await settle(page, 1200);
  await page.screenshot({ path: join(shots, "edited.png") });
  await page.context().close();
}

// ---- Mobile --------------------------------------------------------------
{
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  ).newPage();
  await page.goto(base);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(shots, "mobile-landing.png") });
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const poly = (t) => page.locator("polygon", { has: page.locator(`title:text-is("${t}")`) });
  await poly("Acme Corporation").waitFor({ timeout: 20000 });
  await poly("Acme Corporation").tap();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, "mobile-editor.png") });
  await page.context().close();
}

// ---- Social card (1200×630 OG image and 1280×640 GitHub preview) ------------
const editorShot = readFileSync(join(shots, "editor.png")).toString("base64");
const logo = readFileSync(join(appDir, "icon.svg"), "utf8");
const name = /name:\s*"([^"]+)"/.exec(readFileSync(join(root, "src", "config", "site.ts"), "utf8"))[1];

async function socialCard(width, height, files) {
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${base}/`); // same origin, so the app's Geist font is available
  await page.setContent(`<!doctype html><html class="${htmlClass()}"><head>
  ${cssFiles().map((href) => `<link rel="stylesheet" href="${base}${href}">`).join("")}
  <style>
    body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#09090b;font-family:var(--font-geist-sans),system-ui,sans-serif;color:#fff;position:relative}
    .glow{position:absolute;border-radius:50%;filter:blur(110px)}
    .g1{width:760px;height:420px;left:-120px;top:-200px;background:rgba(79,70,229,.45)}
    .g2{width:600px;height:420px;right:-160px;bottom:-220px;background:rgba(139,92,246,.35)}
    .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 80% 80% at 30% 40%,#000 20%,transparent 100%)}
    .copy{position:absolute;left:72px;top:0;bottom:0;width:${Math.round(width * 0.5)}px;display:flex;flex-direction:column;justify-content:center}
    .brand{display:flex;align-items:center;gap:14px;font-size:26px;font-weight:600;letter-spacing:-.01em}
    .brand svg{width:48px;height:48px}
    h1{margin:36px 0 0;font-size:${width > 1250 ? 58 : 54}px;line-height:1.04;letter-spacing:-.035em;font-weight:650}
    h1 span{background:linear-gradient(90deg,#a5b4fc,#c4b5fd,#f0abfc);-webkit-background-clip:text;color:transparent}
    p{margin:24px 0 0;font-size:24px;line-height:1.4;color:#a1a1aa}
    .chips{display:flex;gap:10px;margin-top:34px;flex-wrap:wrap}
    .chip{font-size:17px;color:#d4d4d8;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}
    .shot{position:absolute;left:${Math.round(width * 0.56)}px;top:80px;width:${Math.round(width * 0.62)}px;border-radius:18px;border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 120px -20px rgba(0,0,0,.9),0 0 0 8px rgba(255,255,255,.03);transform:perspective(1600px) rotateY(-14deg) rotateX(4deg);transform-origin:left center}
  </style></head><body>
  <div class="glow g1"></div><div class="glow g2"></div><div class="grid"></div>
  <img class="shot" src="data:image/png;base64,${editorShot}">
  <div class="copy">
    <div class="brand">${logo}<span>${name}</span></div>
    <h1>Edit the text in any PDF.<br><span>Keep the original look.</span></h1>
    <p>Free, in your browser. Fonts, layout and selectable text preserved.</p>
    <div class="chips"><span class="chip">Original fonts</span><span class="chip">Real text</span><span class="chip">No sign-up</span></div>
  </div>
  </body></html>`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: files[0] });
  for (const f of files.slice(1)) copyFileSync(files[0], f);
  await page.context().close();
}

/** The <html> class carries next/font's --font-geist-sans variable. */
function htmlClass() {
  const html = readFileSync(join(outDir, "index.html"), "utf8");
  return /<html[^>]*class="([^"]+)"/.exec(html)?.[1] ?? "";
}

/** Every stylesheet the built page uses (next/font's @font-face rules live in their own file). */
function cssFiles() {
  const html = readFileSync(join(outDir, "index.html"), "utf8");
  return [...new Set(html.match(/\/_next\/static\/[^"]+\.css/g) ?? [])];
}

await socialCard(1200, 630, [join(appDir, "opengraph-image.png"), join(appDir, "twitter-image.png")]);
await socialCard(1280, 640, [join(root, "docs", "social-preview.png")]);

// ---- Apple touch icon ------------------------------------------------------
{
  const page = await (await browser.newContext({ viewport: { width: 180, height: 180 } })).newPage();
  await page.setContent(`<html><body style="margin:0;background:#4338ca">${logo.replace("<svg ", '<svg width="180" height="180" ')}</body></html>`);
  await page.screenshot({ path: join(appDir, "apple-icon.png") });
  await page.context().close();
}

await browser.close();
server.close();
console.log("Captured screenshots in docs/screenshots and social images in src/app.");
