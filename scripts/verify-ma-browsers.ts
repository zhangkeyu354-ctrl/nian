// 魔法运动员联机验收：4 部手机尺寸浏览器从首页进入 → 建房 → 加入 → 选秀 → 四场比赛打完。
// 每一步只点界面上真实的按钮；检查没有页面错误、只有该决定的人看得到选项、四场都结束。
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { strict as assert } from "node:assert";
import { chromium, type Page } from "playwright";
import { assertUiShot } from "./screenshot-check.ts";

const PORT = 3331;
const BASE = `http://127.0.0.1:${PORT}`;
const out = process.env.MA_OUT ?? "output/ma-browsers";
const viewport =
  process.env.MA_DESKTOP === "1"
    ? { width: 1366, height: 768 }
    : { width: 390, height: 844 };
mkdirSync(out, { recursive: true });
const data = mkdtempSync(join(tmpdir(), "ma-ui-"));
const testSeed = process.env.MA_TEST_SEED;
const seedHook: string[] = [];
if (testSeed !== undefined) {
  assert(
    /^\d+$/.test(testSeed) && Number(testSeed) < 2 ** 31,
    "测试种子需为非负31位整数",
  );
  const hook = join(data, "seed-hook.mjs");
  // Only this temporary test server is seeded. Production exposes no seed API,
  // and every die, ability and player command still goes through the real server.
  writeFileSync(
    hook,
    `import crypto from 'node:crypto';import {syncBuiltinESMExports} from 'node:module';const original=crypto.randomInt;crypto.randomInt=function(max,...args){return max===2**31&&args.length===0?Number(process.env.MA_TEST_SEED):original.call(crypto,max,...args)};syncBuiltinESMExports();`,
  );
  seedHook.push("--import", pathToFileURL(hook).href);
}
const server: ChildProcess = spawn(
  process.execPath,
  ["--import", "tsx", ...seedHook, "apps/server/src/main.ts"],
  {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DBD_DATA_DIR: join(data, "dbd"),
      MA_DATA_DIR: join(data, "ma"),
    },
    stdio: ["ignore", "ignore", "inherit"],
  },
);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/api/info`)).ok) break;
  } catch {}
  if (i > 200) throw new Error("服务器未启动");
  await new Promise((r) => setTimeout(r, 50));
}

const browser = await chromium.launch();
const errors: string[] = [];
const phone = async () => {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    reducedMotion:
      process.env.MA_REDUCED_MOTION === "1" ? "reduce" : "no-preference",
  });
  // MA_LAYOUT=art：手机用原版棋盘（操作卡在赛道中间）
  if(process.env.MA_SPEED==="fast")await ctx.addInitScript(()=>localStorage.setItem("ma-speed","fast"));
  if (process.env.MA_LAYOUT === "art")
    await ctx.addInitScript(() =>
      localStorage.setItem("ma-board-layout", "art"),
    );
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
try {
  const host = await phone();
  await host.goto(BASE + "/");
  await host.getByTestId("open-ma").click();
  await host.getByTestId("ma-create").click();
  await host.waitForURL(/room=/);
  const url = host.url();
  const pages: Page[] = [host];
  const N = Number(process.env.MA_PLAYERS ?? 4);
  const extra = await Promise.all(Array.from({ length: N - 1 }, () => phone()));
  for (const p of [host, ...extra]) {
    if (p !== host) {
      await p.goto(url);
      pages.push(p);
    }
    await p.getByTestId("ma-name").fill("选手" + pages.indexOf(p));
    await p.getByTestId("ma-claim").click();
    await p.getByTestId("ma-code").waitFor();
  }
  if (process.env.MA_SECOND_WIND === "1") {
    const toggle = host.getByTestId("ma-second-wind");
    assert.equal(await toggle.isChecked(), false, "新角色默认关闭");
    assert.equal(
      await pages[1].getByTestId("ma-second-wind").isDisabled(),
      true,
      "只有房主可改",
    );
    await toggle.click();
    await host.waitForFunction(
      () =>
        (
          document.querySelector(
            '[data-testid="ma-second-wind"]',
          ) as HTMLInputElement
        )?.checked,
    );
    await pages[1].waitForFunction(
      () =>
        (
          document.querySelector(
            '[data-testid="ma-second-wind"]',
          ) as HTMLInputElement
        )?.checked,
    );
    await host.setViewportSize({ width: 390, height: 844 });
    await assertUiShot(host, `${out}/sw-lobby-phone.png`);
    await host.setViewportSize({ width: 1366, height: 768 });
    await toggle.scrollIntoViewIfNeeded();
    await assertUiShot(host, `${out}/sw-lobby-desktop.png`);
    await host.setViewportSize(viewport);
  }
  const random = process.env.MA_DEAL === "random";
  if (random) {
    await host.getByTestId("ma-deal-random").click();
    // 其他人的房间页也同步显示「随机模式」被选中
    await pages[1]
      .locator('[data-testid="ma-deal-random"][aria-checked="true"]')
      .waitFor();
  }
  await host.getByTestId("ma-start").click();
  if (random) {
    // 不选秀：每人直接拿到 4 名，全场不重复
    const all: string[] = [];
    for (const p of pages) {
      await p.locator('[data-testid^="pick-"]').first().waitFor();
      const ids = await p
        .locator('[data-testid^="pick-"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!));
      assert.equal(ids.length, 4, "随机模式每人应该拿到 4 名");
      all.push(...ids);
    }
    assert.equal(new Set(all).size, all.length, "随机模式有两人拿到同一名选手");
    assert.equal(
      await host.locator(".ma-order").count(),
      0,
      "随机模式不应出现选秀",
    );
    await host.screenshot({ path: `${out}/1_随机发牌.png`, fullPage: true });
  } else {
    await host.locator(".ma-order").waitFor();
    await host.screenshot({ path: `${out}/1_选秀.png`, fullPage: true });
  }

  let steps = 0;
  let staleClicks = 0;
  let races = 0;
  const statsShots = new Set<string>();
  let speedChecked = false;
  const newRacersPicked = new Set<string>();
  const preferredRacers = (process.env.MA_PREFER_RACERS ?? "")
    .split(",")
    .filter(Boolean);
  for (;;) {
    if (++steps >= Number(process.env.MA_MAX_STEPS ?? 4000)) {
      // 诊断：卡住时把每个人看到的界面和最近的比赛记录打出来
      for (const p of pages)
        if (!(await p.locator(".ma-log li").count()))
          await p
            .getByTestId("fold-log")
            .click()
            .catch(() => {});
      for (const p of pages)
        console.log(
          "STUCK",
          pages.indexOf(p),
          JSON.stringify(
            await p.evaluate(() => ({
              decide: document.querySelector(".ma-decide")?.className,
              prompt: document.querySelector(".ma-decide .ma-prompt")
                ?.textContent,
              buttons: [
                ...document.querySelectorAll(
                  ".ma-decide button, [data-testid^=pick-]",
                ),
              ].map((b) => b.textContent),
              overlay: document.querySelector(".ma-overlay")?.className,
              log: [...document.querySelectorAll(".ma-log li")]
                .slice(0, 12)
                .map((l) => l.textContent),
            })),
          ),
        );
      assert.fail("对局没有在 4000 步内结束");
    }
    if (await host.locator(".ma-final").count()) break;
    if (!speedChecked && (await host.getByTestId("ma-speed").isVisible())) {
      const speed = host.getByTestId("ma-speed");
      const labels: string[] = [];
      for (let i = 0; i < 3; i++) {
        labels.push(await speed.innerText());
        await speed.click();
      }
      assert(
        labels.some((s) => s.includes("慢")) &&
          labels.some((s) => s.includes("正常")) &&
          labels.some((s) => s.includes("快")),
      );
      speedChecked = true;
    }
    const stats = host.locator(".ma-ov-stats");
    if (await stats.isVisible()) {
      const title = await stats.locator("small").first().innerText();
      if (!statsShots.has(title)) {
        statsShots.add(title);
        await assertUiShot(host, `${out}/stats-${statsShots.size}.png`);
      }
    }
    let acted = false;
    for (const p of pages) {
      const previewPick = p
        .locator('[data-testid^="pick-sw_"]', { hasText: /选它|派它上场/ })
        .first();
      const preferredPick = preferredRacers.length
        ? p
            .locator(
              preferredRacers
                .map((id) => `[data-testid="pick-${id}"]`)
                .join(","),
              { hasText: /选它|派它上场/ },
            )
            .first()
        : null;
      const pick =
        preferredPick && (await preferredPick.count())
          ? preferredPick
          : process.env.MA_SECOND_WIND === "1" && (await previewPick.count())
            ? previewPick
            : p
                .locator('[data-testid^="pick-"]', { hasText: /选它|派它上场/ })
                .first();
      // A sending button can outlive its decision for one render; never click it twice.
      // 清晰棋盘：操作在棋盘下面；原版棋盘：操作卡在赛道中间（下面那块隐藏）
      const allOptions = p
        .locator(
          ".ma-decide.you .ma-options button:not(.sending):not(:disabled), .ma-cc.you .ma-options button:not(.sending):not(:disabled)",
        )
        .filter({ visible: true });
      const moleOption = allOptions.filter({ hasText: "挖地直行" }).first();
      const decline = allOptions.filter({ hasText: /^不用$/ }).first();
      const kingDecision = p
        .locator(".ma-prompt", { hasText: "王者一绊" })
        .filter({ visible: true });
      const secretSet = p
        .locator(".ma-prompt, .ma-cc-prompt", { hasText: "秘密设定" })
        .filter({ visible: true });
      const four = allOptions.filter({ hasText: /^4 点$/ }).first();
      // A legal choice to trip oneself forever is not a useful completion bot.
      const opt =
        (await secretSet.count()) && (await four.count())
          ? four
          : (await kingDecision.count()) && (await decline.count())
            ? decline
            : preferredRacers.length && (await moleOption.count())
              ? moleOption
              : allOptions.first();
      const confirm = p.getByTestId("ma-choose-confirm");
      if (await confirm.count()) {
        await confirm.click();
        acted = true;
      } else if (await opt.count()) {
        try {
          await opt.click({ timeout: 2000 });
          staleClicks = 0;
          acted = true;
        } catch (e) {
          // A command from another page may replace this decision between the
          // locator check and click. Re-read the live UI; never force a click.
          if (
            !(e instanceof Error) ||
            !/Timeout|detached/.test(e.name + e.message) ||
            ++staleClicks > 10
          )
            throw e;
        }
      } else if (
        (await pick.count()) &&
        !(await p.locator(".ma-banner", { hasText: "你派出了" }).count())
      ) {
        const id = (await pick.getAttribute("data-testid"))?.replace(
          /^pick-/,
          "",
        );
        if (id?.startsWith("sw_")) newRacersPicked.add(id);
        await pick.click();
        acted = true;
      } else continue;
      if (process.env.MA_DEBUG && steps < 60)
        console.log(
          steps,
          pages.indexOf(p),
          await p.evaluate(() =>
            [
              document.querySelector(".ma-error")?.textContent,
              document.querySelector(".ma-banner, .ma-prompt")?.textContent,
            ].join(" | "),
          ),
        );
      await p.waitForTimeout(60);
      break;
    }
    if (!acted) {
      // 动画播放中：点一下屏幕跳过（真实玩家也可以这样做）
      for (const q of pages) {
        // 点跳过时动画刚好结束，会点到下面的小人、打开选手卡：关掉它
        const box = q.locator(".ma-lightbox");
        if (await box.count())
          await box
            .first()
            .click({ force: true, timeout: 1000 })
            .catch(() => {});
        const ov = q.locator(".ma-overlay:not(.ov-power):not(.ov-note)");
        if (await ov.count())
          await ov
            .first()
            .click({ force: true })
            .catch(() => {});
      }
      await host.waitForTimeout(150);
      continue;
    }
    // 待决定事项只有决定人看得到选项：别人的面板里不能有选项按钮
    for (const q of pages)
      assert.equal(
        await q
          .locator(
            ".ma-decide:not(.you) .ma-options button, .ma-cc:not(.you) .ma-options button",
          )
          .count(),
        0,
        "旁人看到了别人的选项",
      );
    const board = host.locator(".ma-board-art, .ma-grid").first();
    const label = (await board.count())
      ? await board.getAttribute("aria-label")
      : null;
    if (label && !label.includes(`第 ${races} 场`)) {
      races++;
      await host.screenshot({
        path: `${out}/2_第${races}场.png`,
        fullPage: true,
      });
      if (process.env.MA_START_ONLY === "1") {
        assert.equal(pages.length, 8);
        assert.equal(races, 1);
        assert(speedChecked);
        assert.deepEqual(errors, []);
        console.log(
          "MA_EIGHT_START_PASS",
          JSON.stringify({
            players: pages.length,
            steps,
            racesSeen: races,
            speedChecked,
          }),
        );
        break;
      }
    }
  }
  await host.screenshot({ path: `${out}/3_最终成绩.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "MA_BROWSERS_PASS",
    JSON.stringify({
      players: pages.length,
      deal: random ? "random" : "draft",
      steps,
      racesSeen: races,
      speedChecked,
      statsScreens: statsShots.size,
      newRacersPicked: [...newRacersPicked],
    }),
  );
  assert.equal(
    races,
    process.env.MA_START_ONLY === "1" ? 1 : 4,
    "应当看到要求的比赛场数",
  );
} finally {
  await browser.close();
  server.kill();
}
