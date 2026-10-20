import { chromium, devices } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { createGame, reduce } from "../packages/game-engine/src/index.ts";
import { startUI, drainUI } from "./hotseat-driver.ts";
import { tapPhoneCommand } from "./mobile-ui-driver.ts";
import { assertUiShot, assertFullBoardShot } from "./screenshot-check.ts";
const out = "output/playwright/phase2";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const options = {
    seed: 1701,
    mapId: "macmillan_estate",
    survivors: ["meg", "claudette", "jake", "ace"],
    killer: "trapper",
  };
  let state = createGame(options);
  await startUI(page, options);
  assert.equal(await page.locator("[data-card]").count(), 0);
  await page.getByTestId("uncover").tap();
  assert.equal(
    await page.locator('.mobile-dock [data-perk="board_meg_1"]').count(),
    0,
    "unavailable skill is not offered",
  );
  assert.equal(
    JSON.parse(await page.evaluate(() => window.render_game_to_text())).events,
    state.events.length,
  );
  await assertUiShot(page, `${out}/手机_技能未到时机.png`);
  await page.getByLabel("复位地图", { exact: true }).tap();
  await assertFullBoardShot(page, `${out}/手机_竖屏棋盘.png`, {
    rooms: 11,
    routes: 22,
  });
  const initial = await page.getByTestId("board").getAttribute("viewBox");
  const box = (await page.locator(".map-viewport").boundingBox())!,
    x = Math.round(box.x + box.width / 2),
    y = Math.round(box.y + box.height / 2);
  const cdp = await ctx.newCDPSession(page);
  for (const [type, touchPoints] of [
    [
      "touchStart",
      [
        { x: x - 45, y },
        { x: x + 45, y },
      ],
    ],
    [
      "touchMove",
      [
        { x: x - 85, y },
        { x: x + 85, y },
      ],
    ],
    ["touchEnd", []],
  ] as const)
    await cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: [...touchPoints],
    });
  await page.waitForTimeout(80);
  const pinched = await page.getByTestId("board").getAttribute("viewBox");
  assert.notEqual(pinched, initial, "actual two-finger pinch");
  for (const [type, touchPoints] of [
    ["touchStart", [{ x, y }]],
    ["touchMove", [{ x: x + 45, y: y + 20 }]],
    ["touchEnd", []],
  ] as const)
    await cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: [...touchPoints],
    });
  await page.waitForTimeout(80);
  assert.notEqual(
    await page.getByTestId("board").getAttribute("viewBox"),
    pinched,
    "actual one-finger pan",
  );
  await assertUiShot(page, `${out}/手机_双指缩放.png`);
  await page.getByLabel("返回行动", { exact: true }).tap();
  await page.waitForFunction(() => !document.querySelector(".board-overview"));
  await page.waitForTimeout(100);
  // 出生：从先手玩家起每个角色自己点掷骰
  while (state.choice?.kind === "SPAWN_ROLL") {
    await drainUI(page);
    const c = { type: "SELECT", actorId: state.choice.actorId };
    await tapPhoneCommand(page, c);
    state = reduce(state, c);
  }
  await drainUI(page);
  await page.locator(".mobile-dock [data-card=blue]").tap();
  await assertUiShot(page, `${out}/手机_秘密移动牌.png`);
  await page.getByTestId("confirm-plan").tap();
  assert.equal(await page.getByTestId("uncover").count(), 1);
  assert.equal(
    await page
      .locator("[data-card],[data-command],[data-field-option]")
      .count(),
    0,
    "secrets unmounted during handoff",
  );
  await assertUiShot(page, `${out}/手机_交接.png`);
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight + 1,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/手机与遮挡验收.json`,
    JSON.stringify(
      {
        twoFingerPinch: true,
        oneFingerDrag: true,
        unavailableSkillNotOffered: true,
        secretPlanHandoffUnmounted: true,
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
console.log("MOBILE_PASS touch-pinch,drag,privacy,unavailable-skill");
