import { describe, it, expect } from "vitest";
import { createGame, reduce } from "../src/index.ts";
import { getControls, previewRoutes, publicProps } from "../src/controls.ts";
import { simulateGame } from "../../../scripts/simulation.ts";
describe("Hotseat engine queries", () => {
  it("开局只给先手逃生者一个掷出生骰按钮；不泄露道具、不推进随机数", () => {
    const s = createGame({
      seed: 1701,
      mapId: "macmillan_estate",
      survivors: ["dwight", "claudette", "jake", "ace"],
      killer: "trapper",
    });
    const before = JSON.stringify(s);
    const v = getControls(s);
    expect(v.actorId).toBe("dwight");
    expect(v.actions).toHaveLength(1);
    expect(v.actions[0].command).toEqual({ type: "SELECT", actorId: "dwight" });
    expect(publicProps(s).every((p) => p.kind === null)).toBe(true);
    for (const a of v.actions) expect(() => reduce(s, a.command)).not.toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("every offered basic action on full legal games is accepted; preview respects one-way and walls", () => {
    const result = simulateGame(
      {
        seed: 1701,
        mapId: "macmillan_estate",
        survivors: ["dwight", "claudette", "jake", "ace"],
        killer: "trapper",
      },
      "survivor",
    );
    let s = createGame(result.options);
    for (const c of result.commands) {
      const v = getControls(s);
      for (const a of v.actions)
        expect(() => reduce(s, a.command)).not.toThrow();
      if (s.turn?.stage === "MOVE" && !s.choice && !s.window) {
        for (const r of previewRoutes(s, s.turn.actorId, s.turn.card!))
          expect(() =>
            reduce(s, { type: "MOVE", actorId: s.turn!.actorId, ...r }),
          ).not.toThrow();
      }
      s = reduce(s, c);
    }
  });
});
