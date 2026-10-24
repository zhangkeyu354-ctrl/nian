import { it, expect } from "vitest";
import { TOPICS } from "../src/topics.ts";
it("原创题库至少60题，三档都有题且ID题面不重复，每题保留来源", () => {
  expect(TOPICS.length).toBeGreaterThanOrEqual(60);
  expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
  expect(new Set(TOPICS.map((t) => t.question)).size).toBe(TOPICS.length);
  for (const d of [1, 2, 3])
    expect(
      TOPICS.filter((t) => t.difficulty === d).length,
    ).toBeGreaterThanOrEqual(10);
  for (const t of TOPICS) {
    expect(t.source).toMatch(/^https:\/\//);
    expect(t.answer.length).toBeGreaterThan(15);
  }
});

it("v2新增96题且保留旧64题，每主题至少8题，每题带来源说明", () => {
  const added = TOPICS.filter((t) => t.id.startsWith("xb-v2-"));
  expect(added).toHaveLength(96);
  expect(TOPICS.length).toBeGreaterThanOrEqual(160);
  expect(new Set(added.map((t) => t.theme)).size).toBe(12);
  for (const theme of new Set(added.map((t) => t.theme)))
    expect(
      added.filter((t) => t.theme === theme).length,
    ).toBeGreaterThanOrEqual(8);
  expect(added.every((t) => t.sourceNote)).toBe(true);
  expect(
    [1, 2, 3].map((d) => TOPICS.filter((t) => t.difficulty === d).length),
  ).toEqual([64, 64, 32]);
});
