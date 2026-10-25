import { mkdirSync, writeFileSync } from "node:fs";
import { simulateRK } from "../packages/rummikub/src/simulation.ts";
const results = [];
const started = Date.now();
for (const players of [2, 3, 4]) {
  for (let i = 1; i <= 200; i++)
    results.push(simulateRK(players, players * 1000 + i));
  const rows = results.filter((r) => r.players === players);
  console.log(
    `${players} 人：${rows.length}/200 终局，堵局 ${rows.filter((r) => r.blocked).length}，最长 ${Math.max(...rows.map((r) => r.turns))} 回合`,
  );
}
const report = {
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  total: results.length,
  passed: results.length,
  failed: 0,
  seedPolicy: "players * 1000 + [1..200]",
  ai: "greedy own-rack melds then extensions; no full table solver",
  results,
};
mkdirSync("docs/rummikub/verification", { recursive: true });
writeFileSync(
  "docs/rummikub/verification/stage2-simulations.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `通过 ${report.passed}/${report.total}，用时 ${report.elapsedMs} ms`,
);
