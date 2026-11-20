import type { CrimeSceneRole } from "./roles.ts";

export interface SecretState {
  phase: string;
  forensicSeat: number;
  roles: CrimeSceneRole[];
  answer?: { owner: number; clue: string; means: string };
  players: { seat: number; clues: string[]; means: string[] }[];
}

/** Never spread the server state into a client response: additions must be opted in. */
export function viewFor(state: SecretState, seat: number) {
  const myRole = state.roles[seat];
  if (!myRole) throw new RangeError("座位无效");
  const canSeeAnswer = myRole === "forensic" || myRole === "killer" || myRole === "accomplice";
  return {
    phase: myRole === "witness" && state.phase === "night_killer" && state.answer ? "night_witness" : state.phase,
    forensicSeat: state.forensicSeat,
    myRole,
    players: state.players.map(({ seat, clues, means }) => ({ seat, clues: [...clues], means: [...means] })),
    ...((canSeeAnswer || state.phase === "result") && state.answer ? { answer: { ...state.answer } } : {}),
    ...(state.phase === "result" ? { roles: [...state.roles] } : {}),
    ...((myRole === "killer" || myRole === "accomplice") && state.roles.includes(myRole === "killer" ? "accomplice" : "killer")
      ? { evilPartnerSeat: state.roles.indexOf(myRole === "killer" ? "accomplice" : "killer") }
      : {}),
    ...(myRole === "witness" && state.answer && state.phase !== "result"
      ? { witnessCandidates: state.roles.flatMap((role, index) => role === "killer" || role === "accomplice" ? [index] : []) }
      : {}),
  };
}
