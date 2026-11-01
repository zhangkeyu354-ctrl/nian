import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NDRoom } from "../src/nd-rooms.ts";
import type { NDAction } from "../../../packages/shared/src/nd-protocol.ts";

const room = () =>
  NDRoom.create("ABCD", mkdtempSync(join(tmpdir(), "nd-unit-")), {
    allowFixedSeed: true,
    clock: () => 1000,
  });
function setup(n = 4, settings: Record<string, unknown> = {}) {
  const r = room();
  const claims = [r.claim("玩家0")];
  act(r, claims[0].token, {
    type: "SET_SETTINGS",
    count: n,
    ...settings,
  } as NDAction);
  for (let i = 1; i < n; i++) claims.push(r.claim("玩家" + i));
  return { r, claims };
}
function act(
  r: NDRoom,
  token: string,
  action: NDAction,
  now = 1000,
  version = r.file.version,
) {
  const me = r.me(token)!;
  return r.action(
    token,
    version,
    (r.file.seq[me.id] ?? 0) + 1,
    action,
    now,
    r.file.state?.round,
  );
}
function start(n = 4, settings: Record<string, unknown> = {}) {
  const x = setup(n, settings);
  for (const p of x.claims) act(x.r, p.token, { type: "READY" });
  act(x.r, x.claims[0].token, { type: "START", seed: 11 });
  return x;
}
function choose(x: ReturnType<typeof start>) {
  act(x.r, x.claims[0].token, {
    type: "CHOOSE_TOPIC",
    topicId: x.r.file.state!.topicCards[0].questions[0].id,
  });
}
describe("ND rooms", () => {
  it("defaults match cooperative rules and counts are validated", () => {
    const r = room();
    expect(r.file.settings).toEqual({
      count: 4,
      seconds: 0,
      scale: "open",
      expert: false,
      firstCaptain: 0,
    });
    const p = r.claim("  房主  ");
    expect(r.me(p.token)?.name).toBe("房主");
    expect(() => act(r, p.token, { type: "SET_SETTINGS", count: 3 })).toThrow();
  });
  it("only host changes settings or starts; changing settings clears readiness", () => {
    const { r, claims } = setup();
    act(r, claims[1].token, { type: "READY" });
    expect(() =>
      act(r, claims[1].token, { type: "SET_SETTINGS", seconds: 60 }),
    ).toThrow(/房主/);
    act(r, claims[0].token, { type: "SET_SETTINGS", seconds: 60 });
    expect(r.file.players.every((p) => !p.ready)).toBe(true);
    expect(() => act(r, claims[0].token, { type: "START" })).toThrow();
  });
  it("normal settings only deal non-spicy and reject nine-player expert", () => {
    const { r, claims } = start(6, { scale: "normal" });
    expect(
      r.file
        .state!.topicCards.flatMap((c) => c.questions)
        .every((q) => !q.spicy),
    ).toBe(true);
    expect(() => setup(9, { expert: true })).toThrow(/9/);
    expect(() =>
      act(r, claims[0].token, { type: "SET_SETTINGS", scale: "open" }),
    ).toThrow();
  });
  it("refuses production fixed seeds", () => {
    const { r, claims } = setup();
    r.options.allowFixedSeed = false;
    for (const p of claims) act(r, p.token, { type: "READY" });
    expect(() => act(r, claims[0].token, { type: "START", seed: 42 })).toThrow(
      /种子/,
    );
  });
  it("binds rules to token seat and rejects actor/time/text injection", () => {
    const x = start();
    choose(x);
    for (const extra of [
      { seat: 0 },
      { actor: "server" },
      { now: 9e15 },
      { answerText: "secret" },
      { seq: 99 },
    ])
      expect(() =>
        act(x.r, x.claims[1].token, {
          type: "READY",
          ...extra,
        } as unknown as NDAction),
      ).toThrow();
    expect(() => act(x.r, "bad-token", { type: "READY" })).toThrow();
  });
  it("same seq and payload retries are idempotent; changed payload reuse is rejected", () => {
    const { r, claims } = setup(),
      token = claims[0].token,
      seq = r.file.seq[claims[0].playerId] + 1,
      version = r.file.version;
    const action = { type: "READY" } as const;
    r.action(token, version, seq, action, 1000);
    const before = structuredClone(r.file);
    expect(r.action(token, version, seq, action, 1000).changed).toBe(false);
    expect(r.file).toEqual(before);
    expect(() =>
      r.action(
        token,
        version,
        seq,
        { type: "SET_SETTINGS", seconds: 60 },
        1000,
      ),
    ).toThrow(/序号/);
  });
  it("same-round concurrent submissions accept stale versions without losing cards", () => {
    const x = start();
    choose(x);
    const version = x.r.file.version;
    act(
      x.r,
      x.claims[1].token,
      { type: "SUBMIT_ANSWER", text: "第一张" },
      1000,
      version,
    );
    act(
      x.r,
      x.claims[2].token,
      { type: "SUBMIT_ANSWER", text: "第二张" },
      1000,
      version,
    );
    expect(x.r.file.state!.ready).toEqual([1, 2]);
    expect(() =>
      x.r.action(
        x.claims[3].token,
        x.r.file.version,
        2,
        { type: "SUBMIT_ANSWER", text: "跨轮" },
        1000,
        2,
      ),
    ).toThrow();
  });
  it("answer deadline fills missing cards once and retains submitted text, numbers and tokens", () => {
    const x = start(4, { seconds: 60 });
    choose(x);
    act(x.r, x.claims[1].token, { type: "SUBMIT_ANSWER", text: "已提交" });
    const numbers = [...x.r.file.state!.numbers],
      deadline = x.r.file.deadline!;
    expect(deadline).toBe(61000);
    expect(x.r.tick(deadline - 1)).toBe(false);
    expect(x.r.tick(deadline)).toBe(true);
    expect(x.r.file.state!.phase).toBe("ORDER");
    expect(x.r.file.state!.answers).toEqual([
      null,
      "已提交",
      "（没写）",
      "（没写）",
    ]);
    expect(x.r.file.state!.numbers).toEqual(numbers);
    expect(x.r.file.state!.unicorns).toBe(4);
    expect(x.r.tick(deadline + 1)).toBe(false);
  });
  it("no timer means no deadline and no fabricated timeout action", () => {
    const x = start();
    choose(x);
    expect(x.r.file.deadline).toBeNull();
    expect(x.r.tick(1e15)).toBe(false);
    expect(() =>
      act(x.r, x.claims[0].token, { type: "TIMEOUT" } as unknown as NDAction),
    ).toThrow();
  });
  it("round phase change resets deadline but partial ready does not", () => {
    const x = start(4, { seconds: 60 });
    choose(x);
    const old = x.r.file.deadline;
    act(x.r, x.claims[1].token, { type: "SUBMIT_ANSWER", text: "先写" }, 2000);
    expect(x.r.file.deadline).toBe(old);
    for (let i = 2; i < 4; i++)
      act(
        x.r,
        x.claims[i].token,
        { type: "SUBMIT_ANSWER", text: `回答${i}` },
        3000,
      );
    expect(x.r.file.deadline).toBe(63000);
    expect(x.r.file.expired).toBe(false);
  });
  it("persisted token restores private number, readiness and locked order exactly", () => {
    const x = start();
    choose(x);
    for (let i = 1; i < 4; i++)
      act(x.r, x.claims[i].token, { type: "SUBMIT_ANSWER", text: `回答${i}` });
    act(x.r, x.claims[0].token, { type: "LOCK_ORDER", order: [3, 1, 2] });
    const file = JSON.parse(
      readFileSync(join(x.r.directory, "ABCD.json"), "utf8"),
    );
    const restored = new NDRoom(file, x.r.directory, x.r.options);
    expect(restored.snapshot(x.claims[2].token, 1000).view).toEqual(
      x.r.snapshot(x.claims[2].token, 1000).view,
    );
    expect(restored.file.state!.order).toEqual([3, 1, 2]);
    expect(() =>
      act(restored, x.claims[0].token, {
        type: "LOCK_ORDER",
        order: [0, 1, 2, 3],
      }),
    ).toThrow();
  });
  it("public snapshot never contains tokens, internal seq receipts or hidden number arrays", () => {
    const x = start();
    choose(x);
    const snapshot = x.r.snapshot(x.claims[1].token, 1000);
    expect(snapshot.mySeat).toBe(1);
    expect(snapshot.view!.myNumber).toBe(x.r.file.state!.numbers[1]);
    expect(snapshot.players.every((p) => !("token" in p))).toBe(true);
    expect(snapshot.view).not.toHaveProperty("numbers");
    expect(x.r.snapshot(undefined, 1000).view).toBeNull();
  });
  it("save failures roll back version, seq and game state", () => {
    const { r, claims } = setup();
    const before = structuredClone(r.file);
    const broken = join(r.directory, "not-a-directory");
    writeFileSync(broken, "x");
    r.directory = broken;
    expect(() => act(r, claims[0].token, { type: "READY" })).toThrow(/保存/);
    expect(r.file).toEqual(before);
  });
  it("invalid settings leave the whole file unchanged", () => {
    const { r, claims } = setup();
    for (const settings of [
      { seconds: 1 },
      { scale: "x" },
      { expert: "yes" },
      { firstCaptain: 12 },
      { count: 2 },
    ]) {
      const before = structuredClone(r.file);
      expect(() =>
        act(r, claims[0].token, {
          type: "SET_SETTINGS",
          ...settings,
        } as NDAction),
      ).toThrow();
      expect(r.file).toEqual(before);
    }
  });
  it("restored expired deadline does not repeat the timeout or lose a submitted answer", () => {
    const x = start(4, { seconds: 60 });
    choose(x);
    act(x.r, x.claims[1].token, { type: "SUBMIT_ANSWER", text: "重连保留" });
    x.r.tick(x.r.file.deadline!);
    const saved = JSON.parse(
      readFileSync(join(x.r.directory, "ABCD.json"), "utf8"),
    );
    const restored = new NDRoom(saved, x.r.directory, x.r.options);
    expect(restored.tick(restored.file.deadline! - 1)).toBe(false);
    expect(restored.file.timeoutCount).toBe(1);
    expect(restored.file.state!.ready).toEqual([1, 2, 3]);
    expect(restored.file.state!.answers[1]).toBe("重连保留");
  });
  it("lobby leave removes only that seat credential and its command records", () => {
    const { r, claims } = setup();
    act(r, claims[1].token, { type: "LEAVE" });
    expect(r.me(claims[1].token)).toBeUndefined();
    expect(r.file.players).toHaveLength(3);
    expect(r.file.seq).not.toHaveProperty(claims[1].playerId);
    expect(r.file.receipts).not.toHaveProperty(claims[1].playerId);
    r.validate();
  });
  it("a failed team game can rematch without resetting the external sequence", () => {
    const x = start();
    let steps = 0;
    while (x.r.file.state!.phase !== "FINISHED") {
      expect(steps++).toBeLessThan(100);
      const s = x.r.file.state!,
        capt = s.captain;
      if (s.phase === "CHOOSE_TOPIC")
        act(x.r, x.claims[capt].token, {
          type: "CHOOSE_TOPIC",
          topicId: s.topicCards[s.round - 1].questions[0].id,
        });
      else if (s.phase === "ANSWER") {
        const seat = s.players.findIndex(
          (_, i) => i !== capt && !s.ready.includes(i),
        );
        act(x.r, x.claims[seat].token, {
          type: "SUBMIT_ANSWER",
          text: `回答${seat}`,
        });
      } else if (s.phase === "ORDER")
        act(x.r, x.claims[capt].token, {
          type: "LOCK_ORDER",
          order: s.players
            .map((_, i) => i)
            .filter((i) => i !== capt)
            .sort((a, b) => s.numbers[b]! - s.numbers[a]!),
        });
      else if (s.phase === "REVEAL")
        act(x.r, x.claims[capt].token, { type: "REVEAL_NEXT" });
      else if (s.phase === "ROUND_END")
        act(x.r, x.claims[capt].token, { type: "NEXT_ROUND" });
    }
    expect(x.r.file.state!.result!.success).toBe(false);
    const previous = x.r.file.seq[x.claims[0].playerId];
    expect(() => act(x.r, x.claims[1].token, { type: "REMATCH" })).toThrow(
      /房主/,
    );
    act(x.r, x.claims[0].token, { type: "REMATCH" });
    expect(x.r.file.state).toBeNull();
    expect(x.r.file.seq[x.claims[0].playerId]).toBe(previous + 1);
    expect(x.r.file.players.every((p) => !p.ready)).toBe(true);
  });
});
