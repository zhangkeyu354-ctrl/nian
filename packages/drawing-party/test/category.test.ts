import { it, expect } from "vitest";
import { startGame, act, tick, viewFor, WORDS } from "../src/index.ts";
const ps = Array.from({ length: 3 }, (_, i) => ({
  id: "p" + i,
  name: "画家" + i,
}));
const start = () =>
  startGame("fa", ps, 1000, {
    fakeIndex: 1,
    wordIndex: 7,
    optionOffset: 3,
    categoryVote: true,
  });
it("topic ballot hides identity/answer and resolves a real five-category vote", () => {
  let s = start();
  expect(s.phase).toBe("CATEGORY");
  expect(WORDS).toHaveLength(5);
  for (const p of ps) {
    const v = viewFor(s, p.id);
    expect(v.categories).toHaveLength(6);
    expect(v.word).toBeUndefined();
    expect(v.role).toBeUndefined();
    expect(v.options).toBeUndefined();
  }
  s = act(s, "p0", { type: "CATEGORY_VOTE", category: 2 }, 1100);
  expect(() =>
    act(s, "p0", { type: "CATEGORY_VOTE", category: 1 }, 1101),
  ).toThrow();
  expect(viewFor(s, "p0").myCategoryVote).toBe(2);
  expect(viewFor(s, "p2").myCategoryVote).toBeUndefined();
  s = act(s, "p1", { type: "CATEGORY_VOTE", category: 2 }, 1200);
  s = act(s, "p2", { type: "CATEGORY_VOTE", category: 4 }, 1300);
  expect(s.phase).toBe("DRAW");
  expect(s.category).toBe(WORDS[2].category);
  expect(s.options).toContain(s.word);
  expect(viewFor(s, "p1").word).toBeUndefined();
});
it("topic timeout/abstention/random never stalls or creates an invalid answer", () => {
  for (const scenario of ["none", "tie", "random"]) {
    let s = start();
    if (scenario !== "none") {
      s = act(
        s,
        "p0",
        { type: "CATEGORY_VOTE", category: scenario === "random" ? -1 : 0 },
        1100,
      );
      s = act(
        s,
        "p1",
        { type: "CATEGORY_VOTE", category: scenario === "random" ? -1 : 1 },
        1200,
      );
    }
    s = tick(s, s.deadline);
    expect(s.phase).toBe("DRAW");
    expect(s.deadline).toBeGreaterThan(1000);
    expect(s.options).toContain(s.word);
  }
});
it("invalid topic index and late ballot are rejected", () => {
  const s = start();
  expect(() =>
    act(s, "p0", { type: "CATEGORY_VOTE", category: 99 }, 1100),
  ).toThrow();
  expect(() =>
    act(s, "p0", { type: "CATEGORY_VOTE", category: 0 }, s.deadline),
  ).toThrow();
});
