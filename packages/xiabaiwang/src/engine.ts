import { TOPICS, type Topic } from "./topics.ts";
export interface Player {
  id: string;
  name: string;
}
export type Command =
  | { type: "CHALLENGE" | "GUESS"; target: string; round: number }
  | { type: "NEXT"; round: number }
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
  scores: Record<string, number>;
  history: Result[];
}
export function createGame(players: Player[], seed: number): State {
  if (
    players.length < 3 ||
    players.length > 10 ||
    new Set(players.map((p) => p.id)).size !== players.length
  )
    throw Error("需要3～10名不同玩家");
  const s: State = {
    players: structuredClone(players),
    host: players[0].id,
    phase: "discussion",
    round: 0,
    guesser: "",
    truth: "",
    topic: TOPICS[0],
    deck: structuredClone(TOPICS),
    seed: seed >>> 0,
    muted: null,
    speaker: null,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    history: [],
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
  s.guesser = s.players[s.round - 1].id;
  const others = s.players.filter((p) => p.id !== s.guesser);
  s.truth = others[random(s, others.length)].id;
  s.topic = s.deck[s.round - 1];
  s.muted = null;
  s.speaker = null;
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
    if (s.round === s.players.length) s.phase = "over";
    else next(s);
    return s;
  }
  if (s.phase !== "discussion") throw Error("当前不在讨论阶段");
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
  if (actor !== s.guesser) throw Error("仅猜测者可以操作");
  if (c.target === s.guesser || !s.players.some((p) => p.id === c.target))
    throw Error("请选择其他玩家");
  if (c.type === "CHALLENGE") {
    if (s.muted) throw Error("本轮质疑已使用");
    s.muted = c.target;
    if (s.speaker === c.target) s.speaker = null;
    return s;
  }
  const delta = Object.fromEntries(s.players.map((p) => [p.id, 0]));
  delta[c.target] += s.topic.difficulty;
  if (c.target === s.truth) delta[s.guesser] += s.topic.difficulty;
  if (s.muted) {
    if (s.muted === s.truth) delta[s.guesser] -= 3;
    else {
      delta[s.guesser]++;
      delta[s.muted]--;
    }
  }
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
    totalRounds: s.players.length,
    guesser: s.guesser,
    question: s.topic.question,
    difficulty: s.topic.difficulty,
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
    history: structuredClone(s.history),
  };
}
export type View = ReturnType<typeof viewFor>;
