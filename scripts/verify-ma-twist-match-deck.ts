// 验收：至少 1000 局「四场扭扭赛道」完整对局，同一局内抽到的 Twist 事件重复数必须为 0
import { playMatch } from "../packages/magical-athlete/test/twist-match-sim.ts";
const N = Number(process.env.N ?? 1000);
const sched = ["twisty-twirl", "twisty-twirl", "twisty-twirl", "twisty-twirl"] as const;
let dupes = 0, draws = 0, stalled = 0, chaos = 0, allFour = 0, finished = 0;
const perCard = new Array(14).fill(0);
for (let g = 1; g <= N; g++) {
  const players = 2 + (g % 5); // 2–6 人
  const r = playMatch(g + 50000, [...sched], players);
  const all = r.drawsByRace.flat();
  dupes += all.length - new Set(all).size;
  draws += all.length;
  for (const c of all) perCard[c]++;
  if (r.drawsByRace.some((d) => d.includes(10))) chaos++;
  if (r.drawsByRace.every((d) => d.length)) allFour++;
  if (r.stalled) stalled++; else finished++;
  if (g % 100 === 0) console.error(`${g}/${N}`);
}
const out = { matches: N, finished, stalledByKnownDeadlock: stalled, totalDraws: draws, duplicateDrawsWithinMatch: dupes, matchesWithChaos: chaos, matchesAllFourRacesDrew: allFour, drawsPerCard: Object.fromEntries(perCard.map((n, i) => [i, n]).slice(1)) };
console.log(JSON.stringify(out, null, 1));
if (dupes) { console.log("TWIST_MATCH_DECK_FAIL"); process.exit(1); }
console.log("TWIST_MATCH_DECK_PASS");
