// Touch phone: the editing gestures that used to go wrong.
import assert from "node:assert/strict";
import { launch, openFile, pointOn, step, swipe, textBox } from "./helpers.mjs";

const app = await launch({ phone: true });
const { page, base, shot } = app;
const cdp = await app.context.newCDPSession(page);
const zoomLabel = () => page.getByText(/^\d+%$/).first().innerText();
const toolbar = page.getByRole("toolbar", { name: "Text actions" });
const editBar = page.getByRole("group", { name: "Edit text" });

try {
  step("the phone is treated as a touch device");
  await page.goto(`${base}/edit-pdf/`);
  assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), true);
  await openFile(page, "employee-info.pdf");
  await textBox(page, "Mohit Sharma");
  await page.getByText("Tap a word to select its line").waitFor();
  await shot("t01-hint");

  step("tap targets are finger-sized");
  const tap = await pointOn(page, "EMP1024", 0.5);
  await page.touchscreen.tap(tap.x, tap.y);
  await toolbar.waitFor();
  for (const name of ["Move line (drag)", "Edit the whole line", "Text colour", "Remove line", "More options"]) {
    const target = name === "Text colour" ? page.getByLabel(name) : page.getByRole("button", { name });
    const box = await target.boundingBox();
    assert.ok(box && box.width >= 40 && box.height >= 40, `${name} is ${box?.width}×${box?.height}`);
  }
  await shot("t02-selected");

  step("a tap just beside small text still lands on it");
  await page.touchscreen.tap(5, 300); // empty paper: deselects
  await toolbar.waitFor({ state: "detached" });
  const eid = await pointOn(page, "Employee ID:", 0.5);
  await page.touchscreen.tap(eid.x, eid.box.y - 9); // 9px above the line
  await toolbar.waitFor();
  assert.ok((await page.getByLabel("Properties", { exact: true }).count()) === 0, "properties stay closed until asked for");

  step("tapping a word marks it, and a second tap edits just that word");
  await page.touchscreen.tap(5, 300);
  const sharma = await pointOn(page, "Mohit Sharma", 0.85);
  await page.touchscreen.tap(sharma.x, sharma.y);
  await toolbar.waitFor();
  await page.getByTestId("word-marker").waitFor();
  await shot("t03-word-marked");
  await page.touchscreen.tap(sharma.x, sharma.y);
  await editBar.waitFor();
  const input = editBar.getByLabel("Edit word");
  assert.equal(await input.inputValue(), "Sharma", "the bar holds only the tapped word");
  assert.equal(await input.evaluate((el) => el.selectionEnd - el.selectionStart), 6, "…and it is selected for typing");
  assert.equal(await input.evaluate((el) => getComputedStyle(el).fontSize), "16px", "16px, so iOS doesn't zoom the page");
  await page.keyboard.type("Verma");
  assert.equal(await input.inputValue(), "Verma");
  await shot("t04-edit-bar");
  await page.getByRole("button", { name: "Done editing" }).tap();
  await editBar.waitFor({ state: "detached" });
  await textBox(page, "Mohit Verma");

  step("cancel puts the old text back");
  await page.touchscreen.tap(5, 300);
  const again = await pointOn(page, "Mohit Verma", 0.2);
  await page.touchscreen.tap(again.x, again.y);
  await page.touchscreen.tap(again.x, again.y);
  await editBar.waitFor();
  await page.keyboard.type("X");
  await page.getByRole("button", { name: "Cancel editing" }).tap();
  await textBox(page, "Mohit Verma");

  step("pinch zooms the page");
  await page.touchscreen.tap(5, 300);
  const before = Number.parseInt(await zoomLabel(), 10);
  const y = 420;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 170, y, id: 1 }, { x: 220, y, id: 2 }] });
  for (let i = 1; i <= 6; i++) {
    const spread = i * 22;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 170 - spread, y, id: 1 }, { x: 220 + spread, y, id: 2 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForFunction((was) => Number.parseInt(document.body.innerText.match(/(\d+)%/)?.[1] ?? "0", 10) > was + 20, before, { timeout: 5000 });
  console.log(`  zoom ${before}% → ${await zoomLabel()}`);
  await shot("t05-pinched");

  step("the ⋯ menu holds the extras; properties open as a bottom sheet");
  await page.getByRole("button", { name: "More", exact: true }).tap();
  await page.getByRole("menuitem", { name: /Properties/ }).tap();
  const sheet = page.getByLabel("Properties", { exact: true });
  await sheet.waitFor();
  const sheetBox = await sheet.boundingBox();
  assert.ok(sheetBox && sheetBox.y > 200 && sheetBox.width <= 390, "bottom sheet, not a side panel");
  await shot("t06-sheet");

  step("scrolling by dragging over text never selects it");
  await page.goto(`${base}/edit-pdf/`);
  await openFile(page, "multipage.pdf");
  const heading = await pointOn(page, "Page 1 heading", 0.5);
  await swipe(cdp, heading.x, heading.y + 40, -320); // finger starts on the page, drags up
  await page.waitForFunction(() => document.querySelector('[data-testid="viewer"]').scrollTop > 100, null, { timeout: 5000 });
  assert.equal(await toolbar.count(), 0, "…and nothing got selected");

  step("no horizontal overflow on any screen");
  for (const path of ["/", "/edit-pdf/", "/merge-pdf/", "/organize-pdf/", "/images-to-pdf/", "/split-pdf/"]) {
    await page.goto(`${base}${path}`);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${path} overflows by ${overflow}px`);
  }

  assert.deepEqual(app.errors, [], "no console errors");
  console.log("\nTouch E2E passed.");
} catch (error) {
  await shot("t-failure").catch(() => {});
  console.error("\nTouch E2E FAILED:", error.message);
  if (app.errors.length) console.error("Console errors:", app.errors);
  process.exitCode = 1;
} finally {
  await app.close();
}
