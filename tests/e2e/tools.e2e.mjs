// The page tools (merge, organize, split, images → PDF), SEO output and phone flows.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { artifacts, downloadFrom, fx, launch, openFile, pdfPages, pdfTexts, step } from "./helpers.mjs";

const app = await launch();
const { page, base, shot } = app;

try {
  step("SEO: every page ships real HTML, canonical URL, structured data and a sitemap entry");
  const routes = ["/", "/edit-pdf/", "/merge-pdf/", "/organize-pdf/", "/images-to-pdf/", "/split-pdf/"];
  for (const route of routes) {
    const html = await (await fetch(`${base}${route}`)).text();
    assert.match(html, /<h1[ >]/, `${route} has an <h1> in the static HTML`);
    assert.match(html, /<title>[^<]{10,}/, `${route} has a title`);
    assert.match(html, /<meta name="description" content="[^"]{40,}/, `${route} has a description`);
    assert.match(html, /<link rel="canonical"/, `${route} has a canonical link`);
    assert.match(html, /application\/ld\+json/, `${route} has structured data`);
    assert.match(html, /rel="icon"/, `${route} has an icon`);
  }
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  for (const route of routes) assert.ok(sitemap.includes(`${route === "/" ? "/" : route}</loc>`), `sitemap lists ${route}`);
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robots, /Sitemap: .*sitemap\.xml/);
  const manifest = JSON.parse(await (await fetch(`${base}/manifest.webmanifest`)).text());
  assert.equal(manifest.name, "KillMyPDF");
  assert.equal(manifest.shortcuts.length, 5);
  assert.ok(!(await (await fetch(`${base}/`)).text()).includes("indigo"), "no leftover purple classes");

  step("home: five tools, each a real link");
  await page.goto(`${base}/`);
  await page.getByRole("heading", { name: /Kill the PDF hassle/ }).waitFor();
  for (const name of ["Edit PDF text", "Merge PDF", "Organize pages", "Images to PDF", "Split PDF"]) {
    await page.getByRole("link", { name: new RegExp(name) }).first().waitFor();
  }
  await shot("x01-home");

  // ---------------------------------------------------------------- merge
  step("merge: add two PDFs, reorder with the arrow, merge, download");
  await page.getByRole("link", { name: /Merge PDF/ }).first().click();
  await page.waitForURL(/\/merge-pdf\/$/);
  await openFile(page, "employee-info.pdf", "multipage.pdf");
  await page.getByRole("heading", { name: "Your files" }).waitFor();
  await page.getByText("2 files", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Move later" }).first().click(); // employee-info moves after multipage
  const order = await page.getByRole("list", { name: "Files to merge" }).innerText();
  assert.ok(order.indexOf("multipage.pdf") < order.indexOf("employee-info.pdf"), "order changed");
  await shot("x02-merge");
  await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
  await page.getByRole("heading", { name: "Boom. Merged." }).waitFor();
  await shot("x03-merge-result");
  const merged = await downloadFrom(page, () => page.getByRole("button", { name: /^Download$/ }).click(), "merged.pdf");
  const mergedTexts = await pdfTexts(merged.bytes);
  assert.equal(mergedTexts.length, 6);
  assert.match(mergedTexts[0], /Page 1 heading/);
  assert.match(mergedTexts[5], /Employee Information/);
  assert.match(mergedTexts[5], /₹15,00,000/, "embedded font survived");

  step("merge → Organize: the result is handed over, no re-upload");
  await page.getByRole("button", { name: /Organize pages/ }).click();
  await page.waitForURL(/\/organize-pdf\/$/);
  await page.getByText("Tap pages to select them").first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Save 6 pages" }).waitFor();

  // ---------------------------------------------------------------- organize
  step("organize: delete, drag to reorder, rotate, undo, save");
  const tiles = () => page.getByRole("list", { name: "Pages" }).getByRole("listitem");
  await page.getByRole("button", { name: "Select page 2" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Save 5 pages" }).waitFor();
  await page.keyboard.press("Control+z");
  await page.getByRole("button", { name: "Save 6 pages" }).waitFor();
  await page.keyboard.press("Control+Shift+z");
  await page.getByRole("button", { name: "Save 5 pages" }).waitFor();
  // now [P1, P3, P4, P5, E]: drag P1 onto P4's slot with the mouse
  const first = await tiles().nth(0).boundingBox();
  const third = await tiles().nth(2).boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 12, first.y + first.height / 2 + 8, { steps: 4 });
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.getByText("was 1").first().waitFor();
  await page.getByRole("button", { name: "Select page 5" }).click(); // the Employee page, last
  await page.getByRole("button", { name: "Rotate right" }).click();
  await shot("x04-organize");
  const organized = await downloadFrom(
    page,
    async () => {
      await page.getByRole("button", { name: "Save 5 pages" }).click();
      await page.getByRole("heading", { name: "Sorted." }).waitFor();
      await page.getByRole("button", { name: /^Download$/ }).click();
    },
    "organized.pdf",
  );
  const orgTexts = await pdfTexts(organized.bytes);
  assert.equal(orgTexts.length, 5);
  assert.deepEqual(
    orgTexts.map((t) => t.match(/Page \d|Employee/)?.[0]),
    ["Page 3", "Page 4", "Page 1", "Page 5", "Employee"],
  );
  assert.deepEqual((await pdfPages(organized.bytes)).map((p) => p.rotation), [0, 0, 0, 0, 90]);

  // ---------------------------------------------------------------- split
  step("split: custom ranges → zip with the right pieces");
  await page.goto(`${base}/split-pdf/`);
  await openFile(page, "multipage.pdf");
  await page.getByText("How do you want to slice it?").first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Split into 3 files" }).waitFor(); // default: every 2 pages
  await page.getByRole("radio", { name: /Custom ranges/ }).click();
  await page.getByLabel("Pages to pull out").fill("9");
  await page.getByText(/only has 5 pages/).waitFor();
  await page.getByLabel("Pages to pull out").fill("1-2, 4");
  await page.getByText("multipage-pages-1-2.pdf").waitFor();
  await page.getByText("multipage-pages-4.pdf").waitFor();
  await shot("x05-split");
  await page.getByRole("button", { name: "Split into 2 files" }).click();
  await page.getByRole("heading", { name: "Sliced." }).waitFor();
  const zip = await downloadFrom(page, () => page.getByRole("button", { name: /Download all/ }).click(), "split.zip");
  const files = unzipSync(zip.bytes);
  assert.deepEqual(Object.keys(files).sort(), ["multipage-pages-1-2.pdf", "multipage-pages-4.pdf"]);
  assert.deepEqual((await pdfTexts(files["multipage-pages-1-2.pdf"])).map((t) => t.match(/Page \d/)[0]), ["Page 1", "Page 2"]);
  assert.deepEqual((await pdfTexts(files["multipage-pages-4.pdf"])).map((t) => t.match(/Page \d/)[0]), ["Page 4"]);
  const single = await downloadFrom(page, () => page.getByRole("button", { name: "Download multipage-pages-4.pdf" }).click(), "part4.pdf");
  assert.equal((await pdfTexts(single.bytes)).length, 1);

  // ---------------------------------------------------------------- images
  step("images → PDF: JPG, PNG, WebP and an EXIF-rotated photo; one bad file is reported, not fatal");
  await page.goto(`${base}/merge-pdf/`); // any page with a canvas: make a WebP in the browser
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 120;
    const x = c.getContext("2d");
    x.fillStyle = "#0099ff";
    x.fillRect(0, 0, 200, 120);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp"));
    let s = "";
    new Uint8Array(await blob.arrayBuffer()).forEach((v) => (s += String.fromCharCode(v)));
    return btoa(s);
  });
  const webp = join(artifacts, "blue.webp");
  writeFileSync(webp, Buffer.from(b64, "base64"));
  await page.goto(`${base}/images-to-pdf/`);
  await page.locator('input[type="file"]').setInputFiles([fx("images/photo.jpg"), fx("images/logo.png"), webp, fx("images/photo-exif-6.jpg"), fx("images/not-an-image.jpg")]);
  await page.getByRole("heading", { name: "Your images" }).waitFor({ timeout: 20000 });
  await page.getByText("Couldn't add not-an-image.jpg").waitFor();
  await page.getByRole("button", { name: "Create PDF · 4 pages" }).waitFor();
  await page.getByRole("button", { name: "Rotate logo.png" }).click(); // landscape logo → portrait page
  await shot("x06-images");
  const images = await downloadFrom(
    page,
    async () => {
      await page.getByRole("button", { name: "Create PDF · 4 pages" }).click();
      await page.getByRole("heading", { name: "Photos in. PDF out." }).waitFor({ timeout: 30000 });
      await page.getByRole("button", { name: /^Download$/ }).click();
    },
    "images.pdf",
  );
  const sizes = await pdfPages(images.bytes);
  assert.deepEqual(
    sizes.map((s) => `${s.width}x${s.height}`),
    ["595x842", "595x842", "842x595", "842x595"], // photo, rotated logo, webp, EXIF-rotated photo
  );

  step("images → PDF: Letter size and 'fit image' pages");
  await page.getByRole("button", { name: "Tweak it" }).click();
  await page.getByRole("radio", { name: "Letter" }).click();
  await page.getByRole("button", { name: "Create PDF · 4 pages" }).click();
  await page.getByRole("heading", { name: "Photos in. PDF out." }).waitFor({ timeout: 30000 });
  const letter = await downloadFrom(page, () => page.getByRole("button", { name: /^Download$/ }).click(), "images-letter.pdf");
  assert.deepEqual((await pdfPages(letter.bytes)).map((s) => `${s.width}x${s.height}`), ["612x792", "612x792", "792x612", "792x612"]);

  // ---------------------------------------------------------------- wrong inputs
  step("wrong kinds of files are rejected kindly");
  await page.goto(`${base}/merge-pdf/`);
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await page.getByText(/isn't a PDF/).waitFor();
  await page.goto(`${base}/images-to-pdf/`);
  await page.locator('input[type="file"]').setInputFiles(fx("employee-info.pdf"));
  await page.getByText(/isn't an image/).waitFor();
  await page.goto(`${base}/merge-pdf/`);
  await openFile(page, "password.pdf");
  await page.getByText(/password-protected/).first().waitFor();

  assert.deepEqual(app.errors, [], "no console errors");
  console.log("\nTools desktop E2E passed.");
} catch (error) {
  await shot("x-failure").catch(() => {});
  console.error("\nTools E2E FAILED:", error.message);
  if (app.errors.length) console.error("Console errors:", app.errors);
  process.exitCode = 1;
} finally {
  await app.close();
}

if (process.exitCode) process.exit(process.exitCode);

// ------------------------------------------------------------------ phone
const phone = await launch({ phone: true });
try {
  step("phone: merge with big buttons and a bottom bar");
  await phone.page.goto(`${phone.base}/merge-pdf/`);
  await openFile(phone.page, "employee-info.pdf", "multipage.pdf");
  await phone.page.getByRole("heading", { name: "Your files" }).waitFor({ timeout: 20000 });
  const move = await phone.page.getByRole("button", { name: "Move later" }).first().boundingBox();
  assert.ok(move && move.width >= 40 && move.height >= 40, "arrow buttons are finger-sized");
  await phone.page.getByRole("button", { name: "Move later" }).first().tap();
  await phone.page.getByRole("button", { name: "Merge 2 PDFs" }).tap();
  await phone.page.getByRole("heading", { name: "Boom. Merged." }).waitFor();
  await phone.shot("x07-phone-merge-result");

  step("phone: organize — tap a page, delete from the action bar, save");
  await phone.page.goto(`${phone.base}/organize-pdf/`);
  await openFile(phone.page, "multipage.pdf");
  await phone.page.getByRole("button", { name: "Select page 2" }).first().waitFor({ timeout: 20000 });
  await phone.page.getByRole("list", { name: "Pages" }).getByRole("listitem").nth(1).tap();
  await phone.page.getByText("1 selected", { exact: true }).waitFor();
  await phone.page.getByRole("button", { name: "Delete", exact: true }).tap();
  await phone.page.getByRole("button", { name: "Save 4 pages" }).waitFor();
  await phone.shot("x08-phone-organize");
  const out = await downloadFrom(
    phone.page,
    async () => {
      await phone.page.getByRole("button", { name: "Save 4 pages" }).tap();
      await phone.page.getByRole("heading", { name: "Sorted." }).waitFor();
      await phone.page.getByRole("button", { name: /^Download$/ }).tap();
    },
    "phone-organized.pdf",
  );
  assert.equal((await pdfTexts(out.bytes)).length, 4);

  assert.deepEqual(phone.errors, [], "no console errors");
  console.log("\nTools phone E2E passed.");
} catch (error) {
  await phone.shot("x-phone-failure").catch(() => {});
  console.error("\nTools phone E2E FAILED:", error.message);
  process.exitCode = 1;
} finally {
  await phone.close();
}
