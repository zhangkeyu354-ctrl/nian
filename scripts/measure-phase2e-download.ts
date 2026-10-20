// Cold-entry measurement using the same HTTP + WS counters and five seats as Phase 2D.
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
const port = 3335,
  base = `http://127.0.0.1:${port}`,
  out = "docs/phase2e/evidence";
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
    report.push({
      seed,
      devices: network.map((n) => ({ device: n.device, cold: n.cold })),
      errors,
    });
    assert.deepEqual(errors, []);
    for (const ctx of contexts) await ctx.close();
  }
} finally {
  await browser.close();
  server!?.kill();
}
writeFileSync(`${out}/cold-download.json`, JSON.stringify(report, null, 2));
console.log("PHASE2E_COLD_PASS", JSON.stringify(report));
