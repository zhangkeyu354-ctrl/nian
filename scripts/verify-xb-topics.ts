import { TOPICS } from "../packages/xiabaiwang/src/topics.ts";
import { TOPIC_THEMES } from "../packages/xiabaiwang/src/topic-themes.ts";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
const normalized = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[\p{P}\p{Z}\s]/gu, "")
    .toLowerCase();
for (const key of ["id", "question", "answer"] as const)
  assert.equal(
    new Set(TOPICS.map((t) => normalized(t[key]))).size,
    TOPICS.length,
    `${key}去重`,
  );
const grams = (s: string) =>
  new Set(
    [...normalized(s)].slice(1).map((_, i) => normalized(s).slice(i, i + 2)),
  );
const near = [];
for (let i = 0; i < TOPICS.length; i++)
  for (let j = i + 1; j < TOPICS.length; j++) {
    const a = grams(TOPICS[i].answer),
      b = grams(TOPICS[j].answer),
      common = [...a].filter((x) => b.has(x)).length;
    if ((2 * common) / (a.size + b.size) > 0.6)
      near.push([TOPICS[i].id, TOPICS[j].id]);
  }
assert.deepEqual(near, [], "近似答案需要人工复核");
const themes = Object.fromEntries(
  TOPIC_THEMES.map((theme) => [
    theme,
    [1, 2, 3].map(
      (d) =>
        TOPICS.filter((t) => t.theme === theme && t.difficulty === d).length,
    ),
  ]),
);
for (const v of Object.values(themes))
  assert(v.reduce((a, b) => a + b, 0) >= 8);
assert(TOPICS.length >= 160);
const difficulties = [1, 2, 3].map(
  (d) => TOPICS.filter((t) => t.difficulty === d).length,
);
assert.deepEqual(difficulties, [64, 64, 32]);
assert(
  TOPICS.filter((t) => t.id.startsWith("xb-v2-")).every(
    (t) => t.sourceNote && t.source.startsWith("https://"),
  ),
);
mkdirSync("docs/xiabaiwang/feel-v2", { recursive: true });
writeFileSync(
  "docs/xiabaiwang/feel-v2/topics-report.json",
  JSON.stringify(
    {
      count: TOPICS.length,
      difficulties,
      themes,
      duplicateIds: 0,
      duplicateQuestions: 0,
      duplicateAnswers: 0,
      nearDuplicates: near,
      note: "字符相似检查不能替代语义审稿；已人工排除同义的二次烘烤题。",
    },
    null,
    2,
  ),
);
console.log("XB_TOPICS_PASS", TOPICS.length, JSON.stringify(difficulties));
