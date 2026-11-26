import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "output/ma-twist-overlay";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport, reducedMotion] of [
    ["phone", { width: 390, height: 844 }, "no-preference"],
    ["desktop", { width: 1366, height: 768 }, "no-preference"],
    ["reduced", { width: 390, height: 844 }, "reduce"],
  ] as const) {
    const page = await browser.newPage({ viewport, reducedMotion });
    await page.goto("http://127.0.0.1:5173/test/ma-twist.html");
    await page.getByTestId("draw-card").click();
    const card = page.getByTestId("ma-twist-card-overlay");
    await card.waitFor();
    if (!(await card.textContent())?.includes("镜像世界生效")) throw new Error(`${name}: card text missing`);
    await page.waitForTimeout(650);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    await page.close();
  }
  console.log("MA_TWIST_OVERLAY_PASS phone, desktop, reduced motion");
} finally {
  await browser.close();
}
