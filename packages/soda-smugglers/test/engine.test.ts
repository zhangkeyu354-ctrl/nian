import { expect, it } from "vitest";
import {
  createSS,
  reduceSS,
  viewForSS,
  bottlesSS,
  assertInvariants,
  type SSState,
  type Command,
} from "../src/index.ts";
import { game, act, pack, withHands } from "./helpers.ts";
it("R10-R12,R30-R33: pure locked choices, idempotency and no premature secrets", () => {
  const s = game();
  const before = structuredClone(s);
  const h = s.players[1].hand;
  const cmd: Command = {
    type: "SUBMIT",
    actor: 1,
    seq: 1,
    now: 1000,
    luggage: h.slice(0, 2),
    bribe: h[2],
  };
  const a = reduceSS(s, cmd);
  expect(s).toEqual(before);
  expect(a.phase).toBe("PACK");
  expect(viewForSS(a, 0).players[1].luggage).toEqual([null, null]);
  expect(viewForSS(a, 0).players[1].bribe).toBeNull();
  expect(viewForSS(a, 0).players[1].hand).toBeUndefined();
  expect(viewForSS(a, 1).players[1].luggage[0]).toHaveProperty("id");
  expect(reduceSS(a, cmd)).toEqual(a);
  expect(() => act(a, { ...cmd, seq: 2 }, 1)).toThrow();
  expect(() =>
    act(s, { type: "SUBMIT", luggage: [h[0], h[0]], bribe: h[2] }, 1),
  ).toThrow("重复");
  expect(() =>
    act(s, { type: "SUBMIT", luggage: h.slice(0, 2), bribe: h[2] }, 0),
  ).toThrow("旅客");
  const b = pack(a);
  expect(b.phase).toBe("BRIBE");
  expect(viewForSS(b, 0).players[1].bribe).not.toBeNull();
  const v = viewForSS(b, 1);
  v.players[0].caps = 999;
  expect(b.players[0].caps).toBe(10);
});
it("R14-R26: accept bribe pays personal caps, release cashes only luggage once", () => {
  let s = withHands(game(), [[], [2, 3, 1, 0, 0], [0, 1, 3, 2, 2]]);
  s = pack(s);
  expect(() => act(s, { type: "ARREST", target: 1 })).toThrow("逮捕阶段");
  s = act(s, { type: "ACCEPT", target: 1 });
  expect(s.players.map((p) => p.caps)).toEqual([11, 14, 10]);
  expect(s.players[1].settled).toBe(true);
  // 受贿筹码用完，自动进入检查阶段
  expect(s.phase).toBe("INSPECT");
  expect(() => act(s, { type: "INSPECT", target: 1, index: 0 })).toThrow(
    "结算",
  );
  s = act(s, { type: "INSPECT", target: 2, index: 1 });
  expect(viewForSS(s, 0).players[2].luggage).toEqual([
    null,
    { index: 1, bottles: 1 },
  ]);
  expect(s.phase).toBe("ARREST");
  expect(() => act(s, { type: "INSPECT", target: 2, index: 0 })).toThrow();
  s = act(s, { type: "ARREST", target: 2 });
  expect(s.players.map((p) => p.caps)).toEqual([9, 14, 13]);
  expect(s.history.at(-1)).toMatchObject({
    type: "WRONGFUL",
    penalty: 2,
    amount: 1,
  });
  expect(s.phase).toBe("ROUND_END");
  expect(() => act(s, { type: "ARREST", target: 2 })).toThrow();
});
it("R18,R22,R24: zero bribe acceptance and full confiscation excluding bribe", () => {
  let s = pack(withHands(game(), [[], [3, 2, 3, 0, 0], [0, 0, 0, 1, 1]]));
  s = act(s, { type: "ACCEPT", target: 2 });
  expect(s.players[0].caps).toBe(10);
  s = act(s, { type: "ADVANCE" });
  s = act(s, { type: "ARREST", target: 1 });
  expect(s.players[0].caps).toBe(15);
  expect(s.players[1].caps).toBe(10);
});
it("HR-SS-01: both bribe and wrongful payment clip at zero, never create debt", () => {
  let s = pack(withHands(game(), [[], [0, 0, 3, 1, 1], [0, 0, 1, 2, 2]]));
  s.bank += 9;
  s.players[1].caps = 1;
  s = act(s, { type: "ACCEPT", target: 1 });
  expect(s.players[1].caps).toBe(0);
  expect(s.players[0].caps).toBe(11);
  s.bank += 10;
  s.players[0].caps = 1;
  s = act(s, { type: "ADVANCE" });
  s = act(s, { type: "ARREST", target: 2 });
  expect(s.players[0].caps).toBe(0);
  expect(s.players[2].caps).toBe(11);
  assertInvariants(s);
});
it("R27-R29: clockwise rotation, exact rounds and shared ties", () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    let s = game(n);
    const guards: number[] = [];
    while (s.phase !== "FINISHED") {
      guards.push(s.guard);
      s = pack(s);
      s = act(act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" }), {
        type: "ADVANCE",
      });
      if (s.phase === "ROUND_END") s = act(s, { type: "NEXT_ROUND" });
    }
    expect(guards).toEqual(
      Array.from({ length: n * (n <= 4 ? 2 : 1) }, (_, i) => i % n),
    );
    expect(s.result?.scores).toEqual(s.players.map((p) => p.caps));
  }
  let s = game();
  s.round = s.totalRounds;
  s = pack(s);
  s = act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" });
  // Force tie only through a valid value-ledger fixture before final automatic releases.
  const totals = s.players.map((p) =>
    p.luggage.reduce((a, id) => a + bottlesSS(id), 0),
  );
  s.players.forEach((p, i) => (p.caps = 20 - (i === s.guard ? 0 : totals[i])));
  s.bank = 422 - s.players.reduce((a, p) => a + p.caps, 0);
  s = act(s, { type: "ADVANCE" });
  expect(s.result?.winners).toEqual([0, 1, 2]);
});
it("R34: only server can time out; preserve submitted luggage and deadline", () => {
  let s = createSS(["a", "b", "c"], { seed: 1, seconds: 60, now: 1000 });
  const h = s.players[1].hand;
  s = act(s, { type: "SUBMIT", luggage: h.slice(0, 2), bribe: h[2] }, 1);
  const locked = [...s.players[1].luggage];
  expect(() => act(s, { type: "TIMEOUT" }, "server", 60000)).toThrow(
    "尚未到时",
  );
  expect(() => act(s, { type: "TIMEOUT" }, 1, 61000)).toThrow("服务器");
  s = act(s, { type: "TIMEOUT" }, "server", 61000);
  expect(s.players[1].luggage).toEqual(locked);
  expect(s.phase).toBe("BRIBE");
  expect(s.deadline).toBe(121000);
  s = act(s, { type: "TIMEOUT" }, "server", 121000);
  expect(s.phase).toBe("INSPECT");
});

it("auto-advance: a stage with no usable token is skipped, choices are never made for the guard", () => {
  let s = pack(game());
  expect(s.phase).toBe("BRIBE");
  s = act(s, { type: "ACCEPT", target: 1 });
  expect(s.phase).toBe("INSPECT");
  s = act(s, { type: "INSPECT", target: 2, index: 0 });
  expect(s.phase).toBe("ARREST");
  expect(s.players[2].settled).toBe(false);
  s = act(s, { type: "ADVANCE" });
  expect(s.phase).toBe("ROUND_END");
});
