import { clickUI } from "./hotseat-driver.ts";
import { chromium, type Page } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  createGame,
  reduce,
  getControls,
} from "../packages/game-engine/src/index.ts";
import type { Command, CreateOptions } from "../packages/shared/src/types.ts";
const out = "output/playwright/phase2";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
const games: unknown[] = [];
let curtains = 0,
  diceShown = 0,
  mapClicks = 0;
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
async function capture(p: Page, name: string) {
  await p.screenshot({
    path: `${out}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
async function clearOverlays(p: Page) {
  while (await p.getByTestId("ack-feedback").count())
    await p.getByTestId("ack-feedback").click();
  while (await p.getByTestId("ack-dice").count()) {
    diceShown++;
    if (diceShown === 6) await capture(p, "骰子结果");
    await p.getByTestId("ack-dice").click();
  }
  while (await p.getByTestId("ack-feedback").count())
    await p.getByTestId("ack-feedback").click();
  if (await p.getByTestId("uncover").count()) {
    curtains++;
    assert.equal(
      await p.getByTestId("movement-hand").count(),
      0,
      "no secret hand DOM under curtain",
    );
    assert.equal(
      await p.getByTestId("board").count(),
      0,
      "board unmounted under curtain",
    );
    const text = JSON.parse(
      await p.evaluate(() => window.render_game_to_text()),
    );
    assert.equal(text.covered, true);
    assert.equal(text.selectedCards, undefined);
    if (curtains === 2) await capture(p, "交接遮挡");
    await p.getByTestId("uncover").click();
  }
}
for (const seed of [1701, 2903, 4111]) {
  const data = JSON.parse(
    readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8"),
  ) as { options: CreateOptions; commands: Command[] };
  await page.goto("http://127.0.0.1:5173");
  await page.getByTestId("map-select").selectOption(data.options.mapId);
  await page.getByTestId("seed-input").fill(String(seed));
  for (let i = 0; i < 4; i++)
    await page
      .getByTestId("survivor-" + i)
      .selectOption(data.options.survivors[i]);
  await page.getByTestId("killer-select").selectOption(data.options.killer);
  await page.getByTestId("start").click();
  let state = createGame(data.options);
  let used = 0;
  for (let i = 0; i < data.commands.length; i++) {
    const c = data.commands[i];
    try {
      await clearOverlays(page);
      if (i === 0)
        assert.equal(
          await page.locator("[data-room] rect").evaluateAll((els) =>
            els.every((el) => {
              const a = el.getBoundingClientRect(),
                b = el.closest("svg")!.getBoundingClientRect();
              return (
                a.top >= b.top - 1 &&
                a.left >= b.left - 1 &&
                a.right <= b.right + 1 &&
                a.bottom <= b.bottom + 1
              );
            }),
          ),
          true,
          "all map rooms fit initial viewport",
        );
      await clickUI(page, c);
      if (c.type === "USE_PERK") used++;
      if (
        c.type === "SETUP_REVEAL" ||
        c.type === "INTERACT" ||
        (c.type === "SELECT" && c.propId)
      )
        mapClicks++;
      assert.equal(
        await page.getByRole("alert").count(),
        0,
        "valid command must not produce error",
      );
      state = reduce(state, c);
      await clearOverlays(page);
      const text = JSON.parse(
        await page.evaluate(() => window.render_game_to_text()),
      );
      assert.equal(
        text.events,
        state.events.length,
        "UI events match independent reducer after each click",
      );
      if (state.winner)
        assert.equal(
          text.winner,
          state.winner === "survivor" ? "逃生者" : "杀手",
        );
      if (i === 25 || i === 75) {
        await page.getByTestId("board").scrollIntoViewIfNeeded();
        await capture(page, `${seed}_棋盘_${i}`);
      }
    } catch (e) {
      await capture(page, `${seed}_失败_${i}`);
      throw new Error(
        `seed=${seed} step=${i} ${JSON.stringify(c)}: ${String(e)}`,
      );
    }
  }
  assert(state.winner);
  assert.equal(await page.getByTestId("new-game").count(), 1);
  await page.getByTestId("board").scrollIntoViewIfNeeded();
  await capture(page, `${seed}_完整对局结束`);
  const logs = await page.getByTestId("event-log").innerText();
  assert(!logs.includes("undefined"));
  assert(!/CHECK_REQUIRED|DICE_ROLLED|TURN_START/.test(logs));
  games.push({
    seed,
    mapId: data.options.mapId,
    winner: state.winner,
    round: state.round,
    commands: data.commands.length,
    events: state.events.length,
    usedAbilities: used,
    method:
      "Only rendered controls clicked; state independently reduced outside browser and event count checked after every command.",
  });
  console.log("FULL_GAME_PASS", seed, state.winner, data.commands.length);
}
assert.equal(errors.length, 0, errors.join("\n"));
writeFileSync(
  `${out}/完整对局验收.json`,
  JSON.stringify(
    { games, curtains, diceShown, mapClicks, consoleErrors: errors },
    null,
    2,
  ),
);
await browser.close();
