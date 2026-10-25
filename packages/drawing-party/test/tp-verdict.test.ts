import { it, expect } from "vitest";
import { startGame, act, tick, viewFor, type Game } from "../src/index.ts";
const ps = ["a", "b", "c"].map((id) => ({ id, name: id }));
function reveal(): Game {
  let s = startGame("tp", ps, 1000, { fakeIndex: 0, wordIndex: 0 });
  s = tick(s, s.deadline);
  s = tick(s, s.deadline);
  for (const p of ps)
    s = act(s, p.id, { type: "TEXT", text: "小鸡" }, s.deadline - 1);
  while (s.phase !== "REVEAL") {
    if (s.phase === "TASK" && s.step === 2)
      for (const p of ps)
        s = act(s, p.id, { type: "TEXT", text: "恐龙" }, s.deadline - 1);
    else s = tick(s, s.deadline);
  }
  s = act(s, "a", { type: "NEXT" }, 999999);
  return act(s, "a", { type: "NEXT" }, 999999);
}
it("reveal compares initial and final manually, then runs public verdict before awards", () => {
  let s = reveal();
  expect(s.phase).toBe("VERDICT");
  expect(
    viewFor(s, "b")
      .albums?.[0].entries.map((e) => e.text)
      .filter(Boolean),
  ).toEqual(["小鸡", "恐龙"]);
  expect(() =>
    act(s, "a", { type: "VERDICT_VOTE", chain: 1, choice: "success" }, 1000000),
  ).toThrow();
  expect(() =>
    act(
      s,
      "a",
      { type: "VERDICT_VOTE", chain: 0, choice: "other" as any },
      1000000,
    ),
  ).toThrow();
  s = act(
    s,
    "a",
    { type: "VERDICT_VOTE", chain: 0, choice: "success" },
    1000000,
  );
  expect(viewFor(s, "b").verdictVotes).toEqual({ a: "success" });
  expect(() =>
    act(s, "a", { type: "VERDICT_VOTE", chain: 0, choice: null }, 1000001),
  ).toThrow();
  s = act(
    s,
    "b",
    { type: "VERDICT_VOTE", chain: 0, choice: "offtrack" },
    1000000,
  );
  s = act(
    s,
    "c",
    { type: "VERDICT_VOTE", chain: 0, choice: "offtrack" },
    1000000,
  );
  expect(s.phase).toBe("VERDICT_RESULT");
  expect(viewFor(s, "a").verdictResults?.[0]).toMatchObject({
    chain: 0,
    success: 1,
    offtrack: 2,
    abstain: 0,
    outcome: "offtrack",
  });
  expect(() => act(s, "b", { type: "NEXT" }, 1000001)).toThrow();
  s = act(s, "a", { type: "NEXT" }, 1000001);
  expect(s.phase).toBe("AWARD");
  expect(s.deadline).toBe(1030001);
  s = act(
    s,
    "a",
    { type: "AWARD_VOTE", chain: 0, mvp: "b", dud: "b" },
    1000002,
  );
  expect(viewFor(s, "c").awardVotes).toEqual({ a: { mvp: "b", dud: "b" } });
  s = tick(s, s.deadline);
  expect(viewFor(s, "b").awardResults?.[0].votes).toEqual({
    a: { mvp: "b", dud: "b" },
    b: { mvp: null, dud: null },
    c: { mvp: null, dud: null },
  });
});
it("verdict timeout/abstention/ties and snapshot replay are deterministic", () => {
  for (const choices of [
    ["success", null],
    ["success", "offtrack"],
    [null, null],
  ] as const) {
    let s = reveal();
    for (let i = 0; i < choices.length; i++)
      s = act(
        s,
        ps[i].id,
        { type: "VERDICT_VOTE", chain: 0, choice: choices[i] },
        1000000,
      );
    const loaded = JSON.parse(JSON.stringify(s));
    s = tick(s, s.deadline);
    expect(s).toEqual(tick(loaded, loaded.deadline));
    expect(s.verdictResults?.[0].votes.c).toBe(null);
    expect(s.verdictResults?.[0].outcome).toBe(
      choices[0] === "success" && choices[1] === null ? "success" : "mixed",
    );
  }
});

it("paper ratio is fixed in game and drawings, old snapshots keep the legacy ratio", () => {
  let s = startGame("fa", ps, 1000, { fakeIndex: 0, wordIndex: 0 });
  expect(s.paperAspect).toBe(4 / 3);
  expect(viewFor(s, "a").drawing?.aspect).toBe(4 / 3);
  delete s.paperAspect;
  delete s.drawings.shared.aspect;
  expect(viewFor(s, "a").drawing?.aspect).toBe(2);
});
