import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "output/ma-fx";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, desktop] of [["phone", false], ["desktop", true]] as const) {
    const page = await browser.newPage({ viewport: desktop ? { width: 1366, height: 768 } : { width: 390, height: 844 }, deviceScaleFactor: 1 });
    for (const kind of ["portal", "reveal", "monster", "gold"]) {
      await page.goto(`http://127.0.0.1:5173/test/ma-fx.html?kind=${kind}${desktop ? "&desktop" : ""}`);
      await page.getByTestId("ma-race-fx-layer").waitFor();
      const layer = page.getByTestId("ma-race-fx-layer");
      const count = await layer.locator(".ma-race-fx").count();
      if (count > 4 || count === 0) throw new Error(`${kind}: expected 1–4 effects, got ${count}`);
      if (await layer.evaluate(el => getComputedStyle(el).pointerEvents) !== "none")
        throw new Error(`${kind}: effects must not block board controls`);
      await page.waitForTimeout(650);
      await page.screenshot({ path: `${out}/${name}-${kind}.png`, fullPage: false });
    }
    await page.close();
  }
  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await reduced.goto("http://127.0.0.1:5173/test/ma-fx.html?kind=portal");
  await reduced.getByTestId("ma-race-fx-layer").waitFor({ state: "attached" });
  const display = await reduced.getByTestId("ma-race-fx-layer").evaluate(el => getComputedStyle(el).display);
  if (display !== "none") throw new Error(`Reduced motion must hide effects; got ${display}`);
  console.log("MA_FX_CAPTURE_PASS 8 screenshots; reduced-motion layer hidden");
} finally {
  await browser.close();
}
