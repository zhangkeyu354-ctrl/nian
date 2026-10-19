// 联机浏览器验收：5 个独立浏览器（3 台电脑尺寸 + 2 台手机尺寸）通过界面点击完成整局。
// - 房间由界面创建（测试服务器允许固定种子，以便与第一阶段的回放逐步对照）
// - 每条命令都由"拥有该角色的那一个浏览器"点击界面完成；其他浏览器只观看
// - 每步之后，所有浏览器的版本号必须一致，且与独立规则引擎重放的事件数一致
// - 拦截杀手浏览器收到的全部 WebSocket 消息，检查没有泄露逃生者的秘密信息
// - 截图全部通过 screenshot-check（房间数、路线图标数、像素非空白）
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, type Page, type BrowserContext } from "playwright";
import {
  createGame,
  reduce,
  HIDDEN,
} from "../packages/game-engine/src/index.ts";
import type { GameState } from "../packages/shared/src/types.ts";
import { clickUI } from "./hotseat-driver.ts";
import { assertFullBoardShot, waitForBoardImages } from "./screenshot-check.ts";

const PORT = 3322;
const BASE = `http://127.0.0.1:${PORT}`;
const out = "output/lan";
mkdirSync(out, { recursive: true });
const seeds = process.argv.slice(2).map(Number).filter(Boolean);
const games = seeds.length ? seeds : [4111, 1701];

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
        DBD_ALLOW_FIXED_SEED: "1",
        DBD_DATA_DIR: mkdtempSync(join(tmpdir(), "dbd-lanui-")),
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
const text = async (p: Page) =>
  JSON.parse(await p.evaluate(() => window.render_game_to_text()));

/** 关掉所有浏览器上的骰子与反馈弹窗（观看者也会看到） */
async function drain(p: Page) {
  // 观看者的弹窗会自动关闭，所以点击可能扑空；扑空不算错误
  for (let i = 0; i < 30; i++) {
    const dice = p.getByTestId("ack-dice"),
      fb = p.getByTestId("ack-feedback");
    if (await dice.count()) await dice.click({ timeout: 1500 }).catch(() => {});
    else if (await fb.count()) await fb.click({ timeout: 1500 }).catch(() => {});
    else return;
  }
}

await startServer();
const browser = await chromium.launch();
const summary: unknown[] = [];
try {
  for (const seed of games) {
    const r = JSON.parse(
      readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8"),
    );
    const profiles = [
      { width: 1366, height: 900, mobile: false },
      { width: 1366, height: 900, mobile: false },
      { width: 390, height: 844, mobile: true },
      { width: 844, height: 390, mobile: true },
      { width: 1366, height: 900, mobile: false },
    ];
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    const errors: string[] = [];
    const framesOf = new Map<Page, string[]>();
    for (const pr of profiles) {
      const ctx = await browser.newContext({
        viewport: { width: pr.width, height: pr.height },
        hasTouch: pr.mobile,
        isMobile: pr.mobile,
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      const fr: string[] = [];
      framesOf.set(page, fr);
      page.on("websocket", (ws) =>
        ws.on(
          "framereceived",
          (f) => typeof f.payload === "string" && fr.push(f.payload),
        ),
      );
      page.on(
        "response",
        (res) =>
          res.status() >= 400 &&
          errors.push(`HTTP ${res.status()} ${res.url()}`),
      );
      contexts.push(ctx);
      pages.push(page);
    }
    // 1) 第一个浏览器在界面上创建房间
    const host = pages[0];
    await host.goto(`${BASE}/?online=1&seed=${r.options.seed}`);
    await host.getByTestId("map-select").selectOption(r.options.mapId);
    for (let i = 0; i < 4; i++)
      await host
        .getByTestId("survivor-" + i)
        .selectOption(r.options.survivors[i]);
    await host.getByTestId("killer-select").selectOption(r.options.killer);
    await host.getByTestId("create-room").click();
    await host.waitForURL(/room=/);
    const code = new URL(host.url()).searchParams.get("room")!;
    await host.getByTestId("invite").waitFor();
    await host.screenshot({ path: `${out}/${seed}_选座与二维码.png` });

    // 2) 五个浏览器各自选座：用房间号加入（第 2 个浏览器走"输入房间号"流程）
    let full: GameState = createGame(r.options);
    const seatOf = new Map<string, Page>();
    const seats = [
      ...new Set(Object.values(full.actors).map((a) => a.ownerId)),
    ];
    // 杀手座位交给第 5 个浏览器（电脑），手机拿逃生者
    const order = [
      ...seats.filter((s) => full.actors[s]?.side !== "killer"),
      seats.find((s) => full.actors[s]?.side === "killer")!,
    ];
    for (const [i, seatId] of order.entries()) {
      const p = pages[i];
      if (i === 1) {
        await p.goto(`${BASE}/?online=1`);
        await p.getByTestId("join-code").fill(code);
        await p.getByTestId("join-code").press("Enter");
      } else if (i !== 0) await p.goto(`${BASE}/?room=${code}`);
      await p.getByTestId("player-name").fill("玩家" + (i + 1));
      await p.getByTestId("seat-" + seatId).click();
      await p.getByTestId("board").waitFor();
      seatOf.set(seatId, p);
    }
    const killerPage = seatOf.get(full.actors[full.killerId].ownerId)!;

    // 3) 逐条命令：由该角色的拥有者点击界面
    let shots = 0;
    for (const [i, c] of (r.commands as any[]).entries()) {
      for (const p of pages) await drain(p);
      const owner = seatOf.get(full.actors[c.actorId].ownerId)!;
      await clickUI(owner, c);
      full = reduce(full, c);
      for (const p of pages) {
        const t0 = Date.now();
        for (;;) {
          const t = await text(p);
          if (t.online?.version === i + 1) {
            assert.equal(
              t.events,
              full.events.length,
              `浏览器事件数与规则引擎不一致（命令 ${i}）`,
            );
            break;
          }
          if (Date.now() - t0 > 8000)
            throw new Error(
              `命令 ${i} 未同步到所有浏览器：${JSON.stringify(c)} 当前 ${JSON.stringify(t.online)}`,
            );
          await p.waitForTimeout(30);
        }
      }
      // 中局截图：每个浏览器一张，用像素与计数检查
      if (i === Math.floor(r.commands.length / 2)) {
        for (const [k, p] of pages.entries()) {
          await drain(p);
          await waitForBoardImages(p);
          await p.screenshot({
            path: `${out}/${seed}_玩家${k + 1}_中局.png`,
            animations: "disabled",
          });
          await p.getByLabel("复位地图", { exact: true }).click();
          await p.waitForTimeout(250);
          await assertFullBoardShot(
            p,
            `${out}/${seed}_玩家${k + 1}_全图验收.png`,
            full.mapId === "macmillan_estate"
              ? { rooms: 11, routes: 22 }
              : { rooms: 10, routes: 19 },
          );
          await p.getByLabel("定位当前角色", { exact: true }).click();
          shots++;
        }
      }
    }
    assert(full.winner, "对局应当结束");
    for (const p of pages) {
      await drain(p);
      assert.equal(
        (await text(p)).winner,
        full.winner === "survivor" ? "逃生者" : "杀手",
      );
    }
    await pages[2].screenshot({ path: `${out}/${seed}_手机_结算.png` });

    // 4) 隐私：杀手浏览器收到的所有消息里，逃生者的秘密一律被隐藏
    let checkedFrames = 0;
    for (const f of framesOf.get(killerPage)!) {
      const m = f.match(/^\d+(?:\d+)?(\[.*\])$/s);
      if (!m) continue;
      const [ev, snap] = JSON.parse(m[1]) as [string, any];
      if (ev !== "room:update" && !snap?.snapshot) continue;
      const v = snap.view ?? snap.snapshot?.view;
      if (!v) continue;
      checkedFrames++;
      assert.equal(v.seed, 0);
      assert.equal(v.rng, 0);
      for (const p of v.props) if (!p.revealed) assert.equal(p.kind, HIDDEN);
      for (const [owner, hand] of Object.entries(
        v.hands as Record<string, string[]>,
      ))
        if (owner !== full.actors[full.killerId].ownerId)
          assert((hand as string[]).every((x) => x === HIDDEN));
      assert(v.itemDeck.every((x: string) => x === HIDDEN));
    }
    assert(checkedFrames > 50, "应当收到足够多的状态更新");

    // 5) 断线重连：刷新一个手机浏览器，仍回到原座位
    const phone = pages[2];
    const before = await text(phone);
    await phone.reload();
    await phone.getByTestId("board").waitFor();
    const after = await text(phone);
    assert.equal(after.online.seat, before.online.seat, "刷新后回到原座位");

    assert.deepEqual(errors, [], errors.join("\n"));
    summary.push({
      seed,
      room: code,
      commands: r.commands.length,
      winner: full.winner,
      browsers: pages.length,
      killerFramesChecked: checkedFrames,
      screenshotsChecked: shots,
    });
    for (const ctx of contexts) await ctx.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
writeFileSync(`${out}/浏览器联机验收.json`, JSON.stringify(summary, null, 2));
console.log("LAN_BROWSERS_PASS", JSON.stringify(summary));
process.exit(0);
