import { expect, it, vi } from "vitest";
import { XBRoom } from "../src/xb-rooms.ts";
const setup = (seconds: 0 | 30 | 60 = 0) => {
  const room = new XBRoom("UIV333");
  const tokens = ["甲", "乙", "丙"].map((n) => room.join(n));
  room.command(tokens[0], { type: "SET_SPEECH", seconds });
  room.command(tokens[0], { type: "START" });
  return { room, tokens, guesser: tokens[0], other: tokens[1] };
};
it("每人发言累计跨点名保留，超时只提示，不改阶段或积分", () => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  try {
    const { room, tokens, guesser } = setup(30),
      a = room.file.players[1].id,
      b = room.file.players[2].id;
    room.command(guesser, { type: "CALL", round: 1, target: a });
    vi.advanceTimersByTime(5000);
    room.command(guesser, { type: "CALL", round: 1, target: b });
    vi.advanceTimersByTime(2000);
    room.command(tokens[2], { type: "SPEAK", round: 1, target: null });
    expect(room.snapshot(guesser).speechUsed).toEqual({ [a]: 5000, [b]: 2000 });
    room.command(guesser, { type: "CALL", round: 1, target: a });
    vi.advanceTimersByTime(65000);
    expect(room.file.state!.phase).toBe("discussion");
    expect(Object.values(room.file.state!.scores)).toEqual([3, 3, 3]);
    room.command(tokens[1], { type: "SPEAK", round: 1, target: null });
    expect(room.snapshot(guesser).speechUsed![a]).toBe(70000);
  } finally {
    vi.useRealTimers();
  }
});
it("小抄只发给想想，揭晓后公开；非想想、越轮次及非法标签均拒绝，重连恢复", () => {
  let { room, tokens, guesser, other } = setup();
  const target = room.file.players[1].id;
  room.command(guesser, { type: "NOTE", round: 1, target, tag: "suspect" });
  expect(room.snapshot(guesser).privateNotes).toEqual({ [target]: "suspect" });
  expect(room.snapshot(other).privateNotes).toBeUndefined();
  expect(JSON.stringify(room.snapshot(other))).not.toContain('"suspect"');
  expect(() =>
    room.command(other, { type: "NOTE", round: 1, target, tag: "truthy" }),
  ).toThrow();
  expect(() =>
    room.command(guesser, { type: "NOTE", round: 2, target, tag: "truthy" }),
  ).toThrow();
  expect(() =>
    room.command(guesser, {
      type: "NOTE",
      round: 1,
      target,
      tag: "bad" as any,
    }),
  ).toThrow();
  room = new XBRoom("UIV333", JSON.parse(JSON.stringify(room.file)));
  expect(room.snapshot(guesser).privateNotes).toEqual({ [target]: "suspect" });
  room.command(guesser, {
    type: "GUESS",
    round: 1,
    target: room.file.state!.truth,
  });
  expect(room.snapshot(other).revealedNotes![0].tags).toEqual({
    [target]: "suspect",
  });
  expect(room.snapshot().privateNotes).toBeUndefined();
});
it("点名通知只有目标可见；禁言者不能被点名，普通人不能点别人", () => {
  const { room, tokens, guesser } = setup();
  const target = room.file.players[1].id;
  room.command(guesser, { type: "CALL", round: 1, target });
  expect(room.snapshot(tokens[1]).callout?.target).toBe(target);
  expect(room.snapshot(guesser).callout).toBeUndefined();
  expect(room.snapshot(tokens[2]).callout).toBeUndefined();
  expect(room.snapshot().callout).toBeUndefined();
  const nextTarget = room.file.players[2].id;
  room.command(guesser, { type: "CALL", round: 1, target: nextTarget });
  expect(room.snapshot(tokens[1]).callout).toBeUndefined();
  expect(room.snapshot(tokens[2]).callout?.target).toBe(nextTarget);
  room.command(guesser, { type: "CALL", round: 1, target });
  expect(() =>
    room.command(tokens[1], {
      type: "CALL",
      round: 1,
      target: room.file.players[2].id,
    }),
  ).toThrow();
  room.command(guesser, { type: "CHALLENGE", round: 1, target });
  expect(room.snapshot(tokens[1]).callout).toBeUndefined();
  expect(() =>
    room.command(guesser, { type: "CALL", round: 1, target }),
  ).toThrow();
});
it("皇冠每人每轮一次且只在揭晓，计票及重连不改引擎任何状态", () => {
  const { room, tokens, guesser } = setup();
  const target = room.file.players[1].id;
  expect(() =>
    room.command(guesser, { type: "CROWN", round: 1, target }),
  ).toThrow();
  room.command(guesser, {
    type: "GUESS",
    round: 1,
    target: room.file.state!.truth,
  });
  const before = JSON.stringify(room.file.state);
  for (const token of tokens)
    room.command(token, { type: "CROWN", round: 1, target });
  expect(room.snapshot(guesser).crownTotals![target]).toBe(3);
  expect(() =>
    room.command(guesser, { type: "CROWN", round: 1, target }),
  ).toThrow();
  expect(JSON.stringify(room.file.state)).toBe(before);
  expect(
    new XBRoom("UIV333", JSON.parse(JSON.stringify(room.file))).snapshot(
      guesser,
    ).myCrownVote,
  ).toBe(target);
});
it("同步9秒窗口和揭晓时刻存档，房主可设30/60/不限且普通人不能改", () => {
  const room = new XBRoom("UIV334"),
    a = room.join("甲"),
    b = room.join("乙");
  room.join("丙");
  expect(() => room.command(b, { type: "SET_SPEECH", seconds: 30 })).toThrow();
  room.command(a, { type: "SET_SPEECH", seconds: 60 });
  expect(() =>
    room.command(a, { type: "SET_SPEECH", seconds: 20 as any }),
  ).toThrow();
  const now = Date.now();
  room.command(a, { type: "START" });
  expect(room.snapshot(a).readUntil).toBeGreaterThanOrEqual(now + 9000);
  expect(room.snapshot(a).readUntil).toBe(room.snapshot(b).readUntil);
  expect(room.snapshot(b).speechSeconds).toBe(60);
  room.command(a, { type: "GUESS", round: 1, target: room.file.state!.truth });
  const restored = new XBRoom("UIV334", JSON.parse(JSON.stringify(room.file)));
  expect(restored.snapshot(a).revealAt).toBeGreaterThanOrEqual(now);
  expect(() => room.command(a, { type: "SET_SPEECH", seconds: 30 })).toThrow();
});
