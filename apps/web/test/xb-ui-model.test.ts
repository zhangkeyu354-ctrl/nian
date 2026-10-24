import { it, expect } from "vitest";
import { revealFrame, titles } from "../src/xb/ui-model.ts";
it("3/6/10人按座位揭晓均为6～12秒，最后才显示积分", () => {
  for (const n of [3, 6, 10]) {
    expect(revealFrame(0, n).visible).toBe(0);
    expect(revealFrame(600, n).visible).toBe(1);
    expect(revealFrame(1499, n).visible).toBe(1);
    expect(revealFrame(1500, n).visible).toBe(2);
    const end = revealFrame(12000, n);
    expect(end.duration).toBeGreaterThanOrEqual(6000);
    expect(end.duration).toBeLessThanOrEqual(12000);
    expect(end.done && end.scores).toBe(true);
    expect(end.visible).toBe(n);
  }
});
it("趣味称号只读已揭晓历史、支持并列；不把娱乐次数算成分数", () => {
  const view: any = {
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
      { id: "c", name: "丙" },
    ],
    history: [{ guesser: "a", selected: "b", truth: "c" }],
  };
  const before = JSON.stringify(view);
  expect(titles(view, { c: 5 }).map((x) => x.names)).toEqual([
    "乙",
    "甲",
    "丙",
  ]);
  expect(JSON.stringify(view)).toBe(before);
});
