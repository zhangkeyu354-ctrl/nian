import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import bank from "../data/approved-bank.json" with { type: "json" };
import cards from "../data/cards.zh.json" with { type: "json" };
import { createND } from "../src/index.ts";
it("uses all 102 authorized questions with 20 spicy and matching source hash", () => {
  expect(bank.questions).toHaveLength(102);
  expect(cards).toHaveLength(102);
  expect(bank.questions.filter((q) => q.spicy)).toHaveLength(20);
  expect(JSON.stringify([bank, cards])).not.toMatch(/成年|成人/);
  expect(new Set(cards.map((c) => c.id)).size).toBe(102);
  const raw = readFileSync(
    new URL("../data/cards.zh.json", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    bank.sourceSha256,
  );
  const seen = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    const s = createND(["甲", "乙", "丙", "丁"], { seed });
    s.topicCards.forEach((c) => c.questions.forEach((q) => seen.add(q.id)));
  }
  expect(seen.size).toBe(102);
});
