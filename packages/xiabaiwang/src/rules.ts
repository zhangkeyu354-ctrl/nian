/** 用户2026-10-24裁定；第三方规则介绍来源及原版/房规边界见CHECK_REQUIRED.md。无题库或秘密信息。 */
export const XB_RULES = {
  minPlayers: 3,
  maxPlayers: 10,
  originalMaxPlayers: 9,
  initialScore: 3,
  difficultyPoints: { 1: 1, 2: 2, 3: 3 },
  difficultyNames: { 1: "易", 2: "中", 3: "难" },
  challengesPerRound: 1,
  challengeBlufferReward: 1,
  challengeBlufferPenalty: 1,
  challengeTruthPenalty: 3,
  scoreFloor: null,
  defaultCycles: 1,
  cycleOptions: [1, 2],
  roles: { guesser: "想想", truth: "老实人", bluffer: "瞎掰人" },
} as const;
export type Cycles = (typeof XB_RULES.cycleOptions)[number];
export type ScoreStep = {
  kind: "guess" | "challenge";
  delta: Record<string, number>;
};
export function topicPoints(difficulty: number) {
  const points = XB_RULES.difficultyPoints[difficulty as 1 | 2 | 3];
  if (points === undefined) throw Error("题目难度无效");
  return points;
}
/** 输入仅为揭晓后的公开结果；旧存档无scoring时也可重建明细。 */
export function scoreRound(
  ids: string[],
  guesser: string,
  truth: string,
  selected: string,
  challenged: string | null,
  difficulty: number,
): ScoreStep[] {
  const guess = Object.fromEntries(ids.map((id) => [id, 0]));
  const challenge = { ...guess };
  guess[selected] += topicPoints(difficulty);
  if (selected === truth) guess[guesser] += topicPoints(difficulty);
  if (challenged) {
    if (challenged === truth)
      challenge[guesser] -= XB_RULES.challengeTruthPenalty;
    else {
      challenge[guesser] += XB_RULES.challengeBlufferReward;
      challenge[challenged] -= XB_RULES.challengeBlufferPenalty;
    }
  }
  return [
    { kind: "guess", delta: guess },
    { kind: "challenge", delta: challenge },
  ];
}
export function scoreStandings(players: { id: string; score: number }[]) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const levels = [...new Set(sorted.map((p) => p.score))];
  return sorted.map((p) => ({
    id: p.id,
    score: p.score,
    rank: levels.indexOf(p.score) + 1,
  }));
}
export const HOUSE_RULES = [
  {
    id: "HR-XB-01",
    text: `支持${XB_RULES.maxPlayers}人；台湾原版上限${XB_RULES.originalMaxPlayers}人。`,
  },
  {
    id: "HR-XB-02",
    text: `想想每轮最多质疑${XB_RULES.challengesPerRound}次。`,
  },
  { id: "HR-XB-03", text: "允许负分，没有下限。" },
] as const;
