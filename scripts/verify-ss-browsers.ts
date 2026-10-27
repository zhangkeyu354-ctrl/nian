// Real pages at /?game=ss; ordinary play uses DOM clicks, never a privileged test command.
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { SSRoom } from "../apps/server/src/ss-rooms.ts";
import {
  createSS,
  reduceSS,
  viewForSS,
  type SSState,
} from "../packages/soda-smugglers/src/index.ts";
import {
  SS_EVENTS as E,
  type SSSnapshot,
  type SSAction,
} from "../packages/shared/src/ss-protocol.ts";
import { nextSSAction } from "./ss-test-driver.ts";
import { assertUiShot } from "./screenshot-check.ts";
const root = mkdtempSync(join(tmpdir(), "ss-browsers-"));
const data = join(root, "ss");
mkdirSync(data);
const out = "docs/soda-smugglers/verification";
mkdirSync(out, { recursive: true });
const finder = createServer();
await new Promise<void>((r) => finder.listen(0, "127.0.0.1", r));
const port = (finder.address() as any).port;
await new Promise<void>((r) => finder.close(() => r()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined, browser: Browser | undefined;
let logs = "";
const errors: string[] = [];
const checks: string[] = [];
const games: {
  players: number;
  events: boolean;
  rounds: number;
  commands: number;
  frames: number;
}[] = [];
let networkChecks = 0,
  domChecks = 0;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
        SS_DATA_DIR: data,
        SS_ALLOW_FIXED_SEED: "1",
        DBD_DATA_DIR: join(root, "dbd"),
        RK_DATA_DIR: join(root, "rk"),
        DM_DATA_DIR: join(root, "dm"),
        MA_DATA_DIR: join(root, "ma"),
        CN_DATA_DIR: join(root, "cn"),
        RR_DATA_DIR: join(root, "rr"),
        XB_DATA_DIR: join(root, "xb"),
        DP_DATA_DIR: join(root, "dp"),
        WT_DISABLE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout!.on("data", (b) => (logs += b));
  child.stderr!.on("data", (b) => (logs += b));
  for (let i = 0; i < 200; i++) {
    try {
      const h = await fetch(base + "/api/health").then((r) => r.json());
      if (typeof h.ssRooms === "number") return;
    } catch {}
    if (child.exitCode !== null) throw Error("server exited");
    await delay(50);
  }
  throw Error("server startup timeout");
}
async function stop() {
  if (child && child.exitCode === null) {
    const p = child;
    const done = new Promise<void>((r) => p.once("exit", () => r()));
    p.kill();
    await done;
  }
}
const normal = (v: unknown) => JSON.parse(JSON.stringify(v));
const snapshot = (p: Page) =>
  p.evaluate(() =>
    JSON.parse(window.render_game_to_text?.() ?? "null"),
  ) as Promise<SSSnapshot>;
const tokens = (contexts: BrowserContext[], code: string) =>
  Promise.all(
    contexts.map((c) =>
      c.pages()[0].evaluate((code) => localStorage.getItem("ss:" + code), code),
    ),
  );
async function waitVersion(pages: Page[], version: number) {
  await Promise.all(
    pages.map((p) =>
      p.waitForFunction(
        (version) =>
          JSON.parse(window.render_game_to_text?.() ?? "null")?.version >=
          version,
        version,
      ),
    ),
  );
}
async function clickChanged(p: Page, id: string) {
  const before = (await snapshot(p))?.version ?? -1;
  await p.getByTestId(id).click();
  await p.waitForFunction(
    (version) =>
      JSON.parse(window.render_game_to_text?.() ?? "null")?.version > version,
    before,
  );
}
async function reject(
  p: Page,
  code: string,
  token: string,
  action: object,
  overrides: object = {},
) {
  const s = await snapshot(p);
  return p.evaluate(
    async ({ code, token, s, action, overrides }) => {
      const w = window as any;
      if (!w.io) {
        await new Promise<void>((resolve, reject) => {
          const e = document.createElement("script");
          e.src = "/socket.io/socket.io.js";
          e.onload = () => resolve();
          e.onerror = reject;
          document.head.append(e);
        });
      }
      const socket = w.io({ transports: ["websocket"], reconnection: false });
      await new Promise<void>((r) => socket.on("connect", r));
      const ask = (event: string, data: object) =>
        new Promise<any>((r, j) =>
          socket
            .timeout(5000)
            .emit(event, data, (e: any, a: any) => (e ? j(e) : r(a))),
        );
      try {
        await ask("ss:join", { code, token });
        return await ask("ss:action", {
          code,
          token,
          version: s.version,
          seq: s.nextSeq,
          round: s.view?.round,
          action,
          ...overrides,
        });
      } finally {
        socket.disconnect();
      }
    },
    { code, token, s, action, overrides },
  );
}
function snapshotsFromFrame(raw: string): SSSnapshot[] {
  const ix = raw.indexOf("[");
  if (ix < 0 || !/^4[23]/.test(raw)) return [];
  try {
    const a = JSON.parse(raw.slice(ix));
    if (a[0] === "ss:update") return [a[1]];
    return a.filter((x: any) => x?.snapshot).map((x: any) => x.snapshot);
  } catch {
    return [];
  }
}
async function execute(p: Page, a: SSAction) {
  switch (a.type) {
    case "SUBMIT":
      for (const id of [...a.luggage, a.bribe])
        await p.getByTestId("ss-card-" + id).click();
      await clickChanged(p, "ss-submit");
      break;
    case "ACCEPT":
      await clickChanged(
        p,
        `${a.useEvent ? "ss-event-accept" : "ss-accept"}-${a.target}`,
      );
      break;
    case "INSPECT":
      await clickChanged(
        p,
        a.useEvent && a.index === undefined
          ? `ss-dog-${a.target}`
          : `${a.useEvent ? "ss-event-inspect" : "ss-inspect"}-${a.target}-${a.index}`,
      );
      break;
    case "REVEAL_DOG":
      await clickChanged(p, `ss-reveal-dog-${a.index}`);
      break;
    case "ARREST":
      await clickChanged(
        p,
        `${a.useEvent ? "ss-event-arrest" : "ss-arrest"}-${a.target}`,
      );
      break;
    case "GREEDY":
      await clickChanged(p, "ss-greedy");
      break;
    case "ADVANCE":
      await clickChanged(p, "ss-advance");
      break;
    case "NEXT_ROUND":
      await clickChanged(p, "ss-next-round");
      break;
    default:
      throw Error("unsupported browser command");
  }
}
try {
  await start();
  browser = await chromium.launch({ headless: true });
  for (const n of [3, 5, 8])
    for (const events of [false, true]) {
      const contexts: BrowserContext[] = [],
        pages: Page[] = [],
        frames: string[][] = [];
      const oracles = new Map<number, unknown[]>();
      let cursors: number[] = [];
      for (let i = 0; i < n; i++) {
        const c = await browser.newContext({
          viewport:
            i % 2 ? { width: 844, height: 390 } : { width: 390, height: 844 },
        });
        contexts.push(c);
        await c.addInitScript("window.__name = f => f;");
        const p = await c.newPage();
        p.setDefaultTimeout(12000);
        pages.push(p);
        frames[i] = [];
        cursors[i] = 0;
        p.on("pageerror", (e) => errors.push(String(e)));
        p.on("websocket", (w) =>
          w.on("framereceived", (f) => frames[i].push(String(f.payload))),
        );
      }
      await pages[0].goto(base + "/?game=ss");
      await pages[0].getByTestId("ss-name").fill("十字长名字联机验收一");
      await pages[0].getByTestId("ss-create").click();
      await pages[0].getByTestId("ss-count").waitFor();
      const code = (await snapshot(pages[0])).code;
      if (n !== 3) {
        await pages[0].getByTestId("ss-count").selectOption(String(n));
        await pages[0].waitForFunction(
          (n) =>
            JSON.parse(window.render_game_to_text?.() ?? "null").count === n,
          n,
        );
      }
      assert.equal((await snapshot(pages[0])).events, false);
      assert.equal((await snapshot(pages[0])).seconds, 0);
      await clickChanged(pages[0], "ss-random-guard");
      assert.equal((await snapshot(pages[0])).firstGuard, "random");
      await pages[0].getByTestId("ss-first-guard").selectOption("0");
      await pages[0].waitForFunction(
        () =>
          JSON.parse(window.render_game_to_text?.() ?? "null").firstGuard === 0,
      );
      for (const seconds of [60, 120, 0]) {
        await pages[0].getByTestId("ss-seconds").selectOption(String(seconds));
        await pages[0].waitForFunction(
          (seconds) =>
            JSON.parse(window.render_game_to_text?.() ?? "null").seconds ===
            seconds,
          seconds,
        );
      }
      if (events) {
        await clickChanged(pages[0], "ss-events");
        await pages[0].waitForFunction(
          () =>
            JSON.parse(window.render_game_to_text?.() ?? "null").events ===
            true,
        );
      }
      for (let i = 1; i < n; i++) {
        await pages[i].goto(base + "/?game=ss&room=" + code);
        await pages[i].getByTestId("ss-claim").waitFor();
        await pages[i].getByTestId("ss-name").fill(`旅客${i}`);
        await pages[i].getByTestId("ss-claim").click();
        await pages[i].getByTestId("ss-ready").waitFor();
      }
      const allTokens = await tokens(contexts, code);
      assert(allTokens.every(Boolean));
      const audit = async () => {
        const file = JSON.parse(
          readFileSync(join(data, code + ".json"), "utf8"),
        ) as import("../apps/server/src/ss-rooms.ts").SSFile;
        if (file.state)
          oracles.set(
            file.version,
            Array.from({ length: n }, (_, i) =>
              normal(viewForSS(file.state!, i)),
            ),
          );
        for (let i = 0; i < n; i++) {
          for (; cursors[i] < frames[i].length; cursors[i]++) {
            const raw = frames[i][cursors[i]];
            for (let j = 0; j < n; j++)
              if (j !== i)
                assert(
                  !raw.includes(allTokens[j]!),
                  "foreign seat token leaked",
                );
            for (const packet of snapshotsFromFrame(raw)) {
              if (packet.code !== code || !packet.view) continue;
              const expected = oracles.get(packet.version);
              assert(expected, `missing oracle version ${packet.version}`);
              assert.deepEqual(
                normal(packet.view),
                expected[i],
                `network projection seat ${i} version ${packet.version}`,
              );
              networkChecks++;
            }
          }
          const s = await snapshot(pages[i]);
          if (!s.view) continue;
          const html = await pages[i].locator(".ss-world").innerHTML();
          for (let j = 0; j < n; j++)
            if (j !== i) {
              assert(
                (!html.includes("SS0-") &&
                  !html.includes("SS1-") &&
                  !html.includes("SS2-") &&
                  !html.includes("SS3-")) ||
                  i !== s.view.guard,
                "guard DOM exposes card IDs",
              );
              const text = await pages[i]
                .getByTestId(`ss-seat-${j}`)
                .textContent();
              if (j !== s.view.guard)
                for (const card of s.view.players[j].luggage)
                  if (card === null) assert(text?.includes("🔒"));
              assert.equal(s.view.players[j].hand, undefined);
              const secret: SSState["players"][number] | undefined =
                file.state?.players[j];
              if (secret) {
                const hidden: string[] = [
                  ...secret.hand,
                  ...secret.luggage.filter(
                    (_: string, k: number) =>
                      !secret.settled && !secret.revealed.includes(k),
                  ),
                  ...(file.state?.phase === "PACK" && secret.bribe
                    ? [secret.bribe]
                    : []),
                ];
                for (const id of hidden)
                  assert(
                    !new RegExp(`\\b${id}\\b`).test(html),
                    "foreign secret card ID in DOM",
                  );
              }
            }
          domChecks++;
        }
      };
      for (let i = 0; i < n; i++) await clickChanged(pages[i], "ss-ready");
      await clickChanged(pages[0], "ss-start");
      await waitVersion(pages, (await snapshot(pages[0])).version);
      await audit();
      // Deliberately bypass disabled controls to verify server-side denial through real WS.
      for (const action of [
        { type: "TIMEOUT" },
        { type: "ADVANCE", actor: "server" },
        { type: "ADVANCE", now: 0 },
        { type: "ADVANCE" },
      ]) {
        const a = await reject(pages[1], code, allTokens[1]!, action);
        assert.equal(a.ok, false);
        checks.push("server rejects forged/out-of-turn browser command");
      }
      const a = await reject(pages[1], code, allTokens[1]!, {
        type: "SET_SETTINGS",
        events: !events,
      });
      assert.equal(a.ok, false);
      checks.push("browser non-host settings rejected");
      await audit();
      let reconnected = false,
        commands = 0;
      while ((await snapshot(pages[0])).view!.phase !== "FINISHED") {
        const snaps = await Promise.all(pages.map(snapshot));
        const cmd = nextSSAction(snaps)!;
        await execute(pages[cmd.seat], cmd.action);
        const current = await snapshot(pages[cmd.seat]);
        await waitVersion(pages, current.version);
        await audit();
        if (!reconnected && cmd.action.type === "SUBMIT") {
          const i = cmd.seat;
          const locked = normal(
            (await snapshot(pages[i])).view!.players[i].luggage,
          );
          await contexts[i].setOffline(true);
          await pages[i].getByText("重连中…", { exact: true }).waitFor();
          await contexts[i].setOffline(false);
          await pages[i].reload();
          await pages[i].waitForFunction(
            () =>
              !!JSON.parse(window.render_game_to_text?.() ?? "null")?.mySeat,
          );
          assert.deepEqual(
            normal((await snapshot(pages[i])).view!.players[i].luggage),
            locked,
          );
          checks.push("offline/reload token reconnect keeps secret choice");
          reconnected = true;
          await audit();
        }
        assert(++commands < 500, "browser game stuck");
        await delay(30);
      }
      await assertUiShot(
        pages[0],
        `output/playwright/ss-stage3-${n}-${events ? "events" : "base"}-result.png`,
      );
      await audit();
      games.push({
        players: n,
        events,
        rounds: (await snapshot(pages[0])).view!.round,
        commands,
        frames: frames.reduce((a, b) => a + b.length, 0),
      });
      console.log("SS_BROWSER_GAME_PASS", n, events, commands);
      for (const c of contexts) await c.close();
    }
  // Production main.ts timeout after restoration: shortened persisted deadline, no test-time API in server.
  await stop();
  const f = SSRoom.create("TIME", data);
  const claims = Array.from({ length: 3 }, (_, i) => f.claim(`计时${i}`));
  let state = createSS(["计时0", "计时1", "计时2"], {
    seed: 1,
    seconds: 60,
    now: Date.now(),
  });
  const h = state.players[1].hand;
  state = reduceSS(state, {
    type: "SUBMIT",
    actor: 1,
    seq: 1,
    now: Date.now(),
    luggage: h.slice(0, 2),
    bribe: h[2],
  });
  state.deadline = Date.now() + 15000;
  f.file.state = state;
  f.file.seconds = 60;
  f.save();
  const locked = normal(state.players[1].luggage);
  await start();
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(
    ({ code, token }) => localStorage.setItem("ss:" + code, token),
    { code: "TIME", token: claims[1].token },
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(base + "/?game=ss&room=TIME");
  await p.waitForFunction(
    () =>
      JSON.parse(window.render_game_to_text?.() ?? "null")?.view?.phase ===
      "PACK",
  );
  const resumed = await snapshot(p);
  assert.deepEqual(
    resumed.view!.players[1].luggage.map((c) => c!.id),
    locked,
  );
  await p.waitForFunction(
    () =>
      JSON.parse(window.render_game_to_text?.() ?? "null").view.phase ===
      "BRIBE",
    {},
    { timeout: 25000 },
  );
  assert.deepEqual(
    (await snapshot(p)).view!.players[1].luggage.map((c) => c!.id),
    locked,
  );
  checks.push(
    "main server restored deadline auto-fills missing choice, keeps submitted bag",
  );
  await assertUiShot(p, "output/playwright/ss-stage3-timeout.png");
  await c.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    join(out, "stage3-browsers.json"),
    JSON.stringify(
      {
        games,
        gameCount: games.length,
        checks,
        passed: checks.length,
        failed: 0,
        networkChecks,
        domChecks,
        pageErrors: errors,
        screenshots: "output/playwright/ss-stage3-*.png",
        timeoutFixture:
          "persisted deadline shortened to 15s; production server API unchanged",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "SS_BROWSERS_PASS",
    JSON.stringify({
      games: games.length,
      checks: checks.length,
      networkChecks,
      domChecks,
    }),
  );
} finally {
  await browser?.close();
  await stop();
  if (errors.length) console.error("SS_PAGE_ERRORS", errors);
  writeFileSync(join(root, "server.log"), logs);
}
