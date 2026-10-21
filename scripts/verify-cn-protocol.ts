// 行动代号联机协议验收（不经过浏览器，5 个独立 socket 客户端，真实服务器进程）
// 计时缩短为 提示 3 秒 / 猜词 4 秒 / 加时 2 秒（CN_TIMING），用来验证服务器自动超时。
// 覆盖：建房、加队、随机/自选队长、隐私（队员收不到未揭晓身份）、N+1、0/∞、超时自动换边、
//      加时 +N 秒且只能一次、多人同时点、重复提交、刷新重连、服务器重启后恢复、再来一局。
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
import { CN_EVENTS, type CNRoomSnapshot } from "../packages/shared/src/cn-protocol.ts";
import type { Team } from "../packages/codenames/src/types.ts";

const PORT = 3321;
const data = mkdtempSync(join(tmpdir(), "cn-proto-"));
const TIMING = { clue: 3, guess: 4, extra: 2 };
let server: ChildProcess | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function startServer() {
  server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DBD_DATA_DIR: join(data, "dbd"),
      CN_DATA_DIR: join(data, "cn"),
      CN_TIMING: `${TIMING.clue},${TIMING.guess},${TIMING.extra}`,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return;
    } catch {}
    if (i > 300) throw new Error("服务器未启动");
    await sleep(50);
  }
}
async function stopServer() {
  if (!server) return;
  const s = server;
  server = undefined;
  await new Promise<void>((ok) => {
    s.once("exit", () => ok());
    s.kill();
  });
}

interface Client {
  name: string;
  s: Socket;
  token: string;
  last: () => CNRoomSnapshot;
  all: CNRoomSnapshot[];
}
const emit = <T>(s: Socket, ev: string, payload: unknown) => new Promise<T>((ok) => s.emit(ev, payload, ok));
function sock() {
  return io(`http://127.0.0.1:${PORT}`, { transports: ["websocket"], forceNew: true });
}
async function joinAs(code: string, name: string, token?: string): Promise<Client> {
  const s = sock();
  const all: CNRoomSnapshot[] = [];
  s.on(CN_EVENTS.update, (v: CNRoomSnapshot) => all.push(v));
  await new Promise((ok) => s.on("connect", () => ok(null)));
  if (!token) {
    const r = await emit<any>(s, CN_EVENTS.claim, { code, name });
    assert.ok(r.ok, "加入失败 " + r.error);
    token = r.token;
  }
  const j = await emit<any>(s, CN_EVENTS.join, { code, token });
  assert.ok(j.ok);
  all.push(j.snapshot);
  return { name, s, token: token!, all, last: () => all[all.length - 1] };
}
const lobby = (c: Client, code: string, action: unknown) => emit<any>(c.s, CN_EVENTS.lobby, { code, token: c.token, action });
const command = (c: Client, code: string, cmd: unknown, version = c.last().version) =>
  emit<any>(c.s, CN_EVENTS.command, { code, token: c.token, version, command: cmd });
async function settle() {
  await sleep(150);
}

const results: string[] = [];
const pass = (msg: string) => {
  results.push("✔ " + msg);
  console.log("✔", msg);
};

async function main() {
  await startServer();
  const host = sock();
  await new Promise((ok) => host.on("connect", () => ok(null)));
  const created = await emit<any>(host, CN_EVENTS.create, {});
  const code: string = created.code;
  host.close();
  pass(`建房成功，房间号 ${code}`);

  const names = ["红甲", "红乙", "红丙", "蓝甲", "蓝乙"];
  const cs: Client[] = [];
  for (const n of names) cs.push(await joinAs(code, n));
  const [r1, r2, r3, b1, b2] = cs;
  for (const c of [r1, r2, r3]) assert.ok((await lobby(c, code, { type: "JOIN_TEAM", team: "red" })).ok);
  for (const c of [b1, b2]) assert.ok((await lobby(c, code, { type: "JOIN_TEAM", team: "blue" })).ok);
  await settle();
  assert.equal(r1.last().players.find((p) => p.host)?.name, "红甲");
  assert.ok(!(await lobby(r2, code, { type: "START" })).ok, "非房主不能开始");
  pass("5 人加入并分队；只有房主能开始");

  // ---------- 自选队长 ----------
  assert.ok((await lobby(r1, code, { type: "SET_MODE", mode: "pick" })).ok);
  let r = await lobby(r1, code, { type: "START" });
  assert.equal(r.ok, false);
  assert.match(r.error, /队长/);
  assert.ok((await lobby(r2, code, { type: "CLAIM_CAPTAIN" })).ok);
  r = await lobby(r3, code, { type: "CLAIM_CAPTAIN" });
  assert.equal(r.ok, false, "同队第二人不能当队长");
  assert.ok((await lobby(b2, code, { type: "CLAIM_CAPTAIN" })).ok);
  assert.ok((await lobby(r1, code, { type: "START" })).ok);
  await settle();
  let v = r1.last().view!;
  assert.equal(v.captains.red, r2.last().mySeat);
  assert.equal(v.captains.blue, b2.last().mySeat);
  pass("自选队长：没有队长不能开局，同队只能 1 名队长，开局后队长为报名者");

  // ---------- 隐私（线上实际收到的数据） ----------
  const roleCount = (c: Client) => c.last().view!.cards.filter((x) => "role" in x).length;
  assert.equal(roleCount(r2), 25);
  assert.equal(roleCount(b2), 25);
  for (const c of [r1, r3, b1]) {
    assert.equal(roleCount(c), 0);
    for (const snap of c.all) if (snap.view) assert.ok(!JSON.stringify(snap.view).includes("assassin"));
  }
  const raw = JSON.stringify(r1.last());
  assert.ok(!/seed/.test(raw), "不发送种子");
  pass("隐私：两名队长收到 25 张身份；3 名队员收到的所有数据里没有任何未揭晓身份/刺客/种子");

  const roles = r2.last().view!.cards.map((c) => c.role!);
  const capOf = (t: Team) => (t === "red" ? r2 : b2);
  const opOf = (t: Team) => {
    const id = r1.last().view!.operators[t];
    return cs.find((c) => c.last().mySeat === id)!;
  };
  const find = (role: string) => roles.findIndex((x, i) => x === role && !r1.last().view!.cards[i].revealed);
  let turn = v.turn;
  const enemy = (t: Team): Team => (t === "red" ? "blue" : "red");

  // ---------- 非法线索 / 越权 ----------
  r = await command(capOf(turn), code, { type: "GIVE_CLUE", word: v.cards[0].word, number: 1 });
  assert.equal(r.ok, false);
  assert.match(r.error, /桌面上/);
  r = await command(opOf(turn), code, { type: "GIVE_CLUE", word: "联想", number: 1 });
  assert.equal(r.ok, false);
  pass("服务器拒绝桌面词线索、拒绝队员代替队长出线索");

  // ---------- N+1 ----------
  assert.ok((await command(capOf(turn), code, { type: "GIVE_CLUE", word: "联想", number: 1 })).ok);
  await settle();
  assert.equal(r1.last().view!.phase, "guess");
  // 队长不能翻；对方不能翻
  assert.equal((await command(capOf(turn), code, { type: "REVEAL", index: find(turn) })).ok, false);
  assert.equal((await command(opOf(enemy(turn)), code, { type: "MARK", index: find(turn) })).ok, false);
  // 结束猜词前至少翻一张
  assert.equal((await command(opOf(turn), code, { type: "END_GUESSING" })).ok, false);
  // 多人同时点：同一版本号的两条命令只有一条成功
  const op = opOf(turn);
  const ver = op.last().version;
  const i1 = find(turn);
  const [a, b] = await Promise.all([
    command(op, code, { type: "REVEAL", index: i1 }, ver),
    command(op, code, { type: "REVEAL", index: i1 }, ver),
  ]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, "同时提交只有一条成功");
  await settle();
  assert.ok((await command(opOf(turn), code, { type: "REVEAL", index: find(turn) })).ok);
  await settle();
  v = r1.last().view!;
  assert.notEqual(v.turn, turn, "提示 1 翻 2 张后自动换边");
  assert.equal(v.log.at(-2)!.end, "limit");
  pass("N+1：提示 1 翻对 2 张后自动换边；队长/对方不能操作；未翻牌不能结束；同时提交只成功一次");

  // ---------- 提示超时 ----------
  turn = v.turn;
  const t0 = Date.now();
  while (r1.last().view!.turn === turn && Date.now() - t0 < 8000) await sleep(100);
  v = r1.last().view!;
  assert.notEqual(v.turn, turn, "队长超时后自动换边");
  assert.equal(v.log.at(-2)!.end, "clue-timeout");
  const waited = (Date.now() - t0) / 1000;
  assert.ok(waited > TIMING.clue - 1.5 && waited < TIMING.clue + 1.5, "超时时间约等于设置值 " + waited);
  pass(`队长 ${TIMING.clue} 秒不出线索 → 服务器自动换边（实测 ${waited.toFixed(1)} 秒）`);

  // ---------- 加时 + 猜词超时 + 0 线索 ----------
  turn = v.turn;
  assert.ok((await command(capOf(turn), code, { type: "GIVE_CLUE", word: "排除", number: 0 })).ok);
  await settle();
  assert.equal(r1.last().view!.limit, null);
  const dl = r1.last().view!.deadline;
  assert.equal((await command(capOf(turn), code, { type: "EXTRA_TIME" })).ok, false, "队长不能加时");
  assert.ok((await command(opOf(turn), code, { type: "EXTRA_TIME" })).ok);
  await settle();
  assert.equal(r1.last().view!.deadline - dl, TIMING.extra * 1000);
  const again = await command(opOf(turn), code, { type: "EXTRA_TIME" });
  assert.equal(again.ok, false);
  assert.match(again.error, /用过/);
  const g0 = Date.now();
  while (r1.last().view!.turn === turn && Date.now() - g0 < 12000) await sleep(100);
  const gw = (Date.now() - g0) / 1000;
  v = r1.last().view!;
  assert.notEqual(v.turn, turn);
  assert.equal(v.log.at(-2)!.end, "guess-timeout");
  assert.ok(gw > TIMING.guess + TIMING.extra - 1.5, "加时生效后才超时 " + gw);
  pass(`0 线索不限次数；加时 +${TIMING.extra} 秒只能一次、队长不能按；猜词超时自动换边（含加时实测 ${gw.toFixed(1)} 秒）`);

  // ---------- 刷新重连 ----------
  const before = r3.last().view!;
  r3.s.close();
  await settle();
  const r3b = await joinAs(code, "红丙", r3.token);
  assert.equal(r3b.last().mySeat, before.players.find((p) => p.name === "红丙")!.id);
  assert.deepEqual(r3b.last().view!.cards, r1.last().view!.cards);
  cs[2] = r3b;
  pass("断开后用 token 重连回原座位，棋盘一致");

  // ---------- 服务器重启后恢复 ----------
  const snapBefore = r1.last().view!;
  for (const c of cs) c.s.close();
  await stopServer();
  await startServer();
  const r1c = await joinAs(code, "红甲", r1.token);
  const vAfter = r1c.last().view!;
  assert.deepEqual(
    vAfter.cards.map((c) => [c.word, c.revealed]),
    snapBefore.cards.map((c) => [c.word, c.revealed]),
  );
  assert.equal(vAfter.turn, snapBefore.turn);
  assert.deepEqual(vAfter.extraUsed, snapBefore.extraUsed);
  pass("服务器重启后按存档重放恢复（棋盘、回合、加时状态一致）");

  // ---------- 刺客结束 + 再来一局（随机队长） ----------
  const cl = await Promise.all([
    joinAs(code, "红乙", r2.token),
    joinAs(code, "红丙", cs[2].token),
    joinAs(code, "蓝甲", b1.token),
    joinAs(code, "蓝乙", b2.token),
  ]);
  const all = [r1c, ...cl];
  const capC = (t: Team) => all.find((c) => c.last().mySeat === r1c.last().view!.captains[t])!;
  const opC = (t: Team) => all.find((c) => c.last().mySeat === r1c.last().view!.operators[t])!;
  // 可能还在上一阶段的剩余时间里；等到出线索阶段
  for (let k = 0; k < 80 && r1c.last().view!.phase !== "clue"; k++) await sleep(100);
  turn = r1c.last().view!.turn;
  assert.ok((await command(capC(turn), code, { type: "GIVE_CLUE", word: "危险", number: "inf" })).ok);
  await settle();
  const assassin = capC(turn).last().view!.cards.findIndex((c) => c.role === "assassin");
  assert.ok((await command(opC(turn), code, { type: "REVEAL", index: assassin })).ok);
  await settle();
  v = r1c.last().view!;
  assert.equal(v.phase, "over");
  assert.equal(v.winner, enemy(turn));
  assert.equal(v.endReason, "assassin");
  for (const c of all) assert.equal(c.last().view!.cards.filter((x) => x.role).length, 25, "结束后全员公开");
  pass("∞ 线索下翻到刺客 → 该队立即失败；结束后所有人看到全部身份");

  assert.ok((await lobby(r1c, code, { type: "SET_MODE", mode: "random" })).ok === false, "游戏中不能改模式");
  assert.ok((await lobby(r1c, code, { type: "NEXT" })).ok);
  await settle();
  let s = r1c.last();
  assert.equal(s.stage, "lobby");
  assert.equal(s.players.filter((p) => p.team === "red").length, 3, "保留队伍");
  assert.equal(s.players.filter((p) => p.captain).length, 0, "队长清空");
  assert.ok((await lobby(r1c, code, { type: "SET_MODE", mode: "random" })).ok);
  const capsSeen = new Set<string>();
  for (let round = 0; round < 6; round++) {
    assert.ok((await lobby(r1c, code, { type: "START" })).ok);
    await settle();
    s = r1c.last();
    const red = s.view!.captains.red;
    assert.equal(s.players.find((p) => p.playerId === red)!.team, "red");
    capsSeen.add(red);
    // 用刺客快速结束
    const t = s.view!.turn;
    const cap = all.find((c) => c.last().mySeat === s.view!.captains[t])!;
    const opx = all.find((c) => c.last().mySeat === s.view!.operators[t])!;
    assert.ok((await command(cap, code, { type: "GIVE_CLUE", word: "结束", number: 1 })).ok);
    await settle();
    const ai = cap.last().view!.cards.findIndex((c) => c.role === "assassin");
    assert.ok((await command(opx, code, { type: "REVEAL", index: ai })).ok);
    await settle();
    assert.ok((await lobby(r1c, code, { type: "NEXT" })).ok);
    await settle();
  }
  assert.ok(capsSeen.size >= 2, "随机队长会换人");
  assert.equal(r1c.last().round, 7);
  pass(`再来一局：保留队伍、清空队长；随机队长模式连开 6 局，红队抽到过 ${capsSeen.size} 名不同队长`);

  for (const c of all) c.s.close();
  await stopServer();
  console.log(`\n全部通过：${results.length} 组检查`);
}

main().catch(async (e) => {
  console.error("✘ 失败：", e);
  await stopServer();
  process.exit(1);
});
