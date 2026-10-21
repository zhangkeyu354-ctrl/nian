/**
 * 《眼疾手快》Reflex Race 规则引擎（纯函数，服务器权威）
 *
 * 用户规则（2026-10-21）：
 * - 2–6 人。每人屏幕上同一张图（2 个物品）+ 5 个按钮。
 * - 判定：图里如果有物品是它「原本的颜色」，就点它；
 *         否则点颜色和形状都没在图里出现过的那个。
 * - 每张图最先点对的人 +1 分；点错 −1 分（可以是负数），这张图不能再点。
 * - 先到目标分的人获胜，目标分由房主设定。
 */

/** 5 个物品，序号同时代表它的原色：沙发=红，瓶子=绿，书=蓝，猫=黄，雪人=白 */
export const OBJECTS = ["chair", "bottle", "book", "cat", "snowman"] as const;
export type Obj = 0 | 1 | 2 | 3 | 4;
export const OBJECT_NAME = [
  "红沙发",
  "绿瓶子",
  "蓝书",
  "黄猫",
  "白雪人",
] as const;
export const COLOR_NAME = ["红", "绿", "蓝", "黄", "白"] as const;
export const SHAPE_NAME = ["沙发", "瓶子", "书", "猫", "雪人"] as const;

export interface RRItem {
  obj: Obj;
  color: Obj;
  /** 在圆形画面中的位置（0–1）、旋转角度、缩放 */
  x: number;
  y: number;
  rot: number;
  scale: number;
}
export interface RRCard {
  items: [RRItem, RRItem];
  /** match：图里有原色物品；missing：点没出现的那个 */
  kind: "match" | "missing";
  answer: Obj;
}
export interface RRTap {
  player: string;
  obj: Obj;
  correct: boolean;
  at: number;
}
export interface RRTiming {
  /** 新图出现前的准备时间 */
  readyMs: number;
  /** 一张图最长作答时间，到时没人答对就公布答案 */
  cardMs: number;
  /** 公布答案停留时间 */
  revealMs: number;
}
export const DEFAULT_TIMING: RRTiming = {
  readyMs: 1500,
  cardMs: 15_000,
  revealMs: 1800,
};
/** 圆盘中每个物品方框的宽度（占圆盘直径的比例），界面 CSS 与此一致 */
export const ITEM_SIZE = 0.44;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MIN_TARGET = 1;
export const MAX_TARGET = 50;
export const DEFAULT_TARGET = 5;

export interface RRSetup {
  players: { id: string; name: string }[];
  target: number;
  seed: number;
  now: number;
  timing?: RRTiming;
}
export interface RRState {
  players: { id: string; name: string }[];
  target: number;
  timing: RRTiming;
  scores: Record<string, number>;
  rand: number;
  /** 第几张图（从 1 开始） */
  cardNo: number;
  card: RRCard;
  /** 「live」作答中（revealAt 之前是准备时间）；「reveal」公布答案；「over」有人获胜 */
  phase: "live" | "reveal" | "over";
  revealAt: number;
  /** 下一次自动推进的时间（live：没人答对；reveal：下一张图） */
  deadline: number;
  /** 这张图点错过的人 */
  locked: string[];
  taps: RRTap[];
  /** 这张图抢到的人；没人答对为 null */
  cardWinner: string | null;
  winner: string | null;
  /** 全场统计 */
  stats: Record<string, { right: number; wrong: number }>;
}
export type RRCommand =
  | { type: "TAP"; player: string; obj: number; at: number }
  | { type: "TICK"; at: number };

export class RRRuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, msg: string): never => {
  throw new RRRuleError(code, msg);
};

/** mulberry32：返回 [0,1) 随机数和新的种子状态 */
function next(seed: number): [number, number] {
  const a = (seed + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}
class Rand {
  constructor(public s: number) {}
  f() {
    const [v, s] = next(this.s);
    this.s = s;
    return v;
  }
  int(n: number) {
    return Math.floor(this.f() * n);
  }
  pick<T>(arr: readonly T[]) {
    return arr[this.int(arr.length)];
  }
}
const ALL: Obj[] = [0, 1, 2, 3, 4];

/** 答案判定（独立于出题，用于测试出题是否无歧义） */
export function solve(items: readonly { obj: Obj; color: Obj }[]): Obj | null {
  const exact = items.filter((i) => i.obj === i.color);
  if (exact.length === 1) return exact[0].obj;
  if (exact.length > 1) return null;
  const used = new Set<number>(items.flatMap((i) => [i.obj, i.color]));
  const left = ALL.filter((o) => !used.has(o));
  return left.length === 1 ? left[0] : null;
}

/** 出一张图：一半「原色」题，一半「找没出现的」题，每张都只有唯一答案 */
export function makeCard(r: Rand): RRCard {
  let pairs: [Obj, Obj][];
  let kind: RRCard["kind"];
  if (r.f() < 0.5) {
    kind = "match";
    const a = r.pick(ALL);
    const b = r.pick(ALL.filter((o) => o !== a));
    const c = r.pick(ALL.filter((o) => o !== a && o !== b));
    pairs = [
      [a, a],
      [b, c],
    ];
  } else {
    kind = "missing";
    // 4 个不同的序号分给两个物品和两种颜色，剩下的就是答案
    const order = [...ALL];
    for (let i = order.length - 1; i > 0; i--) {
      const j = r.int(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    // 物品 order[0]、order[1]；颜色避免和自己的形状相同
    const [o1, o2, c1, c2] = order;
    pairs = [
      [o1, c1],
      [o2, c2],
    ];
  }
  if (r.f() < 0.5) pairs.reverse();
  // 两个物品放在圆心两侧，随机角度与旋转（和参考截图一样歪歪斜斜）；
  // 物品框宽 = 圆盘的 ITEM_SIZE，两者中心至少相隔一个物品宽，互不遮挡
  const theta = r.f() * Math.PI * 2;
  const dist = 0.235 + r.f() * 0.01;
  const items = pairs.map(([obj, color], i) => {
    const t = theta + i * Math.PI + (r.f() - 0.5) * 0.5;
    return {
      obj,
      color,
      x: +(0.5 + Math.cos(t) * dist).toFixed(3),
      y: +(0.5 + Math.sin(t) * dist).toFixed(3),
      rot: Math.round(r.f() * 360 - 180),
      scale: +(0.96 + r.f() * 0.02).toFixed(2),
    };
  }) as [RRItem, RRItem];
  const answer = solve(items);
  if (answer === null) throw new Error("出题有歧义");
  return { items, kind, answer };
}

export function createRRGame(setup: RRSetup): RRState {
  const ids = new Set(setup.players.map((p) => p.id));
  if (setup.players.length < MIN_PLAYERS || ids.size !== setup.players.length)
    fail("RR_NEED_PLAYERS", "至少需要 2 名玩家。");
  if (setup.players.length > MAX_PLAYERS)
    fail("RR_TOO_MANY", "最多 6 名玩家。");
  const target = Math.trunc(setup.target);
  if (!(target >= MIN_TARGET && target <= MAX_TARGET))
    fail("RR_BAD_TARGET", "目标分需在 1–50 之间。");
  const timing = setup.timing ?? DEFAULT_TIMING;
  const r = new Rand(setup.seed >>> 0);
  const card = makeCard(r);
  const revealAt = setup.now + timing.readyMs;
  return {
    players: setup.players.map((p) => ({ id: p.id, name: p.name })),
    target,
    timing,
    scores: Object.fromEntries(setup.players.map((p) => [p.id, 0])),
    stats: Object.fromEntries(
      setup.players.map((p) => [p.id, { right: 0, wrong: 0 }]),
    ),
    rand: r.s,
    cardNo: 1,
    card,
    phase: "live",
    revealAt,
    deadline: revealAt + timing.cardMs,
    locked: [],
    taps: [],
    cardWinner: null,
    winner: null,
  };
}

function nextCard(s: RRState, at: number): RRState {
  const r = new Rand(s.rand);
  const card = makeCard(r);
  const revealAt = at + s.timing.readyMs;
  return {
    ...s,
    rand: r.s,
    cardNo: s.cardNo + 1,
    card,
    phase: "live",
    revealAt,
    deadline: revealAt + s.timing.cardMs,
    locked: [],
    taps: [],
    cardWinner: null,
  };
}

export function reduceRR(s: RRState, cmd: RRCommand): RRState {
  if (s.phase === "over") fail("RR_OVER", "这一局已经结束了。");
  if (cmd.type === "TICK") {
    if (cmd.at < s.deadline) return s;
    if (s.phase === "live")
      return { ...s, phase: "reveal", deadline: cmd.at + s.timing.revealMs };
    return nextCard(s, cmd.at);
  }
  if (cmd.type !== "TAP") fail("BAD_ACTION", "操作无效。");
  const { player, at } = cmd;
  const obj = Math.trunc(Number(cmd.obj));
  if (!s.players.some((p) => p.id === player))
    fail("RR_NOT_PLAYER", "你在观战，这一局不能作答。");
  if (!(obj >= 0 && obj <= 4)) fail("BAD_ACTION", "操作无效。");
  if (s.phase !== "live") fail("RR_TOO_LATE", "这张图已经结束了。");
  if (at < s.revealAt) fail("RR_TOO_EARLY", "图还没出来。");
  if (at >= s.deadline) fail("RR_TOO_LATE", "这张图已经结束了。");
  if (s.locked.includes(player))
    fail("RR_LOCKED", "你这张图点错过了，等下一张。");
  const correct = obj === s.card.answer;
  const tap: RRTap = { player, obj: obj as Obj, correct, at };
  const stat = s.stats[player];
  if (!correct) {
    const locked = [...s.locked, player];
    const allOut = s.players.every((p) => locked.includes(p.id));
    return {
      ...s,
      scores: { ...s.scores, [player]: s.scores[player] - 1 },
      stats: { ...s.stats, [player]: { ...stat, wrong: stat.wrong + 1 } },
      locked,
      taps: [...s.taps, tap],
      ...(allOut
        ? { phase: "reveal" as const, deadline: at + s.timing.revealMs }
        : {}),
    };
  }
  const score = s.scores[player] + 1;
  const won = score >= s.target;
  return {
    ...s,
    scores: { ...s.scores, [player]: score },
    stats: { ...s.stats, [player]: { ...stat, right: stat.right + 1 } },
    taps: [...s.taps, tap],
    cardWinner: player,
    phase: won ? "over" : "reveal",
    winner: won ? player : null,
    deadline: at + s.timing.revealMs,
  };
}

export type RRView = Omit<RRState, "rand" | "card" | "timing"> & {
  /** 图在准备时间里就发给所有人，各自按服务器时间同时显示（网速快慢不影响谁先看到）；答案只在公布时给出 */
  card: { items: RRItem[]; answer: Obj | null; kind: RRCard["kind"] | null };
};
export function viewForRR(s: RRState): RRView {
  const { rand: _r, card, timing: _t, ...rest } = s;
  const open = s.phase !== "live";
  return {
    ...rest,
    card: {
      items: card.items,
      answer: open ? card.answer : null,
      kind: open ? card.kind : null,
    },
  };
}
