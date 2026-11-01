import { it, expect } from "vitest";
import { entertainmentTitles } from "../../../apps/web/src/nd/ui-model.ts";
it("awards distinct evidence-based titles, maximum four, omitting empty data", () => {
  const h = [true, true, false].map((correct, i) => ({
    id: i,
    type: "REVEALED" as const,
    round: 1,
    captain: 0,
    seat: i + 1,
    number: i + 2,
    correct,
    penalty: correct ? 0 : 1,
  }));
  const titles = entertainmentTitles(h);
  expect(titles.map((t) => t.title)).toEqual([
    "最准队长",
    "最离谱答案",
    "人形量表",
  ]);
  expect(titles[1].seat).toBe(3);
  expect(titles.length).toBeLessThanOrEqual(4);
  expect(entertainmentTitles([])).toEqual([]);
});
