import { describe, expect, it } from "vitest";
import { createRK, viewForRK } from "../src/index.ts";
import { planRummikubTurn, rummikubBotView, runRummikubBotTurn } from "../src/bot.ts";

describe("经典拉密人机", () => {
  it("plays 50 complete games through validated draft and commit commands", () => {
    for (let seed = 1; seed <= 50; seed++) {
      let s = createRK(Array.from({length: seed % 3 + 2}, (_, i) => String(i)), { seed, minutes: 0, now: 0, assertions: true });
      for (let turn = 1; turn <= 3200 && s.phase === "PLAYING"; turn++) {
        s = runRummikubBotTurn(s, (seed + s.current) % 2 ? "easy" : "normal", turn);
        expect(s.lastAction?.type).not.toBe("INVALID");
      }
      expect(s.phase, "seed " + seed).toBe("FINISHED");
    }
  }, 120_000);

  it("uses only its public table and own rack, even if rival tiles and draw order change", () => {
    const s = createRK(["甲", "乙"], { seed: 91, minutes: 0, now: 0 });
    const me = s.current;
    const actorView = rummikubBotView(viewForRK(s, me));
    const other = s.players[1 - me];
    [other.rack[0], s.pool[0]] = [s.pool[0], other.rack[0]];
    s.pool.reverse();
    const changed = rummikubBotView(viewForRK(s, me));
    expect(changed).toEqual(actorView);
    expect(planRummikubTurn(changed, "normal")).toEqual(planRummikubTurn(actorView, "normal"));
  });
});
