import type { CrimeSceneRole } from "./roles.ts";

export interface HuntState {
  phase: "witness_hunt" | "result";
  roles: CrimeSceneRole[];
  deadline: number;
  suggestions: Record<number, number>;
  winner: "good" | "evil" | null;
}

export function beginHunt(roles: CrimeSceneRole[], now: number): HuntState {
  if (!roles.includes("killer") || !roles.includes("accomplice") || !roles.includes("witness")) throw new Error("本局不能进行目击者反杀");
  return { phase: "witness_hunt", roles, deadline: now + 60_000, suggestions: {}, winner: null };
}

export function suggestTarget(state: HuntState, seat: number, target: number, now: number): HuntState {
  if (state.phase !== "witness_hunt" || now >= state.deadline || !["killer", "accomplice"].includes(state.roles[seat]) || !["investigator", "witness"].includes(state.roles[target])) throw new Error("反杀建议无效");
  return { ...state, suggestions: { ...state.suggestions, [seat]: target } };
}

function resolve(state: HuntState, target: number | undefined): HuntState {
  return { ...state, phase: "result", winner: target !== undefined && state.roles[target] === "witness" ? "evil" : "good" };
}

export function submitHunt(state: HuntState, seat: number, now: number): HuntState {
  if (state.phase !== "witness_hunt" || now >= state.deadline || state.roles[seat] !== "killer" || state.suggestions[seat] === undefined) throw new Error("只有凶手可提交已选择的目标");
  return resolve(state, state.suggestions[seat]);
}

export function expireHunt(state: HuntState, now: number): HuntState {
  if (state.phase !== "witness_hunt" || now < state.deadline) return state;
  const killer = state.roles.indexOf("killer");
  const accomplice = state.roles.indexOf("accomplice");
  return resolve(state, state.suggestions[killer] ?? state.suggestions[accomplice]);
}
