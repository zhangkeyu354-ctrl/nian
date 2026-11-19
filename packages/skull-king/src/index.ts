/**
 * 骷髅王 Skull King（Grandpa Beck's Games，2021 新版）规则引擎。纯函数 reduceSK(state, command)。
 * 规则依据：官方英文规则书 sk_rulebook_optimized.pdf + 官方 FAQ（grandpabecksgames.com/pages/skull-king）。
 * 详见 docs/skull-king/RULES.md；规则书没写清的地方见 docs/skull-king/RULINGS.md（标 SK-R 编号）。
 */

export type Suit = "green" | "purple" | "yellow" | "black";
export type Kind = "suit" | "escape" | "pirate" | "tigress" | "king" | "mermaid" | "kraken" | "whale" | "loot";
export type PirateName = "rosie" | "bendt" | "rascal" | "juanita" | "harry";
export interface CardDef {
  id: number;
  kind: Kind;
  suit?: Suit;
  n?: number;
  pirate?: PirateName;
  /** 美术文件名，如 green-7、pirate-rosie */
  key: string;
}

export const SUITS: Suit[] = ["green", "purple", "yellow", "black"];
export const SUIT_NAME: Record<Suit, string> = { green: "鹦鹉", purple: "藏宝图", yellow: "宝箱", black: "骷髅旗" };
export const PIRATES: PirateName[] = ["rosie", "bendt", "rascal", "juanita", "harry"];
export const PIRATE_NAME: Record<PirateName, string> = {
  rosie: "罗茜·德莱尼",
  bendt: "大盗本特",
  rascal: "罗阿坦无赖",
  juanita: "胡安妮塔·翡翠",
  harry: "巨人哈利",
};
export const PIRATE_SKILL: Record<PirateName, string> = {
  rosie: "指定任意一名玩家（包括自己）带下一墩",
  bendt: "从未发出的牌里摸 2 张，再弃掉 2 张手牌",
  rascal: "押注 0、10 或 20 分：本轮猜中就得，猜错就扣",
  juanita: "偷偷查看本轮没发出去的牌",
  harry: "把自己的下注 +1、−1 或不变（最后一墩赢了也能用）",
};
export const KIND_NAME: Record<Exclude<Kind, "suit" | "pirate">, string> = {
  escape: "逃跑",
  tigress: "母老虎",
  king: "骷髅王",
  mermaid: "美人鱼",
  kraken: "克拉肯",
  whale: "白鲸",
  loot: "战利品",
};

const defs: CardDef[] = [];
for (const suit of SUITS) for (let n = 1; n <= 14; n++) defs.push({ id: defs.length, kind: "suit", suit, n, key: `${suit}-${n}` });
for (let i = 0; i < 5; i++) defs.push({ id: defs.length, kind: "escape", key: "escape" });
for (const p of PIRATES) defs.push({ id: defs.length, kind: "pirate", pirate: p, key: "pirate-" + p });
defs.push({ id: defs.length, kind: "tigress", key: "tigress" });
defs.push({ id: defs.length, kind: "king", key: "king" });
defs.push({ id: defs.length, kind: "mermaid", key: "mermaid-1" });
defs.push({ id: defs.length, kind: "mermaid", key: "mermaid-2" });
defs.push({ id: defs.length, kind: "kraken", key: "kraken" });
defs.push({ id: defs.length, kind: "whale", key: "whale" });
defs.push({ id: defs.length, kind: "loot", key: "loot" });
defs.push({ id: defs.length, kind: "loot", key: "loot-2" });
export const CARDS: readonly CardDef[] = defs;

export function cardName(id: number) {
  const c = CARDS[id];
  if (c.kind === "suit") return `${SUIT_NAME[c.suit!]}${c.n}`;
  if (c.kind === "pirate") return `海盗·${PIRATE_NAME[c.pirate!]}`;
  return KIND_NAME[c.kind];
}

export type ScheduleKey = "classic" | "even" | "brawl" | "swift" | "broadside" | "whirlpool";
export const SCHEDULES: Record<ScheduleKey, { name: string; desc: string; counts: number[] }> = {
  classic: { name: "标准", desc: "10 轮，每轮 1→10 张", counts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  even: { name: "四平八稳", desc: "2、4、6、8、10 张各两轮", counts: [2, 2, 4, 4, 6, 6, 8, 8, 10, 10] },
  brawl: { name: "直接开打", desc: "6→10 张各一轮", counts: [6, 7, 8, 9, 10] },
  swift: { name: "速战速决", desc: "5 轮，每轮 5 张", counts: [5, 5, 5, 5, 5] },
  broadside: { name: "全舷齐射", desc: "10 轮，每轮 10 张", counts: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10] },
  whirlpool: { name: "漩涡", desc: "9、7、5、3、1 张各两轮", counts: [9, 9, 7, 7, 5, 5, 3, 3, 1, 1] },
};

export interface SKSettings {
  /** skull = 骷髅王计分（经典）；rascal = 无赖计分 */
  scoring: "skull" | "rascal";
  /** 无赖计分的可选规则：每轮下注后选霰弹/炮弹 */
  cannon: boolean;
  kraken: boolean;
  whale: boolean;
  loot: boolean;
  /** 进阶：五位海盗的专属技能 */
  abilities: boolean;
  schedule: ScheduleKey;
}
export const DEFAULT_SETTINGS: SKSettings = {
  scoring: "skull",
  cannon: false,
  kraken: false,
  whale: false,
  loot: false,
  abilities: false,
  schedule: "classic",
};

export function deckFor(st: Pick<SKSettings, "kraken" | "whale" | "loot">): number[] {
  return CARDS.filter((c) => {
    if (c.kind === "kraken") return st.kraken;
    if (c.kind === "whale") return st.whale;
    if (c.kind === "loot") return st.loot;
    return true;
  }).map((c) => c.id);
}

/** 每轮实际发牌数：牌不够时重复能平均发的最大张数（官方 7–8 人规则） */
export function countsFor(players: number, st: SKSettings): number[] {
  const hands = players === 2 ? 3 : players;
  const max = Math.floor(deckFor(st).length / hands);
  return SCHEDULES[st.schedule].counts.map((k) => Math.min(k, max));
}

export interface Played {
  seat: number;
  id: number;
  /** 母老虎打出时宣告 */
  as?: "pirate" | "escape";
}
export interface BonusItem {
  label: string;
  pts: number;
}
export interface TrickResult {
  no: number;
  cards: Played[];
  /** null = 被克拉肯/白鲸毁掉，没人赢 */
  winner: number | null;
  winCard?: number;
  next: number;
  destroyed?: "kraken" | "whale";
  bonus: BonusItem[];
  lead: Suit | null;
}
export interface RoundRow {
  bid: number;
  won: number;
  shot?: "grape" | "cannon";
  bidPts: number;
  bonusPts: number;
  bonusItems: BonusItem[];
  total: number;
  /** exact / glance(差1) / miss */
  hit: "exact" | "glance" | "miss";
}
export interface Player {
  name: string;
  hand: number[];
  bid: number | null;
  shot: "grape" | "cannon" | null;
  won: number;
  bonus: BonusItem[];
  rascalBet: number | null;
  harry: number;
  score: number;
  rows: (RoundRow & { round: number; cards: number })[];
}
export type Ability =
  | { pirate: "rosie"; seat: number }
  | { pirate: "bendt"; seat: number; drawn: number[] }
  | { pirate: "rascal"; seat: number }
  | { pirate: "juanita"; seat: number }
  | { pirate: "harry"; seat: number };

export interface LogEntry {
  t: string;
  seat?: number;
}
export type Phase = "BID" | "SHOT" | "PLAY" | "ABILITY" | "ROUND_END" | "FINISHED";
export interface SKState {
  phase: Phase;
  players: Player[];
  /** 双人局的灰胡子幽灵（座位号 = players.length） */
  ghost: { hand: number[]; won: number } | null;
  settings: SKSettings;
  counts: number[];
  round: number;
  dealer: number;
  /** 本轮第一墩带牌的人（双人局轮流） */
  starter: number;
  leader: number;
  order: number[];
  trick: Played[];
  tricks: TrickResult[];
  deck: number[];
  out: number[];
  loots: { a: number; b: number }[];
  ability: Ability | null;
  log: LogEntry[];
  seed: number;
  rng: number;
  winners: number[];
}

export type Command =
  | { type: "BID"; actor: number; bid: number }
  | { type: "SHOT"; actor: number; shot: "grape" | "cannon" }
  | { type: "PLAY"; actor: number; id: number; as?: "pirate" | "escape" }
  | { type: "ROSIE"; actor: number; target: number }
  | { type: "BENDT"; actor: number; discard: number[] }
  | { type: "RASCAL"; actor: number; bet: 0 | 10 | 20 }
  | { type: "JUANITA"; actor: number }
  | { type: "HARRY"; actor: number; delta: -1 | 0 | 1 }
  | { type: "NEXT_ROUND"; actor: number };

function ensure(ok: unknown, msg: string): asserts ok {
  if (!ok) throw Error(msg);
}
function nextRand(s: { rng: number }) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(s: { rng: number }, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createSK(names: string[], opts: { seed: number; settings?: Partial<SKSettings>; dealer?: number }): SKState {
  const n = names.length;
  ensure(n >= 2 && n <= 8, "人数须为 2–8");
  const settings = { ...DEFAULT_SETTINGS, ...(opts.settings ?? {}) };
  if (settings.scoring !== "rascal") settings.cannon = false;
  ensure(settings.schedule in SCHEDULES, "轮数方案无效");
  const s: SKState = {
    phase: "BID",
    players: names.map((name) => ({ name, hand: [], bid: null, shot: null, won: 0, bonus: [], rascalBet: null, harry: 0, score: 0, rows: [] })),
    ghost: n === 2 ? { hand: [], won: 0 } : null,
    settings,
    counts: countsFor(n, settings),
    round: 0,
    dealer: 0,
    starter: 0,
    leader: 0,
    order: [],
    trick: [],
    tricks: [],
    deck: [],
    out: [],
    loots: [],
    ability: null,
    log: [],
    seed: opts.seed >>> 0,
    rng: opts.seed >>> 0,
    winners: [],
  };
  s.dealer = opts.dealer ?? Math.floor(nextRand(s) * n);
  deal(s);
  return s;
}

const GHOST = (s: SKState) => s.players.length;
export const cardsThisRound = (s: SKState) => s.counts[s.round];

function deal(s: SKState) {
  const n = s.players.length;
  const k = cardsThisRound(s);
  const deck = shuffle(s, deckFor(s.settings));
  for (const p of s.players) {
    p.hand = deck.splice(0, k);
    p.bid = null;
    p.shot = null;
    p.won = 0;
    p.bonus = [];
    p.rascalBet = null;
    p.harry = 0;
  }
  if (s.ghost) {
    s.ghost.hand = deck.splice(0, k);
    s.ghost.won = 0;
  }
  s.deck = deck;
  s.out = [];
  s.trick = [];
  s.tricks = [];
  s.loots = [];
  s.ability = null;
  // 发牌人左手边先出；双人局两名玩家轮流先出（非发牌人先出）
  s.starter = (s.dealer + 1) % n;
  s.leader = s.starter;
  s.phase = "BID";
  s.log.push({ t: `第 ${s.round + 1} 轮开始，每人 ${k} 张，${s.players[s.dealer].name} 发牌` });
}

function orderFrom(s: SKState, leader: number): number[] {
  const n = s.players.length;
  if (s.ghost) {
    const G = GHOST(s);
    if (leader === G) return [G, s.starter, 1 - s.starter];
    return [leader, G, 1 - leader];
  }
  return Array.from({ length: n }, (_, i) => (leader + i) % n);
}

export const turnOf = (s: SKState) => (s.phase === "PLAY" ? s.order[s.trick.length] : -1);

type Eff = Played & { k: Kind };
export function effKind(p: Played): Kind {
  const c = CARDS[p.id];
  if (c.kind === "tigress") return p.as === "pirate" ? "pirate" : "escape";
  return c.kind;
}
const escapeLike = (k: Kind) => k === "escape" || k === "loot";

/** 本墩要跟的花色：跳过逃跑类，第一张别的牌若是数字牌就是它的颜色，若是角色/巨兽则本墩无花色 */
export function leadSuit(trick: Played[]): Suit | null {
  for (const p of trick) {
    const k = effKind(p);
    if (escapeLike(k)) continue;
    return k === "suit" ? CARDS[p.id].suit! : null;
  }
  return null;
}

export function legalPlays(hand: number[], trick: Played[]): number[] {
  const lead = leadSuit(trick);
  const hasLead = lead !== null && hand.some((id) => CARDS[id].kind === "suit" && CARDS[id].suit === lead);
  return hand.filter((id) => {
    const c = CARDS[id];
    if (c.kind !== "suit" || !hasLead) return true;
    return c.suit === lead;
  });
}

/** 不考虑巨兽时的赢家 */
function normalWinner(list: Eff[], lead: Suit | null): Eff {
  const by = (k: Kind) => list.filter((e) => e.k === k);
  const mermaids = by("mermaid"),
    kings = by("king"),
    pirates = by("pirate");
  if (kings.length && mermaids.length) return mermaids[0];
  if (kings.length) return kings[0];
  if (pirates.length) return pirates[0];
  if (mermaids.length) return mermaids[0];
  const suits = list.filter((e) => e.k === "suit");
  const high = (arr: Eff[]) => arr.reduce((a, b) => (CARDS[b.id].n! > CARDS[a.id].n! ? b : a));
  const blacks = suits.filter((e) => CARDS[e.id].suit === "black");
  if (blacks.length) return high(blacks);
  const l = lead ?? (suits[0] ? CARDS[suits[0].id].suit! : null);
  const led = suits.filter((e) => CARDS[e.id].suit === l);
  if (led.length) return high(led);
  return list[0];
}

export function resolveTrick(trick: Played[]): Omit<TrickResult, "no"> {
  const lead = leadSuit(trick);
  const eff: Eff[] = trick.map((p) => ({ ...p, k: effKind(p) }));
  const beasts = eff.filter((e) => e.k === "kraken" || e.k === "whale");
  const active = beasts[beasts.length - 1];
  // 两只巨兽同墩：后出的生效，先出的当逃跑（官方 FAQ）
  const list: Eff[] = eff.map((e) => ((e.k === "kraken" || e.k === "whale") && e !== active ? { ...e, k: "escape" as Kind } : e));
  const fourteen = (cards: Eff[]) =>
    cards
      .filter((e) => e.k === "suit" && CARDS[e.id].n === 14)
      .map((e) => (CARDS[e.id].suit === "black" ? { label: "黑色 14", pts: 20 } : { label: `${SUIT_NAME[CARDS[e.id].suit!]} 14`, pts: 10 }));
  if (active?.k === "kraken") {
    const would = normalWinner(list.map((e) => (e === active ? { ...e, k: "escape" as Kind } : e)), lead);
    return { cards: trick, winner: null, next: would.seat, destroyed: "kraken", bonus: [], lead };
  }
  if (active?.k === "whale") {
    const suits = list.filter((e) => e.k === "suit");
    if (!suits.length) return { cards: trick, winner: null, next: active.seat, destroyed: "whale", bonus: [], lead };
    const w = suits.reduce((a, b) => (CARDS[b.id].n! > CARDS[a.id].n! ? b : a));
    return { cards: trick, winner: w.seat, winCard: w.id, next: w.seat, destroyed: "whale", bonus: fourteen(list), lead };
  }
  const w = normalWinner(list, lead);
  const bonus = fourteen(list);
  const count = (k: Kind) => list.filter((e) => e.k === k).length;
  if (w.k === "mermaid" && count("king")) bonus.push({ label: "美人鱼诱捕骷髅王", pts: 40 });
  if (w.k === "king" && count("pirate")) bonus.push({ label: `骷髅王抓到 ${count("pirate")} 个海盗`, pts: 30 * count("pirate") });
  if (w.k === "pirate" && count("mermaid")) bonus.push({ label: `海盗抓到 ${count("mermaid")} 条美人鱼`, pts: 20 * count("mermaid") });
  return { cards: trick, winner: w.seat, winCard: w.id, next: w.seat, bonus, lead };
}

function startPlay(s: SKState) {
  s.phase = "PLAY";
  s.leader = s.starter;
  s.order = orderFrom(s, s.leader);
  s.log.push({ t: "下注亮出：" + s.players.map((p) => `${p.name} ${p.bid}`).join("，") });
  ghostPlays(s);
}

function ghostPlays(s: SKState) {
  while (s.phase === "PLAY" && s.ghost && turnOf(s) === GHOST(s)) {
    const id = s.ghost.hand.shift()!;
    const as = CARDS[id].kind === "tigress" ? "escape" : undefined;
    place(s, { seat: GHOST(s), id, ...(as ? { as } : {}) });
  }
}

function place(s: SKState, p: Played) {
  s.trick.push(p);
  if (s.trick.length === s.order.length) finishTrick(s);
}

function finishTrick(s: SKState) {
  const r: TrickResult = { no: s.tricks.length + 1, ...resolveTrick(s.trick) };
  s.tricks.push(r);
  s.out.push(...s.trick.map((p) => p.id));
  s.trick = [];
  const G = GHOST(s);
  const nameOf = (seat: number) => (seat === G ? "灰胡子幽灵" : s.players[seat].name);
  if (r.winner === null) {
    s.log.push({ t: r.destroyed === "kraken" ? `第 ${r.no} 墩被克拉肯吞掉，${nameOf(r.next)} 带下一墩` : `第 ${r.no} 墩被白鲸冲散，${nameOf(r.next)} 带下一墩` });
  } else if (r.winner === G) {
    s.ghost!.won++;
    s.log.push({ t: `灰胡子幽灵赢下第 ${r.no} 墩` });
  } else {
    const p = s.players[r.winner];
    p.won++;
    p.bonus.push(...r.bonus);
    if (!r.destroyed)
      for (const c of r.cards)
        if (effKind(c) === "loot" && c.seat !== r.winner && c.seat !== G) s.loots.push({ a: c.seat, b: r.winner });
    s.log.push({ seat: r.winner, t: `${p.name} 用 ${cardName(r.winCard!)} 赢下第 ${r.no} 墩` + (r.bonus.length ? `（奖励 ${r.bonus.map((b) => "+" + b.pts).join(" ")}）` : ""), });
  }
  s.leader = r.next;
  const last = s.tricks.length === cardsThisRound(s);
  const winCard = r.winCard !== undefined ? CARDS[r.winCard] : null;
  if (s.settings.abilities && r.winner !== null && r.winner !== G && winCard?.kind === "pirate" && !r.destroyed && (!last || winCard.pirate === "harry")) {
    const seat = r.winner;
    const pirate = winCard.pirate!;
    if (pirate === "bendt") {
      const drawn = s.deck.splice(0, 2);
      s.players[seat].hand.push(...drawn);
      s.ability = { pirate, seat, drawn };
      if (!drawn.length) s.ability = null;
    } else s.ability = { pirate, seat } as Ability;
    if (s.ability) {
      s.phase = "ABILITY";
      s.log.push({ seat, t: `${s.players[seat].name} 发动 ${PIRATE_NAME[pirate]} 的技能` });
      return;
    }
  }
  afterTrick(s);
}

function afterTrick(s: SKState) {
  s.ability = null;
  if (s.tricks.length === cardsThisRound(s)) return endRound(s);
  s.phase = "PLAY";
  s.order = orderFrom(s, s.leader);
  ghostPlays(s);
}

export function scoreRow(st: SKSettings, cards: number, p: { bid: number; won: number; shot?: "grape" | "cannon" | null; bonus: BonusItem[]; rascalBet: number | null }, loot: number): RoundRow {
  const diff = Math.abs(p.won - p.bid);
  const hit = diff === 0 ? "exact" : diff === 1 ? "glance" : "miss";
  const items = [...p.bonus];
  if (diff === 0 && loot) items.push({ label: "战利品结盟", pts: 20 * loot });
  const bonusFull = items.reduce((a, b) => a + b.pts, 0);
  let bidPts = 0,
    bonusPts = 0;
  if (st.scoring === "skull") {
    if (p.bid === 0) bidPts = diff === 0 ? 10 * cards : -10 * cards;
    else bidPts = diff === 0 ? 20 * p.bid : -10 * diff;
    bonusPts = diff === 0 ? bonusFull : 0;
  } else if (p.shot === "cannon") {
    bidPts = diff === 0 ? 15 * cards : 0;
    bonusPts = diff === 0 ? bonusFull : 0;
  } else {
    const lootPts = diff === 0 ? 20 * loot : 0;
    const raw = bonusFull - lootPts;
    bidPts = diff === 0 ? 10 * cards : diff === 1 ? 5 * cards : 0;
    bonusPts = diff === 0 ? bonusFull : diff === 1 ? raw / 2 : 0;
  }
  if (p.rascalBet) {
    const r = diff === 0 ? p.rascalBet : -p.rascalBet;
    items.push({ label: "无赖押注", pts: r });
    bonusPts += r;
  }
  return { bid: p.bid, won: p.won, ...(p.shot ? { shot: p.shot } : {}), bidPts, bonusPts, bonusItems: items, total: bidPts + bonusPts, hit };
}

function endRound(s: SKState) {
  const cards = cardsThisRound(s);
  s.players.forEach((p, seat) => {
    const allies = s.loots.filter((l) => l.a === seat || l.b === seat);
    const loot = allies.filter((l) => {
      const other = s.players[l.a === seat ? l.b : l.a];
      return other.won === other.bid;
    }).length;
    const row = scoreRow(s.settings, cards, { bid: p.bid!, won: p.won, shot: p.shot, bonus: p.bonus, rascalBet: p.rascalBet }, loot);
    p.score += row.total;
    p.rows.push({ ...row, round: s.round + 1, cards });
  });
  s.log.push({ t: `第 ${s.round + 1} 轮结束：` + s.players.map((p) => `${p.name} ${p.rows.at(-1)!.total >= 0 ? "+" : ""}${p.rows.at(-1)!.total}`).join("，") });
  if (s.round + 1 >= s.counts.length) {
    s.phase = "FINISHED";
    const best = Math.max(...s.players.map((p) => p.score));
    s.winners = s.players.flatMap((p, i) => (p.score === best ? [i] : []));
    s.log.push({ t: "游戏结束，" + s.winners.map((i) => s.players[i].name).join("、") + " 成为七海船长！" });
  } else s.phase = "ROUND_END";
}

export function reduceSK(prev: SKState, c: Command): SKState {
  const s: SKState = structuredClone(prev);
  const n = s.players.length;
  ensure(Number.isInteger(c.actor) && c.actor >= 0 && c.actor < n, "座位无效");
  const me = s.players[c.actor];
  switch (c.type) {
    case "BID": {
      ensure(s.phase === "BID", "现在不是下注阶段");
      ensure(me.bid === null, "你已经下注了");
      ensure(Number.isInteger(c.bid) && c.bid >= 0 && c.bid <= cardsThisRound(s), "下注须在 0 到本轮张数之间");
      me.bid = c.bid;
      if (s.players.every((p) => p.bid !== null)) {
        if (s.settings.scoring === "rascal" && s.settings.cannon) {
          s.phase = "SHOT";
          s.log.push({ t: "下注亮出：" + s.players.map((p) => `${p.name} ${p.bid}`).join("，") + "，现在选择炮弹" });
        } else startPlay(s);
      }
      break;
    }
    case "SHOT": {
      ensure(s.phase === "SHOT", "现在不是选择炮弹的时候");
      ensure(me.shot === null, "你已经选过了");
      ensure(c.shot === "grape" || c.shot === "cannon", "选择无效");
      me.shot = c.shot;
      if (s.players.every((p) => p.shot !== null)) startPlay(s);
      break;
    }
    case "PLAY": {
      ensure(s.phase === "PLAY", "现在不能出牌");
      ensure(turnOf(s) === c.actor, "还没轮到你");
      ensure(me.hand.includes(c.id), "你没有这张牌");
      ensure(legalPlays(me.hand, s.trick).includes(c.id), `有${SUIT_NAME[leadSuit(s.trick)!]}就必须跟${SUIT_NAME[leadSuit(s.trick)!]}（特殊牌随时可出）`);
      const isTig = CARDS[c.id].kind === "tigress";
      ensure(!isTig || c.as === "pirate" || c.as === "escape", "打出母老虎时要宣告当海盗还是逃跑");
      me.hand.splice(me.hand.indexOf(c.id), 1);
      place(s, { seat: c.actor, id: c.id, ...(isTig ? { as: c.as } : {}) });
      ghostPlays(s);
      break;
    }
    case "ROSIE": {
      ensure(s.phase === "ABILITY" && s.ability?.pirate === "rosie" && s.ability.seat === c.actor, "现在不能发动罗茜的技能");
      ensure(Number.isInteger(c.target) && c.target >= 0 && c.target < n, "请选择一名玩家");
      s.leader = c.target;
      s.log.push({ seat: c.actor, t: `${me.name} 指定 ${s.players[c.target].name} 带下一墩` });
      afterTrick(s);
      break;
    }
    case "BENDT": {
      ensure(s.phase === "ABILITY" && s.ability?.pirate === "bendt" && s.ability.seat === c.actor, "现在不能发动本特的技能");
      const k = s.ability.drawn.length;
      ensure(Array.isArray(c.discard) && c.discard.length === k && new Set(c.discard).size === k && c.discard.every((id) => me.hand.includes(id)), `请选择 ${k} 张要弃掉的手牌`);
      me.hand = me.hand.filter((id) => !c.discard.includes(id));
      s.out.push(...c.discard);
      s.log.push({ seat: c.actor, t: `${me.name} 摸了 ${k} 张又弃了 ${k} 张` });
      afterTrick(s);
      break;
    }
    case "RASCAL": {
      ensure(s.phase === "ABILITY" && s.ability?.pirate === "rascal" && s.ability.seat === c.actor, "现在不能发动无赖的技能");
      ensure([0, 10, 20].includes(c.bet), "只能押 0、10 或 20 分");
      me.rascalBet = (me.rascalBet ?? 0) + c.bet;
      s.log.push({ seat: c.actor, t: `${me.name} 押注 ${c.bet} 分` });
      afterTrick(s);
      break;
    }
    case "JUANITA": {
      ensure(s.phase === "ABILITY" && s.ability?.pirate === "juanita" && s.ability.seat === c.actor, "现在不能发动胡安妮塔的技能");
      s.log.push({ seat: c.actor, t: `${me.name} 偷看了没发出的牌` });
      afterTrick(s);
      break;
    }
    case "HARRY": {
      ensure(s.phase === "ABILITY" && s.ability?.pirate === "harry" && s.ability.seat === c.actor, "现在不能发动哈利的技能");
      ensure([-1, 0, 1].includes(c.delta), "只能 +1、−1 或不变");
      const nb = me.bid! + c.delta;
      ensure(nb >= 0 && nb <= cardsThisRound(s), "下注不能小于 0 或大于本轮张数");
      me.bid = nb;
      me.harry += c.delta;
      s.log.push({ seat: c.actor, t: c.delta ? `${me.name} 把下注改成 ${nb}` : `${me.name} 保持下注不变` });
      afterTrick(s);
      break;
    }
    case "NEXT_ROUND": {
      ensure(s.phase === "ROUND_END", "本轮还没结束");
      s.round++;
      s.dealer = (s.dealer + 1) % n;
      deal(s);
      break;
    }
    default:
      throw Error("未知操作");
  }
  assertInvariants(s);
  return s;
}

export function assertInvariants(s: SKState) {
  const all = [...s.players.flatMap((p) => p.hand), ...(s.ghost?.hand ?? []), ...s.deck, ...s.out, ...s.trick.map((p) => p.id)];
  ensure(new Set(all).size === all.length, "牌重复了");
  ensure(all.length === deckFor(s.settings).length, "牌数不对");
  if (s.phase === "PLAY") ensure(s.order.length === s.players.length + (s.ghost ? 1 : 0), "出牌顺序错误");
}

/* ---------------- 视角（隐藏信息） ---------------- */
export interface SKView {
  me: number;
  phase: Phase;
  round: number;
  rounds: number;
  cards: number;
  counts: number[];
  dealer: number;
  settings: SKSettings;
  hand: number[];
  legal: number[];
  turn: number;
  leader: number;
  order: number[];
  trick: Played[];
  lead: Suit | null;
  tricks: TrickResult[];
  players: {
    name: string;
    handCount: number;
    bid: number | null;
    bidDone: boolean;
    shot: "grape" | "cannon" | null;
    shotDone: boolean;
    won: number;
    bonus: BonusItem[];
    rascalBet: number | null;
    score: number;
    rows: Player["rows"];
  }[];
  ghost: { handCount: number; won: number } | null;
  ability: (Ability & { deck?: number[] }) | null;
  loots: { a: number; b: number }[];
  log: LogEntry[];
  winners: number[];
}

export function viewForSK(s: SKState, me: number): SKView {
  const reveal = s.phase !== "BID";
  const revealShot = s.phase !== "SHOT" && s.phase !== "BID";
  const myAbility = s.ability && s.ability.seat === me;
  return {
    me,
    phase: s.phase,
    round: s.round,
    rounds: s.counts.length,
    cards: cardsThisRound(s),
    counts: s.counts,
    dealer: s.dealer,
    settings: s.settings,
    hand: [...s.players[me].hand],
    legal: s.phase === "PLAY" && turnOf(s) === me ? legalPlays(s.players[me].hand, s.trick) : [],
    turn: turnOf(s),
    leader: s.leader,
    order: s.order,
    trick: s.trick,
    lead: leadSuit(s.trick),
    tricks: s.tricks,
    players: s.players.map((p, i) => ({
      name: p.name,
      handCount: p.hand.length,
      bid: reveal || i === me ? p.bid : null,
      bidDone: p.bid !== null,
      shot: revealShot || i === me ? p.shot : null,
      shotDone: p.shot !== null,
      won: p.won,
      bonus: p.bonus,
      rascalBet: p.rascalBet,
      score: p.score,
      rows: p.rows,
    })),
    ghost: s.ghost ? { handCount: s.ghost.hand.length, won: s.ghost.won } : null,
    ability: s.ability ? { ...s.ability, ...(myAbility && s.ability.pirate === "juanita" ? { deck: [...s.deck] } : {}), ...(s.ability.pirate === "bendt" && !myAbility ? { drawn: [] } : {}) } : null,
    loots: s.loots,
    log: s.log.slice(-40),
    winners: s.winners,
  };
}

/** 卡牌强度（排序与人机用） */
export function strength(id: number, as?: "pirate" | "escape") {
  const c = CARDS[id];
  switch (c.kind) {
    case "suit":
      return (c.suit === "black" ? 20 : 0) + c.n!;
    case "king":
      return 60;
    case "pirate":
      return 50;
    case "tigress":
      return as === "escape" ? 0 : 50;
    case "mermaid":
      return 45;
    default:
      return 0;
  }
}

export function sortHand(hand: number[]) {
  const rank = (id: number) => {
    const c = CARDS[id];
    if (c.kind === "suit") return SUITS.indexOf(c.suit!) * 20 + c.n!;
    return 100 + ["escape", "loot", "tigress", "pirate", "mermaid", "king", "kraken", "whale"].indexOf(c.kind) * 10 + (c.pirate ? PIRATES.indexOf(c.pirate) : 0);
  };
  return [...hand].sort((a, b) => rank(a) - rank(b));
}
