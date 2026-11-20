import type { CrimeSceneRole } from "./roles.ts";

export interface EvidencePair { owner: number; clue: string; means: string }

/** Pure verdict. The room layer validates ownership, flipped cards and badge before calling. */
export function judgeSolve(role: CrimeSceneRole, guess: EvidencePair, answer: EvidencePair) {
  if (role === "forensic") throw new Error("鉴证专家不能破案");
  const matches = guess.owner === answer.owner && guess.clue === answer.clue && guess.means === answer.means;
  if (matches && (role === "killer" || role === "accomplice")) {
    return { kind: "private_reject" as const, message: "不能指认真实证据，请重新选择" };
  }
  if (matches) return { kind: "correct" as const };
  return { kind: "wrong" as const, consumeBadge: true, broadcast: "错！" };
}
