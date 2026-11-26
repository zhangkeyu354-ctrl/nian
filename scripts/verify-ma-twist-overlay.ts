import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "output/ma-twist-overlay";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {}) });
try {
  for (const [name, viewport, reducedMotion] of [
    ["phone", { width: 390, height: 844 }, "no-preference"],
    ["desktop", { width: 1366, height: 768 }, "no-preference"],
    ["reduced", { width: 390, height: 844 }, "reduce"],
  ] as const) {
    const page = await browser.newPage({ viewport, reducedMotion });
    await page.goto("http://127.0.0.1:5173/test/ma-twist.html");
    await page.getByTestId("draw-card").click();
    const card = page.getByTestId("ma-twist-reveal");
    await card.waitFor();
    if (!(await card.textContent())?.includes("镜像世界生效")) throw new Error(`${name}: card text missing`);
    await page.waitForTimeout(650);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    // 不会自己消失：等 4 秒还在，点「知道了」才关
    await page.waitForTimeout(4000);
    if (!(await card.isVisible())) throw new Error(`${name}: card vanished without a tap`);
    await page.getByTestId("ma-twist-ok").click();
    await card.waitFor({ state: "hidden" });
    await page.close();
  }
  console.log("MA_TWIST_OVERLAY_PASS phone, desktop, reduced motion (stays until tapped)");
} finally {
  await browser.close();
}
