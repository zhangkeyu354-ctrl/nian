/**
 * 反转王牌 Dnup（Kei Kajino）规则引擎。纯函数 reduceDU(state, command)。
 * 规则依据 docs/dnup/RULES.md（Codex 调研 + Claude 裁定）。
 * 房规 HR-DU-01：6 人局用官方 4 人牌组 36 张，每人 6 张。
 * HR-DU-02：3–6 人获胜门槛可选 3 或 4 个标记（默认 4）。
 */

export interface CardDef {
  id: number;
  a: number;
  b: number;
  star?: boolean;
  /** 0 = 基础牌；3/4/5 = 三点/四点/五点人数标记 */
  dots: 0 | 3 | 4 | 5;
}

const RAW: [number, number, 0 | 3 | 4 | 5][] = [
  [1, 5, 0], [1, 6, 0], [1, 6, 0], [1, 7, 0], [1, 7, 0], [1, 8, 0], [1, 8, 4], [1, 9, 0], [1, 9, 4], [1, 10, 3],
  [2, 4, 0], [2, 4, 0], [2, 5, 0], [2, 5, 0], [2, 6, 0], [2, 6, 4], [2, 7, 4], [2, 8, 3], [2, 9, 0], [2, 10, 0],
  [3, 4, 0], [3, 4, 4], [3, 5, 0], [3, 5, 4], [3, 6, 0], [3, 6, 3], [3, 7, 0], [3, 8, 0], [3, 9, 0], [3, 10, 5],
  [4, 5, 3], [4, 6, 0], [4, 7, 0], [4, 8, 0], [4, 9, 5], [5, 7, 0], [5, 8, 0], [5, 8, 5], [6, 7, 0], [6, 7, 5],
];
export const CARDS: readonly CardDef[] = RAW.map(([a, b, dots], i) => ({
  id: i + 1,
  a,
  b,
  dots,
  ...(i === 0 ? { star: true } : {}),
}));

/** 某人数使用的牌（6 人 = 4 人牌组，房规 HR-DU-01） */
export function deckFor(n: number): CardDef[] {
  const maxDots = n <= 2 ? 0 : n === 3 ? 3 : n === 5 ? 5 : 4;
  return CARDS.filter((c) => c.dots === 0 || c.dots <= maxDots);
}

/** 手上/桌上的一张牌：flip=false 时有效数值为 a */
export interface HeldCard {
  id: number;
  flip: boolean;
}
export const valueOf = (c: HeldCard) => {
  const d = CARDS[c.id - 1];
  return c.flip ? d.b : d.a;
};
export const otherOf = (c: HeldCard) => {
  const d = CARDS[c.id - 1];
  return c.flip ? d.a : d.b;
};
const rotate = (c: HeldCard): HeldCard => ({ id: c.id, flip: !c.flip });

export interface Group {
  cards: HeldCard[];
  value: number;
  /** 打出这组的玩家（B 加牌的人不变） */
  by: number;
  fresh?: boolean;
}

export interface RoundStats {
  plays: number;
  adds: number;
  takes: number;
  rotates: number;
  /** 自己桌上的组合被压回/弃掉的次数 */
  bounced: number;
  /** 自己桌上的组合被别人拿走的次数 */
  robbed: number;
  /** 本轮最大一手 */
  best: { size: number; value: number } | null;
}
export const emptyStats = (): RoundStats => ({ plays: 0, adds: 0, takes: 0, rotates: 0, bounced: 0, robbed: 0, best: null });

export interface Player {
  stats?: RoundStats;
  name: string;
  hand: HeldCard[];
  zones: (Group | null)[];
  score: number;
  /** 本轮名次：1 / 2；null = 仍在本轮 */
  place: number | null;
}

export type Phase = "PLAY" | "ROUND_END" | "FINISHED";

export interface LogEntry {
  round: number;
  seat: number;
  type: "PLAY" | "ADD" | "TAKE" | "ROTATE" | "OUT" | "WIN_ROUND" | "CLEAR";
  values?: number[];
  value?: number;
  target?: number;
  zone?: number;
  bounced?: { seat: number; count: number; discarded?: boolean };
  points?: number;
  place?: number;
}

export interface DUOptions {
  target: number;
}

export interface DUState {
  phase: Phase;
  players: Player[];
  turn: number;
  /** 双人局当前小回合区域（0=区域1、1=区域2）；多人恒为 0 */
  zone: number;
  round: number;
  seed: number;
  rng: number;
  options: DUOptions;
  discard: number;
  log: LogEntry[];
  winner: number | null;
  /** 本轮结果（ROUND_END/FINISHED 时） */
  roundResult: { seat: number; points: number }[];
  seq: Record<string, number>;
  version: number;
}

export type Command =
  | { type: "PLAY"; actor: number; cards: number[]; zone?: number }
  | { type: "ADD"; actor: number; card: number; target: number; zone?: number }
  | { type: "TAKE"; actor: number; target: number; zone?: number }
  | { type: "ROTATE"; actor: number }
  | { type: "NEXT_ROUND"; actor: number };

function ensure(ok: unknown, msg: string): asserts ok {
  if (!ok) throw Error(msg);
}

function nextRand(s: { rng: number }) {
  // mulberry32
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function defaultTarget(n: number) {
  return n === 2 ? 2 : 4;
}

export function createDU(
  names: string[],
  opts: { seed: number; target?: number },
): DUState {
  const n = names.length;
  ensure(n >= 2 && n <= 6, "人数须为 2–6");
  const target = n === 2 ? 2 : (opts.target ?? 4);
  ensure(n === 2 || target === 3 || target === 4, "获胜门槛只能是 3 或 4");
  const s: DUState = {
    phase: "PLAY",
    players: names.map((name) => ({
      name,
      hand: [],
      zones: n === 2 ? [null, null] : [null],
      score: 0,
      place: null,
    })),
    turn: 0,
    zone: 0,
    round: 0,
    seed: opts.seed >>> 0,
    rng: opts.seed >>> 0,
    options: { target },
    discard: 0,
    log: [],
    winner: null,
    roundResult: [],
    seq: {},
    version: 0,
  };
  deal(s);
  return s;
}

function deal(s: DUState) {
  const n = s.players.length;
  const deck = deckFor(n).map((c) => c.id);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(s) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const per = Math.floor(deck.length / n);
  s.players.forEach((p, i) => {
    p.hand = deck
      .slice(i * per, (i + 1) * per)
      .map((id) => ({ id, flip: nextRand(s) < 0.5 }));
    p.zones = p.zones.map(() => null);
    p.place = null;
    p.stats = emptyStats();
  });
  s.discard = 0;
  s.round++;
  s.roundResult = [];
  s.phase = "PLAY";
  s.turn = s.players.findIndex((p) => p.hand.some((c) => c.id === 1));
  // 双人局：星牌持有者第一次只做区域 2
  s.zone = n === 2 ? 1 : 0;
}

/** 全桌在场的组合 */
export function tableGroups(s: DUState) {
  const out: { seat: number; zone: number; group: Group }[] = [];
  s.players.forEach((p, seat) =>
    p.zones.forEach((g, zone) => g && out.push({ seat, zone, group: g })),
  );
  return out;
}

/** 张数为 size 的组合中（排除 except）是否允许出数值 value；返回会被压掉的组合 */
function beatCheck(
  s: DUState,
  size: number,
  value: number,
  except?: { seat: number; zone: number },
) {
  const same = tableGroups(s).filter(
    (t) =>
      t.group.cards.length === size &&
      !(except && t.seat === except.seat && t.zone === except.zone),
  );
  for (const t of same)
    ensure(value > t.group.value, `桌上已有 ${size} 张 ${t.group.value}，必须更大`);
  return same;
}

function bounce(s: DUState, seat: number, zone: number) {
  const p = s.players[seat];
  if (p.stats) p.stats.bounced++;
  const g = p.zones[zone]!;
  p.zones[zone] = null;
  if (p.place !== null) {
    s.discard += g.cards.length;
    return { seat, count: g.cards.length, discarded: true };
  }
  p.hand.push(...g.cards.map(rotate));
  return { seat, count: g.cards.length };
}

function isTwo(s: DUState) {
  return s.players.length === 2;
}

/** 当前小回合开始：清掉自己当前区域（多人为唯一区域）的旧组合 */
function clearZone(s: DUState, seat: number, zone: number) {
  const g = s.players[seat].zones[zone];
  if (g) {
    s.discard += g.cards.length;
    s.players[seat].zones[zone] = null;
  }
}

function advance(s: DUState) {
  const n = s.players.length;
  if (isTwo(s)) {
    if (s.zone === 0) s.zone = 1;
    else {
      s.turn = (s.turn + 1) % 2;
      s.zone = 0;
    }
    clearZone(s, s.turn, s.zone);
    return;
  }
  for (let k = 0; k < n; k++) {
    s.turn = (s.turn + 1) % n;
    clearZone(s, s.turn, 0);
    if (s.players[s.turn].place === null) return;
  }
}

function award(s: DUState, seat: number) {
  const p = s.players[seat];
  if (isTwo(s)) {
    p.score += 1;
    p.place = 1;
    s.roundResult = [{ seat, points: 1 }];
    s.log.push({ round: s.round, seat, type: "WIN_ROUND", points: 1 });
    endRound(s);
    return;
  }
  const place = s.players.filter((x) => x.place !== null).length + 1;
  const points = place === 1 ? 2 : 1;
  p.place = place;
  p.score += points;
  s.roundResult.push({ seat, points });
  s.log.push({ round: s.round, seat, type: "OUT", place, points });
  if (p.score >= s.options.target || place === 2) endRound(s);
}

function endRound(s: DUState) {
  const best = s.players.find((p) => p.score >= s.options.target);
  if (best) {
    s.phase = "FINISHED";
    s.winner = s.players.indexOf(best);
  } else s.phase = "ROUND_END";
}

export function legalPlay(s: DUState, seat: number, ids: number[]) {
  try {
    checkPlay(s, seat, ids);
    return true;
  } catch {
    return false;
  }
}

function checkPlay(s: DUState, seat: number, ids: number[]) {
  const p = s.players[seat];
  ensure(ids.length > 0, "请选择要出的牌");
  ensure(new Set(ids).size === ids.length, "牌重复");
  const cards = ids.map((id) => p.hand.find((c) => c.id === id));
  ensure(cards.every(Boolean), "手上没有这张牌");
  const v = valueOf(cards[0]!);
  ensure(cards.every((c) => valueOf(c!) === v), "一组牌的数字必须相同");
  const beaten = beatCheck(s, ids.length, v);
  return { cards: cards as HeldCard[], value: v, beaten };
}

function checkAdd(s: DUState, seat: number, id: number, target: number, zone: number) {
  ensure(target !== seat, "只能往对手的组合里加牌");
  const tp = s.players[target];
  ensure(tp, "目标无效");
  const g = tp.zones[zone];
  ensure(g, "对方这里没有组合");
  const card = s.players[seat].hand.find((c) => c.id === id);
  ensure(card, "手上没有这张牌");
  ensure(valueOf(card) === g.value, `只能加一张 ${g.value}`);
  const beaten = beatCheck(s, g.cards.length + 1, g.value, { seat: target, zone });
  return { card, g, beaten };
}

export function reduceDU(state: DUState, c: Command): DUState {
  const s = structuredClone(state);
  if (c.type === "NEXT_ROUND") {
    ensure(s.phase === "ROUND_END", "本轮尚未结束");
    deal(s);
    s.version++;
    return s;
  }
  ensure(s.phase === "PLAY", "本轮已结束");
  ensure(c.actor === s.turn, "还没轮到你");
  const seat = c.actor;
  const me = s.players[seat];
  const myZone = s.zone;
  const entry: LogEntry = { round: s.round, seat, type: c.type, zone: myZone };
  const st = (me.stats ??= emptyStats());
  switch (c.type) {
    case "PLAY": {
      const { cards, value, beaten } = checkPlay(s, seat, c.cards);
      me.hand = me.hand.filter((h) => !c.cards.includes(h.id));
      for (const b of beaten) entry.bounced = bounce(s, b.seat, b.zone);
      me.zones[myZone] = { cards, value, by: seat };
      st.plays++;
      if (!st.best || cards.length > st.best.size || (cards.length === st.best.size && value > st.best.value)) st.best = { size: cards.length, value };
      entry.values = cards.map(valueOf);
      entry.value = value;
      break;
    }
    case "ADD": {
      const zone = c.zone ?? 0;
      const { card, g, beaten } = checkAdd(s, seat, c.card, c.target, zone);
      me.hand = me.hand.filter((h) => h.id !== card.id);
      g.cards.push(card);
      for (const b of beaten) entry.bounced = bounce(s, b.seat, b.zone);
      entry.value = g.value;
      entry.target = c.target;
      entry.zone = zone;
      st.adds++;
      break;
    }
    case "TAKE": {
      const zone = c.zone ?? 0;
      ensure(c.target !== seat, "不能拿自己的组合");
      const tp = s.players[c.target];
      ensure(tp && tp.zones[zone], "对方这里没有组合");
      const g = tp.zones[zone]!;
      tp.zones[zone] = null;
      me.hand.push(...g.cards.map(rotate));
      st.takes++;
      if (tp.stats) tp.stats.robbed++;
      entry.values = g.cards.map(valueOf);
      entry.value = g.value;
      entry.target = c.target;
      entry.zone = zone;
      break;
    }
    case "ROTATE":
      me.hand = me.hand.map(rotate);
      st.rotates++;
      break;
    default:
      throw Error("未知操作");
  }
  s.log.push(entry);
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
  if (me.hand.length === 0) award(s, seat);
  if (s.phase === "PLAY") advance(s);
  s.version++;
  return s;
}

export function assertInvariants(s: DUState, fullDeck = true) {
  const ids = [
    ...s.players.flatMap((p) => [
      ...p.hand,
      ...p.zones.flatMap((g) => g?.cards ?? []),
    ]),
  ].map((c) => c.id);
  ensure(new Set(ids).size === ids.length, "牌重复");
  if (fullDeck) ensure(ids.length + s.discard === deckFor(s.players.length).length, "牌数不对");
}

/** 发给某座位的视图：只有自己的手牌可见，其他人只给张数 */
export function viewForDU(s: DUState, seat: number) {
  return {
    phase: s.phase,
    round: s.round,
    turn: s.turn,
    zone: s.zone,
    target: s.options.target,
    discard: s.discard,
    winner: s.winner,
    roundResult: s.roundResult,
    log: s.log.slice(-30),
    me: seat,
    hand: s.players[seat]?.hand ?? [],
    players: s.players.map((p) => ({
      name: p.name,
      handCount: p.hand.length,
      score: p.score,
      place: p.place,
      zones: p.zones,
      stats: p.stats ?? emptyStats(),
    })),
  };
}
export type DUView = ReturnType<typeof viewForDU>;

/** 给界面：某手牌能否用来做 ADD（返回可加的目标） */
export function addTargets(s: { players: { zones: (Group | null)[] }[] }, seat: number, card: HeldCard) {
  const v = valueOf(card);
  const out: { seat: number; zone: number }[] = [];
  s.players.forEach((p, t) =>
    p.zones.forEach((g, zone) => {
      if (t === seat || !g || g.value !== v) return;
      const size = g.cards.length + 1;
      const ok = s.players.every((q, qs) =>
        q.zones.every(
          (o, oz) =>
            !o || (qs === t && oz === zone) || o.cards.length !== size || o.value < v,
        ),
      );
      if (ok) out.push({ seat: t, zone });
    }),
  );
  return out;
}

export function canPlayView(v: { players: { zones: (Group | null)[] }[] }, size: number, value: number) {
  return v.players.every((p) =>
    p.zones.every((g) => !g || g.cards.length !== size || g.value < value),
  );
}
