import { expect, it } from "vitest";
import {
  createGame,
  act,
  viewFor,
} from "../../../packages/xiabaiwang/src/engine.ts";
import { settlement } from "../src/xb/ui-model.ts";
import { revealTimeline } from "../src/xb/feel.ts";
it("3/6/10人先翻完身份，再依次播放指认/质疑/总分；跳过直接到最终状态", () => {
  for (const n of [3, 6, 10]) {
    const at = 1200 + n * 800;
    expect(revealTimeline(at + 399, n).settlementIndex).toBe(-1);
    expect(revealTimeline(at + 400, n).settlementIndex).toBe(0);
    expect(revealTimeline(at + 1000, n).settlementIndex).toBe(1);
    expect(revealTimeline(at + 1599, n).scores).toBe(false);
    expect(revealTimeline(at + 1600, n).settlementIndex).toBe(2);
    expect(revealTimeline(12000, n).done).toBe(true);
  }
});
it("揭晓明细不重复计分、未质疑也显示该步；旧公开历史能还原", () => {
  const s = createGame(
    Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `人${i}` })),
    5,
  );
  const t = act(s, s.guesser, { type: "GUESS", target: s.truth, round: 1 });
  const v = viewFor(t, null),
    before = JSON.stringify(v);
  const steps = settlement(v);
  expect(steps.map((x) => x.kind)).toEqual(["guess", "challenge", "total"]);
  expect(Object.values(steps[1].delta)).toEqual([0, 0, 0]);
  expect(steps[2].delta).toEqual(t.history[0].delta);
  expect(JSON.stringify(v)).toBe(before);
  delete (v.history[0] as any).scoring;
  expect(settlement(v)).toEqual(steps);
});
