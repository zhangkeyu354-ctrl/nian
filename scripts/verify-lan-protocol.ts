// 联机协议验收（不经过浏览器）：
// 1. 用 3 局固定种子回放，在真实服务器上由各座位各自提交命令，跑完完整对局
// 2. 每次收到的视图都必须与 viewFor(本地完整状态, 本座位) 完全一致 —— 证明服务器不会多发秘密
// 3. 越权操作、过期版本号、重复提交被拒绝；断线后用 token 重连回原座位；服务器重启后从存档恢复
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
import {
  createGame,
  reduce,
  viewFor,
  HIDDEN,
} from "../packages/game-engine/src/index.ts";
import { EVENTS, type RoomSnapshot } from "../packages/shared/src/protocol.ts";
import type { GameState } from "../packages/shared/src/types.ts";

const PORT = 3311;
const data = mkdtempSync(join(tmpdir(), "dbd-lan-"));
let server: ChildProcess | undefined;
async function startServer() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/api/info`);
    throw new Error("端口已被占用：有旧服务器仍在运行");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("端口")) throw e;
  }
  server = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: "127.0.0.1",
        DBD_ALLOW_FIXED_SEED: "1",
        DBD_DATA_DIR: data,
      },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/info`)).ok) return;
    } catch {}
    if (i > 200) throw new Error("服务器未启动");
    await new Promise((r) => setTimeout(r, 50));
  }
}
const emit = <T>(s: Socket, ev: string, payload: unknown) =>
  new Promise<T>((ok) => s.emit(ev, payload, ok));
function client() {
  const s = io(`http://127.0.0.1:${PORT}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  const views: RoomSnapshot[] = [];
  s.on(EVENTS.update, (v: RoomSnapshot) => views.push(v));
  return { s, views };
}
const waitFor = async (f: () => boolean, ms = 5000) => {
  const t = Date.now();
  while (!f()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
};

await startServer();
const report: unknown[] = [];
let leakChecks = 0;
for (const seed of [1701, 2903, 4111]) {
  const r = JSON.parse(
    readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8"),
  );
  const host = client();
  const created = await emit<any>(host.s, EVENTS.create, {
    // 2026-10-20 起房间默认走"选阵营/选角色"；按回放对照时用测试专用的固定配置
    preset: r.options,
    playerCount: 5,
  });
  assert(created.ok, JSON.stringify(created));
  const code = created.code as string;
  const joined = await emit<any>(host.s, EVENTS.join, { code });
  const seats = (joined.snapshot as RoomSnapshot).seats;
  assert.equal(seats.length, 5);
  assert.equal(joined.snapshot.view.seed, 0, "旁观视图不含种子");
  const players = new Map<
    string,
    { s: Socket; views: RoomSnapshot[]; token: string }
  >();
  for (const seat of seats) {
    const c = client();
    await emit(c.s, EVENTS.join, { code });
    const claim = await emit<any>(c.s, EVENTS.claim, {
      code,
      seatId: seat.seatId,
      name: seat.seatId,
    });
    assert(claim.ok);
    players.set(seat.seatId, { ...c, token: claim.token });
  }
  // 同一座位不能被第二个人抢走
  const thief = client();
  const steal = await emit<any>(thief.s, EVENTS.claim, {
    code,
    seatId: seats[0].seatId,
    name: "x",
  });
  assert.equal(steal.code, "SEAT_TAKEN");
  thief.s.close();

  let full: GameState = createGame(r.options);
  let rejected = 0;
  for (const [i, c] of (r.commands as any[]).entries()) {
    const ownerSeat = full.actors[c.actorId].ownerId;
    const owner = players.get(ownerSeat)!;
    // 越权：让另一个座位提交这条命令，必须被拒绝
    if (i % 17 === 0) {
      const other = [...players.entries()].find(([k]) => k !== ownerSeat)!;
      const bad = await emit<any>(other[1].s, EVENTS.command, {
        code,
        token: other[1].token,
        version: i,
        command: c,
      });
      assert.equal(bad.code, "NOT_YOUR_ACTOR");
      rejected++;
    }
    const before = owner.views.length;
    const ok = await emit<any>(owner.s, EVENTS.command, {
      code,
      token: owner.token,
      version: i,
      command: c,
    });
    assert(
      ok.ok,
      `命令 ${i} 被拒绝：${JSON.stringify(ok)} ${JSON.stringify(c)}`,
    );
    const version = i;
    full = reduce(full, c);
    // 重复提交（同一版本号）必须被拒绝
    if (i % 23 === 0) {
      const dup = await emit<any>(owner.s, EVENTS.command, {
        code,
        token: owner.token,
        version,
        command: c,
      });
      assert.equal(dup.code, "STALE");
      rejected++;
    }
    await waitFor(() =>
      [...players.values()].every((p) => p.views.at(-1)?.version === i + 1),
    );
    for (const [seatId, p] of players) {
      const got = p.views.at(-1)!;
      assert.equal(got.mySeat, seatId);
      assert.deepEqual(
        got.view,
        viewFor(full, seatId),
        `座位 ${seatId} 收到的视图与应得视图不一致（命令 ${i}，版本 ${got.version}/${full.events.length}）`,
      );
      leakChecks++;
    }
    void before;
  }
  assert.equal(full.winner, r.result?.winner ?? full.winner);
  // 重连：关闭杀手的连接，用 token 重新加入
  const killerSeat = full.actors[full.killerId].ownerId;
  const k = players.get(killerSeat)!;
  k.s.close();
  const again = client();
  const back = await emit<any>(again.s, EVENTS.join, { code, token: k.token });
  assert.equal(back.snapshot.mySeat, killerSeat, "断线重连回到原座位");
  assert.deepEqual(back.snapshot.view, viewFor(full, killerSeat));
  // 杀手视图中，计划阶段逃生者的牌一律隐藏（抽查最后状态）
  for (const [id, cards] of Object.entries(
    back.snapshot.view.plans as Record<string, string[]>,
  ))
    if (id !== full.killerId && !full.publicPlans.includes(id))
      for (const [i, card] of cards.entries())
        if (
          !full.events.some(
            (e) =>
              e.type === "TURN_START" &&
              e.data.actorId === id &&
              e.data.index === i,
          )
        )
          assert.equal(card, HIDDEN);
  report.push({
    seed,
    code,
    commands: r.commands.length,
    winner: full.winner,
    events: full.events.length,
    rejectedAsExpected: rejected,
  });
  again.s.close();
  host.s.close();
  for (const p of players.values()) p.s.close();
}

// 服务器重启后，房间从存档恢复到同一状态
const lastCode = (report.at(-1) as any).code;
server!.kill();
await new Promise((r) => setTimeout(r, 300));
await startServer();
const after = client();
const restored = await emit<any>(after.s, EVENTS.join, { code: lastCode });
assert(restored.ok, "重启后房间仍然存在");
assert.equal(
  restored.snapshot.version,
  (report.at(-1) as any).commands,
  "重启后状态一致",
);
assert.equal(
  restored.snapshot.view.events.length,
  (report.at(-1) as any).events,
);
after.s.close();
server!.kill();

mkdirSync("output/lan", { recursive: true });
writeFileSync(
  "output/lan/协议验收.json",
  JSON.stringify(
    { games: report, viewEqualityChecks: leakChecks, restartRestore: true },
    null,
    2,
  ),
);
console.log(
  "LAN_PROTOCOL_PASS",
  JSON.stringify(report),
  "view checks",
  leakChecks,
);
// Let libuv close socket and child-process handles before exiting on Windows.
process.exitCode = 0;

