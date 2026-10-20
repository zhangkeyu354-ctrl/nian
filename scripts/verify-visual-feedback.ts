import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  createGame,
  reduce,
  visualCatalog,
} from "../packages/game-engine/src/index.ts";
import { startUI, drainUI, clickUI } from "./hotseat-driver.ts";
const out = "output/playwright/phase2-art";
mkdirSync(out + "/sequence", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  }),
  page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://127.0.0.1:5173/?view=props");
const expected = Object.values(visualCatalog).reduce(
  (n, s) => n + Object.keys(s).length,
  0,
);
assert.equal(await page.locator("[data-gallery-state]").count(), expected);
await page.waitForFunction(
  () =>
    document
      .querySelector(
        '[data-gallery-state="generator:idle"] [data-asset="generator"]',
      )
      ?.getAttribute("data-fallback") === "false",
);
await page.setViewportSize({ width: 1440, height: 4300 });
await page.waitForFunction(() =>
  [...document.querySelectorAll(".state-gallery [data-asset]")].every(
    (el) => el.getAttribute("data-fallback") === "false",
  ),
);
await page.screenshot({
  path: out + "/道具状态一览.png",
  fullPage: true,
  animations: "disabled",
});
await page.setViewportSize({ width: 1440, height: 1100 });
const recorded = new Set<string>();
const records: unknown[] = [];
const kinds: Record<string, string> = {
  flip: "翻牌",
  dice: "掷骰",
  progress: "修机",
  hook: "挂钩",
  attack: "受伤",
};
async function frames(
  kind: string,
  selector: string,
  seed: number,
  step: number,
) {
  if (recorded.has(kind)) return;
  await page.locator(selector).waitFor();
  for (const [i, ratio] of [0.12, 0.55, 0.98].entries()) {
    await page.locator(selector).evaluate((root, ratio) => {
      let animations = root.getAnimations({ subtree: true });
      if (!animations.length) {
        const els = [root, ...root.querySelectorAll("*")].filter(
          (el) => getComputedStyle(el).animationName !== "none",
        ) as HTMLElement[];
        for (const el of els) el.style.animation = "none";
        void (root as HTMLElement).offsetWidth;
        for (const el of els) el.style.animation = "";
        animations = root.getAnimations({ subtree: true });
      }
      for (const a of animations) {
        a.pause();
        const duration = Number(a.effect!.getTiming().duration);
        a.currentTime = duration * ratio;
      }
    }, ratio);
    await page.screenshot({
      path: `${out}/sequence/${kind}_${i + 1}.png`,
      animations: "allow",
    });
  }
  records.push({
    kind,
    label: kinds[kind],
    seed,
    commandIndex: step,
    frames: [1, 2, 3].map((i) => `sequence/${kind}_${i}.png`),
    timing: "Native CSS animations paused at 12%,55%,98%; no game-state edits.",
  });
  recorded.add(kind);
}
for (const seed of [1701, 4111]) {
  const replay = JSON.parse(
    readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8"),
  );
  let s = createGame(replay.options);
  await startUI(page, replay.options);
  await drainUI(page);
  for (let i = 0; i < replay.commands.length; i++) {
    const c = replay.commands[i];
    await clickUI(page, c);
    s = reduce(s, c);
    await drainUI(
      page,
      async () => {
        if (
          (await page.locator(".dice-overlay .eyebrow").innerText()) ===
          "检定结果"
        )
          await frames("dice", ".dice-overlay", seed, i);
      },
      async () => {
        for (const k of ["flip", "progress", "hook", "attack"])
          if (await page.locator(`[data-effect="${k}"]`).count())
            await frames(k, `[data-effect="${k}"]`, seed, i);
      },
    );
    assert.equal(
      JSON.parse(await page.evaluate(() => window.render_game_to_text()))
        .events,
      s.events.length,
    );
    if (seed === 1701 && recorded.has("progress") && recorded.has("dice"))
      break;
    if (seed === 4111 && recorded.has("hook") && recorded.has("attack")) break;
  }
}
assert.deepEqual([...recorded].sort(), [
  "attack",
  "dice",
  "flip",
  "hook",
  "progress",
]);
// Disable motion through real settings, persist across reload, and verify a real flip stays static.
await page.getByTestId("settings").click();
await page.getByTestId("animations-setting").uncheck();
await page.getByTestId("close-settings").click();
await page.goto("http://127.0.0.1:5173/?hotseat=1");
assert.equal(await page.locator("html").getAttribute("data-motion"), "off");
await page.getByTestId("start").click();
await page.getByTestId("uncover").click();
// 开局第一步是先手逃生者掷出生骰（家规 U-NO-SETUP-REVEAL）：关闭动画时掷骰结果静态显示
await page.locator('[data-command*="SELECT"]').first().click();
await page.getByTestId("ack-dice").waitFor();
await page.getByTestId("dice-result").waitFor();
assert.equal(
  await page
    .locator(".dice-overlay")
    .evaluate((el) => el.getAnimations({ subtree: true }).length),
  0,
);
await page.screenshot({
  path: out + "/关闭动画_静态反馈.png",
  animations: "disabled",
});
await page.getByTestId("ack-dice").click();
await drainUI(page);
await page.getByTestId("settings").click();
await page.getByTestId("animations-setting").check();
await page.getByTestId("art-setting").uncheck();
await page.getByTestId("close-settings").click();
await page.goto("http://127.0.0.1:5173/?view=props");
assert.equal(await page.locator(".asset-png").count(), 0);
assert((await page.locator('[data-fallback="true"]').count()) >= expected);
await page.getByTestId("settings").click();
await page.getByTestId("art-setting").check();
await page.getByTestId("close-settings").click();
// Force one PNG to fail. SVG remains visible and no application exception is raised.
await page.route("**/assets/mobile/generator.webp", (r) => r.abort());
await page.reload();
await page.waitForTimeout(250);
assert.equal(
  await page
    .locator('[data-gallery-state="generator:idle"] [data-asset="generator"]')
    .getAttribute("data-fallback"),
  "true",
);
assert.equal(await page.getByRole("alert").count(), 0);
const reduced = await browser.newContext({ reducedMotion: "reduce" });
const rp = await reduced.newPage();
await rp.goto("http://127.0.0.1:5173/?hotseat=1");
assert.equal(await rp.locator("html").getAttribute("data-motion"), "off");
await reduced.close();
assert.deepEqual(errors, []);
writeFileSync(
  out + "/反馈与回退验收.json",
  JSON.stringify(
    {
      galleryStates: expected,
      records,
      settingsOff: true,
      settingsPersisted: true,
      systemReducedMotion: true,
      missingPngFallback: true,
      svgMode: true,
      consoleErrors: errors,
    },
    null,
    2,
  ),
);
const html =
  `<!doctype html><meta charset="utf-8"><title>实际操作反馈连续截图</title><style>body{background:#15231d;color:#eee4c5;font:16px sans-serif;padding:24px}section{margin-bottom:30px}.row{display:flex;gap:8px}img{width:32%;height:320px;object-fit:none;object-position:center}h1{font-size:26px}p{color:#b8c6ae}</style><h1>实际操作反馈连续截图</h1><p>来自真实规则命令；固定原生CSS动画时间点，不修改对局状态。阶段1/2/3对应动画12%/55%/98%。</p>` +
  records
    .map(
      (r: any) =>
        `<section><h2>${r.label}</h2><p>种子${r.seed}，命令序号${r.commandIndex}</p><div class="row">${r.frames.map((f: string, i: number) => `<img src="${f}" alt="${r.label}阶段${i + 1}">`).join("")}</div></section>`,
    )
    .join("");
writeFileSync(out + "/操作反馈连续截图.html", html);
await browser.close();
console.log(
  "VISUAL_FEEDBACK_PASS",
  expected,
  "states; flip/dice/progress/hook/attack sequences; settings; fallback; privacy unit tests separate.",
);
