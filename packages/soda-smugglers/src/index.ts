/** Server-only deterministic state. Clients receive only viewForSS projections. */
export type EventId =
  | "inspection"
  | "birthday"
  | "holiday"
  | "desperate"
  | "greedy"
  | "impartial"
  | "night"
  | "dog";
export const EVENTS: readonly EventId[] = [
  "inspection",
  "birthday",
  "holiday",
  "desperate",
  "greedy",
  "impartial",
  "night",
  "dog",
];
export const EVENT_NAMES: Record<EventId, string> = {
  inspection: "领导视察",
  birthday: "生日礼物",
  holiday: "假日狂欢",
  desperate: "破釜沉舟",
  greedy: "贪得无厌",
  impartial: "铁面无私",
  night: "起早贪黑",
  dog: "缉私犬长",
};
export type Phase =
  "PACK" | "BRIBE" | "INSPECT" | "ARREST" | "ROUND_END" | "FINISHED";
export interface Card {
  id: string;
  bottles: number;
}
export interface Budget {
  bribe: number;
  inspect: number;
  arrest: number;
}
export interface Player {
  name: string;
  caps: number;
  hand: string[];
  luggage: string[];
  bribe: string | null;
  submitted: boolean;
  revealed: number[];
  settled: boolean;
  stats: {
    delivered: number;
    confiscated: number;
    wrongful: number;
    bribesPaid: number;
    bribesReceived: number;
  };
}
export interface PublicAction {
  round: number;
  type: string;
  seat: number;
  target?: number;
  bottles?: number[];
  amount?: number;
  penalty?: number;
  useEvent?: boolean;
}
export interface SSOptions {
  events: boolean;
  seconds: 0 | 60 | 120;
}
export interface SSState {
  phase: Phase;
  players: Player[];
  guard: number;
  firstGuard: number;
  round: number;
  totalRounds: number;
  seed: number;
  random: number;
  options: SSOptions;
  deck: string[];
  discard: string[];
  bank: number;
  budget: Budget;
  event: EventId | null;
  eventDeck: EventId[];
  eventDiscard: EventId[];
  eventUsed: boolean;
  pendingDog: number | null;
  seq: Record<string, number>;
  deadline: number | null;
  history: PublicAction[];
  result: { winners: number[]; scores: number[] } | null;
}
export interface CreateOptions {
  seed: number;
  firstGuard?: number | "random";
  events?: boolean;
  seconds?: 0 | 60 | 120;
  now?: number;
}
const ensure: (ok: unknown, message: string) => asserts ok = (ok, message) => {
  if (!ok) throw Error(message);
};
export const CAP_STOCK = Object.freeze(
  [
    { value: 1, count: 32 },
    { value: 3, count: 20 },
    { value: 5, count: 12 },
    { value: 10, count: 8 },
    { value: 20, count: 5 },
    { value: 30, count: 3 },
  ].map(Object.freeze),
);
export const createDeckSS = (): Card[] =>
  [12, 12, 7, 5].flatMap((n, bottles) =>
    Array.from({ length: n }, (_, i) => ({
      id: `SS${bottles}-${i + 1}`,
      bottles,
    })),
  );
const CARDS = new Map(createDeckSS().map((c) => [c.id, c.bottles]));
export function bottlesSS(id: string): number {
  const v = CARDS.get(id);
  ensure(v !== undefined, "手提箱牌不存在");
  return v;
}
export function actionBudgetSS(n: number): Budget {
  ensure(Number.isInteger(n) && n >= 3 && n <= 8, "游戏需要3至8名玩家");
  return {
    bribe: n >= 7 ? 2 : 1,
    inspect: n >= 6 ? 2 : 1,
    arrest: n === 8 ? 3 : n >= 5 ? 2 : 1,
  };
}
function random(s: SSState) {
  s.random = (s.random + 0x6d2b79f5) >>> 0;
  let x = s.random;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(s: SSState, values: readonly T[]): T[] {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function deadline(s: SSState, now: number) {
  s.deadline =
    s.options.seconds &&
    ["PACK", "BRIBE", "INSPECT", "ARREST"].includes(s.phase)
      ? now + s.options.seconds * 1000
      : null;
}
/** Value ledger represents exact change; HR-SS-01 clips transfers at payer's balance. */
function pay(
  s: SSState,
  from: number | "bank",
  to: number | "bank",
  requested: number,
) {
  const available = from === "bank" ? s.bank : s.players[from].caps;
  const amount = Math.min(available, requested);
  if (from === "bank") s.bank -= amount;
  else s.players[from].caps -= amount;
  if (to === "bank") s.bank += amount;
  else s.players[to].caps += amount;
  return amount;
}
function startRound(s: SSState, now: number) {
  s.phase = "PACK";
  s.budget = actionBudgetSS(s.players.length);
  s.eventUsed = false;
  s.pendingDog = null;
  s.deck = shuffle(
    s,
    createDeckSS().map((c) => c.id),
  );
  s.discard = [];
  s.players.forEach((p, i) => {
    p.hand = i === s.guard ? [] : s.deck.splice(0, 5);
    p.luggage = [];
    p.bribe = null;
    p.submitted = false;
    p.revealed = [];
    p.settled = false;
  });
  s.event = s.options.events ? (s.eventDeck.shift() ?? null) : null;
  if (s.event)
    s.history.push({ round: s.round, type: `EVENT_${s.event}`, seat: s.guard });
  if (s.event === "birthday") {
    const amount = pay(s, "bank", s.guard, 2);
    s.history.push({
      round: s.round,
      type: "BIRTHDAY_BONUS",
      seat: s.guard,
      amount,
    });
  }
  if (s.event === "desperate") {
    const amount = pay(s, s.guard, "bank", s.budget.arrest);
    s.history.push({
      round: s.round,
      type: "DESPERATE_PAYMENT",
      seat: s.guard,
      amount,
    });
  }
  deadline(s, now);
}
export function createSS(names: string[], opts: CreateOptions): SSState {
  actionBudgetSS(names.length);
  ensure(
    names.every((n) => typeof n === "string" && n.trim().length > 0),
    "请填写玩家昵称",
  );
  ensure(
    Number.isInteger(opts.seed) && opts.seed >= 0 && opts.seed <= 0xffffffff,
    "随机种子必须是32位非负整数",
  );
  ensure(
    opts.seconds === undefined || [0, 60, 120].includes(opts.seconds),
    "计时只能为不限时、60秒或120秒",
  );
  ensure(
    opts.events === undefined || typeof opts.events === "boolean",
    "随机事件开关无效",
  );
  const now = opts.now ?? 0;
  ensure(Number.isFinite(now), "时间无效");
  const s: SSState = {
    phase: "PACK",
    players: names.map((name) => ({
      name,
      caps: 10,
      hand: [],
      luggage: [],
      bribe: null,
      submitted: false,
      revealed: [],
      settled: false,
      stats: {
        delivered: 0,
        confiscated: 0,
        wrongful: 0,
        bribesPaid: 0,
        bribesReceived: 0,
      },
    })),
    guard: 0,
    firstGuard: 0,
    round: 1,
    totalRounds: names.length * (names.length <= 4 ? 2 : 1),
    seed: opts.seed,
    random: opts.seed || 0x9e3779b9,
    options: { events: opts.events ?? false, seconds: opts.seconds ?? 0 },
    deck: [],
    discard: [],
    bank: 422 - names.length * 10,
    budget: actionBudgetSS(names.length),
    event: null,
    eventDeck: [],
    eventDiscard: [],
    eventUsed: false,
    pendingDog: null,
    seq: {},
    deadline: null,
    history: [],
    result: null,
  };
  s.guard =
    opts.firstGuard === "random"
      ? Math.floor(random(s) * names.length)
      : (opts.firstGuard ?? 0);
  ensure(
    Number.isInteger(s.guard) && s.guard >= 0 && s.guard < names.length,
    "首位缉私警长座位无效",
  );
  s.firstGuard = s.guard;
  s.eventDeck = s.options.events ? shuffle(s, EVENTS) : [];
  startRound(s, now);
  assertInvariants(s);
  return s;
}
function projectViewSS(s: SSState, seat: number) {
  const own = Number.isInteger(seat) && seat >= 0 && seat < s.players.length;
  return {
    phase: s.phase,
    round: s.round,
    totalRounds: s.totalRounds,
    guard: s.guard,
    firstGuard: s.firstGuard,
    options: s.options,
    bank: s.bank,
    budget: s.budget,
    event: s.event,
    eventUsed: s.eventUsed,
    pendingDog: s.pendingDog,
    deadline: s.deadline,
    result: s.result,
    history: s.history,
    players: s.players.map((p, i) => ({
      seat: i,
      name: p.name,
      caps: p.caps,
      stats: p.stats,
      submitted: p.submitted,
      settled: p.settled,
      hand:
        own && i === seat
          ? p.hand.map((id) => ({ id, bottles: bottlesSS(id) }))
          : undefined,
      luggage: p.luggage.length
        ? p.luggage.map((id, j) =>
            p.settled || p.revealed.includes(j) || (own && i === seat)
              ? {
                  index: j,
                  bottles: bottlesSS(id),
                  ...(own && i === seat ? { id } : {}),
                }
              : null,
          )
        : Array.from({ length: s.event === "holiday" ? 3 : 2 }, () => null),
      bribe:
        p.bribe && (s.phase !== "PACK" || (own && i === seat))
          ? {
              bottles: bottlesSS(p.bribe),
              ...(own && i === seat ? { id: p.bribe } : {}),
            }
          : null,
    })),
  };
}
export function viewForSS(s: SSState, seat: number) {
  return structuredClone(projectViewSS(s, seat));
}
export function assertInvariants(s: SSState) {
  const ids = [
    ...s.deck,
    ...s.discard,
    ...s.players.flatMap((p) => [
      ...p.hand,
      ...p.luggage,
      ...(p.bribe ? [p.bribe] : []),
    ]),
  ];
  ensure(
    ids.length === 36 &&
      new Set(ids).size === 36 &&
      ids.every((id) => CARDS.has(id)),
    "不变量：36张牌必须守恒且不能重复",
  );
  ensure(
    [s.bank, ...s.players.map((p) => p.caps)].every(
      (n) => Number.isInteger(n) && n >= 0,
    ),
    "不变量：瓶盖不能为负数",
  );
  ensure(
    s.bank + s.players.reduce((a, p) => a + p.caps, 0) === 422,
    "不变量：瓶盖总面值必须为422",
  );
  ensure(
    Object.values(s.budget).every((n) => Number.isInteger(n) && n >= 0),
    "不变量：行动指示物不能为负数",
  );
  ensure(
    s.players.every(
      (p) =>
        new Set(p.revealed).size === p.revealed.length &&
        p.revealed.every(
          (i) => Number.isInteger(i) && i >= 0 && i < p.luggage.length,
        ),
    ),
    "不变量：公开箱子位置无效",
  );
  ensure(
    Number.isInteger(s.guard) && s.guard >= 0 && s.guard < s.players.length,
    "不变量：缉私警长座位无效",
  );
  for (let seat = -1; seat < s.players.length; seat++) {
    const v = projectViewSS(s, seat);
    v.players.forEach((p, i) => {
      if (i === seat) return;
      ensure(p.hand === undefined, "隐私不变量：他人手牌不能公开");
      ensure(
        s.phase !== "PACK" || p.bribe === null,
        "隐私不变量：贿赂不能提前公开",
      );
      p.luggage.forEach((card, j) =>
        ensure(
          card === null ||
            (!("id" in card) &&
              (s.players[i].settled || s.players[i].revealed.includes(j))),
          "隐私不变量：未揭晓的行李不能公开",
        ),
      );
    });
  }
  const ev = [...s.eventDeck, ...s.eventDiscard, ...(s.event ? [s.event] : [])];
  ensure(
    s.options.events
      ? ev.length === 8 &&
          new Set(ev).size === 8 &&
          ev.every((e) => EVENTS.includes(e))
      : ev.length === 0,
    "不变量：8张事件牌必须守恒",
  );
}
interface BaseCommand {
  actor: number | "server";
  seq: number;
  now: number;
}
export type Command = BaseCommand &
  (
    | { type: "SUBMIT"; luggage: string[]; bribe: string }
    | { type: "ACCEPT"; target: number; useEvent?: boolean }
    | { type: "INSPECT"; target: number; index?: number; useEvent?: boolean }
    | { type: "REVEAL_DOG"; index: number }
    | { type: "ARREST"; target: number; useEvent?: boolean }
    | { type: "GREEDY" }
    | { type: "ADVANCE" }
    | { type: "NEXT_ROUND" }
    | { type: "TIMEOUT" }
  );
function submit(
  s: SSState,
  seat: number,
  luggage: string[],
  bribe: string,
  now: number,
) {
  const p = s.players[seat];
  ensure(seat !== s.guard, "只有旅客可以提交行李");
  ensure(!p.submitted, "行李已提交，不能再修改");
  ensure(
    Array.isArray(luggage) &&
      luggage.length === (s.event === "holiday" ? 3 : 2),
    `请选择${s.event === "holiday" ? 3 : 2}张手提箱牌作为行李`,
  );
  const chosen = [...luggage, bribe];
  ensure(new Set(chosen).size === chosen.length, "不能重复选择同一张手提箱牌");
  ensure(
    chosen.every((id) => typeof id === "string" && p.hand.includes(id)),
    "只能选择自己的手牌",
  );
  p.luggage = [...luggage];
  p.bribe = bribe;
  s.discard.push(...p.hand.filter((id) => !chosen.includes(id)));
  p.hand = [];
  p.submitted = true;
  if (s.players.every((p, i) => i === s.guard || p.submitted)) {
    s.phase = "BRIBE";
    deadline(s, now);
  }
}
function targetPlayer(s: SSState, target: number) {
  ensure(
    Number.isInteger(target) &&
      target >= 0 &&
      target < s.players.length &&
      target !== s.guard,
    "请选择有效旅客",
  );
  const p = s.players[target];
  ensure(!p.settled, "该旅客已经结算放行或逮捕");
  return p;
}
function settle(s: SSState, target: number, arrest: boolean, useEvent = false) {
  const p = targetPlayer(s, target);
  const bottles = p.luggage.map(bottlesSS);
  const total = bottles.reduce((a, b) => a + b, 0);
  const limit = s.event === "birthday" ? 2 : s.event === "desperate" ? 0 : 1;
  let type = "RELEASE",
    amount = 0,
    penalty = 0;
  if (arrest && total > limit) {
    type = "CONFISCATE";
    amount = pay(s, "bank", s.guard, total);
    s.players[s.guard].stats.confiscated += total;
  } else {
    if (arrest) {
      type = "WRONGFUL";
      penalty =
        useEvent && s.event === "impartial" ? 0 : pay(s, s.guard, target, 2);
      s.players[s.guard].stats.wrongful++;
    }
    amount = pay(s, "bank", target, total);
    p.stats.delivered += total;
  }
  p.settled = true;
  p.revealed = p.luggage.map((_, i) => i);
  s.history.push({
    round: s.round,
    type,
    seat: s.guard,
    target,
    bottles,
    amount,
    penalty,
    useEvent,
  });
}
function accept(s: SSState, target: number, useEvent = false, greedy = false) {
  const p = targetPlayer(s, target);
  ensure(s.phase === "BRIBE", "只能在受贿阶段接受提议");
  if (!greedy) {
    if (useEvent) {
      ensure(
        s.event === "night" && !s.eventUsed,
        "本轮没有可用的额外受贿指示物",
      );
      s.eventUsed = true;
    } else {
      ensure(s.budget.bribe > 0, "受贿指示物已用完");
      s.budget.bribe--;
    }
  }
  ensure(p.bribe !== null, "该旅客尚未公开贿赂");
  const amount = pay(s, target, s.guard, bottlesSS(p.bribe));
  p.stats.bribesPaid += amount;
  s.players[s.guard].stats.bribesReceived += amount;
  s.history.push({
    round: s.round,
    type: "ACCEPT",
    seat: s.guard,
    target,
    amount,
    useEvent,
  });
  settle(s, target, false);
}
function advance(s: SSState, now: number) {
  ensure(s.pendingDog === null, "请等待旅客翻开缉私犬长指定的手提箱");
  if (s.phase === "BRIBE") s.phase = "INSPECT";
  else if (s.phase === "INSPECT") s.phase = "ARREST";
  else if (s.phase === "ARREST") {
    s.players.forEach((p, i) => {
      if (i !== s.guard && !p.settled) settle(s, i, false);
    });
    s.phase = s.round === s.totalRounds ? "FINISHED" : "ROUND_END";
    if (s.phase === "FINISHED") {
      const scores = s.players.map((p) => p.caps);
      const max = Math.max(...scores);
      s.result = {
        scores,
        winners: scores.flatMap((v, i) => (v === max ? [i] : [])),
      };
    }
  } else ensure(false, "当前阶段不能跳过行动");
  deadline(s, now);
}
function inspect(
  s: SSState,
  target: number,
  index: number | undefined,
  useEvent: boolean,
) {
  ensure(s.phase === "INSPECT", "只能在检查阶段打开手提箱");
  const p = targetPlayer(s, target);
  ensure(s.pendingDog === null, "请等待缉私犬长的检查结果");
  if (useEvent) {
    ensure(
      (s.event === "inspection" || s.event === "dog") && !s.eventUsed,
      "本轮没有可用的额外检查指示物",
    );
    if (s.event === "dog") {
      // 卡面：被犬长检查的旅客必须翻开汽水最多的箱子。并列时结果相同，
      // 由服务器直接翻开，避免旅客离线时整桌卡住。
      ensure(p.revealed.length === 0, "缉私犬长不能再次检查同一名旅客");
      const values = p.luggage.map(bottlesSS);
      const max = values.indexOf(Math.max(...values));
      s.eventUsed = true;
      p.revealed.push(max);
      s.history.push({
        round: s.round,
        type: "DOG_REVEAL",
        seat: s.guard,
        target,
        bottles: [values[max]],
        useEvent: true,
      });
      return;
    }
  } else {
    ensure(s.budget.inspect > 0, "检查指示物已用完");
    ensure(p.revealed.length === 0, "同一名旅客只能检查一个手提箱");
  }
  ensure(
    Number.isInteger(index) && index! >= 0 && index! < p.luggage.length,
    "请选择有效的手提箱位置",
  );
  ensure(!p.revealed.includes(index!), "这个手提箱已经公开");
  if (useEvent) s.eventUsed = true;
  else s.budget.inspect--;
  p.revealed.push(index!);
  s.history.push({
    round: s.round,
    type: "INSPECT",
    seat: s.guard,
    target,
    bottles: [bottlesSS(p.luggage[index!])],
    useEvent,
  });
}
function applyCommand(s: SSState, c: Command) {
  if (c.type === "TIMEOUT") {
    ensure(c.actor === "server", "只有服务器可以处理超时");
    ensure(s.deadline !== null && c.now >= s.deadline, "尚未到时或未启用计时");
    if (s.phase === "PACK")
      s.players.forEach((p, i) => {
        if (i !== s.guard && !p.submitted) {
          const n = s.event === "holiday" ? 3 : 2;
          submit(s, i, p.hand.slice(0, n), p.hand[n], c.now);
        }
      });
    else if (s.pendingDog !== null) {
      const target = s.pendingDog;
      const p = s.players[target];
      const values = p.luggage.map(bottlesSS);
      const index = values.indexOf(Math.max(...values));
      p.revealed.push(index);
      s.pendingDog = null;
      s.history.push({
        round: s.round,
        type: "DOG_REVEAL",
        seat: target,
        target,
        bottles: [values[index]],
        useEvent: true,
      });
      deadline(s, c.now);
    } else advance(s, c.now);
    return;
  }
  ensure(c.actor !== "server", "服务器不能代替玩家提交普通操作");
  ensure(
    s.deadline === null || c.now < s.deadline,
    "本阶段已到时，请等待服务器处理",
  );
  if (c.type === "SUBMIT") {
    ensure(s.phase === "PACK", "当前不是秘密装包阶段");
    submit(s, c.actor, c.luggage, c.bribe, c.now);
    return;
  }
  if (c.type === "REVEAL_DOG") {
    ensure(
      s.phase === "INSPECT" && s.pendingDog === c.actor,
      "当前没有轮到你接受缉私犬长检查",
    );
    const p = s.players[c.actor];
    const values = p.luggage.map(bottlesSS);
    ensure(
      Number.isInteger(c.index) && c.index >= 0 && c.index < values.length,
      "请选择有效的手提箱位置",
    );
    ensure(
      values[c.index] === Math.max(...values),
      "必须翻开携带汽水最多的手提箱",
    );
    p.revealed.push(c.index);
    s.pendingDog = null;
    s.history.push({
      round: s.round,
      type: "DOG_REVEAL",
      seat: c.actor,
      target: c.actor,
      bottles: [values[c.index]],
      useEvent: true,
    });
    deadline(s, c.now);
    return;
  }
  if (c.type === "NEXT_ROUND") {
    // 任何玩家都能进入下一轮：警长掉线时整桌不会卡住。
    ensure(s.phase === "ROUND_END", "本轮尚未结束或对局已经结束");
    if (s.event) s.eventDiscard.push(s.event);
    s.round++;
    s.guard = (s.guard + 1) % s.players.length;
    startRound(s, c.now);
    return;
  }
  ensure(c.actor === s.guard, "只有当前缉私警长可以执行此操作");
  ensure(s.pendingDog === null, "请等待旅客翻开缉私犬长指定的手提箱");
  switch (c.type) {
    case "ACCEPT":
      ensure(
        c.useEvent === undefined || typeof c.useEvent === "boolean",
        "事件指示物参数无效",
      );
      accept(s, c.target, c.useEvent);
      break;
    case "INSPECT":
      ensure(
        c.useEvent === undefined || typeof c.useEvent === "boolean",
        "事件指示物参数无效",
      );
      inspect(s, c.target, c.index, c.useEvent ?? false);
      if (s.pendingDog !== null) deadline(s, c.now);
      break;
    case "ARREST": {
      ensure(s.phase === "ARREST", "只能在逮捕阶段执行逮捕");
      targetPlayer(s, c.target);
      ensure(
        c.useEvent === undefined || typeof c.useEvent === "boolean",
        "事件指示物参数无效",
      );
      if (c.useEvent) {
        ensure(
          s.event === "impartial" && !s.eventUsed,
          "本轮没有可用的额外逮捕指示物",
        );
        s.eventUsed = true;
      } else {
        ensure(s.budget.arrest > 0, "逮捕指示物已用完");
        s.budget.arrest--;
      }
      settle(s, c.target, true, c.useEvent);
      break;
    }
    case "GREEDY":
      ensure(
        s.phase === "BRIBE" && s.event === "greedy" && !s.eventUsed,
        "本轮不能使用贪得无厌",
      );
      ensure(
        !s.history.some((a) => a.round === s.round && a.type === "ACCEPT"),
        "贪得无厌必须在接受任何贿赂之前选择",
      );
      s.eventUsed = true;
      s.players.forEach((p, i) => {
        if (i !== s.guard && !p.settled) accept(s, i, false, true);
      });
      s.phase = "ARREST";
      advance(s, c.now);
      break;
    case "ADVANCE":
      advance(s, c.now);
      break;
    default:
      ensure(false, "未知的游戏操作");
  }
}
/** 警长在当前阶段已无事可做时自动进入下一阶段（不改变规则结果，只省掉空按）。 */
function autoAdvance(s: SSState, now: number) {
  for (let guardLoop = 0; guardLoop < 4; guardLoop++) {
    if (!["BRIBE", "INSPECT", "ARREST"].includes(s.phase) || s.pendingDog !== null)
      return;
    const open = s.players.some((p, i) => i !== s.guard && !p.settled);
    const eventLeft =
      !s.eventUsed &&
      ((s.phase === "BRIBE" && (s.event === "night" || s.event === "greedy")) ||
        (s.phase === "INSPECT" && (s.event === "inspection" || s.event === "dog")) ||
        (s.phase === "ARREST" && s.event === "impartial"));
    const left =
      s.phase === "BRIBE"
        ? s.budget.bribe
        : s.phase === "INSPECT"
          ? s.budget.inspect
          : s.budget.arrest;
    if (open && (left > 0 || eventLeft)) return;
    advance(s, now);
  }
}
export function reduceSS(state: SSState, cmd: Command): SSState {
  ensure(cmd && typeof cmd === "object", "游戏操作无效");
  ensure(
    cmd.actor === "server" ||
      (Number.isInteger(cmd.actor) &&
        cmd.actor >= 0 &&
        cmd.actor < state.players.length),
    "行动座位无效",
  );
  ensure(Number.isSafeInteger(cmd.seq) && cmd.seq > 0, "操作序号必须是正整数");
  ensure(Number.isFinite(cmd.now), "操作时间无效");
  const prev = state.seq[String(cmd.actor)] ?? 0;
  if (cmd.seq <= prev) return state;
  ensure(cmd.seq === prev + 1, "操作序号不连续，请同步状态");
  ensure(state.phase !== "FINISHED", "对局已经结束");
  const next = structuredClone(state);
  applyCommand(next, cmd);
  autoAdvance(next, cmd.now);
  if (cmd.type !== "NEXT_ROUND" && cmd.type !== "TIMEOUT")
    state.players.forEach((p, i) => {
      if (i === cmd.actor) return;
      const q = next.players[i];
      ensure(
        JSON.stringify([p.hand, p.luggage, p.bribe]) ===
          JSON.stringify([q.hand, q.luggage, q.bribe]),
        "权限不变量：不能修改其他旅客的秘密选择",
      );
    });
  next.seq[String(cmd.actor)] = cmd.seq;
  assertInvariants(next);
  return next;
}
