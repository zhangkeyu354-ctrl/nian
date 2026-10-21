// 眼疾手快联机协议验收（不经过浏览器，3 个独立 socket 客户端，真实服务器进程）
// 计时缩短：准备 300ms / 作答 1500ms / 公布 300ms（RR_TIMING）。
// 覆盖：建房、加入、房主设目标分、非房主不能改、开局、准备期不能点、点错 −1 并锁定、负分、
//      多人同时点只有一人得分、全员点错公布答案、超时公布并换图、到目标分结束、旧图点击被拒、
//      观战者不能作答、刷新重连、服务器重启后恢复、再来一局、回房间、时钟校准。
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
import {
  RR_EVENTS,
  type RRRoomSnapshot,
} from "../packages/shared/src/rr-protocol.ts";
import { solve } from "../packages/reflex-race/src/engine.ts";

const PORT = 3331;
const data = mkdtempSync(join(tmpdir(), "rr-proto-"));
let server: ChildProcess | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function startServer() {
  server = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: "127.0.0.1",
        DBD_DATA_DIR: join(data, "dbd"),
        RR_DATA_DIR: join(data, "rr"),
        RR_TIMING: "300,1500,300",
      },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return;
    } catch {}
    if (i > 300) throw new Error("服务器未启动");
    await sleep(50);
  }
}
async function stopServer() {
  const s = server;
  server = undefined;
  if (s)
    await new Promise<void>((ok) => (s.once("exit", () => ok()), s.kill()));
}
const emit = <T = any>(s: Socket, ev: string, payload: unknown) =>
  new Promise<T>((ok) => s.emit(ev, payload, ok));
interface Client {
  s: Socket;
  token: string;
  id: string;
  last: () => RRRoomSnapshot;
}
async function connect(
  code: string,
  name?: string,
  token?: string,
): Promise<Client> {
  const s = io(`http://127.0.0.1:${PORT}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  let snap: RRRoomSnapshot | null = null;
  s.on(RR_EVENTS.update, (v: RRRoomSnapshot) => (snap = v));
  await new Promise<void>((ok) => s.once("connect", () => ok()));
  if (!token) {
    const c = await emit(s, RR_EVENTS.claim, { code, name });
    assert.ok(c.ok, c.error);
    token = c.token;
  }
  const j = await emit(s, RR_EVENTS.join, { code, token });
  assert.ok(j.ok);
  snap = j.snapshot;
  return { s, token: token!, id: j.snapshot.mySeat, last: () => snap! };
}
const lobby = (c: Client, code: string, action: unknown) =>
  emit(c.s, RR_EVENTS.lobby, { code, token: c.token, action });
const tap = (c: Client, code: string, obj: number, cardNo?: number) =>
  emit(c.s, RR_EVENTS.command, {
    code,
    token: c.token,
    command: { type: "TAP", obj },
    ...{},
  }).then((r) => r) as Promise<any>;
const tapCard = (c: Client, code: string, obj: number, cardNo: number) =>
  emit(c.s, RR_EVENTS.command, {
    code,
    token: c.token,
    command: { type: "TAP", obj, cardNo },
  }) as Promise<any>;
/** 等到某个条件成立 */
async function until(
  c: Client,
  ok: (v: RRRoomSnapshot) => boolean,
  label: string,
  ms = 5000,
) {
  const end = Date.now() + ms;
  while (!ok(c.last())) {
    if (Date.now() > end) throw new Error("等待超时：" + label);
    await sleep(15);
  }
  return c.last();
}
/** 由图本身算出答案（玩家看到的信息就够判断） */
const answerOf = (v: RRRoomSnapshot) => solve(v.view!.card.items)!;
const waitLive = (c: Client) =>
  until(c, (v) => v.view?.phase === "live" && v.serverNow >= 0, "作答中").then(
    async (v) => {
      await sleep(Math.max(0, v.view!.revealAt - v.serverNow) + 30);
      return c.last();
    },
  );

const step = (m: string) => console.log("  ✓ " + m);
try {
  await startServer();
  const h = io(`http://127.0.0.1:${PORT}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  const created = await emit(h, RR_EVENTS.create, {});
  h.close();
  const code = created.code as string;
  const A = await connect(code, "阿甲");
  const B = await connect(code, "阿乙");
  const C = await connect(code, "阿丙");
  step(`建房 ${code}，3 人加入`);

  const pong = await emit(A.s, RR_EVENTS.ping, {});
  assert.ok(pong.ok && Math.abs(pong.now - Date.now()) < 1000);
  step("时钟校准 ping 返回服务器时间");

  assert.equal(
    (await lobby(B, code, { type: "SET_TARGET", target: 9 })).ok,
    false,
  );
  assert.equal(
    (await lobby(A, code, { type: "SET_TARGET", target: 0 })).ok,
    false,
  );
  assert.ok((await lobby(A, code, { type: "SET_TARGET", target: 2 })).ok);
  await until(C, (v) => v.target === 2, "目标分同步");
  step("只有房主能改目标分（1–50），所有人看到 2 分");

  assert.ok((await lobby(A, code, { type: "START" })).ok);
  let v = await until(B, (x) => x.stage === "game", "开局");
  assert.equal(v.view!.card.answer, null, "作答中不应下发答案");
  const early = await tap(A, code, 0);
  assert.equal(early.ok, false);
  assert.match(early.error, /还没出来/);
  step("开局；准备期点击被拒，答案不提前下发");

  // 第 1 张：A 点错 → −1 并锁定；B 点对 +1
  v = await waitLive(A);
  const ans1 = answerOf(v);
  const wrong1 = (ans1 + 1) % 5;
  const r1 = await tap(A, code, wrong1);
  assert.ok(r1.ok && r1.tap.correct === false);
  assert.equal((await tap(A, code, ans1)).ok, false, "点错后同一张不能再点");
  const r2 = await tap(B, code, ans1);
  assert.ok(r2.ok && r2.tap.correct);
  v = await until(C, (x) => x.view!.phase === "reveal", "公布");
  assert.equal(v.view!.scores[A.id], -1);
  assert.equal(v.view!.scores[B.id], 1);
  assert.equal(v.view!.card.answer, ans1);
  step("点错 −1（负分）并锁定本张；点对 +1；公布答案");

  // 第 2 张：三人同时点对，只能一人得分
  v = await until(A, (x) => x.view!.cardNo === 2, "第 2 张");
  v = await waitLive(A);
  const ans2 = answerOf(v);
  const rs = await Promise.all([
    tap(A, code, ans2),
    tap(B, code, ans2),
    tap(C, code, ans2),
  ]);
  assert.equal(rs.filter((r) => r.ok).length, 1, "同时点只有一人成功");
  v = await until(C, (x) => x.view!.phase !== "live", "第 2 张结束");
  const sum = Object.values(v.view!.scores).reduce((a, b) => a + b, 0);
  assert.equal(sum, 1, "-1 + 1 + 1 = 1");
  step("三人同时点对：只有最先到服务器的一人 +1");

  // 如果 B 已经 2 分就结束了；否则继续：全员点错
  if (v.view!.phase !== "over") {
    v = await until(A, (x) => x.view!.cardNo === 3, "第 3 张");
    v = await waitLive(A);
    const w = (answerOf(v) + 2) % 5;
    await Promise.all([tap(A, code, w), tap(B, code, w), tap(C, code, w)]);
    v = await until(A, (x) => x.view!.phase === "reveal", "全员点错");
    assert.equal(v.view!.cardWinner, null);
    step("全员点错：直接公布答案，没人得分");

    // 旧图点击被拒
    const old = v.view!.cardNo;
    await until(A, (x) => x.view!.cardNo === old + 1, "下一张");
    v = await waitLive(A);
    assert.equal((await tapCard(A, code, answerOf(v), old)).ok, false);
    step("点击带图号，上一张的点击不会落到新图上");

    // 超时：没人点 → 公布并换图
    v = await until(A, (x) => x.view!.phase === "reveal", "超时公布", 4000);
    assert.equal(v.view!.cardWinner, null);
    await until(A, (x) => x.view!.cardNo === old + 2, "超时后换图");
    step("1.5 秒没人答对：自动公布答案并换下一张");

    // 服务器重启：恢复同一局
    const before = A.last().view!;
    await stopServer();
    await startServer();
    const A2 = await connect(code, undefined, A.token);
    const after = A2.last().view!;
    assert.deepEqual(after.scores, before.scores);
    assert.ok(after.cardNo >= before.cardNo);
    assert.equal(A2.id, A.id);
    step("服务器重启后按存档恢复：分数、座位不变");
    for (const c of [A, B, C]) c.s.close();
    const B2 = await connect(code, undefined, B.token);
    const C2 = await connect(code, undefined, C.token);
    // 观战者：第 4 人中途加入，不能作答
    const D = await connect(code, "阿丁");
    v = await waitLive(A2);
    assert.equal((await tap(D, code, answerOf(v))).ok, false);
    step("中途加入的人观战，不能作答");
    // C 连拿到 2 分结束
    while (A2.last().view!.phase !== "over") {
      v = await until(C2, (x) => x.view!.phase === "live", "可作答");
      v = await waitLive(C2);
      await tap(C2, code, answerOf(v));
      await until(A2, (x) => x.view!.phase !== "live", "本张结束");
    }
    (Object.assign(A, A2),
      Object.assign(B, B2),
      Object.assign(C, C2),
      D.s.close());
  }
  v = await until(A, (x) => x.view!.phase === "over", "结束");
  const winner = v.view!.winner!;
  assert.equal(v.view!.scores[winner], 2);
  assert.equal((await tap(A, code, 0)).ok, false);
  step(
    `先到 2 分获胜（${v.view!.players.find((p) => p.id === winner)!.name}），结束后不能再点`,
  );

  assert.equal((await lobby(B, code, { type: "START" })).ok, false);
  assert.ok((await lobby(A, code, { type: "START" })).ok);
  v = await until(
    B,
    (x) => x.round === 2 && x.view?.phase === "live",
    "再来一局",
  );
  assert.ok(Object.values(v.view!.scores).every((s) => s === 0));
  step("房主「再来一局」：分数清零，新一局开始");

  // 结束后回房间
  while (A.last().view!.phase !== "over") {
    v = await waitLive(A);
    if (v.view!.phase !== "live") continue;
    await tap(A, code, answerOf(v));
    await until(A, (x) => x.view!.phase !== "live", "本张结束");
  }
  assert.ok((await lobby(A, code, { type: "NEXT" })).ok);
  await until(C, (x) => x.stage === "lobby" && x.view === null, "回房间");
  step("「回房间」：回到等待页，可以改目标分、移出玩家");

  const health = await (
    await fetch(`http://127.0.0.1:${PORT}/api/health`)
  ).json();
  assert.equal(health.rrRooms, 1);
  step("/api/health 显示眼疾手快房间数");
  for (const c of [A, B, C]) c.s.close();
  console.log("\n眼疾手快协议验收全部通过");
} finally {
  await stopServer();
}
process.exit(0);
