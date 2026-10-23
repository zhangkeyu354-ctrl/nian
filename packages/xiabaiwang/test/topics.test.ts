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
