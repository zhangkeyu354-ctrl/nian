import { it, expect } from "vitest";
import { XBRoom } from "../src/xb-rooms.ts";
it("仅房主可设主题，重连保存设置；同房再来一局不重复题", () => {
  const r = new XBRoom("TOPICS");
  const a = r.join("甲"),
    b = r.join("乙");
  r.join("丙");
  expect(() =>
    r.command(b, { type: "SET_TOPICS", themes: ["冷门汉字或词语"] }),
  ).toThrow("房主");
  r.command(a, { type: "SET_TOPICS", themes: ["冷门汉字或词语"] });
  const used = new Set<string>();
  for (let match = 0; match < 2; match++) {
    r.command(a, { type: "START" });
    for (let round = 1; round <= 3; round++) {
      const s = r.file.state!;
      expect(used.has(s.topic.id)).toBe(false);
      used.add(s.topic.id);
      const g = r.file.players.find((p) => p.id === s.guesser)!.token;
      r.command(g, { type: "GUESS", target: s.truth, round });
      r.command(a, { type: "NEXT", round });
    }
    r.command(a, { type: "REMATCH" });
  }
  expect(
    new XBRoom("TOPICS", structuredClone(r.file)).snapshot(a).topicThemes,
  ).toEqual(["冷门汉字或词语"]);
  expect(() =>
    r.command(a, { type: "SET_TOPICS", themes: ["假主题"] }),
  ).toThrow("主题");
});
