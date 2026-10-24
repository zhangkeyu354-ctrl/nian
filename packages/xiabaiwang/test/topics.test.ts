import { it, expect } from "vitest";
import { TOPICS } from "../src/topics.ts";
import { TOPIC_THEMES } from "../src/topic-themes.ts";

it("原版题库：160个冷门词条，难度64/64/32，ID与词条不重复", () => {
  expect(TOPICS).toHaveLength(160);
  expect(new Set(TOPICS.map((t) => t.id)).size).toBe(160);
  expect(new Set(TOPICS.map((t) => t.question)).size).toBe(160);
  expect(
    [1, 2, 3].map((d) => TOPICS.filter((t) => t.difficulty === d).length),
  ).toEqual([64, 64, 32]);
});

it("题面只是一个词：不是问句、不超过12个字", () => {
  for (const t of TOPICS) {
    expect(t.question, t.id).not.toMatch(/[？?]$/);
    expect(t.question, t.id).not.toMatch(/为什么|是什么|怎么|吗/);
    expect([...t.question].length, t.id).toBeLessThanOrEqual(12);
  }
});

it("每题有真实解释和来源链接，主题都在可选主题列表里，且每个主题都有题", () => {
  for (const t of TOPICS) {
    expect(t.source, t.id).toMatch(/^https:\/\//);
    expect(t.answer.length, t.id).toBeGreaterThan(10);
    expect(TOPIC_THEMES as readonly string[], t.id).toContain(t.theme);
  }
  for (const th of TOPIC_THEMES)
    expect(TOPICS.filter((t) => t.theme === th).length, th).toBeGreaterThan(0);
});
