import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "output/ma-curse-wand-broadcast";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {}) });
try {
  for (const [name, viewport, reducedMotion] of [
    ["phone", { width: 390, height: 844 }, "no-preference"],
    ["desktop", { width: 1366, height: 768 }, "no-preference"],
    ["reduced", { width: 390, height: 844 }, "reduce"],
  ] as const) {
    const page = await browser.newPage({ viewport, reducedMotion });
    await page.goto("http://127.0.0.1:5173/test/ma-twist.html?card=8");
    await page.getByTestId("draw-card").click();
    await page.getByTestId("ma-twist-ok").click();
    const broadcast = page.getByTestId("ma-curse-wand-overlay");
    await broadcast.getByText("跳过 2 个行动顺位", { exact: false }).waitFor();
    if (!(await broadcast.textContent())?.includes("接下来")) throw new Error(`${name}: next turn missing`);
    const box = await broadcast.boundingBox();
    await page.screenshot({ path: `${out}/${name}.png` });
    if (!box || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height)
      throw new Error(`${name}: broadcast clipped on screen ${JSON.stringify(box)}`);
    await page.close();
  }
  console.log("MA_CURSE_WAND_BROADCAST_PASS phone desktop reduced; roll, skipped slots, next turn visible");
} finally {
  await browser.close();
}
