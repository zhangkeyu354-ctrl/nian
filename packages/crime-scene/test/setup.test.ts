import { describe, expect, it } from "vitest";
import { dealGame } from "../src/setup.ts";

describe("开局发牌", () => {
  for (const count of [4, 8, 12]) {
    for (const cards of [3, 4, 5] as const) {
      it(`${count} 人每人 ${cards}+${cards}，专家无牌`, () => {
        const game = dealGame(count, 0, cards, () => 0.25);
        expect(game.roles[0]).toBe("forensic");
        expect(game.players[0].clues).toHaveLength(0);
        expect(game.players[0].means).toHaveLength(0);
        for (const p of game.players.slice(1)) {
          expect(p.clues).toHaveLength(cards);
          expect(p.means).toHaveLength(cards);
        }
        const clues = game.players.flatMap((p) => p.clues);
        const means = game.players.flatMap((p) => p.means);
        expect(new Set(clues).size).toBe(clues.length);
        expect(new Set(means).size).toBe(means.length);
        expect(game.badges).toEqual([false, ...Array(count - 1).fill(true)]);
      });
    }
  }

  it("场景牌堆与四选一地点板不重复", () => {
    const game = dealGame(6, 0, 4, () => 0.25);
    expect(game.locationOptions).toHaveLength(4);
    expect(game.orangeDeck).toHaveLength(21);
    expect(new Set(game.orangeDeck).size).toBe(21);
  });
});
