import { it, expect } from "vitest";
import { XBRoom } from "../src/xb-rooms.ts";
import { createGame, act, speakOrder } from "../../../packages/xiabaiwang/src/engine.ts";

const room5 = () => {
  const r = new XBRoom("SEATS1");
  const t = ["甲", "乙", "丙", "丁", "戊"].map((n) => r.join(n));
  return { r, t, id: (k: number) => r.player(t[k])!.id };
};

it("大厅里可以和别人换座位，房主身份跟着人走", () => {
  const { r, t, id } = room5();
  const host = id(0);
  r.command(t[0], { type: "SWAP_SEAT", target: 3 });
  expect(r.file.players.map((p) => p.name)).toEqual(["丁", "乙", "丙", "甲", "戊"]);
  expect(r.snapshot(t[1]).host).toBe(host);
  // 房主换到 4 号位后仍然能开局，非房主不能
  expect(() => r.command(t[1], { type: "START" })).toThrow("仅房主");
  r.command(t[0], { type: "START" });
  expect(r.file.state!.host).toBe(host);
  expect(r.file.state!.players.map((p) => p.name)).toEqual(["丁", "乙", "丙", "甲", "戊"]);
});

it("换座位的非法情况都会被拒绝", () => {
  const { r, t } = room5();
  expect(() => r.command(t[1], { type: "SWAP_SEAT", target: 1 })).toThrow("已经坐在这里");
  expect(() => r.command(t[1], { type: "SWAP_SEAT", target: 9 })).toThrow("没人");
  r.command(t[0], { type: "START" });
  expect(() => r.command(t[1], { type: "SWAP_SEAT", target: 0 })).toThrow("开局后不能换座位");
});

it("第一个想想随机抽，不总是房主；每人正好当一次想想", () => {
  const players = Array.from({ length: 6 }, (_, i) => ({ id: "p" + i, name: "P" + i }));
  const firsts = new Set<string>();
  for (let k = 0; k < 6; k++) {
    let s = createGame(players, 100 + k, undefined, undefined, "p0", k);
    firsts.add(s.guesser);
    const seen: string[] = [];
    while (s.phase !== "over") {
      seen.push(s.guesser);
      const target = s.players.find((p) => p.id !== s.guesser)!.id;
      s = act(s, s.guesser, { type: "GUESS", target, round: s.round });
      s = act(s, s.host, { type: "NEXT", round: s.round });
    }
    expect(seen.sort()).toEqual(players.map((p) => p.id).sort());
  }
  expect(firsts.size).toBe(6);
  // 房间开局：随机抽第一个想想，多开几局不会总是房主
  const hosts = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const r = new XBRoom("RND" + i);
    const t = ["甲", "乙", "丙", "丁"].map((n) => r.join(n));
    r.command(t[0], { type: "START" });
    hosts.add(r.file.state!.guesser);
  }
  expect(hosts.size).toBeGreaterThan(1);
});

it("解释顺序从想想左手边下一位开始，按座位绕一圈", () => {
  const players = Array.from({ length: 5 }, (_, i) => ({ id: "p" + i, name: "P" + i }));
  const s = createGame(players, 7, undefined, undefined, "p0", 3);
  const g = s.players.findIndex((p) => p.id === s.guesser);
  const order = speakOrder(s).map((p) => p.id);
  expect(order).toHaveLength(4);
  expect(order).not.toContain(s.guesser);
  expect(order[0]).toBe(s.players[(g + 1) % 5].id);
  expect(s.speaker).toBe(order[0]);
});

it("旧存档（没有新字段）保持原来的想想和发言顺序", () => {
  const players = Array.from({ length: 4 }, (_, i) => ({ id: "p" + i, name: "P" + i }));
  const s = createGame(players, 3);
  delete s.firstGuesser;
  delete s.orderFromGuesser;
  expect(speakOrder({ ...s, guesser: "p0" }).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
});
