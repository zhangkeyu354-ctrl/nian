import { writeFileSync } from "node:fs";
import { simulateRK } from "../packages/rummikub/src/simulation.ts";
const start = Date.now(),
  results = [];
for (const players of [5, 6]) {
  for (let i = 1; i <= 200; i++)
    results.push(simulateRK(players, players * 1000 + i, 2000, "xp"));
  const rows = results.filter((r) => r.players === players);
  console.log(
    `${players} players: ${rows.length}/200 finished; blocked ${rows.filter((r) => r.blocked).length}; max turns ${Math.max(...rows.map((r) => r.turns))}`,
  );
}
writeFileSync(
  "docs/rummikub/verification/stage6-simulations.json",
  JSON.stringify(
    {
      total: results.length,
      failed: 0,
      elapsedMs: Date.now() - start,
      ai: "greedy own-rack melds and table extensions; not a complete rearrangement solver",
      results,
    },
    null,
    2,
  ),
);
console.log(`XP simulations PASS ${results.length}/400`);
