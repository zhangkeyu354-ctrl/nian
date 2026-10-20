import { clickUI } from "./hotseat-driver.ts";
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import {
  createGame,
  reduce,
  getControls,
  canCommand,
  legalRoutes,
  itemActions,
} from "../packages/game-engine/src/index.ts";
import { nextCommand, route } from "./simulation.ts";
import type { Command, Card } from "../packages/shared/src/types.ts";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const o = {
  seed: 1701,
  mapId: "macmillan_estate",
  survivors: ["dwight", "claudette", "jake", "ace"],
  killer: "trapper",
};
let state = createGame(o),
  itemChecked = false,
  powerChecked = false;
const commands: Command[] = [];
await page.goto("http://127.0.0.1:5173");
await page.getByTestId("start").click();
async function uncover() {
  while (await page.getByTestId("ack-dice").count())
    await page.getByTestId("ack-dice").click();
  while (await page.getByTestId("ack-feedback").count())
    await page.getByTestId("ack-feedback").click();
  if (await page.getByTestId("uncover").count())
    await page.getByTestId("uncover").click();
}
for (let i = 0; i < 350 && !(itemChecked && powerChecked); i++) {
  await uncover();
  const actor = getControls(state).actorId!;
  const held = state.actors[actor].item;
  if (held && !itemChecked) {
    const events = state.events.length;
    const expected = itemActions(state, actor).map((a) => a.command);
    const actual = await page
      .locator(".item-row [data-command]")
      .evaluateAll((els) =>
        els.map((el) => JSON.parse(el.getAttribute("data-command")!)),
      );
    assert.deepEqual(
      actual,
      expected,
      "desktop item buttons use complete engine commands",
    );
    assert.equal(
      JSON.parse(await page.evaluate(() => window.render_game_to_text()))
        .events,
      events,
    );
    await page.screenshot({
      path: "output/playwright/phase2/物品_合法入口.png",
      fullPage: true,
    });
    itemChecked = true;
  }
  let c = nextCommand(state, "survivor");
  if (state.phase === "SETUP") {
    const chest = state.props.find((p) => p.kind === "chest" && !p.revealed);
    if (chest) c = { type: "SETUP_REVEAL", actorId: actor, propId: chest.id };
  } else if (
    state.phase === "PLANNING" &&
    !state.window &&
    !state.choice &&
    state.actors[actor].side === "survivor" &&
    !itemChecked
  ) {
    const a = state.actors[actor];
    const goals = new Set(
      state.props
        .filter(
          (p) =>
            p.revealed && p.kind === "chest" && !p.removed && p.room !== a.room,
        )
        .map((p) => p.room),
    );
    const steps = route(state, a.room!, goals, "survivor");
    const wanted = steps?.[0] ? state.paths[steps[0].pathId].color : null;
    if (wanted && state.hands[a.ownerId].includes(wanted))
      c = { type: "PLAN", actorId: actor, cards: [wanted] };
  } else if (
    state.turn?.stage === "MOVE" &&
    !state.window &&
    !state.choice &&
    state.actors[actor].side === "survivor" &&
    !itemChecked
  ) {
    const goals = new Set(
      state.props
        .filter((p) => p.revealed && p.kind === "chest" && !p.removed)
        .map((p) => p.room),
    );
    const choices = legalRoutes(
      state,
      state.actors[actor].room!,
      "survivor",
      state.turn.card!,
    );
    const best = choices.sort(
      (a, b) =>
        (route(state, a.to, goals, "survivor")?.length ?? 99) -
        (route(state, b.to, goals, "survivor")?.length ?? 99),
    )[0];
    if (best) c = { type: "MOVE", actorId: actor, ...best };
  } else if (
    state.turn?.stage === "INTERACT" &&
    !state.window &&
    !state.choice
  ) {
    const chest = getControls(state).actions.find(
      (a) => a.command.action === "chest",
    );
    if (chest && !itemChecked) c = chest.command;
    if (actor === "trapper" && !powerChecked) {
      for (const pathId of Object.keys(state.paths)) {
        const attempt = {
          type: "INTERACT",
          actorId: actor,
          action: "power",
          pathId,
        };
        if (canCommand(state, attempt)) {
          c = attempt;
          break;
        }
      }
    }
  }
  await clickUI(page, c);
  if (c.action === "power") powerChecked = true;
  assert.equal(await page.getByRole("alert").count(), 0, JSON.stringify(c));
  state = reduce(state, c);
  commands.push(c);
  await uncover();
  assert.equal(
    JSON.parse(await page.evaluate(() => window.render_game_to_text())).events,
    state.events.length,
  );
}
assert(itemChecked && powerChecked);
assert.equal(
  Object.values(state.paths).some((p) => p.bearTrap),
  true,
);
assert.deepEqual(errors, []);
await page.getByTestId("board").scrollIntoViewIfNeeded();
await page.screenshot({
  path: "output/playwright/phase2/杀手力量_捕兽夹.png",
  fullPage: true,
});
writeFileSync(
  "output/playwright/phase2/物品与力量验收.json",
  JSON.stringify(
    {
      options: o,
      commands,
      itemDrawAndLegalControls: itemChecked,
      powerFormExecuted: powerChecked,
      consoleErrors: errors,
      note: "Focused legal-command scenario; not counted among full-game acceptance runs. Setup deliberately selects chest IDs to exercise item UI.",
    },
    null,
    2,
  ),
);
await browser.close();
console.log(
  "ACTIONS_PASS item-controls,power,all-command-events-match",
  commands.length,
);
