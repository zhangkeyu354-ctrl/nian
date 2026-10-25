import { it, expect } from "vitest";
import { startGame, act, tick, viewFor, type Game } from "../src/index.ts";
const ps = ["a", "b", "c"].map((id) => ({ id, name: id }));
const start = () =>
  startGame("tp", ps, 1000, {
    fakeIndex: 1,
    wordIndex: 0,
    themeTieSeed: 1,
    themeRandomIndex: 3,
  });
function reveal(): Game {
  let s = start();
  s = tick(s, s.deadline);
  s = tick(s, s.deadline);
  while (s.phase !== "REVEAL") s = tick(s, s.deadline);
  return s;
}
it("theme votes are private, locked, validated, and get a full 60s writing stage after banner", () => {
  let s = start();
  expect(s.phase).toBe("THEME");
  expect(s.deadline).toBe(31000);
  for (const theme of [-1, 7, 1.5, NaN])
    expect(() => act(s, "a", { type: "THEME_VOTE", theme }, 1100)).toThrow();
  s = act(s, "a", { type: "THEME_VOTE", theme: 4 }, 1100);
  expect(viewFor(s, "a").myThemeVote).toBe(4);
  expect(viewFor(s, "b").myThemeVote).toBeUndefined();
  expect(viewFor(s, "b").completed).toBe(1);
  expect(JSON.stringify(viewFor(s, "b"))).not.toContain("themeVotes");
  expect(() => act(s, "a", { type: "THEME_VOTE", theme: 0 }, 1100)).toThrow();
  s = act(s, "b", { type: "THEME_VOTE", theme: 4 }, 1200);
  s = act(s, "c", { type: "THEME_VOTE", theme: 0 }, 1300);
  expect(s.phase).toBe("THEME_RESULT");
  expect(viewFor(s, "a").theme).toBe("歌词");
  expect(() => act(s, "a", { type: "TEXT", text: "先写" }, 1400)).toThrow();
  s = tick(s, s.deadline);
  expect(s.phase).toBe("PROMPT");
  expect(s.deadline).toBe(62800);
  // Theme is a hint: unrelated content is valid, and no server words enter the chain.
  s = act(s, "a", { type: "TEXT", text: "不属于歌词也能写" }, 3000);
  expect(s.chains[0][0].text).toBe("不属于歌词也能写");
});
it("tie, random, abstention and custom are deterministic and don't issue system prompts", () => {
  let s = start();
  s = act(s, "a", { type: "THEME_VOTE", theme: 0 }, 1100);
  s = act(s, "b", { type: "THEME_VOTE", theme: 4 }, 1100);
  const saved = JSON.parse(JSON.stringify(s));
  expect(tick(s, s.deadline)).toEqual(tick(saved, s.deadline));
  expect(tick(s, s.deadline).theme).toBe("歌词");
  expect(tick(start(), 31000).theme).toBe("动漫");
  for (const choice of [5, 6]) {
    let g = start();
    for (const p of ps)
      g = act(g, p.id, { type: "THEME_VOTE", theme: choice }, 1100);
    expect(g.theme).toBe(choice === 5 ? "动漫" : undefined);
    g = tick(g, g.deadline);
    g = tick(g, g.deadline);
    expect(g.chains[0][0]).toMatchObject({ text: "未出题", missing: true });
  }
});
it("each final page opens anonymous award voting with correct candidates and no self votes", () => {
  let s = reveal();
  s = act(s, "a", { type: "NEXT" }, 999999);
  s = act(s, "a", { type: "NEXT" }, 999999);
  expect(s.phase).toBe("AWARD");
  expect(viewFor(s, "a").awardCandidates).toEqual([
    ...new Set(s.chains[0].map((e) => e.author)),
  ]);
  expect(() =>
    act(s, "a", { type: "AWARD_VOTE", chain: 1, mvp: "b" }, 1000000),
  ).toThrow();
  expect(() =>
    act(s, "a", { type: "AWARD_VOTE", chain: 0, mvp: "a" }, 1000000),
  ).toThrow();
  expect(() =>
    act(s, "a", { type: "AWARD_VOTE", chain: 0, dud: "x" }, 1000000),
  ).toThrow();
  s = act(
    s,
    "a",
    { type: "AWARD_VOTE", chain: 0, mvp: "b", dud: "b" },
    1000000,
  );
  expect(viewFor(s, "a").myAwardVote).toEqual({ mvp: "b", dud: "b" });
  expect(viewFor(s, "b").myAwardVote).toBeUndefined();
  expect(viewFor(s, "b").awardResults).toEqual([]);
  expect(() =>
    act(s, "a", { type: "AWARD_VOTE", chain: 0 }, 1000001),
  ).toThrow();
  expect(() => act(s, "a", { type: "NEXT" }, 1000001)).toThrow();
  const loaded = JSON.parse(JSON.stringify(s));
  expect(tick(s, s.deadline)).toEqual(tick(loaded, s.deadline));
  s = tick(s, s.deadline);
  expect(s.phase).toBe("AWARD_RESULT");
  expect(s.awardResults![0].mvp).toEqual({ b: 1 });
  expect(s.awardResults![0].mvpWinners).toEqual(["b"]);
  expect(JSON.stringify(viewFor(s, "c"))).not.toContain("awardVotes");
  s = act(s, "a", { type: "NEXT" }, s.deadline + 1);
  expect(s.phase).toBe("REVEAL");
  expect(s.cursor).toBe(3);
});
it("award totals preserve ties and zero votes give no winner", () => {
  let s = reveal();
  while (s.phase !== "RESULT") {
    if (s.phase === "AWARD") {
      for (const p of ps)
        s = act(
          s,
          p.id,
          {
            type: "AWARD_VOTE",
            chain: Math.floor(s.cursor / (s.steps + 1)),
            mvp: ps[(ps.indexOf(p) + 1) % 3].id,
            dud: null,
          },
          2000000,
        );
    } else s = act(s, "a", { type: "NEXT" }, 1999999);
  }
  const v = viewFor(s, "a");
  expect(v.awardTotals?.mvpWinners).toEqual(["a", "b", "c"]);
  expect(v.awardTotals?.mvp).toEqual({ a: 3, b: 3, c: 3 });
  expect(v.awardTotals?.dudWinners).toEqual([]);
});
