import { it, expect } from "vitest";
import {
  createTiles,
  createRK,
  reduceRK,
  assertInvariants,
  validateMeld,
  rackPoints,
  viewForRK,
} from "../src/index.ts";
import { aiTurn } from "../src/simulation.ts";

it("XP explicitly enables 160 unique tiles, three copies and four independent jokers", () => {
  const tiles = createTiles("xp");
  expect(tiles).toHaveLength(160);
  expect(new Set(tiles.map((t) => t.id)).size).toBe(160);
  expect(tiles.filter((t) => t.color === null).map((t) => t.id)).toEqual([
    "J1",
    "J2",
    "J3",
    "J4",
  ]);
  expect(
    tiles.filter((t) => t.color === "R" && t.value === 7).map((t) => t.id),
  ).toEqual(["R07a", "R07b", "R07c"]);
  expect(createTiles()).toHaveLength(106);
  expect(validateMeld(["R11c", "J3", "J4"]).length).toBeGreaterThan(0);
  expect(rackPoints(["J3", "J4", "R13c"])).toBe(73);
});
it("classic stays the default and mode/player mismatches are rejected", () => {
  expect(createRK(["A", "B"], { seed: 1 }).variant).toBe("classic");
  for (const [count, variant] of [
    [5, "classic"],
    [4, "xp"],
    [7, "xp"],
    [6, "bogus"],
  ] as const)
    expect(() =>
      createRK(
        Array.from({ length: count }, (_, i) => String(i)),
        { seed: 1, variant: variant as any },
      ),
    ).toThrow();
});
for (const count of [5, 6])
  it(`XP ${count} seats keep all tiles private and conserved across draft, draw and next turn`, () => {
    const s = createRK(
      Array.from({ length: count }, (_, i) => `玩家${i}`),
      { seed: 6000 + count, variant: "xp", minutes: 0, assertions: true },
    );
    expect(s.pool).toHaveLength(160 - count * 14);
    expect(s.players.every((p) => p.rack.length === 14)).toBe(true);
    expect(new Set(s.startDraw.map((t) => t.seat)).size).toBe(count);
    const actor = s.current,
      id = s.players[actor].rack[0];
    const draft = reduceRK(s, {
      type: "MOVE",
      actor,
      seq: 1,
      now: 0,
      tiles: [id],
      to: { meld: null },
    });
    const observer = (actor + 1) % count;
    expect(viewForRK(draft, observer)).toEqual(viewForRK(s, observer));
    expect(viewForRK(draft, actor).variant).toBe("xp");
    expect(
      viewForRK(draft, observer).players.filter((p) => p.rack !== undefined),
    ).toHaveLength(1);
    assertInvariants(draft);
    const reset = reduceRK(draft, { type: "RESET", actor, seq: 2, now: 0 });
    const next = reduceRK(reset, { type: "DRAW", actor, seq: 3, now: 0 });
    expect(next.current).toBe(observer);
    expect(next.players[actor].rack.length).toBe(15);
    assertInvariants(next);
  });
it("classic invariant rejects an XP tile even with the same total count", () => {
  const s = createRK(["A", "B"], { seed: 1, assertions: true });
  s.pool[0] = "R13c";
  expect(() => assertInvariants(s)).toThrow(/不变量/);
});
it("XP next game retains variant, cumulative scores and wins with a fresh 160-tile deal", () => {
  let s = createRK(["A", "B", "C", "D", "E", "F"], {
    seed: 6006,
    variant: "xp",
    minutes: 0,
    assertions: true,
  });
  for (let i = 0; i < 2000 && s.phase === "PLAYING"; i++) s = aiTurn(s);
  expect(s.phase).toBe("FINISHED");
  const scores = s.players.map((p) => p.score),
    wins = s.players.map((p) => p.wins);
  s = reduceRK(s, {
    type: "NEXT_GAME",
    actor: s.current,
    seq: (s.seq[String(s.current)] ?? 0) + 1,
    now: 0,
  });
  expect(s.variant).toBe("xp");
  expect(s.game).toBe(2);
  expect(s.pool).toHaveLength(76);
  expect(s.players.map((p) => p.score)).toEqual(scores);
  expect(s.players.map((p) => p.wins)).toEqual(wins);
  assertInvariants(s);
});
