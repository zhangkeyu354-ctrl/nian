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
it("旧小抄命令被拒绝，旧存档的小抄不再向任何客户端发送", () => {
  const { room, tokens, guesser } = setup();
  const target = room.file.players[1].id;
  expect(() =>
    room.command(guesser, {
      type: "NOTE",
      round: 1,
      target,
      tag: "suspect",
    } as any),
  ).toThrow();
  (room.file.aids as any).notes = {
    1: { round: 1, tags: { [target]: "suspect" } },
  };
  for (const token of [...tokens, undefined]) {
    expect(room.snapshot(token)).not.toHaveProperty("privateNotes");
    expect(room.snapshot(token)).not.toHaveProperty("revealedNotes");
  }
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

it("申请换词不泄密、不改积分：去重、房主确认、同步阅读、旧词去重和刷新恢复", () => {
  const { room, tokens, guesser } = setup();
  const old = structuredClone(room.file.state!);
  expect(() =>
    room.command(guesser, { type: "SWAP_TOPIC", round: 1 }),
  ).toThrow();
  room.command(tokens[1], { type: "REQUEST_WORD", round: 1 });
  expect(() =>
    room.command(tokens[1], { type: "REQUEST_WORD", round: 1 }),
  ).toThrow();
  expect(() =>
    room.command(tokens[1], { type: "SWAP_TOPIC", round: 1 }),
  ).toThrow();
  expect(room.file.state).toEqual(old);
  const requester = room.file.players[1].id;
  expect(room.snapshot(tokens[2]).wordRequests).toEqual([requester]);
  const before = Date.now();
  room.command(guesser, { type: "SWAP_TOPIC", round: 1 });
  expect(room.file.state!.topic.id).not.toBe(old.topic.id);
  expect(room.file.state!.scores).toEqual(old.scores);
  expect(room.file.state!.truth).toBe(old.truth);
  expect(room.snapshot(guesser).readUntil).toBeGreaterThanOrEqual(
    before + 9000,
  );
  expect(room.snapshot(guesser).wordRequests).toEqual([]);
  const restored = new XBRoom("UIV333", JSON.parse(JSON.stringify(room.file)));
  for (const t of tokens)
    expect(restored.snapshot(t).readUntil).toBe(room.snapshot(t).readUntil);
  expect(restored.availableTopics().some((t) => t.id === old.topic.id)).toBe(
    false,
  );
  const truthToken = tokens.find((t) => room.player(t)!.id === old.truth)!;
  for (const t of tokens)
    expect(!!room.snapshot(t).view!.answer).toBe(t === truthToken);
  room.command(guesser, { type: "CHALLENGE", round: 1, target: requester });
  expect(() =>
    room.command(tokens[2], { type: "REQUEST_WORD", round: 1 }),
  ).toThrow();
});
