import { mkdirSync, writeFileSync } from "node:fs";
import { simulateGame } from "./simulation.ts";
const out = "docs/phase1/games";
mkdirSync(out, { recursive: true });
const cases = [
  {
    seed: 1701,
    mapId: "macmillan_estate",
    survivors: ["dwight", "claudette", "jake", "ace"],
    killer: "trapper",
    goal: "survivor" as const,
  },
  {
    seed: 2903,
    mapId: "autohaven_wreckers",
    survivors: ["meg", "nea", "feng_min", "ace"],
    killer: "nurse",
    goal: "survivor" as const,
  },
  {
    seed: 4111,
    mapId: "autohaven_wreckers",
    survivors: ["dwight", "meg", "jake", "claudette"],
    killer: "doctor",
    goal: "killer" as const,
  },
];
const summary = [];
for (const { goal, ...o } of cases) {
  const result = simulateGame(o, goal);
  const file = `${out}/${o.seed}`;
  writeFileSync(
    file + ".events.jsonl",
    result.state.events.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );
  writeFileSync(
    file + ".replay.json",
    JSON.stringify({ options: o, commands: result.commands }, null, 2),
  );
  const row = {
    seed: o.seed,
    mapId: o.mapId,
    winner: result.state.winner,
    rounds: result.state.round,
    commands: result.commands.length,
    events: result.state.events.length,
    usedBoardAbilities: [
      ...new Set(
        result.state.events
          .filter((e) => e.type === "PERK_USED")
          .map((e) => e.data.perkId),
      ),
    ],
  };
  summary.push(row);
  console.log(JSON.stringify(row));
}
if (
  !summary.some((r) => r.winner === "survivor") ||
  !summary.some((r) => r.winner === "killer")
)
  throw new Error("acceptance requires both winners");
writeFileSync(
  "docs/phase1/SIMULATION_SUMMARY.json",
  JSON.stringify(
    {
      games: summary,
      method:
        "Only createGame + public reduce commands, no state edits or injected victories; all RNG derives from fixed seed. Scripted cooperative policies, not AI balance validation.",
    },
    null,
    2,
  ),
);
