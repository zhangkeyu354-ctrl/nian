import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { assertUiShot } from "./screenshot-check.ts";

const out = "output/ma-masterminds-ui";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results: object[] = [];
try {
  for (const [width, height, count] of [[390, 844, 2], [390, 844, 7], [390, 664, 7], [1366, 768, 2], [1366, 768, 7]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${process.env.DBD_TEST_BASE_URL ?? "http://127.0.0.1:5198"}/test/ma-masterminds.html?count=${count}`);
    const group = page.locator(".ma-step.p2 .ma-step-team");
    await group.waitFor();
    assert.equal(await group.locator(".ma-step-who").count(), count);
    assert.match(await page.locator(".ma-step.p2 .ma-step-block").innerText(), /每人 \+1 分/);
    await page.waitForFunction(() => Array.from(document.images).every(img => img.complete && img.naturalWidth > 0));
    const box = (await page.locator(".ma-ov-podium").boundingBox())!;
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, "podium stays in viewport");
    await assertUiShot(page, `${out}/${width}x${height}-${count}-winners.png`);
    if (count === 7) {
      assert(await group.evaluate(el => el.scrollHeight > el.clientHeight), "large shared podium scrolls");
      await group.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await assertUiShot(page, `${out}/${width}x${height}-${count}-bottom.png`);
    }
    assert.deepEqual(errors, []);
    results.push({ width, height, winners: count, errors });
    await page.close();
  }
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log("MULTIPLE_MASTERMINDS_UI_PASS", results.length);
} finally {
  await browser.close();
}
