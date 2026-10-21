import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { strict as assert } from "node:assert";
import { tapPhoneCommand } from "./mobile-ui-driver.ts";
import { assertUiShot } from "./screenshot-check.ts";
const samples = JSON.parse(
  readFileSync("apps/web/test/scenarios.generated.json", "utf8"),
);
const browser = await chromium.launch();
const base = process.env.DBD_TEST_BASE_URL ?? "http://127.0.0.1:5173";
const results: any[] = [];
mkdirSync("output/mobile-implementation/interfaces", { recursive: true });
try {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  await ctx.addInitScript(() =>
    localStorage.setItem(
      "dbd-visual-settings",
      JSON.stringify({
        animations: false,
        art: true,
        sound: false,
        vibration: false,
      }),
    ),
  );
  const p = await ctx.newPage();
  p.setDefaultTimeout(5000);
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  for (const sample of samples) {
    await p.goto(base + "/test/interface.html?case=" + sample.id);
    await p.getByTestId("mobile-dock").waitFor();
    const taps: string[] = [];
    if (
      sample.id.startsWith("out_of_turn_") ||
      sample.id === "shared_seat_inventory"
    )
      assert.equal(
        JSON.parse(await p.evaluate(() => window.render_game_to_text())).online
          .waiting,
        true,
        "item can be used while waiting",
      );
    try {
      await tapPhoneCommand(p, sample.command, (label) => taps.push(label));
      await p.waitForFunction(
        () => ((window as any).__sent ?? []).length === 1,
        undefined,
        { timeout: 4000 },
      );
      const sent = await p.evaluate(() => (window as any).__sent[0]);
      for (const [key, value] of Object.entries(sample.command))
        assert.deepEqual(sent[key], value, sample.id + " command " + key);
      const view = JSON.parse(
        await p.evaluate(() => window.render_game_to_text()),
      );
      assert.equal(
        view.events,
        sample.afterEvents,
        sample.id + " resulting event count",
      );
      assert.equal(await p.locator("[role=alert]:visible").count(), 0);
      if (sample.id.startsWith("item_"))
        await p.getByTestId("item-used-feedback").waitFor();
      results.push({
        id: sample.id,
        passed: true,
        taps: taps.length,
        command: sent,
        events: view.events,
      });
      if (
        [
          "board_meg_1",
          "board_feng_min_1",
          "item_map",
          "item_flashlight",
          "choice_CARRY_REROUTE",
          "choice_PHANTASM_TARGET",
          "choice_REPLAN",
        ].includes(sample.id)
      )
        await assertUiShot(
          p,
          `output/mobile-implementation/interfaces/${sample.id}.png`,
        );
      console.log("UI_WIRING_PASS", sample.id, taps.length);
    } catch (e) {
      console.error("UI_WIRING_FAIL", sample.id, JSON.stringify(await p.evaluate(() => ({sent:(window as any).__sent, state:window.render_game_to_text()}))));
      await p.screenshot({
        path:
          "output/mobile-implementation/interfaces/FAILED_" +
          sample.id +
          ".png",
      });
      throw e;
    }
    writeFileSync(
      "output/mobile-implementation/interfaces/results.json",
      JSON.stringify(results, null, 2),
    );
  }
  assert.deepEqual(errors, []);
  await ctx.close();
} finally {
  await browser.close();
}
console.log("MOBILE_INTERFACES_PASS", results.length);
