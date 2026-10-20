// 房间流程验收（用户规则 2026-10-20）：手机尺寸的多个浏览器
// 建房选人数 → 输入房间号加入 → 各自选阵营（含多人选杀手 / 没人选杀手 / 4 人自愿控两名）
// → 房主改人数并开始 → 杀手三选一、逃生者二选一 → 所有浏览器进入同一局棋盘。
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, devices, type Page } from "playwright";
import { assertUiShot } from "./screenshot-check.ts";

const PORT = 3324;
const BASE = `http://127.0.0.1:${PORT}`;
const out = "output/lan-lobby";
mkdirSync(out, { recursive: true });

let server: ChildProcess | undefined;
async function startServer() {
  server = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: "127.0.0.1",
        DBD_DATA_DIR: mkdtempSync(join(tmpdir(), "dbd-lobbyui-")),
      },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/api/info`)).ok) return;
    } catch {}
    if (i > 200) throw new Error("服务器未启动");
    await new Promise((r) => setTimeout(r, 50));
  }
}
async function checkPhone(p: Page) {
  const layout = await p.evaluate(() => ({
    scroll:
      document.documentElement.scrollHeight > innerHeight + 1 ||
      document.documentElement.scrollWidth > innerWidth + 1,
    dropdowns: document.querySelectorAll("select").length,
    clipped: [...document.querySelectorAll("button:not([disabled])")]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return (
          b.width > 0 &&
          b.height > 0 &&
          (b.width < 48 ||
            b.height < 48 ||
            b.top < 0 ||
            b.bottom > innerHeight + 1)
        );
      })
      .map((e) => e.textContent),
  }));
  assert.equal(layout.scroll, false);
  assert.equal(layout.dropdowns, 0);
  assert.deepEqual(layout.clipped, []);
}
const text = async (p: Page) =>
  JSON.parse(await p.evaluate(() => window.render_game_to_text()));

const scenarios = [
  {
    name: "5人_两人想当杀手",
    count: 5,
    start: 4,
    sides: ["killer", "survivor", "killer", "survivor", "survivor"],
    volunteer: -1,
  },
  {
    name: "4人_没人选杀手_一人报名控两名",
    count: 4,
    start: 4,
    sides: ["survivor", "survivor", "survivor", "survivor"],
    volunteer: 2,
  },
  {
    name: "3人",
    count: 3,
    start: 3,
    sides: ["survivor", "killer", "survivor"],
    volunteer: -1,
  },
] as const;

await startServer();
const browser = await chromium.launch();
const summary: unknown[] = [];
try {
  for (const sc of scenarios) {
    const errors: string[] = [];
    const pages: Page[] = [];
    for (let i = 0; i < sc.count; i++) {
      const ctx = await browser.newContext({
        ...devices[i % 2 ? "Pixel 7" : "iPhone 13"],
      });
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(String(e)));
      pages.push(p);
    }
    // 1) 房主建房（先选一个不同的人数，进房后再改回来，验证"创建后可改"）
    const host = pages[0];
    await host.goto(`${BASE}/?online=1`);
    await host.getByTestId("count-" + sc.start).tap();
    await host.getByTestId("create-room").tap();
    await host.waitForURL(/room=/);
    const code = new URL(host.url()).searchParams.get("room")!;
    await host.getByTestId("player-name").fill("房主");
    await host.getByTestId("join-room").tap();
    await host.getByTestId("lobby-room").waitFor();
    if (sc.start !== sc.count)
      await host.getByTestId("count-" + sc.count).tap();
    // 2) 其他人用房间号加入
    for (let i = 1; i < sc.count; i++) {
      const p = pages[i];
      await p.goto(`${BASE}/?online=1`);
      await p.getByTestId("join-code").fill(code);
      await p.getByRole("button", { name: "加入", exact: true }).tap();
      await p.getByTestId("player-name").fill("玩家" + (i + 1));
      await p.getByTestId("join-room").tap();
      await p.getByTestId("lobby-room").waitFor();
    }
    // 3) 选阵营 / 报名
    for (let i = 0; i < sc.count; i++) {
      await pages[i].getByTestId("side-" + sc.sides[i]).tap();
      if (i === sc.volunteer) {
        // 勾选状态以服务器为准，等服务器确认后才显示为已勾选
        await pages[i].getByTestId("volunteer").tap();
        await pages[i].waitForFunction(
          () =>
            document.querySelector<HTMLInputElement>(
              '[data-testid="volunteer"]',
            )?.checked,
        );
      }
    }
    await host.waitForFunction(
      () =>
        !document.querySelector<HTMLButtonElement>(
          '[data-testid="start-draft"]',
        )?.disabled,
    );
    await checkPhone(host);
    await assertUiShot(host, `${out}/${sc.name}_房间.png`);
    // 非房主看不到"开始"
    assert.equal(await pages[1].getByTestId("start-draft").count(), 0);
    await host.getByTestId("start-draft").tap();
    // 4) 选角色：每个人点自己第一个可选项，直到都选完
    for (const p of pages) await p.getByTestId("draft-room").waitFor();
    await checkPhone(pages[1]);
    await assertUiShot(pages[1], `${out}/${sc.name}_选角色.png`);
    let killerOptions = 0;
    for (let round = 0; round < 3; round++)
      for (const p of pages) {
        const opts = p.locator('[data-testid^="pick-"]:not([disabled])');
        if (
          round === 0 &&
          (await p.locator('[data-testid^="look-k-"]').count())
        ) {
          killerOptions = await p.locator('[data-testid^="look-k-"]').count();
          // 先看第二个杀手的介绍，确认介绍跟着切换
          const second = p.locator('[data-testid^="look-k-"]').nth(1);
          const id = (await second.getAttribute("data-testid"))!.split("-").pop();
          await second.tap();
          await p.getByTestId("character-detail-" + id).waitFor();
        }
        if (await opts.count()) await opts.first().tap();
        else {
          const tabs = p.locator(".draft-tabs button");
          if (await tabs.count()) await tabs.last().tap();
          if (await opts.count()) await opts.first().tap();
        }
        await p.waitForTimeout(150);
      }
    assert.equal(killerOptions, 3, "杀手三选一");
    // 5) 所有人进入同一局
    for (const p of pages)
      await p.getByTestId("board").waitFor({ timeout: 15000 });
    const t = await Promise.all(pages.map(text));
    const seats = t.map((x) => x.online.seat);
    assert.equal(new Set(seats).size, sc.count, "每人一个座位");
    for (const x of t) assert.equal(x.online.version, 0);
    await assertUiShot(pages[0], `${out}/${sc.name}_开局.png`);
    assert.deepEqual(errors, [], errors.join("\n"));
    summary.push({
      scenario: sc.name,
      room: code,
      players: sc.count,
      killerOptions,
    });
    for (const p of pages) await p.context().close();
  }
} finally {
  await browser.close();
  server?.kill();
}
writeFileSync(`${out}/房间流程验收.json`, JSON.stringify(summary, null, 2));
console.log("LAN_LOBBY_PASS", JSON.stringify(summary));
process.exit(0);
