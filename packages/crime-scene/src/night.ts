import type { EvidencePair } from "./solve.ts";

export interface NightState {
  phase: "night_killer" | "round1_search";
  killerSeat: number;
  players: { seat: number; clues: string[]; means: string[] }[];
  startedAt: number;
  choiceDeadline: number;
  revealAt: number;
  answer?: EvidencePair;
}

const validRandom = (random: () => number): number => {
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError("随机源须返回 [0, 1) 内的数字");
  return n;
};

export function beginNight(
  players: NightState["players"], killerSeat: number, now: number,
  random: () => number = Math.random,
): NightState {
  const killer = players.find((p) => p.seat === killerSeat);
  if (!killer?.clues.length || !killer.means.length) throw new Error("凶手必须有线索牌和手段牌");
  if (!Number.isFinite(now)) throw new RangeError("时间无效");
  const choiceDeadline = now + 60_000;
  const revealAt = choiceDeadline + Math.floor(validRandom(random) * 5001);
  return { phase: "night_killer", killerSeat, players, startedAt: now, choiceDeadline, revealAt };
}

export function chooseEvidence(
  state: NightState, seat: number, clue: string, means: string, now: number,
): NightState {
  if (state.phase !== "night_killer" || state.answer || seat !== state.killerSeat || now >= state.choiceDeadline) {
    throw new Error("现在不能选择关键证物");
  }
  const killer = state.players.find((p) => p.seat === seat)!;
  if (!killer.clues.includes(clue) || !killer.means.includes(means)) throw new Error("只能选择自己面前的牌");
  return { ...state, answer: { owner: seat, clue, means } };
}

/** Timer is server driven; clients never choose or announce the fallback pair. */
export function advanceNight(state: NightState, now: number, random: () => number = Math.random): NightState {
  if (state.phase !== "night_killer" || now < state.revealAt) return state;
  const killer = state.players.find((p) => p.seat === state.killerSeat)!;
  const answer = state.answer ?? {
    owner: state.killerSeat,
    clue: killer.clues[Math.floor(validRandom(random) * killer.clues.length)],
    means: killer.means[Math.floor(validRandom(random) * killer.means.length)],
  };
  return { ...state, phase: "round1_search", answer };
}
