import approved from "../data/approved-bank.json" with { type: "json" };

export interface NDQuestion {
  id: string;
  text: string;
  low: string;
  high: string;
  spicy: boolean;
}
export type NDPhase =
  | "CHOOSE_TOPIC"
  | "ANSWER"
  | "ORDER"
  | "REVEAL"
  | "EXPERT"
  | "CAPTAIN_GUESS"
  | "ROUND_END"
  | "FINISHED";
export interface NDReveal {
  seat: number;
  number: number;
  correct: boolean;
  penalty: number;
  guess?: number;
  answer?: string;
}
export interface NDEvent {
  id: number;
  type:
    | "ROUND_STARTED"
    | "TOPIC_SELECTED"
    | "ANSWER_READY"
    | "ANSWER_WITHDRAWN"
    | "ORDER_LOCKED"
    | "REVEALED"
    | "TEAM_RECOVERY"
    | "FINISHED";
  round: number;
  captain: number;
  seat?: number;
  topicId?: string;
  order?: number[];
  number?: number;
  guess?: number;
  answer?: string;
  correct?: boolean;
  penalty?: number;
  recovered?: number;
  unicorns?: number;
  poops?: number;
  success?: boolean;
}
export interface NDResult {
  success: boolean;
  reason: "NO_UNICORNS" | "FIVE_ROUNDS";
  level: "flop" | "honorable" | "professionals" | "champions";
}
export interface NDState {
  phase: NDPhase;
  players: { name: string }[];
  captain: number;
  round: number;
  totalRounds: 5;
  options: { expert: boolean; scale: "open" | "normal" };
  seed: number;
  random: number;
  topicCards: { id: string; questions: [NDQuestion, NDQuestion] }[];
  topic: NDQuestion | null;
  numbers: (number | null)[];
  unusedNumbers: number[];
  ready: number[];
  answers: (string | null)[];
  order: number[];
  revealed: NDReveal[];
  tokenTotal: number;
  unicorns: number;
  poops: number;
  seq: number[];
  receipts: Record<string, string>[];
  history: NDEvent[];
  result: NDResult | null;
}
export interface NDCreateOptions {
  seed: number;
  firstCaptain?: number;
  expert?: boolean;
  scale?: "open" | "normal";
  bank?: readonly NDQuestion[];
}
type Envelope = { seat: number; seq: number };
export type NDCommand = Envelope &
  (
    | { type: "CHOOSE_TOPIC"; topicId: string }
    | { type: "SUBMIT_ANSWER"; text: string }
    | { type: "WITHDRAW_ANSWER" }
    | { type: "UPDATE_ORDER"; order: readonly number[] }
    | { type: "LOCK_ORDER"; order: readonly number[] }
    | { type: "REVEAL_NEXT" }
    | { type: "GUESS_EXACT"; target: number; guess: number }
    | { type: "GUESS_CAPTAIN"; guess: number }
    | { type: "NEXT_ROUND" }
  );
export class NDGameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NDGameError";
  }
}
function requireND(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new NDGameError(code, message);
}
const ten = () => Array.from({ length: 10 }, (_, i) => i + 1);
const commandFields: Record<NDCommand["type"], readonly string[]> = {
  CHOOSE_TOPIC: ["topicId"],
  SUBMIT_ANSWER: ["text"],
  WITHDRAW_ANSWER: [],
  UPDATE_ORDER: ["order"],
  LOCK_ORDER: ["order"],
  REVEAL_NEXT: [],
  GUESS_EXACT: ["target", "guess"],
  GUESS_CAPTAIN: ["guess"],
  NEXT_ROUND: [],
};
const validSeat = (s: NDState, seat: unknown): seat is number =>
  Number.isInteger(seat) &&
  typeof seat === "number" &&
  seat >= 0 &&
  seat < s.players.length;
const members = (s: NDState) =>
  s.players.map((_, i) => i).filter((i) => i !== s.captain);
function shuffle<T>(s: { random: number }, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    let x = s.random;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    s.random = x >>> 0;
    const j = Math.floor((s.random / 4294967296) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function emit(s: NDState, event: Omit<NDEvent, "id" | "round" | "captain">) {
  s.history.push({
    id: s.history.length + 1,
    round: s.round,
    captain: s.captain,
    ...event,
  });
}
function requirePhase(s: NDState, phase: NDPhase) {
  requireND(s.phase === phase, "PHASE", "当前阶段不能执行这个操作");
}
function requireCaptain(s: NDState, seat: number) {
  requireND(seat === s.captain, "CAPTAIN", "只有本轮队长可以执行这个操作");
}
function requireNumber(n: unknown): asserts n is number {
  requireND(
    Number.isInteger(n) && typeof n === "number" && n >= 1 && n <= 10,
    "NUMBER",
    "数字必须是 1–10 之间的整数",
  );
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "undefined";
}
function validateBank(input: readonly NDQuestion[], scale: "normal" | "open") {
  requireND(Array.isArray(input), "BANK", "题库格式不正确");
  const seen = new Set<string>();
  const result: NDQuestion[] = [];
  for (const q of input) {
    requireND(
      q &&
        typeof q.id === "string" &&
        q.id.trim().length > 0 &&
        !seen.has(q.id),
      "BANK",
      "题目编号必须非空且不能重复",
    );
    seen.add(q.id);
    requireND(
      ["text", "low", "high"].every(
        (k) =>
          typeof q[k as keyof NDQuestion] === "string" &&
          String(q[k as keyof NDQuestion]).trim().length > 0,
      ) && typeof q.spicy === "boolean",
      "BANK",
      "题目、两端标准与尺度标签必须完整",
    );
    if (scale === "open" || !q.spicy)
      result.push({
        id: q.id,
        text: q.text,
        low: q.low,
        high: q.high,
        spicy: q.spicy,
      });
  }
  requireND(
    result.length >= 10,
    "BANK",
    "当前尺度至少需要 10 道不同题目，才能准备五轮二选一",
  );
  return result;
}
/** Pure construction. Production callers must provide a server-generated seed. */
export function createND(
  players: readonly string[],
  options: NDCreateOptions,
): NDState {
  requireND(
    Array.isArray(players) && players.length >= 4 && players.length <= 9,
    "PLAYERS",
    "游戏需要 4–9 名玩家",
  );
  requireND(
    players.every((n) => typeof n === "string" && n.trim().length > 0),
    "PLAYERS",
    "玩家名字不能为空",
  );
  requireND(
    options &&
      Number.isInteger(options.seed) &&
      options.seed >= 0 &&
      options.seed <= 0xffffffff,
    "SEED",
    "种子必须是 0–4294967295 之间的整数",
  );
  const expert = options.expert ?? false,
    scale = options.scale ?? "open",
    captain = options.firstCaptain ?? 0;
  requireND(
    typeof expert === "boolean" && (scale === "open" || scale === "normal"),
    "OPTIONS",
    "游戏模式或尺度设置不正确",
  );
  requireND(
    !expert || players.length !== 9,
    "OPTIONS",
    "9 人暂不支持专家模式，队长没有秘密数字",
  );
  requireND(
    Number.isInteger(captain) && captain >= 0 && captain < players.length,
    "CAPTAIN",
    "首位队长座位不正确",
  );
  const random = { random: options.seed >>> 0 || 0x6d2b79f5 };
  const selected = shuffle(
    random,
    validateBank(options.bank ?? approved.questions, scale),
  ).slice(0, 10);
  const total = Math.min(players.length, 8);
  const s: NDState = {
    phase: "CHOOSE_TOPIC",
    players: players.map((name) => ({ name })),
    captain,
    round: 1,
    totalRounds: 5,
    options: { expert, scale },
    seed: options.seed,
    random: random.random,
    topicCards: Array.from({ length: 5 }, (_, i) => ({
      id: `nd-pair-${i + 1}`,
      questions: [selected[i * 2], selected[i * 2 + 1]],
    })),
    topic: null,
    numbers: players.map(() => null),
    unusedNumbers: ten(),
    ready: [],
    answers: players.map(() => null),
    order: [],
    revealed: [],
    tokenTotal: total,
    unicorns: total,
    poops: 0,
    seq: players.map(() => 0),
    receipts: players.map(() => Object.create(null) as Record<string, string>),
    history: [],
    result: null,
  };
  emit(s, { type: "ROUND_STARTED", unicorns: s.unicorns, poops: s.poops });
  assertInvariantsND(s);
  return s;
}
function drawNumbers(s: NDState) {
  const cards = shuffle(s, ten());
  s.numbers = s.players.map(() => null);
  for (const seat of s.players
    .map((_, i) => i)
    .filter((i) => i !== s.captain || s.options.expert))
    s.numbers[seat] = cards.shift()!;
  s.unusedNumbers = cards;
}
function advanceAnswers(s: NDState) {
  if (s.ready.length !== s.players.length - 1) return;
  s.phase = s.options.expert ? "EXPERT" : "ORDER";
  if (!s.options.expert) s.order = members(s);
}
/** Server-only deadline transition; never accepted as a client command. */
export function timeoutAnswersND(state: NDState): NDState {
  assertInvariantsND(state);
  requirePhase(state, "ANSWER");
  const s = structuredClone(state);
  for (let seat = 0; seat < s.players.length; seat++)
    if (seat !== s.captain && !s.ready.includes(seat)) {
      s.answers[seat] = "（没写）";
      s.ready.push(seat);
      emit(s, { type: "ANSWER_READY", seat });
    }
  advanceAnswers(s);
  assertInvariantsND(s);
  return s;
}
function finish(s: NDState, success: boolean) {
  s.phase = "FINISHED";
  s.result = {
    success,
    reason: success ? "FIVE_ROUNDS" : "NO_UNICORNS",
    level: !success
      ? "flop"
      : s.poops === 0
        ? "champions"
        : s.unicorns >= s.poops
          ? "professionals"
          : "honorable",
  };
  emit(s, { type: "FINISHED", success, unicorns: s.unicorns, poops: s.poops });
}
function roundOver(s: NDState) {
  if (s.round === 5) finish(s, true);
  else s.phase = "ROUND_END";
}
function reveal(s: NDState, seat: number, guess?: number) {
  const number = s.numbers[seat]!;
  const previous = s.revealed.at(-1)?.number;
  const correct =
    guess !== undefined
      ? guess === number
      : previous === undefined || number > previous;
  const penalty = correct ? 0 : 1;
  s.unicorns -= penalty;
  s.poops += penalty;
  const entry: NDReveal = {
    seat,
    number,
    correct,
    penalty,
    ...(s.answers[seat] === null ? {} : { answer: s.answers[seat]! }),
  };
  if (guess !== undefined) entry.guess = guess;
  s.revealed.push(entry);
  emit(s, { type: "REVEALED", ...entry, unicorns: s.unicorns, poops: s.poops });
  if (s.unicorns === 0) {
    finish(s, false);
    return;
  }
  if (s.options.expert) {
    if (s.revealed.length === s.players.length - 1) s.phase = "CAPTAIN_GUESS";
  } else if (s.revealed.length === members(s).length) roundOver(s);
}
/** A rejected action leaves the original untouched. Accepted retries return current state. */
export function reduceND(state: NDState, cmd: NDCommand): NDState {
  assertInvariantsND(state);
  requireND(
    cmd && typeof cmd === "object" && validSeat(state, cmd.seat),
    "SEAT",
    "玩家座位不正确",
  );
  requireND(
    Number.isSafeInteger(cmd.seq) && cmd.seq >= 1,
    "SEQ",
    "命令序号必须从 1 开始递增",
  );
  requireND(
    typeof cmd.type === "string" && Object.hasOwn(commandFields, cmd.type),
    "COMMAND",
    "无法识别的游戏操作",
  );
  const allowed = ["type", "seat", "seq", ...commandFields[cmd.type]];
  requireND(
    Object.keys(cmd).every((key) => allowed.includes(key)),
    "COMMAND",
    "命令包含不允许的字段",
  );
  const fingerprint = canonical(cmd),
    prior = state.receipts[cmd.seat][String(cmd.seq)];
  if (prior !== undefined) {
    requireND(prior === fingerprint, "SEQ", "这个命令序号已用于另一个操作");
    return state;
  }
  requireND(
    cmd.seq === state.seq[cmd.seat] + 1,
    "SEQ",
    "命令序号不连续，请同步当前状态",
  );
  requireND(state.phase !== "FINISHED", "FINISHED", "游戏已经结束");
  const s = structuredClone(state);
  switch (cmd.type) {
    case "CHOOSE_TOPIC": {
      requirePhase(s, "CHOOSE_TOPIC");
      requireCaptain(s, cmd.seat);
      const q = s.topicCards[s.round - 1].questions.find(
        (q) => q.id === cmd.topicId,
      );
      requireND(q, "TOPIC", "只能从本轮的两个候选题中选择");
      s.topic = structuredClone(q);
      drawNumbers(s);
      s.phase = "ANSWER";
      emit(s, { type: "TOPIC_SELECTED", topicId: q.id });
      break;
    }
    case "SUBMIT_ANSWER": {
      requirePhase(s, "ANSWER");
      requireND(
        cmd.seat !== s.captain,
        "ROLE",
        "队长不能提交答题卡，请等大家写卡",
      );
      requireND(!s.ready.includes(cmd.seat), "LOCKED", "已提交，请先撤回修改");
      requireND(typeof cmd.text === "string", "ANSWER", "回答必须是文字");
      const text = cmd.text.trim();
      requireND(
        Array.from(text).length >= 1 && Array.from(text).length <= 30,
        "ANSWER",
        "回答不能为空，长度须为 1–30 字",
      );
      s.answers[cmd.seat] = text;
      s.ready.push(cmd.seat);
      emit(s, { type: "ANSWER_READY", seat: cmd.seat });
      advanceAnswers(s);
      break;
    }
    case "WITHDRAW_ANSWER": {
      requirePhase(s, "ANSWER");
      requireND(cmd.seat !== s.captain, "ROLE", "队长不能撤回答题卡");
      requireND(s.ready.includes(cmd.seat), "ANSWER", "尚未提交答题卡");
      s.ready = s.ready.filter((i) => i !== cmd.seat);
      s.answers[cmd.seat] = null;
      emit(s, { type: "ANSWER_WITHDRAWN", seat: cmd.seat });
      break;
    }
    case "UPDATE_ORDER":
    case "LOCK_ORDER": {
      requirePhase(s, "ORDER");
      requireCaptain(s, cmd.seat);
      const allowed = members(s);
      requireND(
        Array.isArray(cmd.order) &&
          cmd.order.length === allowed.length &&
          new Set(cmd.order).size === allowed.length &&
          cmd.order.every((i) => validSeat(s, i) && allowed.includes(i)),
        "ORDER",
        "排序必须包含本轮每个回答者且不能重复",
      );
      s.order = [...cmd.order];
      if (cmd.type === "LOCK_ORDER") {
        s.phase = "REVEAL";
        emit(s, { type: "ORDER_LOCKED", order: [...s.order] });
      }
      break;
    }
    case "REVEAL_NEXT":
      requirePhase(s, "REVEAL");
      requireCaptain(s, cmd.seat);
      reveal(s, s.order[s.revealed.length]);
      break;
    case "GUESS_EXACT": {
      requirePhase(s, "EXPERT");
      requireCaptain(s, cmd.seat);
      requireNumber(cmd.guess);
      requireND(
        validSeat(s, cmd.target) && cmd.target !== s.captain,
        "TARGET",
        "请选择一名队友，队长的牌最后由队友共同猜",
      );
      requireND(
        !s.revealed.some((r) => r.seat === cmd.target),
        "LOCKED",
        "这名玩家的数字已经揭示",
      );
      reveal(s, cmd.target, cmd.guess);
      break;
    }
    case "GUESS_CAPTAIN": {
      requirePhase(s, "CAPTAIN_GUESS");
      requireND(
        cmd.seat !== s.captain,
        "ROLE",
        "请由一名队友代表大家提交共同猜测",
      );
      requireNumber(cmd.guess);
      const number = s.numbers[s.captain]!,
        correct = cmd.guess === number,
        recovered = correct && s.poops > 0 ? 1 : 0;
      s.poops -= recovered;
      s.unicorns += recovered;
      const entry: NDReveal = {
        seat: s.captain,
        number,
        guess: cmd.guess,
        correct,
        penalty: 0,
      };
      s.revealed.push(entry);
      emit(s, {
        type: "REVEALED",
        ...entry,
        unicorns: s.unicorns,
        poops: s.poops,
      });
      emit(s, {
        type: "TEAM_RECOVERY",
        correct,
        recovered,
        unicorns: s.unicorns,
        poops: s.poops,
      });
      roundOver(s);
      break;
    }
    case "NEXT_ROUND": {
      requirePhase(s, "ROUND_END");
      requireCaptain(s, cmd.seat);
      s.round++;
      s.captain = (s.captain + 1) % s.players.length;
      s.topic = null;
      s.numbers = s.players.map(() => null);
      s.unusedNumbers = ten();
      s.ready = [];
      s.answers = s.players.map(() => null);
      s.order = [];
      s.revealed = [];
      s.phase = "CHOOSE_TOPIC";
      emit(s, { type: "ROUND_STARTED", unicorns: s.unicorns, poops: s.poops });
      break;
    }
    default:
      throw new NDGameError("COMMAND", "无法识别的游戏操作");
  }
  s.seq[cmd.seat] = cmd.seq;
  s.receipts[cmd.seat][String(cmd.seq)] = fingerprint;
  assertInvariantsND(s);
  return s;
}
export interface NDView {
  phase: NDPhase;
  players: { name: string; ready: boolean }[];
  captain: number;
  round: number;
  totalRounds: 5;
  options: { expert: boolean; scale: "open" | "normal" };
  unicorns: number;
  poops: number;
  tokenTotal: number;
  topic: NDQuestion | null;
  choices: NDQuestion[];
  answers: (string | null)[];
  myNumber: number | null;
  mySeq: number | null;
  order: number[];
  revealed: NDReveal[];
  history: NDEvent[];
  result: NDResult | null;
}
/** Whitelist projection: never return RNG, future pairs, receipts or unshown numbers. */
export function viewForND(s: NDState, seat: number | null): NDView {
  requireND(seat === null || validSeat(s, seat), "SEAT", "玩家座位不正确");
  return structuredClone({
    phase: s.phase,
    players: s.players.map((p, i) => ({
      name: p.name,
      ready: s.ready.includes(i),
    })),
    captain: s.captain,
    round: s.round,
    totalRounds: s.totalRounds,
    options: s.options,
    unicorns: s.unicorns,
    poops: s.poops,
    tokenTotal: s.tokenTotal,
    topic: s.topic,
    choices:
      s.phase === "CHOOSE_TOPIC" && seat === s.captain
        ? s.topicCards[s.round - 1].questions
        : [],
    answers: s.answers.map((text, i) =>
      (s.phase !== "ANSWER" && s.phase !== "CHOOSE_TOPIC") || i === seat
        ? text
        : null,
    ),
    myNumber: seat === null ? null : s.numbers[seat],
    mySeq: seat === null ? null : s.seq[seat],
    order: s.order,
    revealed: s.revealed,
    history: s.history,
    result: s.result,
  });
}
export function assertInvariantsND(s: NDState): void {
  const invariant = (value: unknown, label: string) => {
    if (!value) throw new Error("ND invariant: " + label);
  };
  const unique = (v: unknown[]) => new Set(v).size === v.length;
  invariant(
    [
      "CHOOSE_TOPIC",
      "ANSWER",
      "ORDER",
      "REVEAL",
      "EXPERT",
      "CAPTAIN_GUESS",
      "ROUND_END",
      "FINISHED",
    ].includes(s.phase),
    "phase",
  );
  invariant(
    s.players.length >= 4 && s.players.length <= 9 && validSeat(s, s.captain),
    "players/captain",
  );
  invariant(
    Number.isInteger(s.round) &&
      s.round >= 1 &&
      s.round <= 5 &&
      s.totalRounds === 5,
    "round",
  );
  invariant(!s.options.expert || s.players.length !== 9, "expert nine");
  invariant(
    s.tokenTotal === Math.min(s.players.length, 8) &&
      Number.isInteger(s.unicorns) &&
      Number.isInteger(s.poops) &&
      s.unicorns >= 0 &&
      s.poops >= 0 &&
      s.unicorns + s.poops === s.tokenTotal,
    "token conservation",
  );
  invariant(s.numbers.length === s.players.length, "number seats");
  const dealt = s.numbers.filter((v): v is number => v !== null),
    all = [...dealt, ...s.unusedNumbers];
  invariant(
    all.length === 10 &&
      unique(all) &&
      all.every((v) => Number.isInteger(v) && v >= 1 && v <= 10),
    "number conservation",
  );
  if (s.phase === "CHOOSE_TOPIC")
    invariant(dealt.length === 0 && s.topic === null, "before deal");
  else
    invariant(
      s.topic !== null &&
        s.topicCards[s.round - 1].questions.some((q) => q.id === s.topic?.id) &&
        s.numbers.every((v, i) =>
          !s.options.expert && i === s.captain ? v === null : v !== null,
        ),
      "answer numbers/topic",
    );
  invariant(
    unique(s.ready) && s.ready.every((i) => i !== s.captain && validSeat(s, i)),
    "ready membership",
  );
  invariant(
    Array.isArray(s.answers) &&
      s.answers.length === s.players.length &&
      s.answers.every((text, i) =>
        text === null
          ? !s.ready.includes(i)
          : typeof text === "string" &&
            text === text.trim() &&
            Array.from(text).length >= 1 &&
            Array.from(text).length <= 30 &&
            s.ready.includes(i),
      ),
    "answer cards",
  );
  invariant(
    unique(s.revealed.map((r) => r.seat)) &&
      s.revealed.every(
        (r) => validSeat(s, r.seat) && r.number === s.numbers[r.seat],
      ),
    "revealed numbers",
  );
  if (s.phase !== "CHOOSE_TOPIC" && s.phase !== "ANSWER")
    invariant(
      s.ready.length === s.players.length - 1,
      "all responses complete",
    );
  invariant(
    s.order.length === 0 ||
      (!s.options.expert &&
        s.order.length === members(s).length &&
        unique(s.order) &&
        s.order.every((i) => members(s).includes(i))),
    "order membership",
  );
  if (s.phase === "REVEAL")
    invariant(
      s.order.length === members(s).length &&
        s.revealed.length < s.order.length,
      "reveal cursor",
    );
  if (s.options.expert && s.phase === "CAPTAIN_GUESS")
    invariant(
      s.revealed.length === s.players.length - 1 &&
        !s.revealed.some((r) => r.seat === s.captain),
      "captain secret",
    );
  invariant(
    s.topicCards.length === 5 &&
      s.topicCards.every((c) => c.questions.length === 2) &&
      unique(s.topicCards.flatMap((c) => c.questions.map((q) => q.id))),
    "question conservation",
  );
  invariant(
    s.seq.length === s.players.length &&
      s.receipts.length === s.players.length &&
      s.seq.every(
        (v, i) =>
          Number.isSafeInteger(v) &&
          v >= 0 &&
          Object.keys(s.receipts[i]).length === v,
      ),
    "sequence receipts",
  );
  invariant((s.phase === "FINISHED") === (s.result !== null), "result phase");
  if (s.result)
    invariant(
      s.result.success ? s.round === 5 && s.unicorns > 0 : s.unicorns === 0,
      "result boundary",
    );
  else invariant(s.unicorns > 0, "immediate defeat");
  invariant(
    s.history.every(
      (e, i) => e.id === i + 1 && e.round >= 1 && e.round <= s.round,
    ),
    "event order",
  );
}
