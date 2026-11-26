import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "output/ma-monster-reveal";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {}) });
try {
  for (const [name, viewport, reducedMotion] of [
    ["phone", { width: 390, height: 844 }, "no-preference"],
    ["desktop", { width: 1366, height: 768 }, "no-preference"],
    ["reduced", { width: 390, height: 844 }, "reduce"],
  ] as const) {
    const page = await browser.newPage({ viewport, reducedMotion });
    await page.goto("http://127.0.0.1:5173/test/ma-twist.html?card=9");
    const monster = page.getByRole("img", { name: /^巨口怪物，第/ });
    if (await monster.count()) throw new Error(`${name}: monster visible before draw`);
    await page.getByTestId("draw-card").click();
    await page.getByTestId("ma-twist-reveal").waitFor();
    if (await monster.count()) throw new Error(`${name}: monster spoiled before card acknowledgement`);
    await page.screenshot({ path: `${out}/${name}-card.png`, fullPage: false });
    await page.getByTestId("ma-twist-ok").click();
    if (reducedMotion === "no-preference") {
      await page.getByRole("img", { name: "巨口怪物，第 0 格" }).waitFor();
      await page.screenshot({ path: `${out}/${name}-spawn.png`, fullPage: false });
    }
    const die = page.getByTestId("ma-monster-roll");
    await die.waitFor();
    await die.getByText("掷出 4", { exact: false }).waitFor();
    if (reducedMotion === "no-preference" && !(await monster.getAttribute("aria-label"))?.includes("第 0 格"))
      throw new Error(`${name}: monster moved before die result`);
    await page.screenshot({ path: `${out}/${name}-roll.png`, fullPage: false });
    await page.getByRole("img", { name: "巨口怪物，第 4 格" }).waitFor();
    await page.screenshot({ path: `${out}/${name}-moved.png`, fullPage: false });
    await page.close();
  }
  console.log("MA_MONSTER_REVEAL_PASS card hidden until tapped; starts at 0; rolls 4 before moving; phone, desktop, reduced");
} finally {
  await browser.close();
}
