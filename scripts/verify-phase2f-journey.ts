// Real hotseat clicks, independent engine replay, and checked screenshots.
import { chromium, devices } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  createGame,
  reduce,
  getControls,
} from "../packages/game-engine/src/index.ts";
import { startUI, clickUI, drainUI } from "./hotseat-driver.ts";
import { assertUiShot } from "./screenshot-check.ts";
const mode = process.argv[2] ?? "before";
const out = `docs/phase2f/evidence/${mode}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results: any[] = [];
try {
  for (const [name, device, viewport] of [
    ["iPhone13", "iPhone 13", { width: 390, height: 664 }],
    ["Pixel7", "Pixel 7", { width: 412, height: 839 }],
    ["landscape", "iPhone 13", { width: 844, height: 390 }],
  ] as const) {
    if (process.argv[3] && process.argv[3] !== name) continue;
    const ctx = await browser.newContext({ ...devices[device], viewport });
    await ctx.addInitScript(() =>
      localStorage.setItem(
        "dbd-visual-settings",
        JSON.stringify({
          animations: true,
          art: true,
          sound: false,
          vibration: false,
        }),
      ),
    );
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    const replay = JSON.parse(
      readFileSync("docs/phase1/games/4111.replay.json", "utf8"),
    );
    let s = createGame(replay.options);
    const captured = new Set<string>();
    const shots: any[] = [];
    async function shot(key: string) {
      if (captured.has(key)) return;
      captured.add(key);
      shots.push({
        key,
        ...(await assertUiShot(p, `${out}/${name}_${key}.png`)),
      });
    }
    await startUI(p, replay.options);
    await drainUI(p);
    for (const c of replay.commands) {
      const control = getControls(s);
      if (s.phase === "PLANNING" && !s.window && !s.choice && control.planCount)
        await shot("plan");
      if (s.turn?.stage === "MOVE" && !s.choice && !s.window)
        await shot("move");
      if (s.turn?.stage === "INTERACT" && !s.choice && !s.window)
        await shot("interact");
      if (control.actorId === s.killerId && s.phase === "ACTING")
        await shot("killer");
      const next = reduce(s, c);
      const fresh = next.events.slice(s.events.length);
      if (mode === "before" && name === "landscape" && (c.type === "MOVE" || (c.type === "SELECT" && c.to))) {
        // The archived baseline has overlapping transparent room hit targets.
        // Use its existing dock action (still a real touch), record this workaround.
        const buttons = p.locator(".mobile-dock [data-command]:visible");
        const i = await buttons.evaluateAll((els, c) => els.findIndex((el) => {
          const cmd = JSON.parse(el.getAttribute("data-command")!);
          return Object.entries(c).every(([k, v]) => JSON.stringify(cmd[k]) === JSON.stringify(v));
        }), c);
        assert(i >= 0, "baseline dock move must exist");
        await buttons.nth(i).tap();
      } else if (mode === "before" && name === "landscape" && c.type === "SELECT" && Array.isArray(c.route)) {
        // Accessible keyboard path bypasses the reproduced baseline hit-area bug.
        for (const step of c.route as Array<{to: string}>) {
          await p.locator(`[data-room="${step.to}"]`).focus();
          await p.keyboard.press("Enter");
        }
        const dice = p.locator(`[data-dice-count="${c.dice}"]`);
        if (await dice.getAttribute("aria-pressed") !== "true") await dice.tap();
        await p.getByTestId("confirm-carry").tap();
      } else await clickUI(p, c);
      if (await p.getByTestId("uncover").count()) await shot("waiting");
      await drainUI(p, async () => {
        await p.waitForTimeout(1350);
        await shot("dice");
      });
      for (const [type, key] of [
        ["WOUNDED", "injury"],
        ["HOOKED", "hook"],
        ["CHECK_RESOLVED", "verdict"],
      ] as const)
        if (fresh.some((e) => e.type === type)) await shot(key);
      const v = JSON.parse(
        await p.evaluate(() => window.render_game_to_text()),
      );
      assert.equal(v.events, next.events.length);
      s = next;
    }
    assert(s.winner);
    await shot("results");
    assert.deepEqual(errors, []);
    results.push({
      name,
      viewport,
      commands: replay.commands.length,
      winner: s.winner,
      shots,
      errors,
      baselineLandscapeWorkaround: mode === "before" && name === "landscape",
    });
    writeFileSync(`${out}/${name}_journey.json`, JSON.stringify(results.at(-1), null, 2));
    await ctx.close();
    console.log("PHASE2F_JOURNEY_PASS", mode, name, replay.commands.length);
  }
} finally {
  await browser.close();
}
writeFileSync(`${out}/journey.json`, JSON.stringify(results, null, 2));



