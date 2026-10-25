import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, type Page } from "playwright";
import { RKRoom } from "../apps/server/src/rk-rooms.ts";
import {
  createRK,
  createTiles,
  assertInvariants,
  validateMeld,
} from "../packages/rummikub/src/index.ts";
import { findRackMelds } from "../packages/rummikub/src/simulation.ts";
import { assertUiShot } from "./screenshot-check.ts";
const root = mkdtempSync(join(tmpdir(), "rk-xp-ui-")),
  data = join(root, "rk"),
  out = "docs/rummikub/ui-xp";
mkdirSync(data);
mkdirSync(out, { recursive: true });
const names = [
  "一二三四五六七八九十",
  "甲乙丙丁戊己庚辛壬癸",
  "三号朋友",
  "四号朋友",
  "五号朋友",
  "六号朋友",
];
const fixture = RKRoom.create("XPAA", data);
fixture.file.variant = "xp";
fixture.file.count = 6;
fixture.file.minutes = 0;
const users = names.map((n) => fixture.claim(n));
const state = createRK(names, {
  variant: "xp",
  seed: 6006,
  minutes: 0,
  assertions: true,
});
const hands = [
  ["R11c", "J3", "J4", "K13c"],
  ["B01a"],
  ["B02a"],
  ["B03a"],
  ["B04a"],
  ["B05a"],
];
state.current = 0;
state.players.forEach((p, i) => {
  p.rack = hands[i];
  p.opened = true;
});
state.pool = createTiles("xp")
  .map((t) => t.id)
  .filter((id) => !hands.flat().includes(id));
state.board = [];
state.turn = { rack: [...hands[0]], board: [], retrieved: [] };
state.draft = structuredClone(state.turn);
assertInvariants(state);
fixture.file.state = state;
fixture.save();
const old = RKRoom.create("OLDA", data);
const oldUsers = [old.claim("旧房主"), old.claim("旧朋友")];
old.file.state = createRK(["旧房主", "旧朋友"], {
  seed: 1,
  minutes: 0,
  assertions: true,
});
old.save();
const legacy = JSON.parse(readFileSync(join(data, "OLDA.json"), "utf8"));
delete legacy.variant;
delete legacy.state.variant;
writeFileSync(join(data, "OLDA.json"), JSON.stringify(legacy));
const port = 3501,
  base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
async function start() {
  child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        DBD_DATA_DIR: join(root, "dbd"),
        RK_DATA_DIR: data,
        WT_DISABLE: "1",
      },
      stdio: "ignore",
    },
  );
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("server startup failed");
}
async function stop() {
  if (child && child.exitCode === null) {
    const c = child;
    await new Promise<void>((r) => {
      c.once("exit", () => r());
      c.kill();
    });
  }
}
const browser = await chromium.launch(),
  errors: string[] = [],
  checks: unknown[] = [],
  shots: unknown[] = [];
const snap = (p: Page) =>
  p.evaluate(() => JSON.parse((window as any).render_game_to_text()));
async function waitView(p: Page) {
  await p.waitForFunction(() => {
    try {
      return !!JSON.parse((window as any).render_game_to_text()).view;
    } catch {
      return false;
    }
  });
}
async function shot(p: Page, name: string) {
  const audit = await p.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth,
    clippedActions: [
      ...document.querySelectorAll(".rk-action-wrap button"),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return (
        r.top < 0 ||
        r.bottom > innerHeight + 1 ||
        r.left < 0 ||
        r.right > innerWidth + 1
      );
    }).length,
    seatRects: [
      ...document.querySelectorAll(".rk-players:not(.rk-seats) .rk-player"),
    ].map((e) => ({
      rect: e.getBoundingClientRect().toJSON(),
      parent: e.parentElement!.getBoundingClientRect().toJSON(),
      minHeight: getComputedStyle(e).minHeight,
    })),
    names: [...document.querySelectorAll(".rk-player strong")]
      .filter(
        (e) =>
          e.scrollHeight > e.clientHeight + 1 ||
          e.scrollWidth > e.clientWidth + 1,
      )
      .map((e) => e.textContent),
    clippedSeats: [
      ...document.querySelectorAll(".rk-players:not(.rk-seats) .rk-player"),
    ].filter((e) => {
      const r = e.getBoundingClientRect(),
        b = e.parentElement!.getBoundingClientRect();
      return (
        r.top < b.top - 1 ||
        r.bottom > b.bottom + 1 ||
        r.left < b.left - 1 ||
        r.right > b.right + 1
      );
    }).length,
    clippedDraw: [
      ...document.querySelectorAll(
        ".rk-start-draw .rk-tile,.rk-start-draw .rk-primary",
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return (
        r.top < 52 ||
        r.bottom > innerHeight ||
        r.left < 0 ||
        r.right > innerWidth
      );
    }).length,
  }));
  if (audit.clippedSeats || audit.clippedDraw) {
    writeFileSync(
      `${out}/failure-${name}.json`,
      JSON.stringify(audit, null, 2),
    );
    await p.screenshot({ path: `${out}/failure-${name}.png` });
  }
  assert(!audit.horizontal, `horizontal overflow ${name}`);
  assert.equal(audit.clippedActions, 0, `actions visible ${name}`);
  assert.equal(audit.clippedSeats, 0, `all six seats visible ${name}`);
  assert.equal(
    audit.clippedDraw,
    0,
    `all start-draw tiles and button visible ${name}`,
  );
  assert.deepEqual(audit.names, [], `name clipping ${name}`);
  shots.push({
    name,
    audit,
    ...(await assertUiShot(p, `${out}/${name}.png`, "body", "allow")),
  });
}
async function place(p: Page, ids: string[], meld?: string) {
  const before = (await snap(p)).privateRevision;
  for (const id of ids) {
    const b = p.getByTestId("rk-tile-" + id);
    await b.scrollIntoViewIfNeeded();
    await b.click();
  }
  if (meld)
    await p
      .getByTestId("rk-meld-" + meld)
      .locator(".rk-add")
      .click();
  else await p.getByTestId("rk-new-group").click();
  await p.waitForFunction(
    (before) =>
      JSON.parse((window as any).render_game_to_text()).privateRevision >
      before,
    before,
  );
}
try {
  await start();
  const contexts = await Promise.all(
    Array.from({ length: 6 }, () =>
      browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: "reduce",
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  pages.forEach((p) => p.on("pageerror", (e) => errors.push(e.message)));
  // A legacy disk file has no mode; join through the actual server migration.
  await contexts[0].addInitScript(
    ({ code, token }) => localStorage.setItem("rk:" + code, token),
    { code: "OLDA", token: oldUsers[0].token },
  );
  await pages[0].goto(base + "/?game=rk&room=OLDA");
  await waitView(pages[0]);
  assert.equal((await snap(pages[0])).variant, "classic");
  assert.equal((await snap(pages[0])).view.variant, "classic");
  checks.push({ name: "legacy classic file migration", passed: true });
  for (let i = 0; i < 6; i++) {
    await contexts[i].addInitScript(
      ({ token }) => localStorage.setItem("rk:XPAA", token),
      users[i],
    );
    await pages[i].goto(base + "/?game=rk&room=XPAA");
    await waitView(pages[i]);
  }
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await pages[0].setViewportSize(size);
    await pages[0].reload();
    await waitView(pages[0]);
    await shot(pages[0], `${size.width}-six-seat-draw`);
    await pages[0]
      .getByRole("button", { name: "开始这一局", exact: true })
      .click();
    await shot(pages[0], `${size.width}-six-seats-jokers`);
    assert.equal(await pages[0].getByTestId("rk-tile-J3").count(), 1);
    assert.equal(await pages[0].getByTestId("rk-tile-J4").count(), 1);
  }
  await pages[0].setViewportSize({ width: 390, height: 844 });
  const opponent = await snap(pages[1]);
  await place(pages[0], ["R11c", "J3", "J4"]);
  assert.deepEqual(await snap(pages[1]), opponent);
  const draft = (await snap(pages[0])).view.draft,
    nextSeq = (await snap(pages[0])).nextSeq;
  await pages[0].reload();
  await waitView(pages[0]);
  assert.deepEqual((await snap(pages[0])).view.draft, draft);
  assert.equal((await snap(pages[0])).nextSeq, nextSeq);
  await stop();
  await start();
  await Promise.all(pages.map((p) => p.reload()));
  await Promise.all(pages.map(waitView));
  assert.deepEqual((await snap(pages[0])).view.draft, draft);
  assert.equal((await snap(pages[0])).variant, "xp");
  assert.equal((await snap(pages[0])).nextSeq, nextSeq);
  const restoredDraw = pages[0].getByRole("button", {
    name: "开始这一局",
    exact: true,
  });
  if (await restoredDraw.count()) await restoredDraw.click();
  await shot(pages[0], "xp-restored-private-draft");
  await pages[0].getByTestId("rk-commit").click();
  await pages[1].waitForFunction(
    () =>
      JSON.parse((window as any).render_game_to_text()).view.board.length === 1,
  );
  assert.equal((await snap(pages[1])).view.board[0].tiles.length, 3);
  checks.push({
    name: "third copy and J3/J4 render; private draft survives reload and process restart",
    passed: true,
  });
  for (const count of process.env.RK_XP_SHOTS_ONLY === "1" ? [] : [5, 6]) {
    const active = pages.slice(0, count);
    const host = active[0];
    await host.goto(base + "/?game=rk");
    await host.getByLabel("你的昵称", { exact: true }).fill(names[0]);
    await host.getByTestId("rk-create").click();
    await host.getByLabel("拉密玩法").waitFor();
    assert.equal(await host.getByLabel("拉密玩法").inputValue(), "classic");
    assert.deepEqual(
      await host.getByLabel("本局人数").locator("option").allTextContents(),
      ["2", "3", "4"],
    );
    await host.getByLabel("拉密玩法").selectOption("xp");
    await host.waitForFunction(
      () => JSON.parse((window as any).render_game_to_text()).variant === "xp",
    );
    await host.getByLabel("本局人数").selectOption(String(count));
    await host.getByLabel("每回合计时").selectOption("0");
    const url = host.url();
    for (let i = 1; i < count; i++) {
      await active[i].goto(url);
      await active[i].getByLabel("你的昵称", { exact: true }).fill(names[i]);
      await active[i].getByTestId("rk-create").click();
      await active[i].getByLabel("拉密玩法").waitFor();
      assert(await active[i].getByLabel("拉密玩法").isDisabled());
    }
    await shot(host, `xp-${count}-lobby`);
    for (const p of active)
      await p.getByRole("button", { name: "我准备好了", exact: true }).click();
    await host.getByTestId("rk-start").click();
    await Promise.all(active.map(waitView));
    for (const p of active) {
      const start = await snap(p);
      assert.equal(start.variant, "xp");
      assert.equal(start.view.poolCount, 160 - count * 14);
      assert.equal(start.view.players.filter((p: any) => p.rack).length, 1);
    }
    for (const p of active) {
      const close = p.getByRole("button", { name: "开始这一局", exact: true });
      if (await close.count()) await close.click();
    }
    await shot(host, `xp-${count}-start`);
    let turns = 0;
    while ((await snap(host)).view.phase === "PLAYING" && turns < 2000) {
      const seat = (await snap(host)).view.current,
        p = active[seat],
        view = (await snap(p)).view;
      const plan = findRackMelds(view.draft.rack);
      let moved = false;
      if (
        view.players[seat].opened ||
        plan.reduce((n, m) => n + validateMeld(m)[0].score, 0) >= 30
      ) {
        for (const ids of plan) {
          await place(p, ids);
          moved = true;
        }
        if (view.players[seat].opened)
          for (const id of [...(await snap(p)).view.draft.rack]) {
            const target = (await snap(p)).view.draft.board.find(
              (m: any) => validateMeld([...m.tiles, id]).length,
            );
            if (target) {
              await place(p, [id], target.id);
              moved = true;
            }
          }
      }
      const version = (await snap(p)).version;
      await p
        .getByRole("button", {
          name: moved ? "确认出牌" : "摸牌并结束",
          exact: true,
        })
        .click();
      await Promise.all(
        active.map((pg) =>
          pg.waitForFunction(
            (version) =>
              JSON.parse((window as any).render_game_to_text()).version >
              version,
            version,
          ),
        ),
      );
      for (const pg of active) {
        const privateView = (await snap(pg)).view;
        if (privateView.phase === "PLAYING")
          assert.equal(
            privateView.players.filter((p: any) => p.rack).length,
            1,
          );
      }
      turns++;
    }
    const end = (await snap(host)).view;
    assert.equal(end.phase, "FINISHED");
    assert.equal(
      end.result.scores.reduce((a: number, b: number) => a + b, 0),
      0,
    );
    await shot(host, `xp-${count}-result`);
    const scores = end.players.map((p: any) => p.score),
      wins = end.players.map((p: any) => p.wins);
    await host.getByRole("button", { name: "下一局", exact: true }).click();
    await host.waitForFunction(
      () => JSON.parse((window as any).render_game_to_text()).view.game === 2,
    );
    const next = (await snap(host)).view;
    assert.equal(next.variant, "xp");
    assert.equal(next.poolCount, 160 - count * 14);
    assert.deepEqual(
      next.players.map((p: any) => p.score),
      scores,
    );
    assert.deepEqual(
      next.players.map((p: any) => p.wins),
      wins,
    );
    checks.push({
      name: `${count}-browser real UI full game and next game`,
      turns,
      blocked: end.result.blocked,
      scores,
      passed: true,
    });
    console.log(`XP_UI_PASS ${count} players ${turns} turns`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ checks, shots, errors }, null, 2),
  );
  console.log(
    `XP browsers PASS ${checks.length} checks ${shots.length} screenshots`,
  );
} finally {
  await browser.close();
  await stop();
}
