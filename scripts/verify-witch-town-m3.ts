import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import {
  WT_EVENTS as E,
  type WTRoomSnapshot,
} from "../packages/shared/src/wt-protocol.ts";
const base = "http://127.0.0.1:3401",
  data = mkdtempSync(join(tmpdir(), "wt-m3-net-"));
let server: ChildProcess | undefined;
const clients: Socket[] = [];
async function start() {
  server = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "3401",
        WT_ENABLE_DEV: "1",
        WT_ALLOW_CANDIDATE_COUNTS: "1",
        DBD_DATA_DIR: join(data, "dbd/rooms"),
        WT_DATA_DIR: join(data, "wt"),
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  server.stderr?.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("SERVER_NOT_READY");
}
async function stop() {
  if (server && !server.killed) {
    const done = new Promise<void>((r) => server!.once("exit", () => r()));
    server.kill();
    await done;
  }
  server = undefined;
}
async function connect() {
  const s = io(base, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  clients.push(s);
  await new Promise<void>((r, j) => {
    s.once("connect", () => r());
    s.once("connect_error", j);
  });
  return s;
}
async function raw(s: Socket, e: string, r: unknown) {
  return await new Promise<any>((resolve, reject) =>
    s
      .timeout(5000)
      .emit(e, r, (err: Error | null, a: any) =>
        err ? reject(err) : resolve(a),
      ),
  );
}
async function ok(s: Socket, e: string, r: unknown) {
  const a = await raw(s, e, r);
  assert.equal(a.ok, true, JSON.stringify(a));
  return a.data;
}
type Mode = "kill" | "protect" | "confess";
interface Case {
  n: number;
  mode: Mode;
  code: string;
  seats: { token: string; playerId: string }[];
  sockets: Socket[];
  watcher: Socket;
  victim: string;
  checkpoint: WTRoomSnapshot;
  serial: number;
  restarted: boolean;
}
const cases: Case[] = [];
let restarted = false;
function role(view: WTRoomSnapshot, id: string) {
  const players = view.view!.players,
    p = players.find((p) => p.id === id)!;
  if (p.character !== "martha_corey") return p.character;
  const i = players.indexOf(p);
  for (let step = 1; step < players.length; step++) {
    const q = players[(i - step + players.length) % players.length];
    if (q.alive) return q.character;
  }
  return p.character;
}
function black(v:WTRoomSnapshot){const p=v.view?.pending;assert(p?.kind==="black-event");return p;}
async function snapshots(c: Case) {
  return (await Promise.all(
    c.sockets.map((s, i) =>
      ok(s, E.join, { code: c.code, token: c.seats[i].token }),
    ),
  )) as WTRoomSnapshot[];
}
async function action(c: Case, i: number, a: any) {
  const v = await ok(c.sockets[i], E.join, {
    code: c.code,
    token: c.seats[i].token,
  });
  return (await ok(c.sockets[i], E.action, {
    code: c.code,
    request: { requestId: `m3_${c.serial++}`, version: v.version, action: a },
  })) as WTRoomSnapshot;
}
async function create(n: number, mode: Mode) {
  const host = await connect(),
    { code } = await ok(host, E.create, { capacity: n });
  const c: Case = {
    n,
    mode,
    code,
    seats: [],
    sockets: [host],
    watcher: await connect(),
    victim: "",
    checkpoint: null as any,
    serial: 0,
    restarted: false,
  };
  await ok(c.watcher, E.join, { code });
  for (let i = 0; i < n; i++) {
    if (i) c.sockets.push(await connect());
    c.seats.push(
      await ok(c.sockets[i], E.claim, { code, name: `M3-${n}-${i}` }),
    );
  }
  for (let i = 0; i < n; i++)
    await action(c, i, { type: "READY", ready: true });
  await action(c, 0, { type: "START" });
  let views = await snapshots(c),
    v = views[0];
  const cat = views.find(
    (x) => !["mary_warren", "martha_corey"].includes(role(x, x.mySeat!)),
  )!.mySeat!;
  for (let i = 0; i < n; i++)
    if (views[i].view!.private!.everWitch)
      v = await action(c, i, { type: "DAWN_TARGET", targetId: cat });
  for (let step = 0; step < 200; step++) {
    if (v.view!.pending?.kind === "ability") {
      const id = v.view!.pending.playerId;
      v = await action(
        c,
        c.seats.findIndex((p) => p.playerId === id),
        { type: "ABILITY_DECISION", use: false },
      );
      continue;
    }
    if (v.view!.phase === "day") {
      v = await action(
        c,
        c.seats.findIndex((p) => p.playerId === v.view!.turnPlayerId),
        { type: "DRAW" },
      );
      continue;
    }
    assert.equal(v.view!.phase, "black-event");
    const p = black(v);
    if (p.cardKind === "night") break;
    assert.equal(p.cardKind, "conspiracy");
    if (p.stage === "cat") {
      views = await snapshots(c);
      const target = views.find((x) => x.mySeat === v.view!.blackCatOwnerId)!,
        hidden = target.view!.private!.tryals.filter((t) => !t.revealed),
        safe = hidden.findIndex((t) => t.kind !== "witch");
      v = await action(
        c,
        c.seats.findIndex((p2) => p2.playerId === p.drawerId),
        { type: "CONSPIRACY_REVEAL", index: safe >= 0 ? safe : 0 },
      );
    } else
      for (let i = 0; i < n; i++)
        v = await action(c, i, { type: "CONSPIRACY_PICK", index: 0 });
  }
  assert.equal(black(v).cardKind, "night");
  views = await snapshots(c);
  const sheriff = views.find((x) =>
    x.view!.private!.tryals.some((t) => t.kind === "constable" && !t.revealed),
  )?.mySeat;
  const copiedJohn = v.view!.players.find(
    (p) => p.character === "martha_corey" && role(v, p.id) === "john_proctor",
  );
  c.victim =
    mode !== "protect" && copiedJohn
      ? copiedJohn.id
      : v.view!.players.find((p) => p.id !== sheriff)!.id;
  const witches = views
    .map((x, i) => (x.view!.private!.everWitch ? i : -1))
    .filter((i) => i >= 0);
  for (const i of witches)
    v = await action(c, i, { type: "NIGHT_TARGET", targetId: c.victim });
  if (black(v).stage === "constable") {
    const protectedId =
      mode === "protect"
        ? c.victim
        : v.view!.players.find((p) => p.id !== sheriff && p.id !== c.victim)!
            .id;
    v = await action(
      c,
      c.seats.findIndex((p) => p.playerId === sheriff),
      { type: "NIGHT_PROTECT", targetId: protectedId },
    );
  } else if (mode === "protect") {
    // A Conspiracy Cat may have publicly revealed the constable. This is a valid
    // inactive-role branch; use confession for protection, report it explicitly.
    c.mode = "confess";
  }
  assert.equal(black(v).stage, "confession");
  const noSecret = JSON.stringify(await ok(c.watcher, E.join, { code }));
  assert(!noSecret.includes("attackTargetId"));
  assert(!noSecret.includes('"votes":'));
  if (c.mode === "confess") {
    const i = c.seats.findIndex((p) => p.playerId === c.victim),
      self = await ok(c.sockets[i], E.join, { code, token: c.seats[i].token });
    const hidden = self.view.private.tryals.filter((t: any) => !t.revealed),
      safe = hidden.findIndex((t: any) => t.kind !== "witch");
    v = await action(c, i, { type: "CONFESS", index: safe >= 0 ? safe : 0 });
  }
  c.checkpoint = await ok(c.sockets[0], E.join, {
    code,
    token: c.seats[0].token,
  });
  cases.push(c);
  c.sockets[0].disconnect();
  c.sockets[0] = await connect();
  const refreshed = await ok(c.sockets[0], E.join, {
    code,
    token: c.seats[0].token,
  });
  assert.deepEqual(refreshed.view, c.checkpoint.view);
  if (!restarted) {
    await stop();
    for (const s of clients.splice(0)) s.disconnect();
    await start();
    c.sockets = [];
    for (let i = 0; i < n; i++) {
      const s = await connect();
      c.sockets.push(s);
      await ok(s, E.join, { code, token: c.seats[i].token });
    }
    c.watcher = await connect();
    await ok(c.watcher, E.join, { code });
    const resumed = await ok(c.sockets[0], E.join, {
      code,
      token: c.seats[0].token,
    });
    assert.deepEqual(resumed.view, c.checkpoint.view);
    c.restarted = true;
    restarted = true;
  }
  console.log("WT_M3_NIGHT_WAIT", n, c.mode);
}
try {
  try {
    await fetch(base + "/api/health");
    throw Error("PORT_IN_USE");
  } catch (e) {
    if ((e as Error).message === "PORT_IN_USE") throw e;
  }
  await start();
  for (let n = 4; n <= 12; n++)
    for (const mode of ["kill", "protect", "confess"] as const)
      await create(n, mode);
  for (let n = 4; n <= 12; n++)
    for (
      let retry = 0;
      !cases.some((c) => c.n === n && c.mode === "protect") && retry < 5;
      retry++
    )
      await create(n, "protect");
  for (let n = 4; n <= 12; n++)
    for (const mode of ["kill", "protect", "confess"])
      assert(cases.some((c) => c.n === n && c.mode === mode));
  const results: any[] = [];
  for (const c of cases) {
    let v: WTRoomSnapshot | undefined;
    for (let i = 0; i < 150; i++) {
      v = await ok(c.sockets[0], E.join, {
        code: c.code,
        token: c.seats[0].token,
      });
      assert(v);
      if (v.view!.checkRequired) throw Error(`RULE_BLOCKED ${c.n} ${c.mode}`);
      if (v.view!.log.some((e) => e.type === "NIGHT_TARGET_REVEALED")) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    assert(
      v!.view!.log.some((e) => e.type === "NIGHT_TARGET_REVEALED"),
      "server timer did not resolve night",
    );
    const alive = v!.view!.players.find((p) => p.id === c.victim)!.alive;
    assert.equal(alive, c.mode !== "kill");
    assert.equal(
      v!.view!.log.filter((e) => e.type === "NIGHT_TARGET_REVEALED").length,
      1,
    );
    results.push({
      players: c.n,
      mode: c.mode,
      automaticServerDeadline: true,
      victimAlive: alive,
      restartedDuringConfession: c.restarted,
      reconnectedDuringConfession: true,
      secretAttackHidden: true,
    });
  }
  mkdirSync("docs/witch-town/validation", { recursive: true });
  writeFileSync(
    "docs/witch-town/validation/protocol-m3.json",
    JSON.stringify(
      { cases: results, fullOriginalGameAcceptance: false, passed: true },
      null,
      2,
    ),
  );
  console.log("WT_M3_PROTOCOL_PASS", JSON.stringify(results));
} finally {
  for (const s of clients) s.disconnect();
  await stop();
}
