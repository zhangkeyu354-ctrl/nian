import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { viewForND, reduceND } from "../packages/naodong-scale/src/index.ts";
import type { NDFile } from "../apps/server/src/nd-rooms.ts";
import {
  ND_EVENTS as E,
  type NDAck,
  type NDSnapshot,
} from "../packages/shared/src/nd-protocol.ts";
import { until } from "./nd-test-harness.ts";

/** Uses two fresh OS processes and the actual main.ts integration, never a UI. */
export async function verifyNDProcessRecovery(original: NDFile) {
  const dir = mkdtempSync(join(tmpdir(), "nd-process-")),
    ndDir = join(dir, "nd");
  mkdirSync(ndDir);
  const saved = structuredClone(original);
  saved.createdAt = Date.now();
  saved.updatedAt = Date.now();
  assert.equal(saved.state!.phase, "REVEAL");
  assert.equal(saved.deadline, null);
  writeFileSync(join(ndDir, saved.code + ".json"), JSON.stringify(saved), {
    mode: 0o600,
  });
  let expected = saved.state!,
    child: ChildProcess | undefined,
    clients: Socket[] = [],
    stderr = "",
    packets = 0;
  const models = new Map([[saved.version, structuredClone(expected)]]);
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((r) => probe.close(() => r()));
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    WT_DISABLE: "1",
    ND_DATA_DIR: ndDir,
    DBD_DATA_DIR: join(dir, "dbd"),
    MA_DATA_DIR: join(dir, "ma"),
    DM_DATA_DIR: join(dir, "dm"),
    CN_DATA_DIR: join(dir, "cn"),
    SS_DATA_DIR: join(dir, "ss"),
    RK_DATA_DIR: join(dir, "rk"),
    RR_DATA_DIR: join(dir, "rr"),
    XB_DATA_DIR: join(dir, "xb"),
    DP_DATA_DIR: join(dir, "dp"),
  };
  function check(snapshot: NDSnapshot, seat: number) {
    assert.equal(snapshot.mySeat, seat);
    assert.ok(snapshot.players.every((p) => !("token" in p)));
    assert.ok(
      !("state" in snapshot) &&
        !("numbers" in snapshot) &&
        !("receipts" in snapshot),
    );
    const model = models.get(snapshot.version);
    assert.ok(model, "snapshot must have a known recovery version");
    assert.ok(
      JSON.stringify(snapshot.view) === JSON.stringify(viewForND(model, seat)),
      "fresh process projection must preserve the exact seat state",
    );
    packets++;
  }
  const ask = (socket: Socket, event: string, payload: object) =>
    new Promise<NDAck>((r, j) =>
      socket
        .timeout(8000)
        .emit(event, payload, (e: Error | null, a: NDAck) => (e ? j(e) : r(a))),
    );
  async function start() {
    stderr = "";
    child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/server/src/main.ts"],
      { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    child.stderr?.on("data", (data) => {
      stderr += String(data);
    });
    let ready = false;
    for (let i = 0; i < 240; i++) {
      if (child.exitCode !== null)
        throw Error("Test server exited: " + stderr.slice(0, 500));
      try {
        const health = await fetch(base + "/api/health");
        if (health.ok) {
          const body = (await health.json()) as { ndRooms: number };
          assert.equal(body.ndRooms, 1);
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(ready, "actual main server must start");
    clients = [];
    for (let i = 0; i < saved.players.length; i++) {
      const socket = connect(base, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      clients.push(socket);
      socket.on(E.update, (s: NDSnapshot) => check(s, i));
      await new Promise<void>((r, j) => {
        socket.once("connect", r);
        socket.once("connect_error", j);
      });
      const ack = await ask(socket, E.join, {
        code: saved.code,
        token: saved.players[i].token,
      });
      assert.ok(ack.ok, ack.error ?? "restart join failed");
      check(ack.snapshot!, i);
      assert.equal(ack.snapshot!.nextSeq, saved.seq[saved.players[i].id] + 1);
    }
  }
  async function stop() {
    clients.forEach((s) => s.disconnect());
    clients = [];
    if (child && child.exitCode === null && child.signalCode === null) {
      const owned = child;
      owned.kill();
      await until(
        () => owned.exitCode !== null || owned.signalCode !== null,
        "owned test server exit",
      );
    }
  }
  try {
    await start();
    await stop();
    await start();
    const captain = expected.captain;
    expected = reduceND(expected, {
      type: "REVEAL_NEXT",
      seat: captain,
      seq: expected.seq[captain] + 1,
    });
    models.set(saved.version + 1, expected);
    const ack = await ask(clients[captain], E.action, {
      code: saved.code,
      token: saved.players[captain].token,
      version: saved.version,
      seq: saved.seq[saved.players[captain].id] + 1,
      round: expected.round,
      action: { type: "REVEAL_NEXT" },
    });
    assert.ok(ack.ok, ack.error ?? "continue after process restart failed");
    check(ack.snapshot!, captain);
    const persisted = JSON.parse(
      readFileSync(join(ndDir, saved.code + ".json"), "utf8"),
    ) as NDFile;
    assert.ok(
      JSON.stringify(persisted.state) === JSON.stringify(expected),
      "continued reveal must persist after process restart",
    );
    assert.ok(
      !stderr.includes("MaxListenersExceededWarning"),
      "actual main server listener budget must cover enabled games",
    );
    return { processStarts: 2, packets, continuedReveals: 1 };
  } finally {
    await stop();
  }
}
