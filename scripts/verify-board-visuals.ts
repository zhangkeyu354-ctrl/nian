import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { strict as assert } from "node:assert";
import { createGame, reduce } from "../packages/game-engine/src/index.ts";
import { startUI, drainUI, clickUI } from "./hotseat-driver.ts";
import {
  assertFullBoardShot,
  visibleCounts,
  waitForBoardImages,
} from "./screenshot-check.ts";
const out = "output/playwright/phase2c";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  hasTouch: true,
});
const p = await ctx.newPage();
const errors: string[] = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("response", (r) => {
  if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const records: any[] = [];
let boardReveals = 0,
  boardInteractions = 0,
  highlights = 0;
let diceCaptured = false;
for (const seed of [1701, 2903]) {
  const r = JSON.parse(
    readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8"),
  );
  await p.setViewportSize({ width: 1440, height: 1100 });
  await startUI(p, r.options);
  await drainUI(p);
  let s = createGame(r.options);
  for (let i = 0; i < 76; i++) {
    const c = r.commands[i];
    if (c.type === "PLAN" && !highlights) {
      await p.locator(`[data-card="${c.cards[0]}"]`).click();
      const n = await p
        .locator('[data-highlighted="true"] .route-badge.is-lit')
        .count();
      assert(n > 0);
      highlights = n;
      await p.screenshot({ path: `${out}/路线与移动牌.png`, fullPage: true });
      await p.locator(`[data-card="${c.cards[0]}"]`).click();
    }
    await clickUI(p, c);
    s = reduce(s, c);
    if (c.type === "SETUP_REVEAL" || (c.type === "SELECT" && c.propId))
      boardReveals++;
    if (c.type === "INTERACT" && c.targetId) boardInteractions++;
    await drainUI(p, async () => {
      if (
        !diceCaptured &&
        (await p.locator(".dice-overlay").innerText()).includes("检定结果")
      ) {
        await p.waitForTimeout(700);
        await p.screenshot({ path: `${out}/黑色检定骰.png` });
        diceCaptured = true;
      }
    });
    const v = JSON.parse(await p.evaluate(() => window.render_game_to_text()));
    assert.equal(v.events, s.events.length);
    assert.equal(await p.getByRole("alert").count(), 0);
  }
  const count = r.options.mapId === "macmillan_estate" ? 22 : 19;
  assert.equal(await p.locator("[data-route-icon]").count(), count);
  assert.equal(await p.locator('[data-track-icon="hook"]').count(), 8);
  assert.equal(await p.locator('[data-track-icon="generator"]').count(), 4);
  assert.equal(await p.locator('[data-track-icon="exit_gate"]').count(), 1);
  assert(
    !/出生 0|蓝色移动|绿色移动|红色移动|黄色移动/.test(
      await p.locator("body").innerText(),
    ),
  );
  assert((await p.locator("[data-actor] .asset-png").count()) > 0);
  const geometry = await p.locator(".route-badge").evaluateAll((els) =>
    els.map((el) => {
      const b = el.getBoundingClientRect();
      const overlaps = [
        ...document.querySelectorAll("[data-room] > rect"),
      ].some((r) => {
        const a = r.getBoundingClientRect();
        return (
          b.x < a.right && b.right > a.x && b.y < a.bottom && b.bottom > a.y
        );
      });
      return { id: el.getAttribute("data-route-icon"), overlaps };
    }),
  );
  assert(
    geometry.every((r) => !r.overlaps),
    JSON.stringify(geometry.filter((r) => r.overlaps)),
  );
  for (const screen of [
    { name: "电脑", width: 1440, height: 1100 },
    { name: "手机竖屏", width: 390, height: 844 },
    { name: "手机横屏", width: 844, height: 390 },
  ]) {
    await p.setViewportSize(screen);
    await p.waitForTimeout(150);
    await p
      .getByLabel(screen.name === "电脑" ? "复位地图" : "定位当前角色", {
        exact: true,
      })
      .click();
    await p.waitForTimeout(550);
    await p.waitForFunction(() =>
      [...document.querySelectorAll("[data-prop] [data-asset]")].every(
        (e) => e.getAttribute("data-fallback") === "false",
      ),
    );
    assert(
      await p
        .locator("[data-room-art]")
        .evaluateAll((els) =>
          els.every((e) => (e as SVGImageElement).style.display !== "none"),
        ),
    );
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert(!overflow, "no page overflow");
    await p.evaluate(() => window.scrollTo(0, 0));
    if (screen.name === "手机横屏") {
      await p.getByLabel("横屏查看棋盘", { exact: true }).click();
      await p.waitForTimeout(200);
      await p.getByLabel("定位当前角色", { exact: true }).click();
    }
    const svgBox = await p.getByTestId("board").boundingBox();
    assert(svgBox && svgBox.height > 200, "visible SVG canvas");
    const base = `${seed}_${screen.name}_中局`;
    await waitForBoardImages(p);
    await p.screenshot({
      path: `${out}/${base}.png`,
      fullPage: screen.name === "电脑",
      animations: "disabled",
    });
    if (screen.name === "电脑")
      await p
        .locator(".board-shell")
        .screenshot({ path: `${out}/${seed}_棋盘全图.png` });
    if (screen.name === "手机竖屏") {
      // 默认视图显示当前房间与相邻房间；点一下道具先放大到该房间，再检查点击区域
      assert((await visibleCounts(p)).rooms >= 2, "定位视图应包含相邻房间");
      await p.locator("[data-prop] > rect").first().click();
      await p.waitForTimeout(150);
      const rect = await p
        .locator("[data-prop] > rect")
        .first()
        .evaluate((el) => {
          const b = el.getBoundingClientRect();
          return { width: b.width, height: b.height };
        });
      assert(rect.width >= 44 && rect.height >= 44, JSON.stringify(rect));
      const old = await p.getByTestId("board").getAttribute("viewBox");
      await p.getByRole("button", { name: "放大地图", exact: true }).click();
      assert.notEqual(
        await p.getByTestId("board").getAttribute("viewBox"),
        old,
      );
      await p.getByLabel("定位当前角色", { exact: true }).click();
      await p.getByLabel("横屏查看棋盘", { exact: true }).click();
      assert.equal(await p.locator(".board-expanded").count(), 1);
      const rotated = await p.getByTestId("board").getAttribute("viewBox");
      const box = (await p.locator(".map-viewport").boundingBox())!;
      const x = Math.round(box.x + box.width / 2),
        y = Math.round(box.y + box.height / 2),
        cdp = await ctx.newCDPSession(p);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + 45, y: y + 35 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await p.waitForTimeout(80);
      assert.notEqual(
        await p.getByTestId("board").getAttribute("viewBox"),
        rotated,
        "software landscape supports actual touch pan",
      );
      assert.equal(
        JSON.parse(await p.evaluate(() => window.render_game_to_text())).events,
        s.events.length,
        "view gesture does not mutate game",
      );
      await p.screenshot({ path: `${out}/${seed}_竖屏切换横屏.png` });
      await p.getByLabel("横屏查看棋盘", { exact: true }).click();
    }
    if (screen.name === "手机横屏")
      await p.getByLabel("横屏查看棋盘", { exact: true }).click();
    // 全图验收截图：房间数、路线图标数、像素内容三项全部通过才算合格
    if (screen.name === "手机横屏")
      await p.getByLabel("横屏查看棋盘", { exact: true }).click();
    await p.getByLabel("复位地图", { exact: true }).click();
    await p.waitForTimeout(300);
    const expected =
      s.mapId === "macmillan_estate"
        ? { rooms: 11, routes: 22 }
        : { rooms: 10, routes: 19 };
    const full = await assertFullBoardShot(
      p,
      `${out}/${seed}_${screen.name}_全图验收.png`,
      expected,
    );
    if (screen.name === "手机横屏")
      await p.getByLabel("横屏查看棋盘", { exact: true }).click();
    records.push({
      fullBoardCheck: full,
      seed,
      mapId: s.mapId,
      screen: screen.name,
      viewport: { width: screen.width, height: screen.height },
      commandCount: 76,
      round: s.round,
      events: s.events.length,
      file: base + ".png",
    });
  }
}
assert.equal(errors.length, 0, errors.join("\n"));
writeFileSync(
  `${out}/棋盘验收.json`,
  JSON.stringify(
    {
      records,
      boardReveals,
      boardInteractions,
      highlights,
      diceCaptured,
      consoleErrors: errors,
      method:
        "Rendered board/control clicks, independent reducer after every command; resize same actual midgame for each viewport. No state injection.",
    },
    null,
    2,
  ),
);
console.log(
  "PHASE2C_PASS",
  records.length,
  "midgame views",
  boardReveals,
  "board reveals",
  boardInteractions,
  "board interactions",
);
await browser.close();
