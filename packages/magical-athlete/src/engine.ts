/**
 * 魔法运动员规则引擎：纯函数 reduce(state, command)。
 *
 * 一个「单元」（赛前结算、一名玩家的一个回合）从快照开始确定性执行；
 * 中途需要有人做选择时抛出 Need，状态停在那里并给出 pending。
 * 收到回答后，从快照带着全部回答重新执行同一单元（随机数也在快照里，所以结果一致）。
 * 这样所有中途选择（决斗、跟随、重掷……）都不需要手写「从中间继续」的逻辑。
 */
import { DRAFTABLE, racerName } from "./racers.ts";
import { PLAYABLE_TRACKS, TRACKS } from "./tracks.ts";
import type {
  Chip,
  CreateMAOptions,
  Decision,
  MACommand,
  MAPlayer,
  MAState,
  RaceState,
  Settings,
  Token,
} from "./types.ts";

export class MARuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string): never => {
  throw new MARuleError(code, message);
};

class Need {
  constructor(public decision: Decision) {}
}
class RaceOver {}

// ---------------------------------------------------------------- 随机数（mulberry32，状态存在 state.rng）
function nextRandom(s: MAState) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (s: MAState, n: number) => Math.floor(nextRandom(s) * n);
const d6 = (s: MAState) =>
  s.forcedRolls?.length ? s.forcedRolls.shift()! : 1 + randInt(s, 6);
function shuffle<T>(s: MAState, a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// ---------------------------------------------------------------- 创建
export const DEFAULT_POINTS = { gold: 3, silver: 1 };

export function createMAGame(opts: CreateMAOptions): MAState {
  const n = opts.players.length;
  if (n < 2 || n > 6) fail("PLAYER_COUNT", "魔法运动员支持 2–6 人。");
  // 2 人局必须用双选手；3 人可选「双选手变体」；4–6 人只有标准规则
  const variant: Settings["variant"] =
    n === 2 ? "double" : n === 3 && opts.settings?.variant === "double" ? "double" : "standard";
  if (new Set(opts.players.map((p) => p.id)).size !== n)
    fail("DUP_PLAYER", "玩家 id 重复。");
  const races = opts.settings?.races ?? 4;
  const schedule =
    opts.settings?.schedule ??
    Array.from({ length: races }, (_, i) =>
      i % 2 === 0 ? "mild" : PLAYABLE_TRACKS.includes("wild") ? "wild" : "mild",
    );
  for (const t of schedule)
    if (!PLAYABLE_TRACKS.includes(t))
      fail("TRACK_UNCONFIRMED", `${TRACKS[t].zh}：${TRACKS[t].missing}。`);
  const settings: Settings = {
    races,
    variant,
    schedule,
    points:
      opts.settings?.points ??
      Array.from({ length: races }, () => ({ ...DEFAULT_POINTS })),
  };
  const s: MAState = {
    game: "magical-athlete",
    phase: "draft",
    rng: opts.seed >>> 0,
    players: opts.players.map(
      (p): MAPlayer => ({
        id: p.id,
        name: p.name,
        hand: [],
        used: [],
        chips: [],
        choices: [],
      }),
    ),
    seats: opts.players.map((p) => p.id),
    settings,
    deck: [],
    draft: null,
    race: null,
    winners: [],
    nextFirst: null,
    pending: null,
    turn: null,
    log: [],
    version: 0,
  };
  s.deck = shuffle(s, DRAFTABLE);
  const start = rollOff(s, s.seats, "决定选秀先手");
  startDraftRound(s, 0, start);
  return s;
}

const pname = (s: MAState, id: string) =>
  s.players.find((p) => p.id === id)?.name ?? id;
const player = (s: MAState, id: string) =>
  s.players.find((p) => p.id === id) ?? fail("NO_PLAYER", "没有这名玩家。");
function log(s: MAState, text: string) {
  s.log.push({ text, race: s.race ? s.race.index : null });
}

/** 掷骰比大：最高者胜，平局者重掷 */
function rollOff(s: MAState, ids: string[], why: string): string {
  let left = [...ids];
  while (left.length > 1) {
    const rolls = left.map((id) => ({ id, v: d6(s) }));
    log(s, `${why}：` + rolls.map((r) => `${pname(s, r.id)} ${r.v}`).join("，"));
    const max = Math.max(...rolls.map((r) => r.v));
    left = rolls.filter((r) => r.v === max).map((r) => r.id);
  }
  return left[0];
}

/**
 * 选秀（规则书 p12 与 p26）：
 * - 标准：翻 2×人数 张，蛇形；两轮，第二轮从先手左边的人开始 → 每人 4 名。
 * - 2 人：翻 8 张，ABBAABBA；再翻 8 张，顺序反过来（BAABBAAB）→ 每人 8 名。
 * - 3 人双选手：翻 6 张，正常蛇形；共 4 轮，轮流先选 → 每人 8 名。
 */
const draftRounds = (s: MAState) =>
  s.settings.variant === "standard" ? 2 : s.seats.length === 2 ? 2 : 4;

function startDraftRound(s: MAState, round: number, startPlayer: string) {
  const n = s.seats.length;
  const si = s.seats.indexOf(startPlayer);
  let order: string[];
  let flip: number;
  if (n === 2) {
    const [a, b] = round === 0 ? [startPlayer, s.seats[(si + 1) % 2]] : [s.seats[(si + 1) % 2], startPlayer];
    order = [a, b, b, a, a, b, b, a];
    flip = 8;
  } else {
    const first = (si + round) % n;
    const seq = Array.from({ length: n }, (_, i) => s.seats[(first + i) % n]);
    order = [...seq, ...[...seq].reverse()];
    flip = 2 * n;
  }
  s.draft = { round, pool: s.deck.splice(0, flip), order, step: 0, startPlayer };
  log(s, `第 ${round + 1} 轮选秀：翻开 ${flip} 名选手，${pname(s, order[0])} 先选（蛇形）。`);
}

// ---------------------------------------------------------------- 比赛中的工具
const race = (s: MAState) => s.race ?? fail("NO_RACE", "现在不在比赛中。");
const active = (t: Token) => !t.out && t.place === null;
const trackOf = (s: MAState) => TRACKS[race(s).track];
const rname = (t: Token) => racerName(t.racer);

/** 从当前玩家开始顺时针的选手顺序（结算顺序） */
function inOrder(s: MAState): Token[] {
  const r = race(s);
  const i = r.order.indexOf(r.current);
  const ids = [...r.order.slice(i), ...r.order.slice(0, i)];
  return ids.flatMap((id) => r.tokens.filter((t) => t.owner === id));
}
const others = (s: MAState, t: Token) => inOrder(s).filter((x) => x !== t && active(x));
const onSpace = (s: MAState, pos: number) =>
  race(s).tokens.filter((x) => active(x) && x.pos === pos);

function leaders(s: MAState): Token[] {
  const act = race(s).tokens.filter(active);
  if (!act.length) return [];
  const max = Math.max(...act.map((t) => t.pos));
  return act.filter((t) => t.pos === max);
}

/** 选手当前生效的能力 id（山寨猫取领先者的能力） */
export function powerOf(s: MAState, t: Token): string | null {
  if (!active(t)) return null;
  if (t.base !== "copycat") return t.base;
  const lead = leaders(s).filter((x) => x !== t);
  if (!lead.length) return null;
  const pick = lead.find((x) => x.racer === t.copyPick) ?? lead[0];
  return pick.base === "copycat" ? null : pick.base;
}
const has = (s: MAState, t: Token, id: string) => powerOf(s, t) === id;
const holders = (s: MAState, id: string) => inOrder(s).filter((t) => has(s, t, id));

// ---------------------------------------------------------------- 单元执行上下文
interface Ctx {
  answers: string[];
  i: number;
  guard: Set<string>;
  depth: number;
}

function ask(s: MAState, c: Ctx, d: Decision): string {
  if (c.i < c.answers.length) return c.answers[c.i++];
  throw new Need(d);
}

/** 局面指纹：所有选手的位置、摔倒、名次、淘汰（判断「真正重复、不改变状态」的无限循环） */
function stateKey(s: MAState) {
  return race(s)
    .tokens.map((t) => `${t.pos}${t.tripped ? "T" : ""}${t.place ?? ""}${t.out ? "X" : ""}`)
    .join(",");
}
/**
 * 循环判定：同一个触发（同一来源 → 同一对象）在**完全相同的局面**下第二次出现，才是规则书说的无限循环
 * （「按发生顺序结算一轮后停止」）。局面在变化的长连锁（如挪挪 × 吸盘鱼一路往前）是合法的，继续结算。
 * 没有任何次数上限作为规则；SAFETY 只是防止程序本身出错的保险丝，触发时会报错而不是悄悄停止。
 */
const SAFETY = 20000;
function loopCheck(s: MAState, c: Ctx, trigger: string, what: string): boolean {
  if (++c.depth > SAFETY) fail("ENGINE_SAFETY", "连锁结算超过程序保险上限，请把这局的记录发给开发者。");
  const key = `${trigger}|${stateKey(s)}`;
  if (!c.guard.has(key)) {
    c.guard.add(key);
    return false;
  }
  log(s, `（循环：${what}。同一触发在相同局面下再次出现，已按发生顺序结算一轮，到此停止）`);
  return true;
}

/** 某个能力发动了：记录，并让挪挪各蹭 1 格 */
function fire(s: MAState, c: Ctx, src: Token, text: string) {
  log(s, text);
  for (const sc of holders(s, "scoocher")) {
    if (sc === src) continue;
    if (loopCheck(s, c, `scooch:${src.racer}>${sc.racer}`, `${rname(sc)} 与 ${rname(src)} 互相触发`)) continue;
    move(s, c, sc, 1, false, "蹭局王");
    if (active(sc)) fire(s, c, sc, `${rname(sc)}【蹭局王】：因 ${rname(src)} 的能力移动 1 格。`);
  }
}

function trip(s: MAState, t: Token) {
  if (active(t)) t.tripped = true;
}
function gainChip(s: MAState, owner: string, value: number) {
  player(s, owner).chips.push({ kind: "bronze", value, race: race(s).index });
}

function finish(s: MAState, t: Token) {
  const r = race(s);
  t.pos = trackOf(s).length;
  r.finishers.push(t.racer);
  t.place = r.finishers.length;
  log(s, `🏁 ${rname(t)}（${pname(s, t.owner)}）第 ${t.place} 个冲过终点！`);
  if (t.place === 1 && r.mastermindPick === t.racer) {
    const mm = r.tokens.find((x) => x.base === "mastermind" && !x.out);
    if (mm) {
      log(s, `${rname(mm)}【开局下注】猜中了冠军，比赛立刻结束，获得第 2 名！`);
      if (mm !== t) {
        mm.place = 2;
        r.finishers.push(mm.racer);
      } else r.finishers.push(mm.racer);
      throw new RaceOver();
    }
  }
  checkEnd(s);
}
function checkEnd(s: MAState) {
  const r = race(s);
  if (r.finishers.length >= 2 || !r.tokens.some(active)) throw new RaceOver();
}
function eliminate(s: MAState, t: Token) {
  t.out = true;
  race(s).eliminated.push(t.owner);
  checkEnd(s);
}

/** 巨婴：除起点外不能与它同格 */
function hugeBaby(s: MAState, c: Ctx, t: Token) {
  if (!active(t) || t.pos === 0) return;
  for (const hb of holders(s, "huge_baby")) {
    if (hb !== t && hb.pos === t.pos && t.pos > 0) {
      t.pos -= 1;
      fire(s, c, hb, `${rname(hb)}【块头太大】：${rname(t)} 被放到它身后一格。`);
    }
  }
  if (has(s, t, "huge_baby"))
    for (const o of others(s, t))
      if (o.pos === t.pos) {
        o.pos -= 1;
        fire(s, c, t, `${rname(t)}【块头太大】：${rname(o)} 被挤到它身后一格。`);
      }
}

/** 移动（main = 主移动）。n 可正可负；0 不算移动。 */
/**
 * 移动（main = 主移动；其余为技能移动 / 赛道移动，都算「移动」，会经过别人）。n 可正可负；0 不算移动。
 *
 * 吸盘鱼「和对方一起移动」：规则书 Fiddly Details #3 —— 一起到达同一格时，与「停在同一格」有关的能力照样触发；
 * 浪漫者说明 —— 两人一起移动时触发两次（每人一次）。所以跟随者在出发前决定，和移动者**同时**到达，
 * 到达后才逐个结算停格能力（此时两人已经在同一格）。2026-08 规则更新是否改动此处：见 CHECK_REQUIRED MA-U01。
 */
function move(s: MAState, c: Ctx, t: Token, n: number, main: boolean, why: string) {
  if (!active(t) || n === 0) return;
  const L = trackOf(s).length;
  const from = t.pos;

  // 1) 算出终点（跳跳蟾跳过有人的格子；较真怪要求恰好冲线）
  let p: number;
  let skips = 0;
  let overshoot = false;
  if (n < 0) {
    p = Math.max(0, from + n);
    if (p === from) return;
  } else {
    const leap = has(s, t, "leaptoad");
    let rem = n;
    p = from;
    while (rem > 0 && p < L) {
      p++;
      if (p < L && leap && onSpace(s, p).some((x) => x !== t)) skips++;
      else rem--;
    }
    overshoot = p >= L && rem > 0;
    if (overshoot) {
      const st = holders(s, "stickler").find((x) => x !== t);
      if (st) {
        fire(s, c, st, `${rname(st)}【分毫不差】：${rname(t)} 会走过头，不移动。`);
        return;
      }
    }
  }

  // 2) 同格的吸盘鱼在出发前决定要不要一起走
  const riders: Token[] = [];
  for (const f of holders(s, "suckerfish")) {
    if (f === t || f.pos !== from) continue;
    const v = ask(s, c, {
      player: f.owner,
      racer: f.racer,
      kind: "suckerfish",
      prompt: `${rname(f)}【吸附蹭车】：要跟着 ${rname(t)} 一起移动到${p >= L ? "终点" : `第 ${p} 格`}吗？`,
      options: [
        { value: "yes", label: "跟上" },
        { value: "no", label: "不跟" },
      ],
    });
    if (v !== "yes") continue;
    // 移动者自己是较真怪且走过头：跟着的吸盘鱼也会走过头，被较真怪拦下
    if (overshoot && holders(s, "stickler").some((x) => x !== f)) {
      log(s, `${rname(f)} 想跟上，但会走过头冲线，被【分毫不差】拦下。`);
      continue;
    }
    riders.push(f);
  }
  for (let k = 0; k < skips; k++) fire(s, c, t, `${rname(t)}【踩头过河】：跳过一个有人的格子。`);

  // 3) 一起到达
  const group = [t, ...riders];
  const passedOf = (g: Token) =>
    n < 0 ? [] : others(s, g).filter((o) => !group.includes(o) && o.pos > from && (p >= L || o.pos < p));
  const passed = new Map(group.map((g) => [g, passedOf(g)]));
  for (const f of riders) log(s, `${rname(f)}【吸附蹭车】跟着 ${rname(t)} 一起移动。`);
  if (p >= L) {
    for (const g of group) if (active(g)) finish(s, g);
    return;
  }
  for (const g of group) g.pos = p;
  log(
    s,
    n < 0
      ? `${group.map(rname).join("、")} 后退到第 ${p} 格（${why}）。`
      : `${group.map(rname).join("、")} ${main ? "主移动" : "移动"} ${n} 格，到第 ${p} 格（${why}）。`,
  );
  // 4) 到达后：巨婴调整位置，再逐个结算停格能力（按当前玩家 → 顺时针）
  const arrivals = inOrder(s).filter((x) => group.includes(x));
  for (const g of arrivals) hugeBaby(s, c, g);
  for (const g of arrivals) react(s, c, g, passed.get(g) ?? []);
  for (const f of riders) if (active(f)) fire(s, c, f, `${rname(f)}【吸附蹭车】发动。`);
}

/** 传送：放到新格子，不算移动，不经过任何人 */
function warp(s: MAState, c: Ctx, t: Token, to: number) {
  if (!active(t)) return;
  t.pos = Math.max(0, Math.min(trackOf(s).length - 1, to));
  hugeBaby(s, c, t);
  react(s, c, t, []);
}

/** 停在格子上之后：先结算赛道格，再按「当前玩家 → 顺时针」结算能力 */
function react(s: MAState, c: Ctx, t: Token, passed: Token[]) {
  if (!active(t)) return;
  const pos = t.pos;
  const sp = trackOf(s).specials[pos];
  if (sp) {
    if (sp.kind === "rock") {
      trip(s, t);
      log(s, `${rname(t)} 停在石头上，摔倒了。`);
    } else if (sp.kind === "star") {
      gainChip(s, t.owner, 1);
      log(s, `${rname(t)} 停在星星上，获得 1 分筹码。`);
    } else {
      // 例：巨婴在 12、箭头 11（+1）→ 被放回 11 → 再走箭头……按「循环结算一轮后停止」
      if (loopCheck(s, c, `arrow:${t.racer}@${pos}`, `${rname(t)} 与第 ${pos} 格箭头`)) return;
      log(s, `${rname(t)} 停在箭头上：额外移动 ${sp.steps} 格。`);
      move(s, c, t, sp.steps, false, "箭头");
      return;
    }
  }
  for (const x of inOrder(s)) {
    if (!active(t)) return;
    const p = powerOf(s, x);
    if (!p) continue;
    if (p === "banana" && passed.includes(x)) {
      trip(s, t);
      fire(s, c, x, `${rname(x)}【香蕉皮】：${rname(t)} 经过时摔倒。`);
    } else if (p === "centaur" && x === t && passed.length) {
      for (const o of passed) {
        move(s, c, o, -2, false, "尥蹶子");
        fire(s, c, x, `${rname(x)}【尥蹶子】：${rname(o)} 被踢后退 2 格。`);
      }
    } else if (p === "baba_yaga" && t.pos === pos) {
      if (x !== t && x.pos === pos) {
        trip(s, t);
        fire(s, c, x, `${rname(x)}【鸡脚小屋】：${rname(t)} 停到她的格子，摔倒。`);
      } else if (x === t)
        for (const o of onSpace(s, pos).filter((o) => o !== t)) {
          trip(s, o);
          fire(s, c, x, `${rname(x)}【鸡脚小屋】：停到 ${rname(o)} 的格子，${rname(o)} 摔倒。`);
        }
    } else if (p === "mouth" && x === t) {
      const o = onSpace(s, pos).filter((o) => o !== t);
      if (o.length === 1) {
        fire(s, c, x, `${rname(x)}【一口吞人】：${rname(o[0])} 被吞掉，淘汰出本场比赛！`);
        eliminate(s, o[0]);
      }
    } else if (p === "romantic" && t.pos === pos && onSpace(s, pos).length === 2) {
      move(s, c, x, 2, false, "见不得成双");
      fire(s, c, x, `${rname(x)}【见不得成双】：${rname(t)} 停进了两人格子，移动 2 格。`);
    } else if (p === "duelist" && t.pos === pos) {
      const foes =
        x === t ? onSpace(s, pos).filter((o) => o !== x) : x.pos === pos ? [t] : [];
      if (!foes.length) continue;
      const v = ask(s, c, {
        player: x.owner,
        racer: x.racer,
        kind: "duel",
        prompt: `${rname(x)}【单挑】：要喊「决斗」吗？`,
        options: [
          ...foes.map((o) => ({ value: o.racer, label: `和 ${rname(o)} 决斗` })),
          { value: "no", label: "不决斗" },
        ],
      });
      const o = foes.find((f) => f.racer === v);
      if (o) {
        const a = d6(s),
          b = d6(s);
        const winner = a >= b ? x : o;
        fire(s, c, x, `${rname(x)}【单挑】：${rname(x)} 掷 ${a}，${rname(o)} 掷 ${b}，${rname(winner)} 赢！`);
        move(s, c, winner, 2, false, "决斗获胜");
      }
    }
  }
}

// ---------------------------------------------------------------- 回合
function aloneInLead(s: MAState, t: Token) {
  const l = leaders(s);
  return l.length === 1 && l[0] === t;
}
function aloneLast(s: MAState, t: Token) {
  const act = race(s).tokens.filter(active);
  const min = Math.min(...act.map((x) => x.pos));
  const last = act.filter((x) => x.pos === min);
  return last.length === 1 && last[0] === t;
}

interface TurnFlags {
  extra: boolean;
  skipper: string | null;
}

function mainMove(s: MAState, c: Ctx, t: Token, f: TurnFlags) {
  const r = race(s);
  let prediction: number | null = null;
  if (has(s, t, "genius")) {
    const v = ask(s, c, {
      player: t.owner,
      racer: t.racer,
      kind: "genius",
      prompt: `${rname(t)}【预判自己】：预测这次主移动会掷出几点？`,
      options: [
        ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} 点` })),
        { value: "no", label: "不预测" },
      ],
    });
    if (v !== "no") {
      prediction = Number(v);
      log(s, `${rname(t)} 预测会掷出 ${v} 点。`);
    }
  }
  const start: Decision["options"] = [{ value: "roll", label: "🎲 掷骰" }];
  if (has(s, t, "legs")) start.push({ value: "legs", label: "【稳定输出】不掷骰，直接走 5 格" });
  if (has(s, t, "flip_flop"))
    for (const o of others(s, t))
      if (o.pos !== t.pos)
        start.push({ value: "flip:" + o.racer, label: `【瞬间换位】与 ${rname(o)} 交换位置` });
  const how = ask(s, c, {
    player: t.owner,
    racer: t.racer,
    kind: "main",
    prompt: `${rname(t)} 的主移动`,
    options: start,
  });
  if (how.startsWith("flip:")) {
    const o = others(s, t).find((x) => x.racer === how.slice(5))!;
    const [a, b] = [t.pos, o.pos];
    fire(s, c, t, `${rname(t)}【瞬间换位】：与 ${rname(o)} 交换位置。`);
    t.pos = b;
    o.pos = a;
    hugeBaby(s, c, t);
    hugeBaby(s, c, o);
    react(s, c, t, []);
    react(s, c, o, []);
    return;
  }
  let base: number;
  if (how === "legs") {
    base = 5;
    fire(s, c, t, `${rname(t)}【稳定输出】：不掷骰，走 5 格。`);
  } else {
    const roll = () => {
      const v = d6(s);
      r.lastRoll = { player: t.owner, racer: t.racer, value: v, seq: (r.lastRoll?.seq ?? 0) + 1 };
      return v;
    };
    let v = roll();
    log(s, `${pname(s, t.owner)} 为 ${rname(t)} 掷出 ${v}。`);
    let magic = has(s, t, "magician") ? 2 : 0;
    let diceUsed = false;
    for (;;) {
      const dms = holders(s, "dicemonger");
      const opts: Decision["options"] = [{ value: "keep", label: `就用 ${v} 点` }];
      if (magic > 0) opts.push({ value: "magician", label: `【变两次】重掷（还剩 ${magic} 次）` });
      if (dms.length && !diceUsed) opts.push({ value: "dicemonger", label: "【开放重掷】重掷一次" });
      if (opts.length === 1) break;
      const a = ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "reroll",
        prompt: `掷出 ${v} 点，要重掷吗？`,
        options: opts,
      });
      if (a === "keep") break;
      if (a === "magician") {
        magic--;
        fire(s, c, t, `${rname(t)}【变两次】重掷。`);
      } else {
        diceUsed = true;
        const dm = dms[0];
        fire(s, c, dm, `${rname(t)} 用【开放重掷】重掷。`);
        if (dm !== t) move(s, c, dm, 1, false, "开放重掷");
      }
      v = roll();
      log(s, `重掷结果：${v}。`);
    }
    if (prediction !== null) {
      if (prediction === v) {
        f.extra = true;
        fire(s, c, t, `${rname(t)}【预判自己】猜中了！本回合后再行动一次。`);
      } else log(s, `${rname(t)} 没猜中。`);
    }
    if (has(s, t, "sisyphus") && v === 6) {
      const me = player(s, t.owner);
      const i = me.chips.findLastIndex((ch) => ch.kind === "bronze");
      if (i >= 0) me.chips.splice(i, 1);
      fire(s, c, t, `${rname(t)}【推石头】掷出 6：传送回起点${i >= 0 ? "，失去 1 个分数筹码" : ""}。`);
      warp(s, c, t, 0);
      return;
    }
    let skip = false;
    if (v === 1) {
      for (const w of holders(s, "inchworm"))
        if (w !== t) {
          skip = true;
          fire(s, c, w, `${rname(w)}【雁过拔毛】：${rname(t)} 掷出 1，跳过这次移动。`);
          move(s, c, w, 1, false, "雁过拔毛");
        }
      const sk = holders(s, "skipper")[0];
      if (sk && f.skipper === null) {
        f.skipper = sk.owner;
        fire(s, c, sk, `${rname(sk)}【插队上】：有人掷出 1，${rname(sk)} 下一个行动。`);
      }
    }
    if (v === 6)
      for (const l of holders(s, "lackey"))
        if (l !== t) {
          fire(s, c, l, `${rname(l)}【点头哈腰】：${rname(t)} 掷出 6，它先走 2 格。`);
          move(s, c, l, 2, false, "点头哈腰");
        }
    if (skip || !active(t)) return;
    base = v;
    if (has(s, t, "alchemist") && v <= 2) {
      const a = ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "alchemist",
        prompt: `${rname(t)}【点石成金】：掷出 ${v}，要改为移动 4 格吗？`,
        options: [
          { value: "yes", label: "改为 4 格" },
          { value: "no", label: `就走 ${v} 格` },
        ],
      });
      if (a === "yes") {
        base = 4;
        fire(s, c, t, `${rname(t)}【点石成金】：改为移动 4 格。`);
      }
    }
  }
  let rocket = false;
  if (has(s, t, "rocket_scientist") && how !== "legs") {
    const a = ask(s, c, {
      player: t.owner,
      racer: t.racer,
      kind: "rocket",
      prompt: `${rname(t)}【一键加速】：要移动两倍（${base * 2} 格）然后摔倒吗？`,
      options: [
        { value: "yes", label: `冲 ${base * 2} 格（之后摔倒）` },
        { value: "no", label: `正常走 ${base} 格` },
      ],
    });
    if (a === "yes") {
      rocket = true;
      base *= 2;
      fire(s, c, t, `${rname(t)}【一键加速】：两倍移动！`);
    }
  }
  let dist = base;
  if (has(s, t, "blimp")) {
    const corner = trackOf(s).secondCorner ?? fail("CHECK_REQUIRED", "第二个弯道位置未确认。");
    const before = turnStartPos(t) < corner;
    dist += before ? 3 : -1;
    fire(s, c, t, `${rname(t)}【冲劲】：回合开始时${before ? "还没到第二个弯道，主移动 +3" : "已过第二个弯道，主移动 −1"}。`);
  }
  if (has(s, t, "hare")) {
    dist += 2;
    fire(s, c, t, `${rname(t)}【骄兵必败】：主移动 +2。`);
  }
  for (const co of holders(s, "coach"))
    if (co.pos === t.pos) {
      dist += 1;
      fire(s, c, co, `${rname(co)}【团队激励】：${rname(t)} 主移动 +1。`);
    }
  if (has(s, t, "party_animal")) {
    const n = onSpace(s, t.pos).filter((o) => o !== t).length;
    if (n) {
      dist += n;
      fire(s, c, t, `${rname(t)}【人气磁铁】：同格 ${n} 人，主移动 +${n}。`);
    }
  }
  for (const g of holders(s, "gunk"))
    if (g !== t) {
      dist -= 1;
      fire(s, c, g, `${rname(g)}【全场减速】：${rname(t)} 主移动 −1。`);
    }
  move(s, c, t, Math.max(0, dist), true, "主移动");
  if (rocket && active(t)) {
    trip(s, t);
    log(s, `${rname(t)} 冲完摔倒了。`);
  }
}

function beforeMain(s: MAState, c: Ctx, t: Token) {
  if (has(s, t, "lovable_loser") && aloneLast(s, t)) {
    gainChip(s, t.owner, 1);
    fire(s, c, t, `${rname(t)}【惨兮兮】：独自垫底，获得 1 分筹码。`);
  }
  if (has(s, t, "party_animal")) {
    fire(s, c, t, `${rname(t)}【人气磁铁】：所有选手向它移动 1 格。`);
    // 所有人同时各移动 1 格（规则书 Fiddly Details #3：同时到达照样触发停格能力，按到达后的局面判断）
    const movers = others(s, t).filter((o) => o.pos !== t.pos);
    const arrivals: Token[] = [];
    for (const o of movers) {
      const to = Math.max(0, o.pos + (o.pos < t.pos ? 1 : -1));
      if (to === o.pos) continue;
      o.pos = to;
      arrivals.push(o);
    }
    if (arrivals.length)
      log(s, arrivals.map((o) => `${rname(o)} → 第 ${o.pos} 格`).join("，") + "（人气磁铁，同时移动）");
    for (const o of arrivals) hugeBaby(s, c, o);
    for (const o of arrivals) react(s, c, o, []);
  }
  if (has(s, t, "cheerleader")) {
    const act = race(s).tokens.filter(active);
    const min = Math.min(...act.map((x) => x.pos));
    const last = inOrder(s).filter((x) => active(x) && x.pos === min);
    const a = ask(s, c, {
      player: t.owner,
      racer: t.racer,
      kind: "cheer",
      prompt: `${rname(t)}【加油打气】：让最后一名（${last.map(rname).join("、")}）移动 2 格，自己再移动 1 格？`,
      options: [
        { value: "yes", label: "加油！" },
        { value: "no", label: "不用" },
      ],
    });
    if (a === "yes") {
      fire(s, c, t, `${rname(t)}【加油打气】！`);
      for (const o of last) move(s, c, o, 2, false, "加油打气");
      move(s, c, t, 1, false, "加油打气");
    }
  }
  if (has(s, t, "hypnotist") && active(t)) {
    const targets = others(s, t).filter((o) => o.pos !== t.pos);
    if (targets.length) {
      const a = ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "hypnotist",
        prompt: `${rname(t)}【招之即来】：把一名选手传送到你的格子？`,
        options: [
          ...targets.map((o) => ({ value: o.racer, label: `${rname(o)}（第 ${o.pos} 格）` })),
          { value: "no", label: "不用" },
        ],
      });
      const o = targets.find((x) => x.racer === a);
      if (o) {
        fire(s, c, t, `${rname(t)}【招之即来】：把 ${rname(o)} 传送过来。`);
        warp(s, c, o, t.pos);
      }
    }
  }
  if (has(s, t, "third_wheel") && active(t)) {
    const counts = new Map<number, number>();
    for (const o of others(s, t)) counts.set(o.pos, (counts.get(o.pos) ?? 0) + 1);
    const spaces = [...counts].filter(([p, n]) => n === 2 && p !== t.pos).map(([p]) => p);
    if (spaces.length) {
      const a = ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "third_wheel",
        prompt: `${rname(t)}【插足小情侣】：传送到恰好有 2 人的格子？`,
        options: [
          ...spaces.map((p) => ({
            value: String(p),
            label: `第 ${p} 格（${onSpace(s, p).map(rname).join("、")}）`,
          })),
          { value: "no", label: "不用" },
        ],
      });
      if (a !== "no") {
        fire(s, c, t, `${rname(t)}【插足小情侣】：传送到第 ${a} 格。`);
        warp(s, c, t, Number(a));
      }
    }
  }
}

/** 本回合开始时的位置（飞艇用；每个单元都从快照重建，所以放在内存里即可） */
const turnStart = new WeakMap<Token, number>();
const turnStartPos = (t: Token) => turnStart.get(t) ?? t.pos;

/** 一名选手的回合（双选手变体里，一名玩家的回合包含两名选手各自的回合，先后完整进行） */
function racerTurn(s: MAState, c: Ctx, t: Token, f: TurnFlags) {
  const r = race(s);
  const startPos = t.pos;
  turnStart.set(t, startPos);
  {
    if (!t.started) {
      t.started = true;
      if (has(s, t, "mastermind") && r.mastermindPick === null) {
        const a = ask(s, c, {
          player: t.owner,
          racer: t.racer,
          kind: "mastermind",
          prompt: `${rname(t)}【开局下注】：预测哪名选手会赢得本场？`,
          options: r.tokens.map((o) => ({ value: o.racer, label: rname(o) })),
        });
        r.mastermindPick = a;
        fire(s, c, t, `${rname(t)}【开局下注】：预测 ${racerName(a)} 夺冠。`);
      }
    }
    if (t.base === "copycat") {
      const lead = leaders(s).filter((x) => x !== t);
      if (lead.length > 1) {
        t.copyPick = ask(s, c, {
          player: t.owner,
          racer: t.racer,
          kind: "copycat",
          prompt: `${rname(t)}【抄作业】：并列领先，要复制谁的能力？`,
          options: lead.map((o) => ({ value: o.racer, label: rname(o) })),
        });
      }
    }
    if (t.tripped) {
      ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "standup",
        prompt: `${rname(t)} 摔倒了，这回合跳过主移动。`,
        options: [{ value: "ok", label: "爬起来" }],
      });
      t.tripped = false;
      log(s, `${rname(t)} 爬了起来（跳过主移动）。`);
    } else {
      const hareSkip = has(s, t, "hare") && aloneInLead(s, t);
      beforeMain(s, c, t);
      if (hareSkip && active(t) && race(s).tokens.filter(active).length === 1) {
        // 场上只剩兔子：它永远独自领先、永远跳过主移动，比赛无法结束（MA-Q05，待用户裁定）
        log(s, `场上只剩 ${rname(t)}，它永远独自领先而无法移动，本场比赛结束（MA-Q05 暂定做法）。`);
        throw new RaceOver();
      }
      if (hareSkip && active(t)) {
        ask(s, c, {
          player: t.owner,
          racer: t.racer,
          kind: "hare",
          prompt: `${rname(t)}【骄兵必败】：回合开始时独自领先，跳过主移动。`,
          options: [{ value: "ok", label: "睡一会儿" }],
        });
        fire(s, c, t, `${rname(t)}【骄兵必败】：独自领先，打了个盹。`);
      } else if (active(t)) mainMove(s, c, t, f);
    }
    if (active(t) && Math.abs(t.pos - startPos) <= 1)
      for (const h of holders(s, "heckler"))
        if (h !== t) {
          fire(s, c, h, `${rname(h)}【幸灾乐祸】：${rname(t)} 这回合几乎没动，移动 2 格。`);
          move(s, c, h, 2, false, "幸灾乐祸");
        }
  }
}

/**
 * 一名玩家的回合。
 * - 标准：唯一的选手行动。
 * - 双选手（规则书 p26）：3 人变体「按你想要的顺序移动两名选手，完整结束一名再动另一名」；
 *   2 人变体「每名玩家的第一个回合选一名选手行动，之后每回合按想要的顺序使用每名选手」。
 */
function turnUnit(s: MAState, c: Ctx) {
  const r = race(s);
  const f: TurnFlags = { extra: false, skipper: null };
  const mine = () => inOrder(s).filter((x) => x.owner === r.current && active(x));
  try {
    let seq = mine();
    if (seq.length > 1) {
      const firstOnly = s.seats.length === 2 && !r.firstTurnDone.includes(r.current);
      const a = ask(s, c, {
        player: r.current,
        racer: null,
        kind: "order",
        prompt: firstOnly ? "你的第一个回合只用一名选手：用哪一名？" : "这回合两名选手都要行动：先动哪一名？",
        options: seq.map((x) => ({ value: x.racer, label: firstOnly ? rname(x) : `先动 ${rname(x)}` })),
      });
      const firstT = seq.find((x) => x.racer === a)!;
      seq = firstOnly ? [firstT] : [firstT, ...seq.filter((x) => x !== firstT)];
    }
    if (!r.firstTurnDone.includes(r.current)) r.firstTurnDone.push(r.current);
    for (const t of seq) if (active(t)) racerTurn(s, c, t, f);
  } catch (e) {
    // 等人决定时回合还没结束，不能换人；比赛结束时照常记下一位
    if (!(e instanceof Need)) nextTurn(s, f);
    throw e;
  }
  nextTurn(s, f);
}

function nextTurn(s: MAState, f: TurnFlags) {
  const r = race(s);
  const live = (id: string) => r.tokens.some((x) => x.owner === id && active(x));
  if (f.extra && live(r.current)) return;
  if (f.skipper && live(f.skipper)) {
    r.current = f.skipper;
    return;
  }
  const i = r.order.indexOf(r.current);
  for (let k = 1; k <= r.order.length; k++) {
    const id = r.order[(i + k) % r.order.length];
    if (live(id)) {
      r.current = id;
      return;
    }
  }
}

/** 赛前：神秘蛋、双胞胎、西西弗斯 */
function setupUnit(s: MAState, c: Ctx) {
  const r = race(s);
  for (const t of inOrder(s)) {
    if (t.racer === "egg") {
      const draw = s.deck.splice(0, 3);
      const a = ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "egg",
        prompt: "神秘蛋【开盲盒】：选一名选手，本场拥有它的能力。",
        options: draw.map((id) => ({ value: id, label: racerName(id) })),
      });
      t.base = a;
      s.deck.push(...draw.filter((x) => x !== a));
      log(s, `神秘蛋开出了 ${racerName(a)}！`);
    }
    if (t.racer === "twin" || t.base === "twin") {
      const opts = [...new Set(s.winners)];
      if (opts.length) {
        const a = ask(s, c, {
          player: t.owner,
          racer: t.racer,
          kind: "twin",
          prompt: `${rname(t)}【复刻冠军】：选一名之前比赛的冠军，用它的能力比赛？`,
          options: [
            ...opts.map((id) => ({ value: id, label: racerName(id) })),
            { value: "no", label: "不用" },
          ],
        });
        t.base = a === "no" ? "twin" : a;
        if (a !== "no") log(s, `${rname(t)} 复刻了 ${racerName(a)} 的能力。`);
      } else log(s, `${rname(t)}：之前还没有冠军，无法复刻。`);
    }
    if (t.base === "sisyphus") {
      for (let k = 0; k < 4; k++) gainChip(s, t.owner, 1);
      log(s, `${rname(t)}【推石头】：赛前获得 4 个分数筹码。`);
    }
  }
  r.setup = true;
}

// ---------------------------------------------------------------- 单元调度
const strip = (s: MAState) => JSON.stringify({ ...s, turn: null, pending: null });

function runUnit(snapshot: string, answers: string[]): { s: MAState; need: Decision | null } {
  const s: MAState = JSON.parse(snapshot);
  const c: Ctx = { answers, i: 0, guard: new Set(), depth: 0 };
  const r = race(s);
  try {
    if (!r.setup) setupUnit(s, c);
    else turnUnit(s, c);
    if (c.i < answers.length) fail("EXTRA_ANSWER", "多余的回答。");
    return { s, need: null };
  } catch (e) {
    if (e instanceof Need) return { s, need: e.decision };
    if (e instanceof RaceOver) {
      endRace(s);
      return { s, need: null };
    }
    throw e;
  }
}

/** 自动推进到下一个需要有人选择的地方 */
function advance(s: MAState): MAState {
  for (let guard = 0; guard < 1000; guard++) {
    if (s.phase !== "race" || !s.race || s.race.over) return s;
    const snapshot = strip(s);
    const res = runUnit(snapshot, []);
    if (res.need) {
      res.s.pending = res.need;
      res.s.turn = { snapshot, answers: [] };
      return res.s;
    }
    s = res.s;
  }
  return fail("LOOP", "自动结算次数过多。");
}

function endRace(s: MAState) {
  const r = race(s);
  r.over = true;
  const pts = s.settings.points[r.index] ?? DEFAULT_POINTS;
  const owner = (racer: string) => r.tokens.find((t) => t.racer === racer)!.owner;
  const [first, second] = r.finishers;
  if (first) {
    player(s, owner(first)).chips.push({ kind: "gold", value: pts.gold, race: r.index });
    s.winners.push(first);
  }
  if (second)
    player(s, owner(second)).chips.push({ kind: "silver", value: pts.silver, race: r.index });
  else log(s, "没有第二名，银牌作废。");
  log(
    s,
    `第 ${r.index + 1} 场结束：冠军 ${first ? racerName(first) : "无"}（+${pts.gold}），亚军 ${second ? racerName(second) : "无"}${second ? `（+${pts.silver}）` : ""}。`,
  );
  // 下一场先手：上一场最落后的选手（或第一个被淘汰的）；2 人变体：上一场得分较少的玩家，平分掷骰
  let next: string;
  if (s.seats.length === 2) {
    const got = s.seats.map((id) => ({
      id,
      v: total(player(s, id).chips.filter((ch) => ch.race === r.index)),
    }));
    next =
      got[0].v === got[1].v
        ? rollOff(s, s.seats, "上一场得分相同，掷骰决定下一场先手")
        : got[0].v < got[1].v ? got[0].id : got[1].id;
  } else if (r.eliminated.length) next = r.eliminated[0];
  else {
    const left = r.tokens.filter(active);
    if (left.length) {
      const min = Math.min(...left.map((t) => t.pos));
      const back = left.filter((t) => t.pos === min).map((t) => t.owner);
      next = back.length > 1 ? rollOff(s, back, "并列最落后，掷骰决定下一场先手") : back[0];
    } else next = r.order[0];
  }
  for (const p of s.players) p.choices = [];
  if (r.index + 1 >= s.settings.races) {
    s.phase = "over";
    const totals = s.players.map((p) => ({ p, v: total(p.chips) }));
    const max = Math.max(...totals.map((x) => x.v));
    log(s, `🏆 比赛结束！获胜：${totals.filter((x) => x.v === max).map((x) => x.p.name).join("、")}（${max} 分）`);
  } else {
    s.phase = "choose";
    s.nextFirst = next;
    log(s, `下一场由 ${pname(s, next)} 先手。请秘密选择出场选手。`);
  }
}

export const total = (chips: Chip[]) => chips.reduce((a, ch) => a + ch.value, 0);

function startRace(s: MAState) {
  const idx = s.race ? s.race.index + 1 : 0;
  const first = s.nextFirst ?? rollOff(s, s.seats, "决定第一场先手");
  s.nextFirst = null;
  const i = s.seats.indexOf(first);
  const order = [...s.seats.slice(i), ...s.seats.slice(0, i)];
  const track = s.settings.schedule[idx] ?? "mild";
  s.race = {
    index: idx,
    track,
    order,
    current: first,
    tokens: order.flatMap((id) =>
      player(s, id).choices.map((racer) => ({
        racer,
        owner: id,
        pos: 0,
        tripped: false,
        place: null,
        out: false,
        base: racer,
        copyPick: null,
        started: false,
      })),
    ),
    finishers: [],
    eliminated: [],
    mastermindPick: null,
    lastRoll: null,
    over: false,
    setup: false,
    firstTurnDone: [],
  };
  for (const p of s.players) p.used.push(...p.choices);
  s.phase = "race";
  log(
    s,
    `第 ${idx + 1} 场（${TRACKS[track].zh}）开始！出场：` +
      s.race.tokens.map((t) => `${pname(s, t.owner)}·${rname(t)}`).join("，"),
  );
}

// ---------------------------------------------------------------- 对外：reduce
export function reduceMA(prev: MAState, cmd: MACommand): MAState {
  let s: MAState = structuredClone(prev);
  const me = player(s, cmd.player);
  if (cmd.type === "DRAFT") {
    const d = s.phase === "draft" && s.draft ? s.draft : fail("PHASE", "现在不是选秀阶段。");
    if (d.order[d.step] !== me.id) fail("NOT_YOUR_PICK", "还没轮到你选。");
    if (!d.pool.includes(cmd.racer)) fail("NOT_IN_POOL", "这名选手不在场上。");
    d.pool = d.pool.filter((x) => x !== cmd.racer);
    me.hand.push(cmd.racer);
    log(s, `${me.name} 选了 ${racerName(cmd.racer)}。`);
    d.step++;
    if (d.step >= d.order.length) {
      s.deck.push(...d.pool);
      if (d.round + 1 < draftRounds(s)) startDraftRound(s, d.round + 1, d.startPlayer);
      else {
        s.draft = null;
        s.phase = "choose";
        log(s, "选秀结束！请秘密选择第 1 场的出场选手。");
      }
    }
  } else if (cmd.type === "CHOOSE") {
    if (s.phase !== "choose") fail("PHASE", "现在不是选择出场选手的阶段。");
    const need = s.settings.variant === "double" ? 2 : 1;
    const picks = cmd.racers ?? (cmd.racer ? [cmd.racer] : []);
    if (picks.length !== need) fail("PICK_COUNT", `这一场要派 ${need} 名选手。`);
    if (new Set(picks).size !== picks.length) fail("PICK_DUP", "要派两名不同的选手。");
    for (const racer of picks)
      if (!me.hand.includes(racer) || me.used.includes(racer))
        fail("NOT_AVAILABLE", "这名选手不能出场（不在手上或已经用过）。");
    me.choices = [...picks];
    if (s.players.every((p) => p.choices.length === need)) {
      startRace(s);
      s = advance(s);
    }
  } else {
    const p = s.pending ?? fail("NO_PENDING", "现在没有需要你决定的事。");
    if (p.player !== me.id) fail("NOT_YOUR_DECISION", "这不是你的决定。");
    if (!p.options.some((o) => o.value === cmd.value)) fail("BAD_OPTION", "无效的选项。");
    const turn = s.turn!;
    const answers = [...turn.answers, cmd.value];
    const res = runUnit(turn.snapshot, answers);
    if (res.need) {
      res.s.pending = res.need;
      res.s.turn = { snapshot: turn.snapshot, answers };
      s = res.s;
    } else {
      s = res.s;
      s.pending = null;
      s.turn = null;
      if (s.phase === "race") s = advance(s);
    }
  }
  s.version = prev.version + 1;
  return s;
}

/** 当前需要谁做什么（大厅/界面用） */
export function waitingFor(s: MAState): string[] {
  if (s.phase === "draft" && s.draft) return [s.draft.order[s.draft.step]];
  if (s.phase === "choose") return s.players.filter((p) => !p.choices.length).map((p) => p.id);
  if (s.pending) return [s.pending.player];
  return [];
}

/** 测试用：直接摆好一场比赛（跳过选秀），位置可指定，然后自动推进到第一个选择 */
export function testRace(opts: {
  racers: string[];
  pos?: number[];
  seed?: number;
  tripped?: boolean[];
  winners?: string[];
  skipSetup?: boolean;
  /** 接下来的骰子点数（测试用） */
  rolls?: number[];
  track?: "mild" | "wild";
}): MAState {
  const players = opts.racers.map((_, i) => ({ id: "p" + (i + 1), name: "玩家" + (i + 1) }));
  const s = createMAGame({ players: players.length >= 3 ? players : [...players, ...[{ id: "x1", name: "x" }, { id: "x2", name: "y" }].slice(0, 3 - players.length)], seed: opts.seed ?? 1 });
  s.players = s.players.slice(0, opts.racers.length);
  s.seats = s.seats.slice(0, opts.racers.length);
  s.draft = null;
  s.log = [];
  s.winners = opts.winners ?? [];
  s.players.forEach((p, i) => {
    p.hand = [opts.racers[i]];
    p.choices = [opts.racers[i]];
  });
  s.nextFirst = "p1";
  if (opts.track) s.settings.schedule = [opts.track, opts.track, opts.track, opts.track];
  s.race = { index: -1 } as RaceState;
  startRace(s);
  const r = s.race!;
  r.tokens.forEach((t, i) => {
    t.pos = opts.pos?.[i] ?? 0;
    t.tripped = opts.tripped?.[i] ?? false;
  });
  if (opts.skipSetup) r.setup = true;
  if (opts.rolls) s.forcedRolls = [...opts.rolls];
  return advance(s);
}
