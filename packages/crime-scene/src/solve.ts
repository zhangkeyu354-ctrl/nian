import type { CrimeSceneRole } from "./roles.ts";

export interface EvidencePair { owner: number; clue: string; means: string }

/** Pure verdict. The room layer validates ownership, flipped cards and badge before calling. */
export function judgeSolve(role: CrimeSceneRole, guess: EvidencePair, answer: EvidencePair) {
  if (role === "forensic") throw new Error("鉴证专家不能破案");
  const matches = guess.owner === answer.owner && guess.clue === answer.clue && guess.means === answer.means;
  // 原版：除专家外任何人（含凶手、帮凶）正确指认都算破案。凶手的真组合在他自己面前，本来就不能指认自己。
  if (matches) return { kind: "correct" as const };
  return { kind: "wrong" as const, consumeBadge: true, broadcast: "错！" };
}
