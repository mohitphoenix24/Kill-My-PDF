// Desktop: the text editor, end to end, against the production build (what Netlify serves).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { downloadFrom, launch, openFile, pdfTexts, pointOn, step, textBox } from "./helpers.mjs";

const app = await launch();
const { page, base, shot } = app;
const idle = () => page.waitForFunction(() => !document.body.innerText.includes("Updating preview"), null, { timeout: 15000 });
const panel = page.getByLabel("Properties", { exact: true });

try {
  step("home page → Edit PDF text");
  await page.goto(`${base}/`);
  await page.getByRole("heading", { name: /Kill the PDF hassle/ }).waitFor();
  await page.getByRole("link", { name: /Edit PDF text/ }).first().click();
  await page.waitForURL(/\/edit-pdf\/$/);
  await page.getByRole("button", { name: "Drop your PDF here" }).waitFor();
  await shot("e01-edit-landing");

  step("open a PDF; hover highlights the line");
  await openFile(page, "employee-info.pdf");
  await textBox(page, "Mohit Sharma");
  await shot("e02-loaded");
  const mid = await pointOn(page, "Mohit Sharma", 0.5);
  await page.mouse.move(mid.x, mid.y);
  await page.waitForFunction(() => {
    const p = [...document.querySelectorAll("polygon")].find((x) => x.textContent?.startsWith("Mohit Sharma"));
    return p?.getAttribute("fill") === "rgba(198, 241, 53, 0.32)";
  });

  step("click selects: floating toolbar and inspector");
  await page.mouse.click(mid.x, mid.y);
  await page.getByRole("toolbar", { name: "Text actions" }).waitFor();
  await page.getByLabel("Text content").waitFor();
  for (const expected of ["Helvetica", "Regular", "#000000", "Standard font"]) {
    assert.ok((await panel.innerText()).includes(expected), `inspector shows ${expected}`);
  }
  await shot("e03-selected");

  step("double-click a WORD: only that word is selected for typing");
  const left = await pointOn(page, "Mohit Sharma", 0.12); // over "Mohit"
  await page.mouse.dblclick(left.x, left.y);
  const inline = page.getByLabel("Edit text inline");
  await inline.waitFor();
  const [selStart, selEnd] = await inline.evaluate((el) => [el.selectionStart, el.selectionEnd]);
  assert.equal("Mohit Sharma".slice(selStart, selEnd), "Mohit", "the tapped word is selected, not the whole line");
  await page.keyboard.type("Rohit");
  assert.equal(await inline.inputValue(), "Rohit Sharma");
  await shot("e04-inline-editing");
  await inline.press("Enter");
  await idle();
  await page.waitForTimeout(500);
  assert.ok((await panel.innerText()).includes("Original font preserved"), "export status shown");

  step("double-click the other word");
  const right = await pointOn(page, "Rohit Sharma", 0.85); // over "Sharma"
  await page.mouse.dblclick(right.x, right.y);
  const [s2, e2] = await inline.evaluate((el) => [el.selectionStart, el.selectionEnd]);
  assert.equal("Rohit Sharma".slice(s2, e2), "Sharma");
  await inline.press("Escape"); // cancel: nothing changes
  assert.ok(await textBox(page, "Rohit Sharma"));

  step("undo / redo with the keyboard");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await textBox(page, "Mohit Sharma");
  await page.keyboard.press("Control+Shift+z");
  await textBox(page, "Rohit Sharma");
  await idle();

  step("edit the salary (needs a substitute font)");
  const salary = await pointOn(page, "₹15,00,000", 0.5);
  await page.mouse.dblclick(salary.x, salary.y);
  await inline.fill("₹18,00,000");
  await inline.press("Enter");
  await idle();
  await page.waitForTimeout(500);
  assert.ok((await panel.innerText()).includes("Using a similar font"), "substitution is reported");

  step("floating toolbar changes the size");
  await page.keyboard.press("Escape");
  const loc = await pointOn(page, "Hyderabad", 0.5);
  await page.mouse.click(loc.x, loc.y);
  await page.getByRole("button", { name: "Larger" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Text actions"]') !== null);
  await page.keyboard.press("Control+z");

  step("download and verify the PDF");
  const out = await downloadFrom(page, () => page.getByRole("button", { name: "Download" }).click(), "employee-info-edited.pdf");
  await page.getByText("Downloaded employee-info-edited.pdf").waitFor({ timeout: 15000 });
  await shot("e05-saved");
  const text = (await pdfTexts(out.bytes)).join(" ");
  assert.ok(text.includes("Rohit Sharma"), "new name extracted");
  assert.ok(text.includes("₹18,00,000"), "new salary extracted");
  assert.ok(!text.includes("Mohit"), "old name is gone");
  for (const kept of ["Employee ID:", "EMP1024", "Engineering", "Hyderabad"]) assert.ok(text.includes(kept), `${kept} unchanged`);
  try {
    const poppler = execFileSync("pdftotext", ["-layout", out.path, "-"], { encoding: "utf8" });
    assert.match(poppler, /Employee Name:\s+Rohit Sharma/);
    assert.match(poppler, /Salary:\s+₹18,00,000/);
    console.log("  poppler (independent reader) agrees");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  step("select-text mode exposes a native text layer");
  await page.getByRole("radio", { name: "Select text" }).click();
  await page.locator(".textLayer span").first().waitFor();
  assert.ok((await page.locator(".textLayer").first().innerText()).includes("Rohit Sharma"));
  await page.getByRole("radio", { name: "Edit" }).click();

  step("zoom keeps the overlay aligned");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(800);
  await shot("e06-zoomed");
  await page.getByRole("button", { name: "Fit width" }).click();

  step("logo asks before discarding edits, then goes home");
  const emp = await pointOn(page, "EMP1024", 0.5);
  await page.mouse.click(emp.x, emp.y);
  await page.keyboard.press("ArrowRight"); // a fresh, un-downloaded edit
  await page.getByRole("button", { name: /back to home/ }).click();
  await page.getByText("Discard your changes?").waitFor();
  await shot("e07-discard-dialog");
  await page.getByRole("button", { name: "Keep editing" }).click();
  await page.getByRole("button", { name: /back to home/ }).click();
  await page.getByRole("button", { name: "Discard & leave" }).click();
  await page.getByRole("heading", { name: /Kill the PDF hassle/ }).waitFor();
  assert.match(page.url(), /\/$/);

  step("error states on the start page");
  await page.goto(`${base}/edit-pdf/`);
  await openFile(page, "not-a-pdf.pdf");
  await page.getByText("This file is not a PDF.").waitFor();
  await openFile(page, "password.pdf");
  await page.getByText(/password-protected/).waitFor();
  await shot("e08-error");
  await openFile(page, "corrupted.pdf");
  await page.getByText(/damaged or invalid/).waitFor();
  await openFile(page, "scanned.pdf");
  await page.getByText("This PDF does not contain editable native text. Scanned PDFs are not currently supported.").waitFor();
  await shot("e09-scanned");

  step("wrong file type on the drop zone");
  await page.goto(`${base}/edit-pdf/`);
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.getByText(/isn't a PDF/).waitFor();

  step("rotated text, rotated pages and multi-page navigation");
  await page.goto(`${base}/edit-pdf/`);
  await openFile(page, "text-features.pdf");
  await textBox(page, "Rotated thirty");
  await shot("e10-text-features");
  await page.goto(`${base}/edit-pdf/`);
  await openFile(page, "rotated-pages.pdf");
  await textBox(page, "Rotated page 90");
  await page.goto(`${base}/edit-pdf/`);
  await openFile(page, "multipage.pdf");
  await textBox(page, "Page 1 heading");
  await page.getByLabel("Page number").fill("4");
  await page.getByLabel("Page number").press("Enter");
  await textBox(page, "Page 4 heading");
  await page.getByRole("button", { name: "Go to page 2" }).click();
  await page.waitForTimeout(500);
  assert.ok(await (await page.locator("polygon", { has: page.locator('title:text-is("Page 2 heading")') })).isVisible());

  step("keyboard shortcuts dialog");
  await page.keyboard.press("?");
  await page.getByText("Keyboard shortcuts").first().waitFor();
  await shot("e11-shortcuts");
  await page.keyboard.press("Escape");

  assert.deepEqual(app.errors, [], "no console errors");
  console.log("\nEditor E2E passed.");
} catch (error) {
  await shot("e-failure").catch(() => {});
  console.error("\nEditor E2E FAILED:", error.message);
  if (app.errors.length) console.error("Console errors:", app.errors);
  process.exitCode = 1;
} finally {
  await app.close();
}
