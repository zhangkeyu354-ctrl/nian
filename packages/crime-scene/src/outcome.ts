import type { CrimeSceneRole } from "./roles.ts";
import { judgeSolve, type EvidencePair } from "./solve.ts";

export interface OutcomeState {
  phase: string;
  roles: CrimeSceneRole[];
  badges: boolean[];
  bonusAttempts?: number[];
  answer: EvidencePair;
  players: { seat: number; clues: string[]; means: string[]; excludedClues: string[] }[];
  winner: "good" | "evil" | null;
  hunt: { solver: number } | null;
}

export function accuse(state: OutcomeState, seat: number, guess: EvidencePair): OutcomeState {
  if (!/^round[123]_(search|brief)$/.test(state.phase) || (!state.badges[seat] && !(state.bonusAttempts?.[seat] ?? 0))) throw new Error("现在不能破案");
  if (guess.owner === seat || !Number.isInteger(guess.owner)) throw new Error("只能指认其他玩家");
  const owner = state.players[guess.owner];
  if (!owner || owner.seat !== guess.owner || !owner.clues.includes(guess.clue) || !owner.means.includes(guess.means) || owner.excludedClues.includes(guess.clue)) throw new Error("证据组合无效");
  const verdict = judgeSolve(state.roles[seat], guess, state.answer);
  if (verdict.kind === "correct") {
    const hasWitness = state.roles.includes("witness");
    return { ...state, phase: hasWitness ? "witness_hunt" : "result", winner: hasWitness ? null : "good", hunt: hasWitness ? { solver: seat } : null };
  }
  const badges = [...state.badges];
  const bonusAttempts = state.bonusAttempts ? [...state.bonusAttempts] : undefined;
  if ((bonusAttempts?.[seat] ?? 0) > 0) bonusAttempts![seat]--;
  else badges[seat] = false;
  const goodCanSolve = state.roles.some((role, index) => (role === "investigator" || role === "witness") && (badges[index] || (bonusAttempts?.[index] ?? 0) > 0));
  return { ...state, badges, bonusAttempts, phase: goodCanSolve ? state.phase : "result", winner: goodCanSolve ? null : "evil" };
}

export function finishHunt(state: OutcomeState, target: number | null): OutcomeState {
  if (state.phase !== "witness_hunt") throw new Error("当前不能反杀");
  if (target !== null && state.roles[target] !== "investigator" && state.roles[target] !== "witness") throw new Error("反杀目标必须是调查员或目击者");
  return { ...state, phase: "result", winner: target !== null && state.roles[target] === "witness" ? "evil" : "good" };
}
