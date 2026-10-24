import { expect, it } from "vitest";
import { XBRoom } from "../src/xb-rooms.ts";
it("圈数只允许房主在大厅设置，序列化重连保持两圈并按轮数检查余题", () => {
  let room = new XBRoom("SCORE2");
  const host = room.join("甲"),
    other = room.join("乙");
  for (const name of ["丙", "丁", "戊"]) room.join(name);
  expect(() => room.command(other, { type: "SET_CYCLES", cycles: 2 })).toThrow(
    "房主",
  );
  expect(() =>
    room.command(host, { type: "SET_CYCLES", cycles: 0 as any }),
  ).toThrow("无效");
  room.command(host, { type: "SET_CYCLES", cycles: 2 });
  room = new XBRoom("SCORE2", JSON.parse(JSON.stringify(room.file)));
  expect(room.snapshot(other).cycles).toBe(2);
  room.command(host, { type: "SET_TOPICS", themes: ["自然现象与地貌"] });
  expect(() => room.command(host, { type: "START" })).toThrow("题目不足");
  expect(room.file.state).toBeNull();
  room.command(host, { type: "SET_TOPICS", themes: [] });
  room.command(host, { type: "START" });
  expect(room.snapshot(other).view!.totalRounds).toBe(10);
  expect(room.snapshot(other).view!.players.every((p) => p.score === 3)).toBe(
    true,
  );
  expect(() => room.command(host, { type: "SET_CYCLES", cycles: 1 })).toThrow(
    "开局后",
  );
  room = new XBRoom("SCORE2", JSON.parse(JSON.stringify(room.file)));
  expect(room.snapshot(other).view!.totalRounds).toBe(10);
  expect(room.snapshot(other).view!.players.every((p) => p.score === 3)).toBe(
    true,
  );
});
