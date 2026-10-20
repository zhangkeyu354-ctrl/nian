import { chromium, devices } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { startUI } from "./hotseat-driver.ts";
import { assertUiShot } from "./screenshot-check.ts";
const browser = await chromium.launch();
const result: unknown[] = [];
mkdirSync("output/mobile-implementation", { recursive: true });
try {
  for (const device of ["iPhone 13", "Pixel 7"]) {
    const ctx = await browser.newContext({ ...devices[device] });
    const p = await ctx.newPage();
    await startUI(p, {
      seed: 1701,
      mapId: "macmillan_estate",
      survivors: ["dwight", "claudette", "jake", "ace"],
      killer: "trapper",
    });
    await p.getByTestId("uncover").tap();
    await p.getByTestId("mobile-dock").waitFor({ timeout: 3000 });
    assert.equal(
      await p.locator("select:visible").count(),
      0,
      "no dropdowns in phone match",
    );
    const layout = await p.evaluate(() => ({
      scroll: document.documentElement.scrollHeight > innerHeight + 1,
      small: [...document.querySelectorAll("button:not(:disabled)")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== "hidden" &&
            (r.width < 48 || r.height < 48)
          );
        })
        .map((e) => e.textContent),
    }));
    assert.equal(layout.scroll, false, "no page scrolling");
    assert.deepEqual(layout.small, [], "48px buttons");
    result.push({
      device,
      layout,
      screenshot: await assertUiShot(
        p,
        `output/mobile-implementation/${device}_setup.png`,
      ),
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(
  "output/mobile-implementation/surface.json",
  JSON.stringify(result, null, 2),
);
console.log("MOBILE_SURFACE_PASS");
