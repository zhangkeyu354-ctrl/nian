import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import { CONTENT, validColors, createGame, oathDone, plansOf, reduceMY, scene, viewForMY, type Cmd, type State } from "../../../packages/mist-expedition/src/index.ts";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LIMIT: Record<string, number> = { FORK: 30, PLAN: 90, CONTRIBUTE: 30, ROLL: 20, FLASHBACK: 10, COUNCIL: 45, MAP: 45 };
type P = { id: string; token: string; name: string };
type File = { code: string; hostId: string; players: P[]; seed: number; commands: Cmd[]; touched: number };
type Room = File & { state: State | null; deadline: number; timer?: NodeJS.Timeout };

export function attachMist(io: Server, dir: string, opt: { maxRooms: number; idleMs: number }) {
  mkdirSync(dir, { recursive: true });
  const rooms = new Map<string, Room>();
  const bySocket = new Map<string, { code: string; id: string }>();
  const save = (r: Room) => { r.touched = Date.now(); const { state, timer, deadline, ...f } = r; const p = join(dir, r.code + ".json"); writeFileSync(p + ".tmp", JSON.stringify(f)); renameSync(p + ".tmp", p); };
  const view = (r: Room, id: string) => {
    const seat = r.players.findIndex((p) => p.id === id), s = r.state;
    const base: any = { code: r.code, host: r.hostId === id, me: seat, deadline: r.deadline, serverNow: Date.now(), names: r.players.map((p) => p.name), started: !!s };
    if (!s) return base;
    const v: any = viewForMY(s, seat), mine = s.players[seat], sc = scene(s), oath = CONTENT.secret_oaths.find((o: any) => o.id === mine.oath);
    Object.assign(base, v, { myOath: { name: oath.name, text: oath.text, target: mine.oathTarget }, sceneInfo: { id: sc.id.toLowerCase(), loc: sc.loc, mon: sc.kind === "monster" ? sc.id : null, title: sc.title, type: sc.type, narration: sc.narration }, plans: plansOf(s).map((p: any) => ({ id: p.id, name: p.name, attribute: p.attribute, difficulty: p.difficulty, valid_colors: p.valid_colors })), intelText: s.intel.filter((i) => i.seat === seat).map((i) => sc.intel.find((x: any) => x.id === i.id).text), dealOffer: s.dealOffer && seat === s.actor ? { name: s.dealOffer.name, text: s.dealOffer.text } : null, fork: s.fork ?? null, validNow: s.planId ? validColors(s) : [] });
    if (s.ending) { base.endingInfo = CONTENT.endings.find((e: any) => e.id === s.ending); base.traitors = s.players.filter((p) => p.traitor || p.recruit).map((p) => p.seat); base.defectors = s.players.filter((p) => p.defected).map((p) => p.seat); base.reveal_all = { oaths: s.players.map((p) => ({ seat: p.seat, role: p.traitor ? "内奸" : p.recruit ? "被策反" : p.defected ? "投诚者" : "冒险者", name: CONTENT.secret_oaths.find((o: any) => o.id === p.oath).name, done: oathDone(s, p.seat) })), intel: s.log.filter((l) => l.type === "intel_given") }; }
    return base;
  };
  const push = (r: Room) => { for (const [sid, b] of bySocket) if (b.code === r.code) io.to(sid).emit("my:state", view(r, b.id)); };
  const auto = (s: State): Cmd[] => {
    if (s.phase === "MAP") return [{ t: "MOVE", seat: s.actor, pos: Math.min(11, s.pos + 1) }];
    if (s.phase === "FORK") return [{ t: "FORK", seat: s.actor, optionId: s.fork.options[0].id }];
    if (s.phase === "PLAN") return [{ t: "PLAN", seat: s.actor, planId: plansOf(s)[0].id }];
    if (s.phase === "CONTRIBUTE") { const q = s.players.find((p) => (s.n === 2 || p.seat !== s.actor) && p.seat !== s.jailed && !s.played.some((x) => x.seat === p.seat))!; return [{ t: "CONTRIBUTE", seat: q.seat, cardId: q.hand[randomInt(q.hand.length)].id }]; }
    if (s.phase === "ROLL") return [{ t: "ROLL", seat: s.actor, push: false }];
    if (s.phase === "COUNCIL") return s.players.filter((p) => !(p.seat in s.votes)).map((p) => ({ t: "VOTE", seat: p.seat, target: null }) as Cmd);
    return s.players.filter((p) => !s.passed.includes(p.seat)).map((p) => ({ t: "PASS", seat: p.seat }) as Cmd);
  };
  const run = (r: Room, c: Cmd) => { r.state = reduceMY(r.state!, c); r.commands.push(c); };
  const arm = (r: Room, phase0?: string) => {
    if (!r.state || r.state.ending) { clearTimeout(r.timer); r.deadline = 0; return; }
    const key = r.state.phase + r.state.sceneIdx; if (key === phase0) return;
    clearTimeout(r.timer); const sec = LIMIT[r.state.phase]; r.deadline = Date.now() + sec * 1000;
    r.timer = setTimeout(() => { while (r.state && !r.state.ending && r.state.phase + r.state.sceneIdx === key) for (const c of auto(r.state)) { if (r.state.phase + r.state.sceneIdx !== key) break; run(r, c); } arm(r); save(r); push(r); }, sec * 1000);
  };
  for (const f of readdirSync(dir)) if (f.endsWith(".json")) try {
    const d: File = JSON.parse(readFileSync(join(dir, f), "utf8")); const r: Room = { ...d, state: null, deadline: 0 };
    if (d.commands !== undefined && (d as any).started !== false && d.seed && d.players.length >= 2 && (d as any).begun) { let s = createGame(d.players.length, d.seed); for (const c of d.commands) s = reduceMY(s, c); r.state = s; }
    rooms.set(r.code, r); arm(r);
  } catch { /* 损坏存档跳过 */ }
  setInterval(() => { for (const [c, r] of rooms) if (Date.now() - r.touched > opt.idleMs) { clearTimeout(r.timer); rooms.delete(c); rmSync(join(dir, c + ".json"), { force: true }); } }, 60000).unref();
  io.on("connection", (sock: Socket) => {
    const guard = (fn: (a: any) => any) => (a: any, ack: (x: any) => void) => { try { ack?.({ ok: true, ...fn(a ?? {}) }); } catch (e: any) { ack?.({ ok: false, error: e.message }); } };
    const cur = () => { const b = bySocket.get(sock.id); const r = b && rooms.get(b.code); if (!b || !r) throw new Error("请先加入房间"); return { b, r }; };
    sock.on("my:create", guard(() => { if (rooms.size >= opt.maxRooms) throw new Error("房间已满"); let code = ""; do { code = Array.from({ length: 4 }, () => CHARS[randomInt(CHARS.length)]).join(""); } while (rooms.has(code)); const r: Room = { code, hostId: "", players: [], seed: randomInt(1, 2 ** 31), commands: [], touched: Date.now(), state: null, deadline: 0 }; rooms.set(code, r); return { code }; }));
    sock.on("my:join", guard(({ code, token, name }) => {
      const r = rooms.get(String(code).toUpperCase()); if (!r) throw new Error("房间不存在");
      let p = r.players.find((x) => token && x.token === token);
      if (!p) { if (r.state) throw new Error("游戏已开始"); if (r.players.length >= 8) throw new Error("房间已满 8 人"); p = { id: randomBytes(6).toString("hex"), token: randomBytes(16).toString("hex"), name: String(name || "玩家").slice(0, 12) }; r.players.push(p); r.hostId ||= p.id; }
      bySocket.set(sock.id, { code: r.code, id: p.id }); save(r); push(r); return { token: p.token, snapshot: view(r, p.id) };
    }));
    sock.on("my:start", guard(() => { const { b, r } = cur(); if (b.id !== r.hostId) throw new Error("只有房主能开始"); if (r.state) throw new Error("已经开始"); if (r.players.length < 2) throw new Error("至少 2 人"); r.state = createGame(r.players.length, r.seed); (r as any).begun = true; arm(r); save(r); push(r); return {}; }));
    sock.on("my:rematch", guard(() => { const { b, r } = cur(); if (b.id !== r.hostId) throw new Error("只有房主能再来一局"); if (!r.state?.ending) throw new Error("本局还没结束"); r.seed = randomInt(1, 2 ** 31); r.commands = []; r.state = createGame(r.players.length, r.seed); arm(r); save(r); push(r); return {}; }));
    sock.on("my:cmd", guard((c) => {
      const { b, r } = cur(); if (!r.state) throw new Error("游戏未开始"); const seat = r.players.findIndex((p) => p.id === b.id), key = r.state.phase + r.state.sceneIdx;
      run(r, { ...c, seat }); arm(r, key); save(r); push(r); return {};
    }));
    sock.on("disconnect", () => bySocket.delete(sock.id));
  });
  return { rooms };
}
