import { expect, it } from "vitest";
import {
  createSS,
  createDeckSS,
  actionBudgetSS,
  viewForSS,
  assertInvariants,
} from "../src/index.ts";
it("R01-R09: seeded creation, official inventory, budgets and public guard", () => {
  expect(createDeckSS()).toHaveLength(36);
  expect(
    [0, 1, 2, 3].map(
      (v) => createDeckSS().filter((c) => c.bottles === v).length,
    ),
  ).toEqual([12, 12, 7, 5]);
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const names = Array.from({ length: n }, (_, i) => `旅客${i}`);
    const s = createSS(names, { seed: 42, firstGuard: 1, now: 1000 });
    expect(createSS(names, { seed: 42, firstGuard: 1, now: 1000 })).toEqual(s);
    expect(s.guard).toBe(1);
    expect(s.players.map((p) => p.hand.length)).toEqual(
      names.map((_, i) => (i === 1 ? 0 : 5)),
    );
    expect(s.players.every((p) => p.caps === 10)).toBe(true);
    expect(s.bank).toBe(422 - n * 10);
    expect(s.options.events).toBe(false);
    expect(viewForSS(s, 0)).not.toHaveProperty("seed");
    assertInvariants(s);
  }
  expect([3, 4, 5, 6, 7, 8].map(actionBudgetSS)).toEqual([
    { bribe: 1, inspect: 1, arrest: 1 },
    { bribe: 1, inspect: 1, arrest: 1 },
    { bribe: 1, inspect: 1, arrest: 2 },
    { bribe: 1, inspect: 2, arrest: 2 },
    { bribe: 2, inspect: 2, arrest: 2 },
    { bribe: 2, inspect: 2, arrest: 3 },
  ]);
  expect(() => createSS(["a", "b"], { seed: 1 })).toThrow("3至8");
});
