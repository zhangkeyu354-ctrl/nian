import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium, devices, type Locator, type Page } from "playwright";
import { io, type Socket } from "socket.io-client";
import { strict as assert } from "node:assert";
import { createGame, reduce } from "../packages/game-engine/src/index.ts";
import { EVENTS } from "../packages/shared/src/protocol.ts";
import {
  waitForBoardImages,
  pixelStats,
  assertUiShot,
} from "./screenshot-check.ts";
const BASE = "http://127.0.0.1:3344",
  dir = "docs/phase2d/audit";
mkdirSync(dir, { recursive: true });
const wanted = new Set([
  "plan_survivor",
  "plan_killer",
  "move",
  "reveal",
  "repair",
  "exit",
  "locker",
  "cleanse",
  "chest",
  "pallet",
  "attack",
  "pickup",
  "heal",
  "skill_use",
  "skill_skip",
  "end",
  "carry",
]);
const cases = JSON.parse(
  readFileSync("docs/phase2d/audit-cases.json", "utf8"),
).filter(
  (a: any) =>
    wanted.has(a.kind) &&
    (!process.argv[2] || process.argv.slice(2).includes(a.kind)),
);
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/main.ts"],
  {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "3344",
      DBD_ALLOW_FIXED_SEED: "1",
      DBD_DATA_DIR: "work/phase2d/audit-rooms",
    },
    stdio: "ignore",
  },
);
const browser = await chromium.launch();
const call = (s: Socket, ev: string, v: unknown) =>
  new Promise<any>((resolve, reject) => {
    s.timeout(8000).emit(ev, v, (err: unknown, res: any) =>
      err ? reject(err) : resolve(res),
    );
  });
const client = () => io(BASE, { transports: ["websocket"], forceNew: true });
const results: any[] = [];
const previousResults: any[] = process.argv[2]
  ? JSON.parse(
      readFileSync("docs/phase2d/操作审计记录.json", "utf8"),
    ).results.filter((x: any) => !cases.some((c: any) => c.kind === x.kind))
  : [];
const limits: Record<string, number> = {
  plan_survivor: 2,
  plan_killer: 3,
  move: 1,
  reveal: 2,
  repair: 2,
  exit: 2,
  locker: 2,
  cleanse: 2,
  chest: 2,
  pallet: 2,
  attack: 2,
  pickup: 2,
  heal: 2,
  skill_use: 1,
  skill_skip: 1,
  end: 1,
  carry: 2,
};
try {
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(BASE + "/api/info")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  for (const item of cases) {
    const sockets: Socket[] = [];
    const host = client();
    sockets.push(host);
    const made = await call(host, EVENTS.create, {
      ...item.options,
      playerCount: 5,
    });
    assert(made.ok);
    const code = made.code;
    let state = createGame(item.options);
    const players = new Map<string, { socket: Socket; token: string }>();
    for (const seat of new Set(
      Object.values(state.actors).map((a) => a.ownerId),
    )) {
      const s = client();
      sockets.push(s);
      await call(s, EVENTS.join, { code });
      const a = await call(s, EVENTS.claim, {
        code,
        seatId: seat,
        name: "审计测试座位",
      });
      assert(a.ok);
      players.set(seat, { socket: s, token: a.token });
    }
    for (const [version, c] of item.prefix.entries()) {
      const owner = players.get(state.actors[c.actorId].ownerId)!;
      const a = await call(owner.socket, EVENTS.command, {
        code,
        token: owner.token,
        version,
        command: c,
      });
      assert(a.ok, JSON.stringify(a));
      state = reduce(state, c);
    }
    const token = players.get(
      state.actors[item.command.actorId].ownerId,
    )!.token;
    const { defaultBrowserType, ...profile } = devices["iPhone 13"];
    const ctx = await browser.newContext(profile);
    await ctx.addInitScript(
      ({ code, token }) => localStorage.setItem("dbd-seat-" + code, token),
      { code, token },
    );
    const p = await ctx.newPage(),
      cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    let transferred = 0;
    const responseIds = new Set<string>();
    cdp.on("Network.responseReceived", (e) => {
      if (e.response.url.startsWith(BASE)) responseIds.add(e.requestId);
    });
    cdp.on("Network.loadingFinished", (e) => {
      if (responseIds.has(e.requestId)) transferred += e.encodedDataLength;
    });
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE + "/?room=" + code);
    await p.getByTestId("board").waitFor();
    await waitForBoardImages(p);
    await p.waitForLoadState("networkidle");
    const coldTransfer = transferred;
    const before = item.prefix.length;
    await p.waitForFunction(
      (n) => JSON.parse(window.render_game_to_text()).online?.version === n,
      before,
    );
    const trace: any[] = [];
    let scrolls = 0;
    let shot: any = null;
    const version = async () =>
      JSON.parse(await p.evaluate(() => window.render_game_to_text())).online
        .version;
    async function tap(
      el: Locator,
      position?: { x: number; y: number },
      suffix = "",
    ) {
      const old = await p.evaluate(() => scrollY);
      await el.scrollIntoViewIfNeeded();
      const now = await p.evaluate(() => scrollY);
      if (Math.abs(now - old) > 1) scrolls++;
      const box = (await el.boundingBox())!;
      const label =
        (await el.getAttribute("aria-label")) ||
        (await el.textContent()) ||
        (await el.getAttribute("data-prop")) ||
        (await el.getAttribute("data-actor"));
      const proof = await assertUiShot(p, `${dir}/${item.kind}${suffix}.png`);
      if (!suffix) shot = { file: `audit/${item.kind}.png`, ...proof };
      trace.push({
        kind: "tap",
        label: label?.trim().slice(0, 100),
        box: { width: box.width, height: box.height },
        scrollY: now,
      });
      await el.tap(position ? { position } : {});
      if (Math.abs((await p.evaluate(() => scrollY)) - now) > 1) scrolls++;
      await p.waitForTimeout(100);
    }
    async function commandButton() {
      const buttons = p.locator("[data-command]");
      const idx = await buttons.evaluateAll(
        (els, c) =>
          els.findIndex((el) => {
            const x = JSON.parse(el.getAttribute("data-command")!);
            return Object.entries(c).every(
              ([k, v]) => JSON.stringify(x[k]) === JSON.stringify(v),
            );
          }),
        item.command,
      );
      return idx < 0 ? null : buttons.nth(idx);
    }
    const c = item.command;
    let completed = false;
    let error = "";
    let commandTaps = 0;
    let acknowledgementTaps = 0;
    try {
      if (c.type === "PLAN") {
        for (const card of c.cards)
          await tap(p.locator(`[data-card="${card}"]`));
        await tap(p.getByTestId("confirm-plan"));
      } else if (c.type === "USE_PERK") {
        await tap(p.locator(`[data-perk="${c.perkId}"]`));
        for (const key of ["index", "targetId", "roomId", "pathId"]) {
          if (c[key] !== undefined) {
            const f = p.locator(`[data-field="${key}"]`);
            if (
              (await f.count()) &&
              (await f.inputValue()) !== String(c[key])
            ) {
              await tap(f);
              await f.selectOption(String(c[key]));
              trace.push({ kind: "native-select-confirmation", label: key });
            }
          }
        }
        await tap(p.getByTestId("submit-parameters"));
      } else if (c.type === "SELECT" && Array.isArray(c.route)) {
        for (const r of c.route)
          await tap(
            p.locator(
              `[data-carry-path="${r.pathId}"][data-carry-to="${r.to}"]`,
            ),
          );
        const dice = p.getByTestId("carry-dice");
        if ((await dice.inputValue()) !== String(c.dice)) {
          await tap(dice);
          await dice.selectOption(String(c.dice));
          trace.push({ kind: "native-select-confirmation", label: "dice" });
        }
        await tap(p.getByTestId("confirm-carry"));
      } else if (c.type === "MOVE" && c.to) {
        const el = p.locator(`[data-room="${c.to}"] > rect`);
        const box = (await el.boundingBox())!;
        await tap(el, { x: box.width / 2, y: Math.min(8, box.height / 3) });
      } else if (c.propId || c.targetId) {
        const id = c.propId ?? c.targetId;
        const target = p
          .locator(`[data-prop="${id}"],[data-actor="${id}"]`)
          .first();
        const room = await target.evaluate((el) =>
          el
            .closest("[data-room-container]")!
            .getAttribute("data-room-container")!,
        );
        const frame = p.locator(`[data-room="${room}"] > rect`);
        const b = (await frame.boundingBox())!;
        await tap(frame, { x: b.width / 2, y: Math.min(8, b.height / 3) });
        for (
          let attempt = 0;
          attempt < 4 && (await version()) === before;
          attempt++
        ) {
          const btn = await commandButton();
          if (btn) {
            await tap(btn);
            break;
          }
          await tap(target.locator(":scope > rect"));
        }
      } else {
        const button = await commandButton();
        assert(button);
        await tap(button);
      }
      await p.waitForFunction(
        (n) =>
          JSON.parse(window.render_game_to_text()).online.version === n + 1,
        before,
        { timeout: 5000 },
      );
      const next = reduce(state, c);
      assert.equal(
        JSON.parse(await p.evaluate(() => window.render_game_to_text())).events,
        next.events.length,
      );
      commandTaps = trace.length;
      await p.waitForTimeout(150);
      for (let ack = 0; ack < 30; ack++) {
        const dice = p.getByTestId("ack-dice"),
          feedback = p.getByTestId("ack-feedback");
        const button = (await dice.count())
          ? dice
          : (await feedback.count())
            ? feedback
            : null;
        if (!button) break;
        acknowledgementTaps++;
        await tap(button, undefined, "_feedback");
      }
      assert.equal(
        await p
          .locator('[data-testid="ack-dice"],[data-testid="ack-feedback"]')
          .count(),
        0,
      );
      completed = true;
    } catch (e) {
      error = String(e);
      if (!shot) {
        const png = await p.screenshot({ path: `${dir}/${item.kind}.png` });
        shot = {
          file: `audit/${item.kind}.png`,
          pixels: await pixelStats(p, png, {
            x: 0,
            y: 0,
            width: 390,
            height: 844,
          }),
        };
      }
    }
    const fonts = await p.locator(".room-label").evaluateAll((els) =>
      els.map((el) => {
        const m = (el as SVGGraphicsElement).getScreenCTM();
        return (
          parseFloat(getComputedStyle(el).fontSize) *
          (m ? Math.hypot(m.a, m.b) : 1)
        );
      }),
    );
    const taps = trace.length;
    const record = {
      kind: item.kind,
      seed: item.seed,
      prefixCommands: before,
      command: c,
      limit: limits[item.kind],
      taps,
      commandTaps,
      acknowledgementTaps,
      physicalTaps: trace.filter((x) => x.kind === "tap").length,
      nativeSelectConfirmations: trace.filter(
        (x) => x.kind === "native-select-confirmation",
      ).length,
      scrollRequired: scrolls > 0,
      scrollTransitions: scrolls,
      dropdownRequired: trace.some(
        (x) => x.kind === "native-select-confirmation",
      ),
      smallestTapTarget: Math.min(
        ...trace
          .filter((x) => x.box)
          .map((x) => Math.min(x.box.width, x.box.height)),
      ),
      roomLabelCssPixels: fonts[0] ?? null,
      completed,
      error,
      overLimit: taps > limits[item.kind],
      coldRoomTransferBytes: coldTransfer,
      screenshot: shot,
      trace,
      consoleErrors: errors,
    };
    results.push(record);
    writeFileSync(
      "docs/phase2d/操作审计记录.json",
      JSON.stringify(
        {
          device:
            "Playwright iPhone 13 descriptor in Chromium (390x844 CSS, touch, DPR 3), not physical Safari",
          base: "5b9683e",
          preparation:
            "Separate test server; original legal command prefix via authenticated protocol, then browser rejoined its own test seat. No game-state injection. Measured steps use touchscreen taps; native select confirmations counted separately. ScrollIntoView is recorded as page scrolling, not claimed to be a physical swipe. Command taps and dice/feedback acknowledgement taps are listed separately; taps includes both.",
          results: [...previousResults, ...results],
        },
        null,
        2,
      ),
    );
    console.log(
      "AUDIT",
      item.kind,
      taps,
      "scroll",
      scrolls,
      "complete",
      completed,
      error,
    );
    await ctx.close();
    for (const s of sockets) s.close();
  }
} finally {
  await browser.close();
  server.kill();
}
assert(
  results.every((x) => x.completed),
  "Some audit actions did not complete; inspect records",
);
