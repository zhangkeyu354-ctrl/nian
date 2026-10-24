import { TOPICS, type Topic } from "./topics.ts";
import {
  XB_RULES,
  scoreRound,
  scoreStandings,
  type Cycles,
  type ScoreStep,
} from "./rules.ts";
export { XB_RULES } from "./rules.ts";
export interface Player {
  id: string;
  name: string;
}
export type Command =
  | { type: "CHALLENGE" | "GUESS"; target: string; round: number }
  | { type: "NEXT" | "EXPLAIN_NEXT" | "SWAP_TOPIC"; round: number }
  | { type: "SPEAK"; target: string | null; round: number };
export interface Result {
  round: number;
  guesser: string;
  truth: string;
  selected: string;
  challenged: string | null;
  question: string;
  answer: string;
  source: string;
  difficulty: number;
  delta: Record<string, number>;
  scoring: ScoreStep[];
}
export interface State {
  players: Player[];
  host: string;
  phase: "discussion" | "reveal" | "over";
  round: number;
  guesser: string;
  truth: string;
  topic: Topic;
  deck: Topic[];
  seed: number;
  muted: string | null;
  speaker: string | null;
  explanationIndex?: number;
  scores: Record<string, number>;
  history: Result[];
  cycles?: Cycles;
}
export function createGame(
  players: Player[],
  seed: number,
  topics: Topic[] = TOPICS,
  cycles: Cycles = XB_RULES.defaultCycles,
): State {
  if (!(XB_RULES.cycleOptions as readonly number[]).includes(cycles))
    throw Error("圈数无效");
  if (
    players.length < XB_RULES.minPlayers ||
    players.length > XB_RULES.maxPlayers ||
    new Set(players.map((p) => p.id)).size !== players.length
  )
    throw Error(`需要${XB_RULES.minPlayers}～${XB_RULES.maxPlayers}名不同玩家`);
  if (topics.length < players.length * cycles)
    throw Error("可用题目不足，请增加主题或选择全部随机");
  const s: State = {
    players: structuredClone(players),
    host: players[0].id,
    phase: "discussion",
    round: 0,
    guesser: "",
    truth: "",
    topic: topics[0],
    deck: structuredClone(topics),
    seed: seed >>> 0,
    muted: null,
    speaker: null,
    scores: Object.fromEntries(
      players.map((p) => [p.id, XB_RULES.initialScore]),
    ),
    history: [],
    cycles,
  };
  for (let i = s.deck.length - 1; i > 0; i--) {
    const j = random(s, i + 1);
    [s.deck[i], s.deck[j]] = [s.deck[j], s.deck[i]];
  }
  next(s);
  return s;
}
function random(s: State, n: number) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return Math.floor((s.seed / 4294967296) * n);
}
function next(s: State) {
  s.round++;
  s.guesser = s.players[(s.round - 1) % s.players.length].id;
  const others = s.players.filter((p) => p.id !== s.guesser);
  s.truth = others[random(s, others.length)].id;
  s.topic = s.deck[s.round - 1];
  s.muted = null;
  s.explanationIndex = 0;
  s.speaker = s.players.find((p) => p.id !== s.guesser)!.id;
  s.phase = "discussion";
}
export function act(state: State, actor: string, c: Command): State {
  if (
    !c ||
    !state.players.some((p) => p.id === actor) ||
    c.round !== state.round
  )
    throw Error("玩家或回合无效，请刷新状态");
  const s = structuredClone(state);
  if (c.type === "NEXT") {
    if (actor !== s.host || s.phase !== "reveal")
      throw Error("仅房主可在结算后继续");
    if (s.round === s.players.length * (s.cycles ?? XB_RULES.defaultCycles))
      s.phase = "over";
    else next(s);
    return s;
  }
  if (s.phase !== "discussion") throw Error("当前不在讨论阶段");
  if (c.type === "SWAP_TOPIC") {
    if (actor !== s.host) throw Error("仅房主可以确认换词");
    if (s.muted) throw Error("本轮已使用你在放屁！，不能再换词");
    if (
      s.deck.length <=
      s.players.length * (s.cycles ?? XB_RULES.defaultCycles)
    )
      throw Error("剩余词条不足以完成本局，请继续当前词条");
    s.deck.splice(s.round - 1, 1);
    s.topic = s.deck[s.round - 1];
    s.explanationIndex = 0;
    s.speaker = s.players.find((p) => p.id !== s.guesser)!.id;
    return s;
  }
  if (c.type === "EXPLAIN_NEXT") {
    const order = s.players.filter((p) => p.id !== s.guesser);
    const index = s.explanationIndex ?? 0;
    if (actor !== s.guesser && actor !== order[index]?.id)
      throw Error("请等待当前玩家解释，或由想想推进");
    if (index >= order.length) throw Error("所有人都已解释，可自由追问");
    s.explanationIndex = index + 1;
    if (order[s.explanationIndex]?.id === s.muted) s.explanationIndex++;
    s.speaker = order[s.explanationIndex]?.id ?? null;
    return s;
  }
  if (c.type === "SPEAK") {
    if (c.target !== null && !s.players.some((p) => p.id === c.target))
      throw Error("目标无效");
    if (
      actor !== s.guesser &&
      c.target !== actor &&
      !(c.target === null && s.speaker === actor)
    )
      throw Error("只能标记自己发言");
    if (c.target === s.muted && c.target !== null)
      throw Error("本轮已被禁止发言");
    s.speaker = c.target;
    return s;
  }
  if (c.type !== "CHALLENGE" && c.type !== "GUESS") throw Error("行动无效");
  if (actor !== s.guesser) throw Error(`仅${XB_RULES.roles.guesser}可以操作`);
  if (c.target === s.guesser || !s.players.some((p) => p.id === c.target))
    throw Error("请选择其他玩家");
  if (c.type === "CHALLENGE") {
    if ((s.muted ? 1 : 0) >= XB_RULES.challengesPerRound)
      throw Error("本轮质疑已使用");
    s.muted = c.target;
    const order = s.players.filter((p) => p.id !== s.guesser);
    if (order[s.explanationIndex ?? 0]?.id === c.target) {
      s.explanationIndex = (s.explanationIndex ?? 0) + 1;
      s.speaker = order[s.explanationIndex]?.id ?? null;
    }
    if (s.speaker === c.target) s.speaker = null;
    return s;
  }
  const delta = Object.fromEntries(s.players.map((p) => [p.id, 0]));
  const scoring = scoreRound(
    s.players.map((p) => p.id),
    s.guesser,
    s.truth,
    c.target,
    s.muted,
    s.topic.difficulty,
  );
  for (const step of scoring)
    for (const id of Object.keys(delta)) delta[id] += step.delta[id];
  for (const id of Object.keys(delta)) s.scores[id] += delta[id];
  s.history.push({
    round: s.round,
    guesser: s.guesser,
    truth: s.truth,
    selected: c.target,
    challenged: s.muted,
    question: s.topic.question,
    answer: s.topic.answer,
    source: s.topic.source,
    difficulty: s.topic.difficulty,
    delta,
    scoring,
  });
  s.phase = "reveal";
  s.speaker = null;
  return s;
}
export function viewFor(s: State, me: string | null) {
  const reveal = s.phase !== "discussion";
  return {
    phase: s.phase,
    round: s.round,
    totalRounds: s.players.length * (s.cycles ?? XB_RULES.defaultCycles),
    cycles: s.cycles ?? XB_RULES.defaultCycles,
    standings: scoreStandings(
      s.players.map((p) => ({ id: p.id, score: s.scores[p.id] })),
    ),
    winners:
      s.phase === "over"
        ? s.players
            .filter(
              (p) => s.scores[p.id] === Math.max(...Object.values(s.scores)),
            )
            .map((p) => p.id)
        : [],
    guesser: s.guesser,
    question: s.topic.question,
    difficulty: s.topic.difficulty,
    theme: s.topic.theme,
    ...(reveal || me === s.truth
      ? { answer: s.topic.answer, source: s.topic.source }
      : {}),
    players: s.players.map((p) => ({
      ...p,
      score: s.scores[p.id],
      role:
        p.id === s.guesser
          ? "guesser"
          : reveal || p.id === me
            ? p.id === s.truth
              ? "truth"
              : "bluffer"
            : null,
    })),
    muted: s.muted,
    speaker: s.speaker,
    explanationOrder: s.players
      .filter((p) => p.id !== s.guesser)
      .map((p) => p.id),
    explainer: reveal
      ? null
      : (s.players.filter((p) => p.id !== s.guesser)[s.explanationIndex ?? 0]
          ?.id ?? null),
    history: structuredClone(s.history),
  };
}
export type View = ReturnType<typeof viewFor>;
