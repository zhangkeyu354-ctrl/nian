import { chromium, devices } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertUiShot } from "./screenshot-check.ts";

const browser = await chromium.launch();
const out = "docs/phase2e/evidence";
mkdirSync(out, { recursive: true });
const results: unknown[] = [];
try {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  await ctx.addInitScript(() =>
    localStorage.setItem(
      "dbd-visual-settings",
      JSON.stringify({
        art: true,
        animations: false,
        sound: false,
        vibration: false,
      }),
    ),
  );
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  for (const id of [
    "flashlight",
    "first_aid_kit",
    "broken_key",
    "dull_key",
    "skeleton_key",
  ]) {
    await p.goto("http://127.0.0.1:5173/test/interface.html?case=item_" + id);
    await p.getByTestId("my-items").tap();
    const art = p.locator(`.phone-sheet [data-illustration="${id}"]`);
    await art.evaluate(async (el: HTMLImageElement) => el.decode());
    assert.equal(await art.getAttribute("data-art-source"), "AI 生成");
    if (id === "flashlight")
      results.push(await assertUiShot(p, `${out}/iPhone13_物品栏.png`));
    results.push({ id, source: "AI 生成", loaded: true });
  }
  // Exercise the actual Illustration component after a real network failure.
  await p.route("**/assets/items/flashlight.webp", (route) => route.abort());
  await p.goto(
    "http://127.0.0.1:5173/test/interface.html?case=item_flashlight",
  );
  await p.getByTestId("my-items").tap();
  const fallback = p.locator('.phone-sheet [data-illustration="flashlight"]');
  await p.waitForFunction(
    () =>
      document
        .querySelector('.phone-sheet [data-illustration="flashlight"]')
        ?.getAttribute("data-art-source") === "占位",
  );
  await fallback.evaluate(async (el: HTMLImageElement) => el.decode());
  assert((await fallback.getAttribute("src"))?.endsWith(".svg"));
  results.push(await assertUiShot(p, `${out}/手电筒_网络失败SVG回退.png`));
  assert.deepEqual(errors, []);
  results.push({ fallback: true, errors });
  await ctx.close();
} finally {
  await browser.close();
}
writeFileSync(
  "docs/phase2e/evidence/interface-art-checks.json",
  JSON.stringify(results, null, 2),
);
console.log(
  "PHASE2E_EVIDENCE_PASS five item assets loaded; real network failure falls back to SVG",
);
