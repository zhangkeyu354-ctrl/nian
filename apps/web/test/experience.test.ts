import { describe, it, expect } from "vitest";
import { createGame, reduce } from "../../../packages/game-engine/src/index.ts";
import { readFileSync } from "node:fs";
import {
  publicMotion,
  threatFor,
  skillReason,
  majorNotices,
} from "../src/experience-model.ts";
const replay = JSON.parse(
  readFileSync("docs/phase1/games/4111.replay.json", "utf8"),
);
describe("presentation consumes projected events without changing the game", () => {
  it("moves follow actual server path and suppress hidden locker actors", () => {
    let before = createGame(replay.options);
    for (const c of replay.commands) {
      const after = reduce(before, c);
      const e = after.events
        .slice(before.events.length)
        .find((e) => e.type === "MOVED");
      if (e) {
        expect(publicMotion(before, after)[0]).toMatchObject({
          actorId: e.data.actorId,
          pathId: e.data.pathId,
          from: e.data.from,
          to: e.data.to,
        });
        const hidden = structuredClone(after);
        hidden.actors[String(e.data.actorId)].lockerId = "secret";
        expect(publicMotion(before, hidden)).toHaveLength(0);
        return;
      }
      before = after;
    }
    throw new Error("real replay must move");
  });
  it("only owning survivor seat gets a threat warning; unknown killer location is ignored", () => {
    const s = createGame(replay.options),
      a = s.actors[s.survivors[0]],
      k = s.actors[s.killerId];
    a.room = Object.values(s.paths)[0].rooms[0];
    k.room = a.room;
    expect(threatFor(s, a.ownerId).level).toBe("same");
    expect(threatFor(s, k.ownerId).level).toBe("none");
    k.room = "hidden";
    expect(threatFor(s, a.ownerId).level).toBe("none");
  });
  it("disabled skill explanation does not decide legality", () => {
    expect(skillReason({ available: false, cost: 3, id: "p" }, 2, [])).toBe(
      "血点不足",
    );
    expect(skillReason({ available: false, cost: 1, id: "p" }, 2, ["p"])).toBe(
      "本轮已用过",
    );
    expect(skillReason({ available: false, cost: 1, id: "p" }, 2, [])).toBe(
      "时机未到",
    );
    expect(
      skillReason({ available: true, cost: 1, id: "p" }, 2, []),
    ).toBeNull();
  });
  it("hook, injury and completion each have distinct public notices; no history replay", () => {
    const s = createGame(replay.options);
    const ev = (type: string, seq: number, data: any) => ({
      type,
      seq,
      round: 1,
      data,
      sourceRef: [],
    });
    expect(
      majorNotices(s, [
        ev("HOOKED", 2, { actorId: s.survivors[0] }),
        ev("GENERATOR_COMPLETED", 3, {}),
      ]).map((n) => n.title),
    ).toEqual(["挂上钩子", "发电机完成"]);
    expect(majorNotices(s, [])).toEqual([]);
  });
});
