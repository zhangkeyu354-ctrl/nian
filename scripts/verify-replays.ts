import { readFileSync, writeFileSync } from "node:fs";
import { deepStrictEqual, strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { createGame, reduce } from "../packages/game-engine/src/index.ts";
import type { Command, CreateOptions } from "../packages/shared/src/types.ts";
const summary = JSON.parse(
  readFileSync("docs/phase1/SIMULATION_SUMMARY.json", "utf8"),
) as {
  games: Array<{
    seed: number;
    winner: string;
    rounds: number;
    events: number;
    commands: number;
  }>;
};
const verified = [];
for (const g of summary.games) {
  if (!Number.isInteger(g.seed)) throw new Error("invalid replay seed");
  const stem = `docs/phase1/games/${g.seed}`;
  const replay = JSON.parse(readFileSync(stem + ".replay.json", "utf8")) as {
    options: CreateOptions;
    commands: Command[];
  };
  const expected = readFileSync(stem + ".events.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const state = replay.commands.reduce(reduce, createGame(replay.options));
  deepStrictEqual(state.events, expected);
  strictEqual(state.winner, g.winner);
  strictEqual(state.round, g.rounds);
  strictEqual(state.events.length, g.events);
  strictEqual(replay.commands.length, g.commands);
  const sha256 = createHash("sha256")
    .update(JSON.stringify(state))
    .digest("hex");
  verified.push({
    seed: g.seed,
    winner: state.winner,
    sha256,
    eventsSha256: createHash("sha256")
      .update(readFileSync(stem + ".events.jsonl"))
      .digest("hex"),
    commandsSha256: createHash("sha256")
      .update(readFileSync(stem + ".replay.json"))
      .digest("hex"),
  });
  console.log(
    `Replay ${g.seed}: ${state.winner}, every event reproduced, SHA-256 ${sha256}`,
  );
}
if (verified.length < 3 || new Set(verified.map((v) => v.winner)).size !== 2)
  throw new Error("requires >=3 games, both winners");
writeFileSync(
  "docs/phase1/REPLAY_VERIFICATION.json",
  JSON.stringify({ verified }, null, 2),
);
