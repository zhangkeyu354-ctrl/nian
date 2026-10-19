import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync } from "node:fs";
import { openRoomSelect } from "./hotseat-driver.ts";
const out = "output/playwright/phase2";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://127.0.0.1:5173");
await page.getByTestId("survivor-0").selectOption("meg");
await page.getByTestId("start").click();
assert.equal(await page.getByTestId("movement-hand").count(), 0);
await page.getByTestId("uncover").click();
const before = JSON.parse(
  await page.evaluate(() => window.render_game_to_text()),
).events;
// 2026-10-20：39 个板载技能已全部实现。改为检查"不在时机时按钮不可点"，且不会改变状态。
const megSprint = page.locator('[data-perk="board_meg_1"]');
assert(await megSprint.isDisabled(), "perk outside its timing must be disabled");
assert.equal((await megSprint.textContent())?.trim(), "尚未到使用时机");
assert.equal(
  JSON.parse(await page.evaluate(() => window.render_game_to_text())).events,
  before,
);
await page.screenshot({
  path: `${out}/手机_技能未到时机.png`,
  fullPage: true,
});
await page.getByTestId("board").scrollIntoViewIfNeeded();
const initial = await page.getByTestId("board").getAttribute("viewBox");
assert(
  Number(initial!.split(" ")[2]) < 1000,
  "mobile starts with readable focused map",
);
await page.getByRole("button", { name: "放大地图", exact: true }).click();
assert.notEqual(
  await page.getByTestId("board").getAttribute("viewBox"),
  initial,
);
await page.getByRole("button", { name: "复位地图", exact: true }).click();
const rect = (await page.locator(".map-viewport").boundingBox())!;
const x = Math.round(rect.x + rect.width / 2),
  y = Math.round(rect.y + rect.height / 2);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [
    { x: x - 45, y },
    { x: x + 45, y },
  ],
});
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchMove",
  touchPoints: [
    { x: x - 85, y },
    { x: x + 85, y },
  ],
});
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchEnd",
  touchPoints: [],
});
await page.waitForTimeout(80);
const pinched = await page.getByTestId("board").getAttribute("viewBox");
assert.notEqual(pinched, initial, "real two-finger pinch changes viewBox");
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x, y }],
});
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchMove",
  touchPoints: [{ x: x + 55, y: y + 20 }],
});
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchEnd",
  touchPoints: [],
});
await page.waitForTimeout(80);
const panned = await page.getByTestId("board").getAttribute("viewBox");
assert.notEqual(panned, pinched, "one-finger drag changes viewBox");
await page.screenshot({ path: `${out}/手机_双指缩放.png`, fullPage: true });
await page.getByRole("button", { name: "复位地图", exact: true }).click();
await page.screenshot({ path: `${out}/手机_竖屏棋盘.png`, fullPage: true });
assert.equal(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
  true,
  "no horizontal page overflow",
);
const small = await page
  .locator("button:visible")
  .evaluateAll((els) =>
    els
      .filter((el) => el.getBoundingClientRect().height < 43)
      .map((el) => el.textContent),
  );
assert.deepEqual(small, [], "all standard buttons at least44px");
// Complete setup through visible action buttons, then inspect secret-plan handoff.
for (let i = 0; i < 4; i++) {
  while (await page.getByTestId("ack-feedback").count())
    await page.getByTestId("ack-feedback").click();
  if (await page.getByTestId("uncover").count())
    await page.getByTestId("uncover").click();
  const target = page.locator(".actionable-prop").first();
  const room = await target.evaluate((el) =>
    el.closest("[data-room-container]")!.getAttribute("data-room-container")!,
  );
  await (await openRoomSelect(page)).selectOption(room);
  await target.locator(":scope > rect").click();
  while (await page.getByTestId("ack-dice").count())
    await page.getByTestId("ack-dice").click();
}
while (await page.getByTestId("ack-feedback").count())
  await page.getByTestId("ack-feedback").click();
if (await page.getByTestId("uncover").count())
  await page.getByTestId("uncover").click();
await page.locator('[data-card="blue"]').click();
await page.screenshot({ path: `${out}/手机_秘密移动牌.png`, fullPage: true });
await page.getByTestId("confirm-plan").click();
assert.equal(await page.getByTestId("uncover").count(), 1);
assert.equal(await page.locator("[data-card]").count(), 0);
assert.equal(await page.locator("[data-command]").count(), 0);
assert.equal(await page.locator("[data-field]").count(), 0);
await page.screenshot({ path: `${out}/手机_交接.png`, fullPage: true });
assert.deepEqual(errors, []);
writeFileSync(
  `${out}/手机与遮挡验收.json`,
  JSON.stringify(
    {
      viewport: { width: 390, height: 844 },
      checkRequiredHandled: true,
      rejectedCommandUnchanged: true,
      twoFingerPinch: true,
      oneFingerDrag: true,
      largeButtons: true,
      noPageOverflow: true,
      secretPlanHandoffUnmounted: true,
      consoleErrors: errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("MOBILE_PASS pinch,drag,privacy,44px,perk-timing");
