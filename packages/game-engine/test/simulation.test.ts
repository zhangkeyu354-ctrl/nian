import { it, expect } from "vitest";
import { simulateGame } from "../../../scripts/simulation.ts";
import { createGame, reduce } from "../src/index.ts";
it("finishes and replays three seeded games on real maps with both winners (Phase1 acceptance)", () => {
  for (const [seed, mapId, goal] of [
    [1701, "macmillan_estate", "survivor"],
    [2903, "autohaven_wreckers", "survivor"],
    [4111, "autohaven_wreckers", "killer"],
  ] as const) {
    const options = {
      seed,
      mapId,
      survivors: ["dwight", "claudette", "jake", "ace"],
      killer: "trapper",
    };
    const r = simulateGame(options, goal);
    expect(r.state.winner).toBe(goal);
    const replay = r.commands.reduce(reduce, createGame(options));
    expect(replay).toEqual(r.state);
    expect(replay.events.at(-1)?.type).toBe("GAME_OVER");
  }
}, 60000);
