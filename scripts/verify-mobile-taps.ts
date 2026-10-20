import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, devices, type Page } from "playwright";
import { createGame, reduce } from "../packages/game-engine/src/index.ts";
import type { Command } from "../packages/shared/src/types.ts";
import { tapPhoneCommand } from "./mobile-ui-driver.ts";
import {
  assertFullBoardShot,
  assertUiShot,
  waitForBoardImages,
} from "./screenshot-check.ts";
const port = 3334,
  base = `http://127.0.0.1:${port}`,
  out = "output/mobile-implementation";
mkdirSync(out, { recursive: true });
let server: ChildProcess;
const browser = await chromium.launch();
const report: any[] = [];
const text = async (p: Page) =>
  JSON.parse(await p.evaluate(() => window.render_game_to_text()));
try {
  server = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        DBD_ALLOW_FIXED_SEED: "1",
        DBD_DATA_DIR: mkdtempSync(join(tmpdir(), "dbd-mobile-")),
      },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base + "/api/info")).ok) break;
    } catch {}
    assert(i < 200, "server ready");
    await new Promise((r) => setTimeout(r, 50));
  }
  for (const seed of [4111, 1701]) {
    const replay = JSON.parse(
      readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8"),
    );
    let state = createGame(replay.options);
    const contexts = [],
      pages: Page[] = [],
      errors: string[] = [],
      network: any[] = [],
      shots: any[] = [],
      trace: any[] = [];
    for (let i = 0; i < 5; i++) {
      const device = i % 2 ? "Pixel 7" : "iPhone 13";
      const ctx = await browser.newContext({ ...devices[device] });
      await ctx.addInitScript(() =>
        localStorage.setItem(
          "dbd-visual-settings",
          JSON.stringify({
            animations: false,
            art: true,
            sound: false,
            vibration: false,
          }),
        ),
      );
      const p = await ctx.newPage(),
        cdp = await ctx.newCDPSession(p);
      let http = 0,
        ws = 0;
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      cdp.on("Network.loadingFinished", (e) => {
        http += e.encodedDataLength;
      });
      cdp.on("Network.webSocketFrameReceived", (e) => {
        ws += Buffer.byteLength(e.response.payloadData);
      });
      cdp.on("Network.webSocketFrameSent", (e) => {
        ws += Buffer.byteLength(e.response.payloadData);
      });
      p.on("pageerror", (e) => errors.push(String(e)));
      p.on("response", (r) => {
        if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
      });
      network.push({
        device,
        measure: () => ({ http, websocket: ws, total: http + ws }),
      });
      contexts.push(ctx);
      pages.push(p);
    }
    const host = pages[0];
    const preset = [
      replay.options.mapId,
      ...replay.options.survivors,
      replay.options.killer,
    ].join(",");
    await host.goto(`${base}/?online=1&seed=${seed}&preset=${preset}`);
    await host.getByTestId("create-room").tap();
    await host.waitForURL(/room=/);
    const code = new URL(host.url()).searchParams.get("room")!;
    const seatOf = new Map<string, Page>(),
      seats = [...new Set(Object.values(state.actors).map((a) => a.ownerId))];
    for (let i = 0; i < 5; i++) {
      const p = pages[i];
      if (i) await p.goto(`${base}/?room=${code}`);
      await p.getByTestId("player-name").fill("手机" + (i + 1));
      await p.getByTestId("seat-" + seats[i]).tap();
      await p.getByTestId("mobile-dock").waitFor();
      seatOf.set(seats[i], p);
      await waitForBoardImages(p);
      await p.waitForLoadState("networkidle");
      const cold = network[i].measure();
      network[i].cold = cold;
      assert(
        cold.total <= 8 * 1024 * 1024,
        "cold total <=8MiB " + JSON.stringify(cold),
      );
    }
    const captured = new Set<string>();
    for (const [index, c] of (replay.commands as Command[]).entries()) {
      const owner = seatOf.get(state.actors[c.actorId!].ownerId)!;
      // Spectator dice close themselves; never tap another player's result.
      await owner
        .locator(".dice-overlay")
        .waitFor({ state: "hidden", timeout: 8000 });
      const stage = await owner
        .getByTestId("mobile-dock")
        .getAttribute("data-stage");
      if (stage && !captured.has(stage)) {
        shots.push(await assertUiShot(owner, `${out}/${seed}_${stage}.png`));
        captured.add(stage);
      }
      if (!captured.has("waiting")) {
        for (const p of pages)
          if ((await text(p)).online.waiting) {
            shots.push(await assertUiShot(p, `${out}/${seed}_waiting.png`));
            captured.add("waiting");
            break;
          }
      }
      const taps: string[] = [];
      await tapPhoneCommand(owner, c, (label) => taps.push(label));
      state = reduce(state, c);
      try {
        await Promise.all(
          pages.map((p) =>
            p.waitForFunction(
              (v) =>
                JSON.parse(window.render_game_to_text()).online?.version === v,
              index + 1,
              { timeout: 8000 },
            ),
          ),
        );
      } catch (e) {
        await owner.screenshot({ path: `${out}/FAILED_${seed}_${index}.png` });
        writeFileSync(
          `${out}/FAILED_${seed}_${index}.json`,
          JSON.stringify(
            {
              command: c,
              view: await text(owner),
              rects: await owner.locator("[data-room]").evaluateAll((els) =>
                els.map((el) => ({
                  id: el.getAttribute("data-room"),
                  rect: JSON.stringify(el.getBoundingClientRect()),
                })),
              ),
            },
            null,
            2,
          ),
        );
        throw e;
      }
      for (const p of pages)
        assert.equal((await text(p)).events, state.events.length);
      const submittedTaps = taps.length;
      const acknowledgementsBySeat = await Promise.all(
        pages.map(async (p, seat) => {
          let count = 0;
          for (
            let n = 0;
            n < 160 && (await p.locator(".dice-overlay").count());
            n++
          ) {
            const ack = p.getByTestId("ack-dice");
            if (await ack.count()) {
              if (!captured.has("dice")) {
                captured.add("dice");
                shots.push(await assertUiShot(p, `${out}/${seed}_dice.png`));
              }
              await ack.tap();
              count++;
            } else await p.waitForTimeout(50);
          }
          assert.equal(
            await p.locator(".dice-overlay").count(),
            0,
            "dice queue settled",
          );
          return { seat, count };
        }),
      );
      const acknowledgements = acknowledgementsBySeat.find(
        (a) => pages[a.seat] === owner,
      )!.count;
      const max =
        c.type === "PLAN"
          ? state.actors[c.actorId!].side === "killer"
            ? 3
            : 2
          : c.type === "MOVE"
            ? 1
            : c.type === "SETUP_REVEAL"
              ? 2
              : c.type === "SELECT" && Array.isArray(c.route)
                ? c.route.length + 1
                : c.type === "INTERACT"
                  ? 2
                  : c.type === "USE_PERK" ||
                      c.type === "PASS" ||
                      c.type === "END_TURN"
                    ? 1
                    : undefined;
      // Carry route and its subsequent mandatory dice acknowledgement are separate tasks (U-DICE).
      const measured =
        c.type === "INTERACT"
          ? submittedTaps + acknowledgements
          : submittedTaps;
      const row = {
        index,
        command: c,
        submittedTaps,
        diceAcknowledgements: acknowledgements,
        acknowledgementsBySeat,
        totalTaps: submittedTaps + acknowledgements,
        budget: max,
        budgetCount: measured,
        taps,
      };
      trace.push(row);
      writeFileSync(
        `${out}/${seed}_tap-trace.json`,
        JSON.stringify(trace, null, 2),
      );
      if (max !== undefined)
        assert(measured <= max, `tap budget failed ${JSON.stringify(row)}`);
      for (const p of pages) {
        const layout = await p.evaluate(() => ({
          scroll:
            document.documentElement.scrollHeight > innerHeight + 1 ||
            scrollY !== 0,
          dropdowns: [...document.querySelectorAll("select")].filter(
            (e) => e.getBoundingClientRect().width > 0,
          ).length,
          small: [...document.querySelectorAll("button:not(:disabled)")]
            .filter((e) => {
              const b = e.getBoundingClientRect();
              return (
                b.width > 0 && b.height > 0 && (b.width < 48 || b.height < 48)
              );
            })
            .map((e) => e.textContent),
        }));
        assert.equal(layout.scroll, false);
        assert.equal(layout.dropdowns, 0);
        assert.deepEqual(layout.small, []);
      }
      if (index === Math.floor(replay.commands.length / 2)) {
        const p = owner;
        for (const [name, viewport] of [
          ["portrait", { width: 390, height: 844 }],
          ["landscape", { width: 844, height: 390 }],
        ] as const) {
          await p.setViewportSize(viewport);
          await p.waitForTimeout(150);
          shots.push(
            await assertUiShot(p, `${out}/${seed}_${name}_midgame.png`),
          );
          await p.getByLabel("复位地图", { exact: true }).tap();
          await p.waitForTimeout(100);
          shots.push(
            await assertFullBoardShot(
              p,
              `${out}/${seed}_${name}_fullmap.png`,
              state.mapId === "macmillan_estate"
                ? { rooms: 11, routes: 22 }
                : { rooms: 10, routes: 19 },
            ),
          );
          await p.getByLabel("返回行动", { exact: true }).tap();
          await p.getByLabel("定位当前角色", { exact: true }).tap();
        }
        await p.setViewportSize({ width: 390, height: 844 });
      }
    }
    assert(state.winner);
    await assertUiShot(pages[0], `${out}/${seed}_results.png`);
    assert.deepEqual(errors, []);
    report.push({
      seed,
      commands: trace.length,
      winner: state.winner,
      devices: network.map((n) => ({ device: n.device, cold: n.cold })),
      trace,
      shots,
      errors,
    });
    writeFileSync(`${out}/mobile-taps.json`, JSON.stringify(report, null, 2));
    for (const ctx of contexts) await ctx.close();
    console.log("MOBILE_GAME_PASS", seed, trace.length, state.winner);
  }
} finally {
  await browser.close();
  server!?.kill();
}
console.log("MOBILE_TAPS_PASS");
