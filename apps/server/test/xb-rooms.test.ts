import { it, expect } from "vitest";
import { XBRoom } from "../src/xb-rooms.ts";
it("UI v1：拒绝扔自己，娱乐统计独立于规则，只有房主可在终局再来一局", () => {
  const r = new XBRoom("UIVONE");
  const a = r.join("甲"),
    b = r.join("乙");
  r.join("丙");
  const before = JSON.stringify(r.file);
  expect(() => r.poop(a, r.player(a)!.id, 2000)).toThrow("不能扔自己");
  r.poop(a, r.player(b)!.id, 2000);
  expect(JSON.stringify(r.file)).toBe(before);
  expect(r.snapshot(a).funHits[r.player(b)!.id]).toBe(1);
  expect(() => r.command(a, { type: "REMATCH" })).toThrow();
  r.command(a, { type: "START" });
  expect(r.snapshot(a).discussionAt).toBeGreaterThan(0);
  for (let round = 1; round <= 3; round++) {
    const state = r.file.state!;
    const token = r.file.players.find((p) => p.id === state.guesser)!.token;
    r.command(token, { type: "GUESS", target: state.truth, round });
    r.command(a, { type: "NEXT", round });
  }
  expect(() => r.command(b, { type: "REMATCH" })).toThrow();
  r.command(a, { type: "REMATCH" });
  expect(r.snapshot(a).view).toBeNull();
  expect(r.file.players).toHaveLength(3);
});
it("房间恢复身份分数、娱乐冷却不修改游戏状态、越权与开局后加入被拒绝", () => {
  const r = new XBRoom("TEST");
  const a = r.join("甲"),
    b = r.join("乙"),
    c = r.join("丙");
  r.command(a, { type: "START" });
  const before = JSON.stringify(r.file);
  r.poop(b, r.file.players[0].id, 2000);
  expect(JSON.stringify(r.file)).toBe(before);
  expect(() => r.poop(b, r.file.players[0].id, 3000)).toThrow();
  expect(() => r.poop("bad", r.file.players[0].id, 4000)).toThrow();
  expect(() => r.join("丁")).toThrow();
  const s = r.file.state!;
  expect(() =>
    r.command(b, { type: "CHALLENGE", target: s.truth, round: 1 }),
  ).toThrow();
  r.command(a, { type: "CHALLENGE", target: r.file.players[1].id, round: 1 });
  r.poop(b, r.file.players[0].id, 4000);
  r.command(a, { type: "GUESS", target: s.truth, round: 1 });
  const recovered = new XBRoom("TEST", JSON.parse(JSON.stringify(r.file)));
  expect(recovered.snapshot(c).view).toEqual(r.snapshot(c).view);
  expect(recovered.join("", b)).toBe(b);
  expect(recovered.snapshot(b).me).toBe(r.file.players[1].id);
  expect(recovered.snapshot("bad").view!.answer).toBeDefined(); // 已揭晓
});
