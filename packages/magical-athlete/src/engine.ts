/**
 * 魔法运动员规则引擎：纯函数 reduce(state, command)。
 *
 * 一个「单元」（赛前结算、一名玩家的一个回合）从快照开始确定性执行；
 * 中途需要有人做选择时抛出 Need，状态停在那里并给出 pending。
 * 收到回答后，从快照带着全部回答重新执行同一单元（随机数也在快照里，所以结果一致）。
 * 这样所有中途选择（决斗、跟随、重掷……）都不需要手写「从中间继续」的逻辑。
 */
import { DRAFTABLE, racerName } from "./racers.ts";
import { SECOND_WIND_FIRST_CORNERS, SECOND_WIND_PREVIEW_IDS } from "./second-wind-preview.ts";
import { PLAYABLE_TRACKS, TRACKS } from "./tracks.ts";
import type {
  Chip,
  CreateMAOptions,
  Fx,
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
const d6 = (s: MAState) => (s.forcedRolls?.length ? s.forcedRolls.shift()! : 1 + randInt(s, 6));
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
  // 用户房规（2026-10-22）：上限放宽到 8 人（官方 2–6 人）；36 名选手够 8 人各 4 名
  if (n < 2 || n > 8) fail("PLAYER_COUNT", "魔法运动员支持 2–8 人。");
  // 用户房规（2026-10-20 HR-MA-01）：不论几人，每人每场只出 1 名选手、共 4 场 → 一律标准规则。
  // 规则书的 2 人 / 3 人双选手变体仍保留在引擎里，只有明确传 variant: "double" 时才用（测试用）。
  const variant: Settings["variant"] =
    (n === 2 || n === 3) && opts.settings?.variant === "double" ? "double" : "standard";
  if (new Set(opts.players.map((p) => p.id)).size !== n) fail("DUP_PLAYER", "玩家 id 重复。");
  const races = opts.settings?.races ?? 4;
  const schedule =
    opts.settings?.schedule ??
    Array.from({ length: races }, (_, i) =>
      i % 2 === 0 ? "mild" : PLAYABLE_TRACKS.includes("wild") ? "wild" : "mild",
    );
  for (const t of schedule)
    if (!PLAYABLE_TRACKS.includes(t)) fail("TRACK_UNCONFIRMED", `${TRACKS[t].zh}：${TRACKS[t].missing}。`);
  const deal: "draft" | "random" = opts.settings?.deal === "random" && variant === "standard" ? "random" : "draft";
  const settings: Settings = {
    ...(opts.settings?.secondWindPreview === true ? { secondWindPreview: true } : {}),
    races,
    variant,
    deal,
    schedule,
    points: opts.settings?.points ?? Array.from({ length: races }, () => ({ ...DEFAULT_POINTS })),
  };
  const s: MAState = {
    game: "magical-athlete",
    phase: "draft",
    rng: opts.seed >>> 0,
    players: opts.players.map((p): MAPlayer => ({
      id: p.id,
      name: p.name,
      hand: [],
      used: [],
      chips: [],
      choices: [],
    })),
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
  s.deck = shuffle(s, settings.secondWindPreview ? [...DRAFTABLE, ...SECOND_WIND_PREVIEW_IDS] : DRAFTABLE);
  if (deal === "random") {
    // 随机模式（用户 2026-10-20）：不选秀，从洗好的牌堆里给每人发 4 名。
    // 牌堆里每名选手只有一张，所以全场不会有两人拿到同一名选手。
    const each = 4;
    for (const p of s.players) p.hand = s.deck.splice(0, each);
    s.phase = "choose";
    log(s, `随机模式：每人随机发 ${each} 名选手（全场不重复）。`);
    for (const p of s.players) log(s, `${p.name} 拿到：${p.hand.map(racerName).join("、")}。`);
    log(s, "请秘密选择第 1 场的出场选手。");
    return s;
  }
  const start = rollOff(s, s.seats, "决定选秀先手");
  startDraftRound(s, 0, start);
  return s;
}

const pname = (s: MAState, id: string) => s.players.find((p) => p.id === id)?.name ?? id;
const player = (s: MAState, id: string) => s.players.find((p) => p.id === id) ?? fail("NO_PLAYER", "没有这名玩家。");
function log(s: MAState, text: string, fx?: Fx) {
  s.log.push({
    text,
    race: s.race ? s.race.index : null,
    ...(fx ? { fx } : {}),
  });
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
const draftRounds = (s: MAState) => (s.settings.variant === "standard" ? 2 : s.seats.length === 2 ? 2 : 4);

function startDraftRound(s: MAState, round: number, startPlayer: string) {
  const n = s.seats.length;
  const si = s.seats.indexOf(startPlayer);
  let order: string[];
  let flip: number;
  if (n === 2 && s.settings.variant === "double") {
    const [a, b] = round === 0 ? [startPlayer, s.seats[(si + 1) % 2]] : [s.seats[(si + 1) % 2], startPlayer];
    order = [a, b, b, a, a, b, b, a];
    flip = 8;
  } else {
    const first = (si + round) % n;
    const seq = Array.from({ length: n }, (_, i) => s.seats[(first + i) % n]);
    order = [...seq, ...[...seq].reverse()];
    flip = 2 * n;
  }
  s.draft = {
    round,
    pool: s.deck.splice(0, flip),
    order,
    step: 0,
    startPlayer,
  };
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
const onSpace = (s: MAState, pos: number) => race(s).tokens.filter((x) => active(x) && x.pos === pos);

function leaders(s: MAState): Token[] {
  const act = race(s).tokens.filter(active);
  if (!act.length) return [];
  const max = Math.max(...act.map((t) => t.pos));
  return act.filter((t) => t.pos === max);
}

/** 选手当前生效的能力 id（山寨猫取领先者的能力） */
function nativePowerOf(s: MAState, t: Token): string | null {
  if (!active(t)) return null;
  if (t.base.startsWith("sw_")) {
    if (!s.settings.secondWindPreview) fail("CONTENT_DISABLED", "Second Wind 开发预览未开启。");
    if (!SECOND_WIND_PREVIEW_IDS.includes(t.base)) fail("CHECK_REQUIRED", "这名 Second Wind 选手尚未实现。");
  }
  if (t.base !== "copycat") return t.base;
  const lead = leaders(s).filter((x) => x !== t);
  if (!lead.length) return null;
  const pick = lead.find((x) => x.racer === t.copyPick) ?? lead[0];
  return pick.base === "copycat" ? null : pick.base;
}
export function powerOf(s: MAState, t: Token): string | null {
  const p = nativePowerOf(s, t);
  if (p && suppressedByNull(s, t)) return null;
  return p;
}
function suppressedByNull(s: MAState, t: Token): boolean {
  return (
    !!s.settings.secondWindPreview &&
    race(s).tokens.some((o) => o !== t && active(o) && o.pos < t.pos && nativePowerOf(s, o) === "sw_null")
  );
}
const has = (s: MAState, t: Token, id: string) => powerOf(s, t) === id;
const holders = (s: MAState, id: string) => inOrder(s).filter((t) => has(s, t, id));

function registerReturner(s: MAState, t: Token) {
  if (!has(s, t, "sw_re_runner")) return;
  s.returningRacers ??= [];
  if (!s.returningRacers.some((x) => x.racer === t.racer))
    s.returningRacers.push({ racer: t.racer, owner: t.owner, base: "sw_re_runner" });
}
function hogActive(s: MAState, source: string) {
  const t = race(s).tokens.find((t) => t.racer === source);
  return !!t && has(s, t, "sw_hog_knight");
}
function spawnHog(s: MAState, c: Ctx, t: Token) {
  if (!has(s, t, "sw_hog_knight") || race(s).hogs?.some((h) => h.source === t.racer)) return;
  fire(s, c, t, `${rname(t)}【野猪坐骑】：骑上野猪。`, "sw_hog_knight");
  (race(s).hogs ??= []).push({ source: t.racer, rider: t.racer, pos: t.pos });
}
function takeHogs(s: MAState, c: Ctx, t: Token, simultaneous: boolean) {
  if (simultaneous) return;
  for (const h of race(s).hogs ?? []) {
    const rider = race(s).tokens.find((o) => o.racer === h.rider);
    const pos = rider?.pos ?? h.pos;
    if (h.rider === t.racer || pos !== t.pos || !hogActive(s, h.source)) continue;
    fire(
      s,
      c,
      race(s).tokens.find((o) => o.racer === h.source)!,
      `${rname(t)}【野猪坐骑】：接走野猪。`,
      "sw_hog_knight",
    );
    h.rider = t.racer;
    h.pos = t.pos;
  }
}

// ---------------------------------------------------------------- 单元执行上下文
interface Ctx {
  answers: string[];
  i: number;
  guard: Set<string>;
  depth: number;
  criticUsed: Set<string>;
}

function ask(s: MAState, c: Ctx, d: Decision): string {
  if (c.i < c.answers.length) return c.answers[c.i++];
  throw new Need(d);
}

/** 局面指纹：所有选手的位置、摔倒、名次、淘汰（判断「真正重复、不改变状态」的无限循环） */
function stateKey(s: MAState) {
  const positions = race(s)
    .tokens.map((t) => `${t.pos}${t.tripped ? "T" : ""}${t.place ?? ""}${t.out ? "X" : ""}`)
    .join(",");
  return s.settings.secondWindPreview
    ? positions +
        JSON.stringify({
          powers: race(s).tokens.map((t) => [t.racer, t.owner, t.base, t.secondWind]),
          hogs: race(s).hogs,
          deck: s.deck.length,
        })
    : positions;
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
function fire(s: MAState, c: Ctx, src: Token, text: string, powerOverride?: string) {
  log(s, text, {
    kind: "power",
    racer: src.racer,
    power: powerOverride ?? powerOf(s, src) ?? src.base,
  });
  // End-of-race powers get the usual skill card, without resuming the race.
  if (race(s).over) return;
  for (const sc of holders(s, "scoocher")) {
    if (sc === src) continue;
    if (loopCheck(s, c, `scooch:${src.racer}>${sc.racer}`, `${rname(sc)} 与 ${rname(src)} 互相触发`)) continue;
    move(s, c, sc, 1, false, "蹭局王");
    if (active(sc)) fire(s, c, sc, `${rname(sc)}【蹭局王】：因 ${rname(src)} 的能力移动 1 格。`);
  }
}

function trip(s: MAState, t: Token) {
  if (!active(t)) return;
  t.tripped = true;
  log(s, "", { kind: "trip", racer: t.racer });
}
function gainChip(s: MAState, owner: string, value: number) {
  if (value < 0) {
    const payer = player(s, owner);
    if (total(payer.chips) < -value) fail("POINTS", "积分不足。");
    let remaining = -value;
    for (const kind of ["bronze", "silver", "gold"] as const) {
      for (const chip of payer.chips.filter((ch) => ch.kind === kind && ch.value > 0)) {
        const paid = Math.min(remaining, chip.value);
        if (paid && chip.race !== race(s).index) {
          const spending = (race(s).priorRaceSpending ??= {});
          spending[owner] = (spending[owner] ?? 0) + paid;
        }
        chip.value -= paid;
        remaining -= paid;
        if (!remaining) break;
      }
      if (!remaining) break;
    }
    payer.chips = payer.chips.filter((ch) => ch.value > 0);
    log(s, "", { kind: "chip", player: owner, value });
    return;
  }
  player(s, owner).chips.push({ kind: "bronze", value, race: race(s).index });
  log(s, "", { kind: "chip", player: owner, value });
}

const leftOf = (s: MAState, t: Token) => {
  const tokens = race(s).tokens;
  return tokens[(tokens.indexOf(t) + 1) % tokens.length];
};

/** A skill-card's Scoocher chain must not erase an already-triggered award. */
function awardPower(s: MAState, c: Ctx, src: Token, amount: number, text: string, id: string) {
  try {
    fire(s, c, src, text, id);
  } catch (e) {
    if (e instanceof RaceOver) gainChip(s, src.owner, amount);
    throw e;
  }
  gainChip(s, src.owner, amount);
}

function finish(s: MAState, c: Ctx, t: Token) {
  const r = race(s);
  const eligibleMasterminds = s.settings.secondWindPreview ? new Set(holders(s, "mastermind")) : null;
  if (!r.finishers.length && !r.championIntercepted) {
    const gang = holders(s, "sw_doppelgangster");
    if (gang.length) {
      const inherited = powerOf(s, t) ?? t.base;
      r.championIntercepted = true;
      for (const d of gang) {
        fire(s, c, d, `${rname(d)}【冠军替身】：${rname(t)} 改为淘汰，取得其能力。`, "sw_doppelgangster");
        if (d !== t) {
          d.base = inherited;
          registerReturner(s, d);
        }
      }
      eliminate(s, t);
      return;
    }
  }
  const stepdads = holders(s, "sw_stepdad").filter((dad) => leftOf(s, dad) === t);
  t.pos = trackOf(s).length;
  r.finishers.push(t.racer);
  t.place = r.finishers.length;
  log(s, `🏁 ${rname(t)}（${pname(s, t.owner)}）第 ${t.place} 个冲过终点！`, {
    kind: "finish",
    racer: t.racer,
    place: t.place,
  });
  if (t.place === 1)
    for (const dad of stepdads)
      awardPower(s, c, dad, 3, `${rname(dad)}【扶你一把】：左侧 ${rname(t)} 第一个冲线，获得 3 分。`, "sw_stepdad");
  if (t.place === 1 && r.mastermindPick === t.racer) {
    const mm = r.tokens.find(
      (x) => x.base === "mastermind" && !x.out && (!eligibleMasterminds || eligibleMasterminds.has(x)),
    );
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
  log(s, "", { kind: "out", racer: t.racer });
  race(s).eliminated.push(t.owner);
  checkEnd(s);
}

/** 巨婴：除起点外不能与它同格 */
function hugeBaby(s: MAState, c: Ctx, t: Token) {
  if (!active(t) || t.pos === 0) return;
  for (const hb of holders(s, "huge_baby")) {
    if (hb !== t && hb.pos === t.pos && t.pos > 0) {
      t.pos -= 1;
      log(s, "", { kind: "warp", racer: t.racer, from: t.pos + 1, to: t.pos });
      fire(s, c, hb, `${rname(hb)}【块头太大】：${rname(t)} 被放到它身后一格。`);
    }
  }
  if (has(s, t, "huge_baby"))
    for (const o of others(s, t))
      if (o.pos === t.pos) {
        o.pos -= 1;
        log(s, "", {
          kind: "warp",
          racer: o.racer,
          from: o.pos + 1,
          to: o.pos,
        });
        fire(s, c, t, `${rname(t)}【块头太大】：${rname(o)} 被挤到它身后一格。`);
      }
}

/** 移动（main = 主移动）。n 可正可负；0 不算移动。 */
/**
 * 移动（main = 主移动；其余为技能移动 / 赛道移动，都算「移动」，会经过别人）。n 可正可负；0 不算移动。
 *
 * 吸盘鱼「和对方一起移动」：规则书 Fiddly Details #3 —— 一起到达同一格时，与「停在同一格」有关的能力照样触发；
 * 浪漫者说明 —— 两人一起移动时触发两次（每人一次）。所以跟随者在出发前决定，和移动者**同时**到达，
 * 到达后才逐个结算（此时两人已经在同一格）。2026-08 规则更新：同时到达时「停在格子上」的能力不触发（见 react）。
 */
function move(s: MAState, c: Ctx, t: Token, n: number, main: boolean, why: string, together: Token[] = []) {
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

  // 3) 一起到达（together：同一个效果让同一格的几个人一起移动，如啦啦队长让并列最后的人一起走 2）
  const group = [t, ...together.filter((x) => active(x) && x.pos === from && x !== t), ...riders];
  const streaking = new Set(group.filter((g) => has(s, g, "sw_streaker")));
  const penguins = new Set(holders(s, "sw_penguin"));
  const biting = new Set(group.filter((g) => has(s, g, "sw_bite_mark") && g.secondWind?.wereMouth));
  const magicalTrip =
    main &&
    n > 0 &&
    has(s, t, "sw_magical_athlete") &&
    race(s).lastRoll?.racer === t.racer &&
    race(s).lastRoll?.value === 6;
  // 经过 = 出发时在自己前面、停下后在自己后面（巨婴把人挤到身后也算被经过，设计师在 BGG 裁定巨婴 × 香蕉会摔倒）
  const before = new Map(race(s).tokens.map((o) => [o, o.pos]));
  const passedOf = (g: Token) =>
    n < 0
      ? []
      : others(s, g).filter(
          (o) => !group.includes(o) && (before.get(o) ?? 0) > from && (g.place !== null || o.pos < g.pos),
        );
  for (const f of riders) log(s, `${rname(f)}【吸附蹭车】跟着 ${rname(t)} 一起移动。`);
  log(s, "", {
    kind: "move",
    racers: group.map((g) => g.racer),
    from,
    to: Math.min(p, L),
    why,
  });
  if (p >= L) {
    for (const g of group)
      if (active(g)) {
        if (magicalTrip && g === t)
          magicPass(
            s,
            c,
            g,
            others(s, g).filter((o) => !group.includes(o) && (before.get(o) ?? 0) > from),
          );
        if (biting.has(g))
          bitePass(
            s,
            c,
            g,
            others(s, g).filter((o) => !group.includes(o) && (before.get(o) ?? 0) > from),
          );
        penguinPass(
          s,
          c,
          n < 0 ? [] : others(s, g).filter((o) => !group.includes(o) && (before.get(o) ?? 0) > from),
          penguins,
        );
        if (n > 0 && streaking.has(g) && others(s, g).some((o) => !group.includes(o) && (before.get(o) ?? 0) > from)) {
          fire(s, c, g, `${rname(g)}【擦身得分】：经过其他选手，获得 1 分。`, "sw_streaker");
          gainChip(s, g.owner, 1);
        }
        finish(s, c, g);
      }
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
  const passed = new Map(group.map((g) => [g, passedOf(g)]));
  if (magicalTrip) magicPass(s, c, t, passed.get(t) ?? []);
  for (const g of arrivals) if (biting.has(g)) bitePass(s, c, g, passed.get(g) ?? []);
  for (const g of arrivals) react(s, c, g, passed.get(g) ?? [], group.length > 1, streaking.has(g), penguins);
  for (const f of riders) if (active(f)) fire(s, c, f, `${rname(f)}【吸附蹭车】发动。`);
}

/** 传送：放到新格子，不算移动，不经过任何人 */
function warp(s: MAState, c: Ctx, t: Token, to: number, exchange?: Token, group?: Token[]) {
  if (group) {
    const arrivals = inOrder(s).filter((x) => active(x) && group.includes(x));
    const destination = Math.max(0, Math.min(trackOf(s).length - 1, to));
    for (const o of arrivals) {
      const from = o.pos;
      o.pos = destination;
      log(s, "", { kind: "warp", racer: o.racer, from, to: destination });
    }
    for (const o of arrivals) hugeBaby(s, c, o);
    for (const o of arrivals) react(s, c, o, [], arrivals.length > 1);
    return;
  }
  if (!active(t)) return;
  if (exchange && !active(exchange)) return;
  const from = t.pos;
  t.pos = Math.max(0, Math.min(trackOf(s).length - 1, to));
  log(s, "", { kind: "warp", racer: t.racer, from, to: t.pos });
  if (exchange) {
    const exchangeFrom = exchange.pos;
    exchange.pos = from;
    log(s, "", {
      kind: "warp",
      racer: exchange.racer,
      from: exchangeFrom,
      to: exchange.pos,
    });
    hugeBaby(s, c, t);
    hugeBaby(s, c, exchange);
    react(s, c, t, [], true);
    react(s, c, exchange, [], true);
    return;
  }
  hugeBaby(s, c, t);
  react(s, c, t, []);
}

/** 停在格子上之后：先结算赛道格，再按「当前玩家 → 顺时针」结算能力 */
/**
 * simultaneous：这名选手是与别人**同时到达**的（吸盘鱼一起走、派对咖同时吸引、人字拖同时交换）。
 * 2026-08 规则更新（设计师 Alex Hague，BGG 帖 3754599）：
 * “Stopping on a space” powers DON'T trigger if racers arrive simultaneously, like in the case of Party Animal.
 * → 浪漫者、血盆大口、芭芭雅嘎这类「停在格子上」的能力对同时到达者不触发。赛道格（箭头/石头/星星）不是能力，照常生效（CHECK_REQUIRED MA-U01b）。
 */
function bitePass(s: MAState, c: Ctx, source: Token, passed: Token[]) {
  const targets = passed.filter(active);
  if (!targets.length) return;
  fire(s, c, source, `${rname(source)}【巨口变身】：淘汰经过的 ${targets.map(rname).join("、")}。`, "sw_bite_mark");
  for (const target of targets) if (active(target)) eliminate(s, target);
}
function magicPass(s: MAState, c: Ctx, t: Token, targets: Token[]) {
  const hit = targets.filter(active);
  if (!hit.length) return;
  fire(s, c, t, `${rname(t)}【六面魔法】：绊倒经过的 ${hit.map(rname).join("、")}。`, "sw_magical_athlete");
  for (const o of hit) trip(s, o);
}

function penguinPass(s: MAState, c: Ctx, passed: Token[], penguins?: Set<Token>) {
  for (const penguin of passed) {
    if (!active(penguin) || !(penguins ? penguins.has(penguin) : has(s, penguin, "sw_penguin"))) continue;
    fire(s, c, penguin, `${rname(penguin)}【肚皮滑行】：被经过，自己摔倒。`, "sw_penguin");
    trip(s, penguin);
  }
}

function react(
  s: MAState,
  c: Ctx,
  t: Token,
  passed: Token[],
  simultaneous = false,
  streaking = false,
  penguins?: Set<Token>,
) {
  if (!active(t)) return;
  penguinPass(s, c, passed, penguins);
  if (streaking && passed.length) {
    fire(s, c, t, `${rname(t)}【擦身得分】：经过其他选手，获得 1 分。`, "sw_streaker");
    gainChip(s, t.owner, 1);
  }
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
      // 箭头会开始新的一段移动并提前返回；必须先结算刚刚这段移动经过的香蕉。
      // 不能把 passed 交给下一段：下一段可能后退，或香蕉已经移动到别处。
      for (const x of inOrder(s)) {
        if (powerOf(s, x) === "banana" && passed.includes(x)) {
          trip(s, t);
          fire(s, c, x, `${rname(x)}【香蕉皮】：${rname(t)} 经过时摔倒。`);
        }
      }
      // 例：巨婴在 12、箭头 11（+1）→ 被放回 11 → 再走箭头……按「循环结算一轮后停止」
      if (loopCheck(s, c, `arrow:${t.racer}@${pos}`, `${rname(t)} 与第 ${pos} 格箭头`)) return;
      log(s, `${rname(t)} 停在箭头上：额外移动 ${sp.steps} 格。`);
      move(s, c, t, sp.steps, false, "箭头");
      return;
    }
  }
  takeHogs(s, c, t, simultaneous);
  for (const x of inOrder(s)) {
    if (!active(t)) return;
    const p = powerOf(s, x);
    if (!p) continue;
    if (p === "sw_hotel" && x !== t && t.pos === pos && x.pos === pos && !simultaneous) {
      if (
        loopCheck(
          s,
          c,
          `hotel:${x.racer}>${t.racer}:${total(player(s, t.owner).chips)}:${total(player(s, x.owner).chips)}`,
          `${rname(x)} 重复收取同一停格费用`,
        )
      )
        continue;
      fire(s, c, x, `${rname(x)}【过路房费】：结算 ${rname(t)} 的 1 分房费。`, "sw_hotel");
      const canPay = total(player(s, t.owner).chips) >= 1;
      if (canPay && t.owner !== x.owner) {
        gainChip(s, t.owner, -1);
        gainChip(s, x.owner, 1);
      } else if (!canPay) trip(s, t);
    } else if (p === "banana" && passed.includes(x)) {
      trip(s, t);
      fire(s, c, x, `${rname(x)}【香蕉皮】：${rname(t)} 经过时摔倒。`);
    } else if (p === "centaur" && x === t && passed.length) {
      for (const o of passed) {
        move(s, c, o, -2, false, "尥蹶子");
        fire(s, c, x, `${rname(x)}【尥蹶子】：${rname(o)} 被踢后退 2 格。`);
      }
    } else if (p === "baba_yaga" && t.pos === pos && !simultaneous) {
      if (x !== t && x.pos === pos) {
        trip(s, t);
        fire(s, c, x, `${rname(x)}【鸡脚小屋】：${rname(t)} 停到她的格子，摔倒。`);
      } else if (x === t)
        for (const o of onSpace(s, pos).filter((o) => o !== t)) {
          trip(s, o);
          fire(s, c, x, `${rname(x)}【鸡脚小屋】：停到 ${rname(o)} 的格子，${rname(o)} 摔倒。`);
        }
    } else if (p === "mouth" && x === t && !simultaneous) {
      const o = onSpace(s, pos).filter((o) => o !== t);
      if (o.length === 1) {
        fire(s, c, x, `${rname(x)}【一口吞人】：${rname(o[0])} 被吞掉，淘汰出本场比赛！`);
        eliminate(s, o[0]);
      }
    } else if (p === "romantic" && t.pos === pos && !simultaneous && onSpace(s, pos).length === 2) {
      move(s, c, x, 2, false, "见不得成双");
      fire(s, c, x, `${rname(x)}【见不得成双】：${rname(t)} 停进了两人格子，移动 2 格。`);
    } else if (p === "duelist" && t.pos === pos && !simultaneous) {
      const foes = x === t ? onSpace(s, pos).filter((o) => o !== x) : x.pos === pos ? [t] : [];
      if (!foes.length) continue;
      const v = ask(s, c, {
        player: x.owner,
        racer: x.racer,
        kind: "duel",
        prompt: `${rname(x)}【单挑】：要喊「决斗」吗？`,
        options: [
          ...foes.map((o) => ({
            value: o.racer,
            label: `和 ${rname(o)} 决斗`,
          })),
          { value: "no", label: "不决斗" },
        ],
      });
      const o = foes.find((f) => f.racer === v);
      if (o) {
        const a = racerDie(s, c, x),
          b = racerDie(s, c, o);
        const winner = a >= b ? x : o;
        log(s, "", {
          kind: "duel",
          a: { racer: x.racer, value: a },
          b: { racer: o.racer, value: b },
        });
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

/** Racer-owned rolls, including auxiliary dice; player roll-offs stay unchanged. */
function racerDie(s: MAState, c: Ctx, t: Token) {
  for (let safety = 0; safety < SAFETY; safety++) {
    const stunner = holders(s, "sw_stunner").find((o) => o !== t && Math.abs(o.pos - t.pos) <= 1);
    const raw = d6(s);
    if (stunner) {
      fire(s, c, stunner, `${rname(stunner)}【全场看呆】：${rname(t)} 的骰点视为 1。`, "sw_stunner");
      return 1;
    }
    const poopers = holders(s, "sw_party_pooper");
    if (raw !== 6 || !poopers.length) return raw;
    log(s, `${rname(t)} 掷出 6，必须重掷。`, {
      kind: "roll",
      player: t.owner,
      racer: t.racer,
      value: 6,
      reroll: true,
    });
    for (const p of poopers) {
      if (!active(p)) continue;
      fire(s, c, p, `${rname(p)}【噪音投诉】：重掷 6，移动 1 格。`, "sw_party_pooper");
      move(s, c, p, 1, false, "噪音投诉");
    }
  }
  return fail("ENGINE_SAFETY", "连续强制重掷超过程序保险，请保存本局记录。");
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
        ...[1, 2, 3, 4, 5, 6].map((n) => ({
          value: String(n),
          label: `${n} 点`,
        })),
        { value: "no", label: "不预测" },
      ],
    });
    if (v !== "no") {
      prediction = Number(v);
      log(s, `${rname(t)} 预测会掷出 ${v} 点。`);
    }
  }
  const start: Decision["options"] = [{ value: "roll", label: "🎲 掷骰" }];
  if (has(s, t, "sw_cheatah")) start[0].label = "秘密设骰";
  if (has(s, t, "sw_mole") && !others(s, t).some((o) => Math.abs(o.pos - t.pos) <= 1))
    start.push({ value: "mole", label: "【挖地直行】不掷骰，直接走 6 格" });
  if (has(s, t, "legs")) start.push({ value: "legs", label: "【稳定输出】不掷骰，直接走 5 格" });
  if (has(s, t, "flip_flop"))
    for (const o of others(s, t))
      if (o.pos !== t.pos)
        start.push({
          value: "flip:" + o.racer,
          label: `【瞬间换位】与 ${rname(o)} 交换位置`,
        });
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
    log(s, "", { kind: "warp", racer: t.racer, from: a, to: b });
    log(s, "", { kind: "warp", racer: o.racer, from: b, to: a });
    hugeBaby(s, c, t);
    hugeBaby(s, c, o);
    react(s, c, t, [], true);
    react(s, c, o, [], true);
    return;
  }
  let base: number;
  let reverseMain = false;
  let mainRoll: number | null = null;
  if (has(s, t, "sw_cheatah")) {
    const options = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} 点` }));
    const chosen = ask(s, c, {
      player: t.owner,
      racer: t.racer,
      kind: "cheatah_set",
      prompt: `${rname(t)}【藏骰戏法】：秘密设定点数。`,
      options,
    });
    const right = s.seats[(s.seats.indexOf(t.owner) + s.seats.length - 1) % s.seats.length];
    const guess = ask(s, c, {
      player: right,
      racer: t.racer,
      kind: "cheatah_guess",
      prompt: `${rname(t)}【藏骰戏法】：猜出秘密点数。`,
      options,
    });
    fire(
      s,
      c,
      t,
      `${rname(t)}【藏骰戏法】：设为 ${chosen}，猜 ${guess}，${chosen === guess ? "猜中，不移动" : "未猜中"}。`,
      "sw_cheatah",
    );
    if (chosen === guess) return;
    base = Number(chosen);
  } else if (how === "legs" || how === "mole") {
    base = how === "mole" ? 6 : 5;
    fire(s, c, t, `${rname(t)}【${how === "mole" ? "挖地直行" : "稳定输出"}】：不掷骰，走 ${base} 格。`);
  } else {
    let pooled = false;
    const roll = () => {
      pooled = has(s, t, "sw_mr_dice_guy");
      let v: number;
      if (pooled) {
        fire(s, c, t, `${rname(t)}【重复为王】：掷六颗骰子，选择重复点数。`, "sw_mr_dice_guy");
        for (let safety = 0; ; safety++) {
          if (safety >= SAFETY) fail("ENGINE_SAFETY", "六骰连续不重复超过程序保险。");
          const values: number[] = [];
          for (let i = 0; i < 6; i++) {
            const value = racerDie(s, c, t);
            values.push(value);
            log(s, `${rname(t)} 第 ${i + 1} 颗骰子：${value}。`, {
              kind: "roll",
              player: t.owner,
              racer: t.racer,
              value,
            });
          }
          const repeated = [...new Set(values)]
            .filter((n) => values.filter((v) => v === n).length > 1)
            .sort((a, b) => a - b);
          if (!repeated.length) {
            fire(s, c, t, `${rname(t)}【重复为王】：六颗全不重复，按用户裁定全部重掷。`, "sw_mr_dice_guy");
            continue;
          }
          v = Number(
            ask(s, c, {
              player: t.owner,
              racer: t.racer,
              kind: "dice_pool",
              prompt: `${rname(t)}【重复为王】：${values.join("、")}，选择重复数字。`,
              options: repeated.map((n) => ({
                value: String(n),
                label: `${n} 点`,
              })),
            }),
          );
          break;
        }
      } else v = racerDie(s, c, t);
      r.lastRoll = {
        player: t.owner,
        racer: t.racer,
        value: v,
        seq: (r.lastRoll?.seq ?? 0) + 1,
      };
      return v;
    };
    let showTotal = 0;
    let previousShowRoll: number | null = null;
    let diceUsed = false;
    for (;;) {
      let v = roll();
      log(
        s,
        `${pname(s, t.owner)} 为 ${rname(t)} 掷出 ${v}。`,
        pooled
          ? undefined
          : {
              kind: "roll",
              player: t.owner,
              racer: t.racer,
              value: v,
            },
      );
      let magic = has(s, t, "magician") ? 2 : 0;
      for (;;) {
        let forcedByCritic = false;
        for (const critic of holders(s, "sw_critic")) {
          if (critic === t || t.pos <= critic.pos || c.criticUsed.has(critic.racer)) continue;
          const picked = ask(s, c, {
            player: critic.owner,
            racer: critic.racer,
            kind: "critic",
            prompt: `${rname(critic)}【评头论足】：让前方的 ${rname(t)} 重掷 ${v} 点？`,
            options: [
              { value: "yes", label: "让他重掷" },
              { value: "no", label: "不用" },
            ],
          });
          if (picked !== "yes") continue;
          c.criticUsed.add(critic.racer);
          fire(s, c, critic, `${rname(critic)}【评头论足】：让 ${rname(t)} 重掷主移动骰。`);
          v = roll();
          log(
            s,
            `评论家要求重掷：${v}。`,
            pooled
              ? undefined
              : {
                  kind: "roll",
                  player: t.owner,
                  racer: t.racer,
                  value: v,
                  reroll: true,
                },
          );
          forcedByCritic = true;
          break;
        }
        if (forcedByCritic) continue;
        const dms = holders(s, "dicemonger");
        const opts: Decision["options"] = [{ value: "keep", label: `就用 ${v} 点` }];
        if (magic > 0)
          opts.push({
            value: "magician",
            label: `【变两次】重掷（还剩 ${magic} 次）`,
          });
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
        log(
          s,
          `重掷结果：${v}。`,
          pooled
            ? undefined
            : {
                kind: "roll",
                player: t.owner,
                racer: t.racer,
                value: v,
                reroll: true,
              },
        );
      }
      mainRoll = v;
      if (has(s, t, "sw_mush") && v <= 2) {
        const drawn = s.deck[0];
        fire(
          s,
          c,
          t,
          `${rname(t)}【百变糊糊】：${drawn ? `抽到 ${racerName(drawn)}，替换本场能力。` : "牌堆已空，保留当前能力。"}`,
          "sw_mush",
        );
        if (drawn) {
          s.deck.shift();
          t.base = drawn;
          registerReturner(s, t);
        }
      }
      if (has(s, t, "sw_bite_mark") && v <= 2 && !t.secondWind?.wereMouth) {
        fire(s, c, t, `${rname(t)}【巨口变身】：变成巨口，本场淘汰经过的选手。`, "sw_bite_mark");
        t.secondWind = { ...t.secondWind, wereMouth: true };
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
      // Final roll only: replaced rolls never eliminate Icarus. Apply its own
      // effect before other racers react, but still dispatch their roll triggers.
      if (has(s, t, "sw_icarus") && v === 6) {
        fire(s, c, t, `${rname(t)}【飞行风险】：最终掷出 6，淘汰出本场。`, "sw_icarus");
        eliminate(s, t);
      }
      for (const rival of holders(s, "sw_nemesis")) {
        if (rival === t) continue;
        const choice = ask(s, c, {
          player: rival.owner,
          racer: rival.racer,
          kind: "nemesis",
          prompt: `${rname(rival)}【宿命对决】：跟掷 ${rname(t)} 的 ${v} 点？`,
          options: [
            { value: "yes", label: "🎲 跟掷" },
            { value: "no", label: "不用" },
          ],
        });
        if (choice !== "yes") continue;
        fire(s, c, rival, `${rname(rival)}【宿命对决】：跟掷，目标 ${v} 点。`, "sw_nemesis");
        const matched = racerDie(s, c, rival);
        log(s, `${rname(rival)} 跟掷 ${matched}，${matched === v ? "相同，移动" : "不同，不移动"}。`, {
          kind: "roll",
          player: rival.owner,
          racer: rival.racer,
          value: matched,
        });
        if (matched === v) move(s, c, rival, matched, false, "宿命对决");
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
      if (v === 3)
        for (const sab of holders(s, "sw_le_saboteur"))
          if (sab !== t) {
            reverseMain = true;
            fire(s, c, sab, `${rname(sab)}【三点倒车】：${rname(t)} 的主移动改为后退。`);
          }
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
      if (!has(s, t, "sw_show_off")) break;
      if (previousShowRoll !== null && v <= previousShowRoll) {
        fire(s, c, t, `${rname(t)}【看我表演】：${v} 不大于上次 ${previousShowRoll}，本次不移动。`, "sw_show_off");
        return;
      }
      showTotal += v;
      const next = ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "showoff",
        prompt: `${rname(t)}【看我表演】：累计 ${showTotal} 格，上次 ${v} 点；继续冒险？`,
        options: [
          { value: "stop", label: `收手，移动 ${showTotal} 格` },
          { value: "roll", label: "🎲 再掷一次" },
        ],
      });
      if (next === "stop") {
        base = showTotal;
        break;
      }
      previousShowRoll = v;
      fire(s, c, t, `${rname(t)}【看我表演】：继续掷骰累加。`, "sw_show_off");
    }
  }
  if (mainRoll !== null && has(s, t, "sw_magical_athlete")) {
    fire(s, c, t, `${rname(t)}【六面魔法】：发动 ${mainRoll} 点分支。`, "sw_magical_athlete");
    if (mainRoll === 1) base = 7;
    if (mainRoll === 4) {
      base = 4;
      f.extra = true;
    }
    if (mainRoll === 6) base = 6;
    if (mainRoll === 2 || mainRoll === 5) {
      const act = r.tokens.filter(active);
      const edge = mainRoll === 2 ? Math.min(...act.map((o) => o.pos)) : Math.max(...act.map((o) => o.pos));
      const targets = act.filter((o) => o.pos === edge);
      const id =
        targets.length === 1
          ? targets[0].racer
          : ask(s, c, {
              player: t.owner,
              racer: t.racer,
              kind: "magical_tie",
              prompt: `${rname(t)}【六面魔法】：选择${mainRoll === 2 ? "垫底" : "领先"}选手。`,
              options: targets.map((o) => ({ value: o.racer, label: rname(o) })),
            });
      const target = targets.find((o) => o.racer === id)!;
      if (mainRoll === 2) warp(s, c, target, t.pos);
      else move(s, c, target, -5, false, "六面魔法");
      return;
    }
    if (mainRoll === 3) {
      const targets = others(s, t);
      if (targets.length) {
        const id = ask(s, c, {
          player: t.owner,
          racer: t.racer,
          kind: "magical_warp",
          prompt: `${rname(t)}【六面魔法】：传送并绊倒一名选手。`,
          options: targets.map((o) => ({ value: o.racer, label: rname(o) })),
        });
        const target = targets.find((o) => o.racer === id)!;
        warp(s, c, t, target.pos);
        trip(s, target);
      }
      return;
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
  if (has(s, t, "sw_gloth")) {
    dist -= 1;
    fire(s, c, t, `${rname(t)}【慢有慢福】：主移动 −1。`, "sw_gloth");
  }
  for (const dad of holders(s, "sw_stepdad"))
    if (leftOf(s, dad) === t && dad !== t) {
      dist += 2;
      fire(s, c, dad, `${rname(dad)}【扶你一把】：左侧 ${rname(t)} 主移动 +2。`, "sw_stepdad");
    }
  if (has(s, t, "sw_penguin") && t.tripped && mainRoll !== null) {
    dist += mainRoll;
    fire(s, c, t, `${rname(t)}【肚皮滑行】：摔倒时主移动骰点翻倍。`, "sw_penguin");
  }
  const blunderdog = has(s, t, "sw_blunderdog");
  if (blunderdog) {
    const last = Math.min(
      ...race(s)
        .tokens.filter(active)
        .map((o) => o.pos),
    );
    if (t.pos === last && mainRoll !== null) {
      dist += mainRoll * 2;
      fire(s, c, t, `${rname(t)}【倒霉反转】：垫底，主移动骰点乘 3。`);
    } else if (t.pos !== last) {
      reverseMain = true;
      fire(s, c, t, `${rname(t)}【倒霉反转】：没有垫底，主移动改为后退。`);
    }
  }
  if (has(s, t, "sw_speed_demon")) {
    const points = total(player(s, t.owner).chips);
    if (points) {
      dist += points;
      fire(s, c, t, `${rname(t)}【极速失控】：玩家有 ${points} 分，主移动 +${points}。`);
    }
  }
  if (has(s, t, "sw_icarus")) {
    dist += 3;
    fire(s, c, t, `${rname(t)}【飞行风险】：主移动 +3。`);
  }
  if (has(s, t, "sw_overtaker")) {
    const n = others(s, t).filter((o) => o.pos > t.pos).length;
    if (n) {
      dist += n;
      fire(s, c, t, `${rname(t)}【赶超计谋】：前方 ${n} 名选手，主移动 +${n}。`);
    }
  }
  if (has(s, t, "blimp")) {
    const corner = trackOf(s).secondCorner ?? fail("CHECK_REQUIRED", "第二个弯道位置未确认。");
    const before = turnStartPos(t) < corner;
    dist += before ? 3 : -1;
    fire(
      s,
      c,
      t,
      `${rname(t)}【冲劲】：回合开始时${before ? "还没到第二个弯道，主移动 +3" : "已过第二个弯道，主移动 −1"}。`,
    );
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
  for (const hog of r.hogs ?? [])
    if (hog.rider === t.racer && hogActive(s, hog.source)) {
      fire(
        s,
        c,
        r.tokens.find((o) => o.racer === hog.source)!,
        `${rname(t)}【野猪坐骑】：主移动 +2。`,
        "sw_hog_knight",
      );
      dist += 2;
    }
  for (const n of holders(s, "sw_null"))
    if (t.pos > n.pos) {
      fire(s, c, n, `${rname(n)}【虚无领域】：${rname(t)} 主移动 -1。`, "sw_null");
      dist -= 1;
    }
  move(
    s,
    c,
    t,
    Math.max(0, dist) * (reverseMain ? -1 : 1),
    true,
    blunderdog
      ? "倒霉反转"
      : reverseMain
        ? "三点倒车"
        : how === "mole"
          ? "挖地直行"
          : has(s, t, "sw_penguin") && t.tripped
            ? "肚皮滑行"
            : has(s, t, "sw_show_off")
              ? "看我表演"
              : "主移动",
  );
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
      log(s, "", {
        kind: "move",
        racers: [o.racer],
        from: o.pos,
        to,
        why: "人气磁铁",
      });
      o.pos = to;
      arrivals.push(o);
    }
    if (arrivals.length)
      log(s, arrivals.map((o) => `${rname(o)} → 第 ${o.pos} 格`).join("，") + "（人气磁铁，同时移动）");
    for (const o of arrivals) hugeBaby(s, c, o);
    for (const o of arrivals) react(s, c, o, [], arrivals.length > 1);
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
      // 并列最后的人同时移动 2（同一格出发、同一格到达）→ 属于同时到达
      move(s, c, last[0], 2, false, "加油打气", last.slice(1));
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
          ...targets.map((o) => ({
            value: o.racer,
            label: `${rname(o)}（第 ${o.pos} 格）`,
          })),
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
    if (t.base === "copycat" && !suppressedByNull(s, t)) {
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
    // New turn-start abilities are not skipped just because the main move is lost.
    if (has(s, t, "sw_spoilsport")) {
      const opponents = others(s, t);
      if (opponents.length && opponents.every((o) => o.pos >= t.pos + 5)) {
        r.cancelledBy = t.racer;
        r.over = true;
        fire(s, c, t, `${rname(t)}【举报罢赛】：取消本场，保留已得分，不发金银牌，自己获得 3 分。`, "sw_spoilsport");
        gainChip(s, t.owner, 3);
        throw new RaceOver();
      }
    }
    if (has(s, t, "sw_kraken") && !t.secondWind?.krakenUsed) {
      const use = ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "kraken",
        prompt: `${rname(t)}【全员集合】：使用本场唯一一次的全员传送并绊倒？`,
        options: [
          { value: "yes", label: "全员集合" },
          { value: "no", label: "不用" },
        ],
      });
      if (use === "yes") {
        t.secondWind = { ...t.secondWind, krakenUsed: true };
        fire(s, c, t, `${rname(t)}【全员集合】：所有其他选手同时传送并摔倒。`, "sw_kraken");
        const targets = others(s, t);
        warp(s, c, t, t.pos, undefined, targets);
        for (const target of targets) trip(s, target);
      }
    }
    if (has(s, t, "sw_soulmate")) {
      const target = others(s, t).find((o) => o.racer === t.secondWind?.soulmate);
      if (target && Math.abs(t.pos - target.pos) <= 5) {
        fire(s, c, t, `${rname(t)}【心有灵犀】：传送到 ${rname(target)} 所在格。`, "sw_soulmate");
        warp(s, c, t, target.pos);
      }
    }
    if (has(s, t, "sw_speed_demon")) {
      const opponents = others(s, t);
      if (opponents.length && t.pos >= Math.max(...opponents.map((o) => o.pos)) + 4) {
        fire(s, c, t, `${rname(t)}【极速失控】：领先至少 4 格，淘汰出本场。`);
        eliminate(s, t);
        return;
      }
    }
    if (has(s, t, "sw_diva")) {
      const opponents = others(s, t);
      if (opponents.length) {
        const last = Math.min(t.pos, ...opponents.map((o) => o.pos));
        const targetPos = t.pos === last ? Math.max(...opponents.map((o) => o.pos)) : last;
        const targets = opponents.filter((o) => o.pos === targetPos);
        const picked =
          targets.length === 1
            ? targets[0].racer
            : ask(s, c, {
                player: t.owner,
                racer: t.racer,
                kind: "diva",
                prompt: `${rname(t)}【戏剧换位】：选择换位的选手。`,
                options: targets.map((o) => ({
                  value: o.racer,
                  label: rname(o),
                })),
              });
        const target = targets.find((o) => o.racer === picked)!;
        fire(s, c, t, `${rname(t)}【戏剧换位】：与 ${rname(target)} 同步交换位置。`);
        warp(s, c, t, target.pos, target);
      }
    }
    if (has(s, t, "sw_tail")) {
      const ahead = others(s, t).filter((o) => o.pos > t.pos);
      const nearest = ahead.filter((o) => o.pos === Math.min(...ahead.map((x) => x.pos)));
      if (nearest.length) {
        const picked = ask(s, c, {
          player: t.owner,
          racer: t.racer,
          kind: "tail",
          prompt: `${rname(t)}【尾随其后】：传送到前方最近选手的身后一格？`,
          options: [...nearest.map((o) => ({ value: o.racer, label: rname(o) })), { value: "no", label: "不用" }],
        });
        const target = nearest.find((o) => o.racer === picked);
        if (target) {
          fire(s, c, t, `${rname(t)}【尾随其后】：传送到 ${rname(target)} 身后一格。`);
          warp(s, c, t, target.pos - 1);
        }
      }
    }
    if (has(s, t, "sw_kingtripper")) {
      const targets = leaders(s);
      if (targets.length) {
        const a = ask(s, c, {
          player: t.owner,
          racer: t.racer,
          kind: "kingtripper",
          prompt: `${rname(t)}【王者一绊】：绊倒一名领先选手？`,
          options: [...targets.map((o) => ({ value: o.racer, label: rname(o) })), { value: "no", label: "不用" }],
        });
        const target = targets.find((o) => o.racer === a);
        if (target) {
          fire(s, c, t, `${rname(t)}【王者一绊】：${rname(target)} 摔倒。`);
          trip(s, target);
        }
      }
    }
    if (t.tripped && !has(s, t, "sw_penguin")) {
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
    if (has(s, t, "sw_hopfrog") && others(s, t).some((o) => o.pos === t.pos + 1)) {
      fire(s, c, t, `${rname(t)}【弹跳加赛】：前方一格有选手，获得一个额外回合。`);
      f.extra = true;
    }
    if (has(s, t, "sw_the_hose")) {
      ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "hose",
        prompt: `${rname(t)}【强力冲洗】：掷骰决定冲洗距离。`,
        options: [{ value: "roll", label: "🎲 掷冲洗骰" }],
      });
      fire(s, c, t, `${rname(t)}【强力冲洗】：掷骰并绊倒前方范围内的选手。`);
      const value = racerDie(s, c, t);
      log(s, `${rname(t)} 的冲洗骰：${value}。`, {
        kind: "roll",
        player: t.owner,
        racer: t.racer,
        value,
      });
      for (const target of others(s, t)) if (target.pos > t.pos && target.pos - t.pos <= value) trip(s, target);
    }
    if (has(s, t, "sw_switcharoo")) {
      const targets = others(s, t).filter((o) => o.owner !== t.owner && Math.abs(o.pos - t.pos) <= 1);
      if (targets.length) {
        const id = ask(s, c, {
          player: t.owner,
          racer: t.racer,
          kind: "switcharoo",
          prompt: `${rname(t)}【换手戏法】：交换哪名选手的控制权？`,
          options: [...targets.map((o) => ({ value: o.racer, label: rname(o) })), { value: "no", label: "不用" }],
        });
        const target = targets.find((o) => o.racer === id);
        if (target) {
          fire(s, c, t, `${rname(t)}【换手戏法】：与 ${rname(target)} 交换控制者。`, "sw_switcharoo");
          const previous = t.owner;
          t.owner = target.owner;
          target.owner = previous;
          // Provisional interpretation: cards and future return rights transfer;
          // already earned chips stay with their original players.
          const oldPlayer = player(s, previous),
            newPlayer = player(s, t.owner);
          oldPlayer.hand = oldPlayer.hand.map((id) => (id === t.racer ? target.racer : id));
          newPlayer.hand = newPlayer.hand.map((id) => (id === target.racer ? t.racer : id));
          oldPlayer.used = oldPlayer.used.map((id) => (id === t.racer ? target.racer : id));
          newPlayer.used = newPlayer.used.map((id) => (id === target.racer ? t.racer : id));
          for (const returning of s.returningRacers ?? []) {
            if (returning.racer === t.racer) returning.owner = t.owner;
            if (returning.racer === target.racer) returning.owner = target.owner;
          }
          log(s, `${rname(t)} 由 ${pname(s, t.owner)} 控制，${rname(target)} 由 ${pname(s, target.owner)} 控制。`, {
            kind: "control",
            racer: t.racer,
            target: target.racer,
            owner: t.owner,
            targetOwner: target.owner,
          });
        }
      }
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
    // 2026-08 规则：多名选手按赛前摆好的顺序（顺时针）行动，不再每回合重选顺序
    let seq = mine();
    if (
      seq.length > 1 &&
      s.settings.variant === "double" &&
      s.seats.length === 2 &&
      !r.firstTurnDone.includes(r.current)
    ) {
      // 2 人变体：每名玩家的第一个回合只用一名选手（2025-09 规则书 p26；2026-08 版是否保留见 CHECK_REQUIRED MA-U02b）
      const a = ask(s, c, {
        player: r.current,
        racer: null,
        kind: "order",
        prompt: "你的第一个回合只用一名选手：用哪一名？",
        options: seq.map((x) => ({ value: x.racer, label: rname(x) })),
      });
      seq = seq.filter((x) => x.racer === a);
    }
    if (!r.firstTurnDone.includes(r.current)) r.firstTurnDone.push(r.current);
    for (const t of seq) if (active(t) && t.owner === r.current) racerTurn(s, c, t, f);
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
  // 双选手：赛前每名玩家把自己的两名选手按想要的行动顺序摆在面前（2026-08 规则更新 #2）
  if (s.settings.variant === "double" || s.returningRacers?.length)
    for (const pid of r.order) {
      const mineT = r.tokens.filter((x) => x.owner === pid);
      if (mineT.length < 2) continue;
      const a = ask(s, c, {
        player: pid,
        racer: null,
        kind: "lineup",
        prompt: "把两名选手按行动顺序摆好：本场每回合谁先动？",
        options: mineT.map((x) => ({
          value: x.racer,
          label: `${rname(x)} 先动`,
        })),
      });
      const first = mineT.find((x) => x.racer === a)!;
      const rest = r.tokens.filter((x) => x.owner !== pid);
      const ordered = [first, ...mineT.filter((x) => x !== first)];
      // 保持座位顺序：把这名玩家的两名选手按新顺序放回原位置
      const idx = r.tokens.findIndex((x) => x.owner === pid);
      r.tokens = [...rest.slice(0, idx), ...ordered, ...rest.slice(idx)];
      log(s, `${pname(s, pid)} 的出场顺序：${ordered.map(rname).join(" → ")}。`);
    }
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
          options: [...opts.map((id) => ({ value: id, label: racerName(id) })), { value: "no", label: "不用" }],
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
  const understudies = holders(s, "sw_understudy");
  const copied = new Map<Token, Token>();
  for (const t of understudies) {
    const targets = others(s, t).filter((o) => o.owner !== t.owner);
    if (!targets.length) continue;
    const pick = ask(s, c, {
      player: t.owner,
      racer: t.racer,
      kind: "understudy",
      prompt: `${rname(t)}【假戏真做】：复制一名对方选手的能力。`,
      options: targets.map((o) => ({ value: o.racer, label: rname(o) })),
    });
    copied.set(
      t,
      targets.find((o) => o.racer === pick)!,
    );
  }
  const original = new Map(r.tokens.map((t) => [t, t.base]));
  const inherited = (t: Token, path = new Set<Token>()): string => {
    if (path.has(t)) return "sw_understudy";
    const target = copied.get(t);
    return target ? inherited(target, new Set([...path, t])) : original.get(t)!;
  };
  for (const t of understudies) t.base = inherited(t);
  for (const t of understudies) {
    if (!copied.has(t)) continue;
    fire(s, c, t, `${rname(t)}【假戏真做】：复制 ${rname(copied.get(t)!)} 的能力。`, "sw_understudy");
    if (t.base === "twin" && s.winners.length) {
      const opts = [...new Set(s.winners)];
      const pick = ask(s, c, {
        player: t.owner,
        racer: t.racer,
        kind: "twin",
        prompt: `${rname(t)}【复刻冠军】：选择此前冠军。`,
        options: [...opts.map((id) => ({ value: id, label: racerName(id) })), { value: "no", label: "不用" }],
      });
      t.base = pick === "no" ? "twin" : pick;
    }
    if (t.base === "sisyphus") for (let i = 0; i < 4; i++) gainChip(s, t.owner, 1);
  }
  for (const t of inOrder(s)) {
    if (!has(s, t, "sw_soulmate")) continue;
    const targets = others(s, t).filter((o) => o.owner !== t.owner);
    if (!targets.length) continue;
    const pick = ask(s, c, {
      player: t.owner,
      racer: t.racer,
      kind: "soulmate",
      prompt: `${rname(t)}【心有灵犀】：选择本场的一名对方选手。`,
      options: targets.map((o) => ({ value: o.racer, label: rname(o) })),
    });
    t.secondWind = { ...t.secondWind, soulmate: pick };
    fire(s, c, t, `${rname(t)}【心有灵犀】：选择 ${racerName(pick)}。`, "sw_soulmate");
  }
  const nepoBabies = holders(s, "sw_nepo_baby");
  if (nepoBabies.length) {
    const corner = SECOND_WIND_FIRST_CORNERS[r.track] ?? fail("CHECK_REQUIRED", "第一个弯道位置未确认。");
    for (const t of nepoBabies) fire(s, c, t, `${rname(t)}【赢在起点】：从第一个弯道出发。`, "sw_nepo_baby");
    warp(s, c, nepoBabies[0], corner, undefined, nepoBabies);
  }
  for (const t of inOrder(s)) {
    registerReturner(s, t);
    spawnHog(s, c, t);
  }
  r.setup = true;
}

// ---------------------------------------------------------------- 单元调度
const strip = (s: MAState) => JSON.stringify({ ...s, turn: null, pending: null });

function runUnit(snapshot: string, answers: string[]): { s: MAState; need: Decision | null } {
  const s: MAState = JSON.parse(snapshot);
  const c: Ctx = {
    answers,
    i: 0,
    guard: new Set(),
    depth: 0,
    criticUsed: new Set(),
  };
  const r = race(s);
  try {
    if (!r.setup) setupUnit(s, c);
    else turnUnit(s, c);
    if (c.i < answers.length) fail("EXTRA_ANSWER", "多余的回答。");
    return { s, need: null };
  } catch (e) {
    if (e instanceof Need) return { s, need: e.decision };
    if (e instanceof RaceOver) {
      endRace(s, c);
      return { s, need: null };
    }
    throw e;
  }
}

/** Prove a terminal new-Diva cycle using disposable deterministic replays.
 * Only compulsory stand-up answers may be supplied. Any choice, random roll,
 * actual movement or scoring invalidates this proof; it is never a chain cap.
 * Base-only games never enter this path. No hidden history is sent to clients.
 */
function forcedStandupCycle(initial: MAState): boolean {
  if (initial.pending?.kind !== "standup" || !initial.settings.secondWindPreview || !holders(initial, "sw_diva").length)
    return false;
  let probe: MAState = structuredClone(initial);
  const seen = new Set<string>();
  for (;;) {
    if (probe.phase !== "race" || probe.race?.over) return false;
    if (
      probe.pending &&
      (probe.pending.kind !== "standup" ||
        probe.pending.options.length !== 1 ||
        probe.pending.options[0].value !== "ok")
    )
      return false;
    const key = JSON.stringify({
      ...probe,
      log: [],
      version: 0,
      turn: null,
      pending: probe.pending
        ? {
            kind: probe.pending.kind,
            racer: probe.pending.racer,
            player: probe.pending.player,
            answerCount: probe.turn!.answers.length,
          }
        : null,
    });
    if (seen.has(key)) return true;
    seen.add(key);
    const snapshot = probe.turn?.snapshot ?? strip(probe);
    const answers = probe.pending ? [...probe.turn!.answers, "ok"] : [];
    const res = runUnit(snapshot, answers);
    // Compare against the beginning of this unit because Need replays rebuild
    // its existing log. Warps/trips alone can form a closed forced cycle.
    const startLogLength = (JSON.parse(snapshot) as MAState).log.length;
    if (
      res.s.log
        .slice(startLogLength)
        .some((l) => l.fx && ["roll", "duel", "move", "chip", "finish", "out"].includes(l.fx.kind))
    )
      return false;
    probe = res.s;
    probe.pending = res.need;
    probe.turn = res.need ? { snapshot, answers } : null;
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
      if (forcedStandupCycle(res.s)) {
        log(res.s, "所有在场选手陷入无法前进的强制起身循环，本场立即结束，剩余名次不计分。");
        endRace(res.s);
        res.s.pending = null;
        res.s.turn = null;
        return res.s;
      }
      return res.s;
    }
    s = res.s;
  }
  return fail("LOOP", "自动结算次数过多。");
}

function endRace(
  s: MAState,
  c: Ctx = {
    answers: [],
    i: 0,
    guard: new Set(),
    depth: 0,
    criticUsed: new Set(),
  },
) {
  const r = race(s);
  for (const t of r.tokens) registerReturner(s, t);
  r.over = true;
  const corner = trackOf(s).secondCorner;
  const bonuses = holders(s, "sw_gloth").filter((t) => corner !== null && t.pos <= corner);
  for (const gloth of bonuses)
    awardPower(s, c, gloth, 3, `${rname(gloth)}【慢有慢福】：赛后没超过第二个弯道，获得 3 分。`, "sw_gloth");
  const pts = s.settings.points[r.index] ?? DEFAULT_POINTS;
  const owner = (racer: string) => r.tokens.find((t) => t.racer === racer)!.owner;
  const [first, second] = r.cancelledBy ? [] : r.finishers;
  if (first) {
    player(s, owner(first)).chips.push({
      kind: "gold",
      value: pts.gold,
      race: r.index,
    });
    s.winners.push(first);
  }
  if (second)
    player(s, owner(second)).chips.push({
      kind: "silver",
      value: pts.silver,
      race: r.index,
    });
  else log(s, "没有第二名，银牌作废。");
  // 领奖台（只是展示用）：第 3 名 = 还在场上、位置最靠前的选手（同格按本场行动顺序）；不计分
  const places: Array<{
    racer: string;
    owner: string;
    place: number;
    points: number;
  }> = [];
  if (first)
    places.push({
      racer: first,
      owner: owner(first),
      place: 1,
      points: pts.gold,
    });
  if (second)
    places.push({
      racer: second,
      owner: owner(second),
      place: 2,
      points: pts.silver,
    });
  const rest = r.tokens
    .filter((t) => active(t) && !r.finishers.includes(t.racer))
    .sort((a, b) => b.pos - a.pos || r.order.indexOf(a.owner) - r.order.indexOf(b.owner));
  if (rest[0] && places.length === 2)
    places.push({
      racer: rest[0].racer,
      owner: rest[0].owner,
      place: 3,
      points: 0,
    });
  log(
    s,
    r.cancelledBy
      ? `第 ${r.index + 1} 场已取消：保留已得分，不发本场金银牌。`
      : `第 ${r.index + 1} 场结束：冠军 ${first ? racerName(first) : "无"}（+${pts.gold}），亚军 ${second ? racerName(second) : "无"}${second ? `（+${pts.silver}）` : ""}。`,
    { kind: "podium", race: r.index, places },
  );
  // 下一场先手：上一场最落后的选手（或第一个被淘汰的）；2 人变体：上一场得分较少的玩家，平分掷骰
  let next: string;
  if (s.seats.length === 2 && s.settings.variant === "double") {
    const got = s.seats.map((id) => ({
      id,
      v: total(player(s, id).chips.filter((ch) => ch.race === r.index)) - (r.priorRaceSpending?.[id] ?? 0),
    }));
    next =
      got[0].v === got[1].v
        ? rollOff(s, s.seats, "上一场得分相同，掷骰决定下一场先手")
        : got[0].v < got[1].v
          ? got[0].id
          : got[1].id;
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
    log(
      s,
      `🏆 比赛结束！获胜：${totals
        .filter((x) => x.v === max)
        .map((x) => x.p.name)
        .join("、")}（${max} 分）`,
      {
        kind: "champion",
        winners: totals.filter((x) => x.v === max).map((x) => x.p.id),
        totals: totals.map((x) => ({ player: x.p.id, total: x.v })),
      },
    );
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
  for (const returning of s.returningRacers ?? []) {
    if (s.race.tokens.some((t) => t.racer === returning.racer)) continue;
    s.race.tokens.push({
      racer: returning.racer,
      owner: returning.owner,
      base: returning.base,
      pos: 0,
      tripped: false,
      place: null,
      out: false,
      copyPick: null,
      started: false,
    });
  }
  for (const p of s.players) p.used.push(...p.choices);
  s.phase = "race";
  log(
    s,
    `第 ${idx + 1} 场（${TRACKS[track].zh}）开始！出场：` +
      s.race.tokens.map((t) => `${pname(s, t.owner)}·${rname(t)}`).join("，"),
    {
      kind: "start",
      race: idx,
      track,
      ...(s.settings.secondWindPreview
        ? { owners: Object.fromEntries(s.race.tokens.map((t) => [t.racer, t.owner])) }
        : {}),
    },
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
  secondWindPreview?: boolean;
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
  const players = opts.racers.map((_, i) => ({
    id: "p" + (i + 1),
    name: "玩家" + (i + 1),
  }));
  const s = createMAGame({
    players:
      players.length >= 3
        ? players
        : [
            ...players,
            ...[
              { id: "x1", name: "x" },
              { id: "x2", name: "y" },
            ].slice(0, 3 - players.length),
          ],
    seed: opts.seed ?? 1,
    settings: opts.secondWindPreview ? { secondWindPreview: true } : {},
  });
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
