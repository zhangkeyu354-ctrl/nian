import { expect, it } from "vitest";
import { createMAGame, reduceMA } from "../src/engine.ts";
import type { MACommand, MAState } from "../src/types.ts";
import { compactChainHistory } from "./chain-invariants.ts";

const semantic = (s: MAState): unknown => ({
  ...s,
  log: [],
  turn: s.turn ? { ...s.turn, snapshot: JSON.stringify({ ...JSON.parse(s.turn.snapshot), log: [] }) } : null,
});
for (const players of [2, 4, 8])
  it(`归档已检查的完整回合不改变${players}人整局规则状态和任何比赛记录`, () => {
    let full = createMAGame({
      players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      seed: 390 + players,
      settings: { secondWindPreview: true, deal: "random" },
    });
    let compact = structuredClone(full),
      steps = 0,
      archivedRaces = 0;
    const archived: MAState["log"] = [];
    while (full.phase !== "over") {
      expect(++steps).toBeLessThan(2500);
      let command: MACommand;
      if (full.phase === "choose") {
        const p = full.players.find((p) => !p.choices.length)!;
        command = { type: "CHOOSE", player: p.id, racer: p.hand.find((r) => !p.used.includes(r))! };
      } else {
        const p = full.pending!;
        command = {
          type: "ANSWER",
          player: p.player,
          value:
            p.options.find((o) => o.value === "no")?.value ??
            p.options.find((o) => o.value === "keep")?.value ??
            p.options[0].value,
        };
      }
      full = reduceMA(full, command);
      compact = reduceMA(compact, command);
      const batch = compactChainHistory(compact);
      archived.push(...batch);
      archivedRaces += batch.filter((l) => l.fx?.kind === "podium").length;
      expect(semantic(compact)).toEqual(semantic(full));
      expect([...archived, ...compact.log]).toEqual(full.log);
    }
    expect(archivedRaces + compact.log.filter((l) => l.fx?.kind === "podium").length).toBe(4);
  }, 30_000);
