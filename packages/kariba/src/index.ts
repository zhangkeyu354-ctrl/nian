/**
 * 卡里巴湖 Kariba 规则引擎（纯函数，无 I/O，不读时钟，不用 Math.random）。
 * 原版规则：docs/kariba/RULE_MATRIX.md；组队房规：docs/kariba/HOUSE_RULES.md（HR-KB-01）。
 * 服务器持有完整状态，客户端只拿 viewForKB(state, seat)。
 */

export const ANIMALS = [
  "",
  "老鼠",
  "狐獴",
  "斑马",
  "长颈鹿",
  "鸵鸟",
  "猎豹",
  "犀牛",
  "大象",
] as const;
export const HAND_SIZE = 5;

export type Mode = "solo" | "team";
export type Phase = "PLAY" | "FINISHED";

export interface KBOptions {
  mode: Mode;
  /** 每回合秒数，0 = 不限时 */
  seconds: 0 | 30 | 60;
}

export interface Player {
  name: string;
  hand: string[];
  pile: string[];
  team: number; // 个人战时等于座位号
  turns: number;
  stats: { biggest: number; mouseElephant: number; chases: number };
}

export type KBEvent =
  | { type: "PLAY"; seat: number; value: number; count: number; total: number }
  | {
      type: "CHASE";
      seat: number;
      by: number;
      target: number;
      cards: number;
    }
  | { type: "NO_CHASE"; seat: number; value: number; total: number }
  | { type: "DRAW"; seat: number; count: number }
  | { type: "TIMEOUT"; seat: number }
  | { type: "LAST_ROUND"; seat: number }
  | { type: "END"; winners: number[] };

export interface KBState {
  phase: Phase;
  options: KBOptions;
  players: Player[];
  /** 水塘：下标 1–8 为该动物的牌 ID */
  pond: string[][];
  deck: string[];
  turn: number;
  /** 本局第一个出牌的座位（组队模式补齐一圈用） */
  first: number;
  /** 组队模式：已触发终局，打到这个座位前停止 */
  endAt: number | null;
  totalCards: number;
  rng: number;
  deadline: number | null;
  seq: Record<string, number>;
  log: { turn: number; events: KBEvent[] }[];
  turnNo: number;
}

export type Command =
  | { type: "PLAY"; actor: number; seq: number; now: number; cardIds: string[] }
  | { type: "TIMEOUT"; actor: "server"; seq: number; now: number };

export interface CreateOptions {
  seed: number;
  mode?: Mode;
  seconds?: 0 | 30 | 60;
  /** 组队模式：每个座位的队伍号（0 起）。不填则按交叉座位 A1 B1 … A2 B2 … */
  teams?: number[];
  first?: number;
  now?: number;
}

function ensure(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

export function valueOf(id: string): number {
  const v = Number(id.slice(1, 2));
  ensure(id[0] === "A" && v >= 1 && v <= 8, "牌编号无效");
  return v;
}

export function animalName(v: number) {
  return ANIMALS[v] ?? "?";
}

/** 每种动物几张：个人战 8；组队 4 人 8、6 人 12、8 人 16（HR-KB-01） */
export function copiesFor(n: number, mode: Mode): number {
  if (mode === "solo") {
    ensure(n >= 2 && n <= 5, "个人战需要 2–5 人");
    return 8;
  }
  ensure(n === 4 || n === 6 || n === 8, "组队模式只支持 4、6、8 人（两人一队）");
  return n === 4 ? 8 : n === 6 ? 12 : 16;
}

export function createDeckKB(copies: number): string[] {
  const ids: string[] = [];
  for (let v = 1; v <= 8; v++)
    for (let k = 1; k <= copies; k++) ids.push(`A${v}-${String(k).padStart(2, "0")}`);
  return ids;
}

function rand(s: KBState): number {
  // mulberry32
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(s: KBState, a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function defaultTeams(n: number): number[] {
  const t = n / 2;
  return Array.from({ length: n }, (_, i) => i % t);
}

export function createKB(names: string[], opts: CreateOptions): KBState {
  const mode = opts.mode ?? "solo";
  const copies = copiesFor(names.length, mode);
  ensure(names.every((n) => typeof n === "string" && n.trim()), "请填写玩家昵称");
  ensure(
    Number.isInteger(opts.seed) && opts.seed >= 0 && opts.seed <= 0xffffffff,
    "随机种子必须是32位非负整数",
  );
  const seconds = opts.seconds ?? 30;
  ensure([0, 30, 60].includes(seconds), "计时只能为 30 秒、60 秒或不限");
  let teams = names.map((_, i) => i);
  if (mode === "team") {
    teams = opts.teams ?? defaultTeams(names.length);
    const k = names.length / 2;
    ensure(teams.length === names.length, "分队信息不完整");
    for (let t = 0; t < k; t++)
      ensure(teams.filter((x) => x === t).length === 2, "每队必须正好 2 人");
    for (let i = 0; i < names.length; i++)
      ensure(
        teams[i] !== teams[(i + 1) % names.length],
        "队友不能挨着坐（会连续出牌）",
      );
  }
  const now = opts.now ?? 0;
  const s: KBState = {
    phase: "PLAY",
    options: { mode, seconds },
    players: names.map((name, i) => ({
      name,
      hand: [],
      pile: [],
      team: teams[i],
      turns: 0,
      stats: { biggest: 0, mouseElephant: 0, chases: 0 },
    })),
    pond: Array.from({ length: 9 }, () => []),
    deck: [],
    turn: 0,
    first: 0,
    endAt: null,
    totalCards: copies * 8,
    rng: opts.seed >>> 0,
    deadline: null,
    seq: {},
    log: [],
    turnNo: 1,
  };
  s.deck = shuffle(s, createDeckKB(copies));
  for (const p of s.players) p.hand = s.deck.splice(0, HAND_SIZE);
  const first =
    opts.first ?? Math.floor(rand(s) * names.length);
  ensure(Number.isInteger(first) && first >= 0 && first < names.length, "先手座位无效");
  s.turn = s.first = first;
  setDeadline(s, now);
  assertInvariants(s);
  return s;
}

function setDeadline(s: KBState, now: number) {
  s.deadline =
    s.phase === "PLAY" && s.options.seconds > 0 ? now + s.options.seconds * 1000 : null;
}

/** 找出这次会被赶走的动物（0 = 不会触发） */
export function chaseTarget(pond: string[][], value: number): number {
  if (pond[value].length < 3) return 0;
  if (value === 1) return pond[8].length > 0 ? 8 : 0;
  for (let w = value - 1; w >= 1; w--) if (pond[w].length > 0) return w;
  return 0;
}

/** 预判（给界面用）：打出 count 张 value 会赶走谁、拿几张 */
export function previewKB(pond: string[][], value: number, count: number) {
  const sim = pond.map((x) => x.slice());
  for (let i = 0; i < count; i++) sim[value].push("x");
  const target = chaseTarget(sim, value);
  return { total: sim[value].length, target, cards: target ? sim[target].length : 0 };
}

function play(s: KBState, seat: number, ids: string[], events: KBEvent[]) {
  const p = s.players[seat];
  ensure(Array.isArray(ids) && ids.length > 0, "请至少选 1 张牌");
  ensure(new Set(ids).size === ids.length, "同一张牌不能选两次");
  for (const id of ids) ensure(p.hand.includes(id), "这张牌不在你手里");
  const v = valueOf(ids[0]);
  ensure(ids.every((id) => valueOf(id) === v), "一次只能打同一种动物");
  p.hand = p.hand.filter((id) => !ids.includes(id));
  s.pond[v].push(...ids);
  events.push({ type: "PLAY", seat, value: v, count: ids.length, total: s.pond[v].length });
  const target = chaseTarget(s.pond, v);
  if (target) {
    const won = s.pond[target];
    s.pond[target] = [];
    p.pile.push(...won);
    p.stats.biggest = Math.max(p.stats.biggest, won.length);
    p.stats.chases++;
    if (v === 1) p.stats.mouseElephant += won.length;
    events.push({ type: "CHASE", seat, by: v, target, cards: won.length });
  } else if (s.pond[v].length >= 3) {
    events.push({ type: "NO_CHASE", seat, value: v, total: s.pond[v].length });
  }
  const need = Math.max(0, HAND_SIZE - p.hand.length);
  const drawn = s.deck.splice(0, need);
  p.hand.push(...drawn);
  if (drawn.length) events.push({ type: "DRAW", seat, count: drawn.length });
  p.turns++;
}

function nextSeat(s: KBState, from: number): number {
  return (from + 1) % s.players.length;
}

function advance(s: KBState, seat: number, events: KBEvent[], now: number) {
  const n = s.players.length;
  // 终局：牌库已空且刚出牌的人手牌打完
  if (s.endAt === null && s.deck.length === 0 && s.players[seat].hand.length === 0) {
    if (s.options.mode === "solo") return finish(s, events);
    // HR-KB-01：组队模式打完这一圈（到先手座位前为止）
    s.endAt = s.first;
    events.push({ type: "LAST_ROUND", seat });
  }
  let t = nextSeat(s, seat);
  for (let k = 0; k < n; k++) {
    if (s.endAt !== null && t === s.endAt) return finish(s, events);
    if (s.players[t].hand.length > 0) {
      s.turn = t;
      s.turnNo++;
      setDeadline(s, now);
      return;
    }
    t = nextSeat(s, t);
  }
  finish(s, events);
}

export function scoresKB(s: KBState): { seat: number; team: number; score: number }[] {
  return s.players.map((p, i) => ({ seat: i, team: p.team, score: p.pile.length }));
}

export function teamScoresKB(s: KBState): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of s.players) m.set(p.team, (m.get(p.team) ?? 0) + p.pile.length);
  return m;
}

/** 胜者座位（并列都算赢，CHECK-KB-05） */
export function winnersKB(s: KBState): number[] {
  const ts = teamScoresKB(s);
  const best = Math.max(...ts.values());
  return s.players.map((p, i) => (ts.get(p.team) === best ? i : -1)).filter((i) => i >= 0);
}

function finish(s: KBState, events: KBEvent[]) {
  s.phase = "FINISHED";
  s.deadline = null;
  events.push({ type: "END", winners: winnersKB(s) });
}

export function reduceKB(state: KBState, cmd: Command): KBState {
  ensure(cmd && typeof cmd === "object", "游戏操作无效");
  ensure(
    cmd.actor === "server" ||
      (Number.isInteger(cmd.actor) && cmd.actor >= 0 && cmd.actor < state.players.length),
    "行动座位无效",
  );
  ensure(Number.isSafeInteger(cmd.seq) && cmd.seq > 0, "操作序号必须是正整数");
  ensure(Number.isFinite(cmd.now), "操作时间无效");
  const prev = state.seq[String(cmd.actor)] ?? 0;
  if (cmd.seq <= prev) return state; // 幂等
  ensure(cmd.seq === prev + 1, "操作序号不连续，请同步状态");
  ensure(state.phase !== "FINISHED", "对局已经结束");
  const s = structuredClone(state);
  const events: KBEvent[] = [];
  const turnNo = s.turnNo;
  let seat: number;
  if (cmd.type === "PLAY") {
    seat = cmd.actor;
    ensure(
      seat === s.turn,
      `还没轮到你，等待 ${s.turn + 1}号 ${s.players[s.turn].name}`,
    );
    play(s, seat, cmd.cardIds, events);
  } else if (cmd.type === "TIMEOUT") {
    ensure(cmd.actor === "server", "只有服务器能判超时");
    ensure(s.deadline !== null && cmd.now >= s.deadline, "还没到时间");
    seat = s.turn;
    // CHECK-KB-06：超时自动打出数值最小的一张
    const pick = s.players[seat].hand.slice().sort((a, b) => valueOf(a) - valueOf(b) || a.localeCompare(b))[0];
    events.push({ type: "TIMEOUT", seat });
    play(s, seat, [pick], events);
  } else {
    throw new Error("未知操作");
  }
  advance(s, seat, events, cmd.now);
  s.log.push({ turn: turnNo, events });
  s.seq[String(cmd.actor)] = cmd.seq;
  assertInvariants(s);
  return s;
}

export function assertInvariants(s: KBState) {
  const all = [
    ...s.deck,
    ...s.pond.flat(),
    ...s.players.flatMap((p) => [...p.hand, ...p.pile]),
  ];
  ensure(all.length === s.totalCards, `不变量：牌总数应为 ${s.totalCards}，实际 ${all.length}`);
  ensure(new Set(all).size === all.length, "不变量：出现重复的牌");
  ensure(s.pond[0].length === 0, "不变量：水塘 0 号位不能有牌");
  for (let v = 1; v <= 8; v++)
    ensure(s.pond[v].every((id) => valueOf(id) === v), "不变量：水塘位置放错动物");
  for (const p of s.players) ensure(p.hand.length <= HAND_SIZE, "不变量：手牌超过 5 张");
  if (s.phase === "PLAY") ensure(s.players[s.turn].hand.length > 0, "不变量：当前玩家没有手牌");
}

/** 给座位 seat 看的视图；seat = -1 为旁观。不含任何别人的手牌和牌库顺序（队友也不可见）。 */
export function viewForKB(s: KBState, seat: number) {
  const ts = teamScoresKB(s);
  return {
    phase: s.phase,
    options: s.options,
    you: seat,
    turn: s.turn,
    turnNo: s.turnNo,
    lastRound: s.endAt !== null,
    deadline: s.deadline,
    deck: s.deck.length,
    pond: s.pond.map((x) => x.length),
    hand: seat >= 0 && seat < s.players.length ? s.players[seat].hand.slice() : [],
    players: s.players.map((p, i) => ({
      seat: i,
      name: p.name,
      team: p.team,
      handCount: p.hand.length,
      score: p.pile.length,
      teamScore: ts.get(p.team) ?? 0,
      stats: s.phase === "FINISHED" ? p.stats : undefined,
    })),
    lastEvents: s.log.at(-1)?.events ?? [],
    winners: s.phase === "FINISHED" ? winnersKB(s) : [],
  };
}
export type KBView = ReturnType<typeof viewForKB>;

/** 测试 / 模拟用的简单 AI：能拿最多就拿最多，否则出不会送分的牌，再否则出最小的。 */
export function simpleAI(s: KBState, seat: number, rng: () => number): string[] {
  const hand = s.players[seat].hand;
  const groups = new Map<number, string[]>();
  for (const id of hand) {
    const v = valueOf(id);
    groups.set(v, [...(groups.get(v) ?? []), id]);
  }
  let best: { ids: string[]; gain: number; risk: number } | null = null;
  for (const [v, ids] of groups)
    for (let c = 1; c <= ids.length; c++) {
      const pv = previewKB(s.pond, v, c);
      const risk = pv.target ? 0 : pv.total === 2 ? 1 : 0;
      const gain = pv.cards + rng() * 0.5;
      const cand = { ids: ids.slice(0, c), gain, risk };
      if (
        !best ||
        cand.gain - cand.risk * 2 > best.gain - best.risk * 2
      )
        best = cand;
    }
  return best!.ids;
}
