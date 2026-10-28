import { expect, it } from "vitest";
import {
  EVENTS,
  createSS,
  reduceSS,
  viewForSS,
  bottlesSS,
  assertInvariants,
  type EventId,
} from "../src/index.ts";
import { game, act, pack, withHands } from "./helpers.ts";
function eventGame(event: EventId, n = 3) {
  for (let seed = 1; seed <= 1000; seed++) {
    const s = game(n, seed, true);
    if (s.event === event) return s;
  }
  throw Error("missing event seed");
}
it("E01 生日礼物: 2 bank caps and legal two bottles still receive normal compensation", () => {
  let s = eventGame("birthday");
  expect(s.players[0].caps).toBe(12);
  expect(s.bank).toBe(390);
  s = pack(withHands(s, [[], [1, 1, 3, 0, 0], [2, 1, 2, 0, 0]]));
  s = act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" });
  s = act(s, { type: "ARREST", target: 1 });
  expect(s.players[1].caps).toBe(14);
  expect(s.players[0].caps).toBe(10);
});
it("E02 假日狂欢: three luggage cards from five, one bribe, one discard; total limit stays one", () => {
  let s = eventGame("holiday");
  s = withHands(s, [[], [1, 0, 1, 3, 0], [0, 0, 1, 3, 2]]);
  s = pack(s);
  expect(s.players[1].luggage).toHaveLength(3);
  expect(s.discard).toHaveLength(2);
  s = act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" });
  s = act(s, { type: "ARREST", target: 1 });
  expect(s.players[0].caps).toBe(12);
});
it("E03 领导视察: one bonus inspection may reveal the same traveler's second suitcase", () => {
  let s = pack(eventGame("inspection"));
  s = act(s, { type: "ADVANCE" });
  s = act(s, { type: "INSPECT", target: 1, index: 0 });
  s = act(s, { type: "INSPECT", target: 1, index: 1, useEvent: true });
  expect(s.players[1].revealed).toEqual([0, 1]);
  // 两次检查都用完，自动进入逮捕阶段，不能再检查
  expect(s.phase).toBe("ARREST");
  expect(() =>
    act(s, { type: "INSPECT", target: 2, index: 0, useEvent: true }),
  ).toThrow();
});
it("E04 破釜沉舟: pay normal arrest count into bank, zero bottle threshold", () => {
  let s = eventGame("desperate", 5);
  expect(s.players[0].caps).toBe(8);
  expect(s.bank).toBe(374);
  s = pack(
    withHands(s, [
      [],
      [1, 0, 0, 0, 0],
      [0, 0, 1, 1, 1],
      [0, 0, 1, 1, 1],
      [0, 0, 1, 1, 1],
    ]),
  );
  s = act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" });
  s = act(s, { type: "ARREST", target: 1 });
  expect(s.players[0].caps).toBe(9);
  expect(s.history.at(-1)?.type).toBe("CONFISCATE");
  s = act(s, { type: "ARREST", target: 2 });
  expect(s.players[0].caps).toBe(7);
  expect(s.players[2].caps).toBe(12);
});
it("E05 贪得无厌: accept all then finish round, or use ordinary limited actions", () => {
  let s = pack(eventGame("greedy", 8));
  s = act(s, { type: "GREEDY" });
  expect(
    s.players.filter((_, i) => i !== s.guard).every((p) => p.settled),
  ).toBe(true);
  expect(s.phase).toBe("ROUND_END");
  expect(s.history.filter((a) => a.type === "ACCEPT")).toHaveLength(7);
  let t = pack(eventGame("greedy"));
  t = act(t, { type: "ACCEPT", target: 1 });
  expect(() => act(t, { type: "GREEDY" })).toThrow("之前");
  t = act(t, { type: "ADVANCE" });
  t = act(t, { type: "INSPECT", target: 2, index: 0 });
  expect(t.players[2].revealed).toEqual([0]);
});
it("E06 铁面无私: bonus arrest only waives wrongful 2, traveler still receives legal bottle", () => {
  let s = pack(
    withHands(eventGame("impartial"), [[], [0, 1, 3, 0, 0], [0, 0, 1, 2, 2]]),
  );
  s = act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" });
  s = act(s, { type: "ARREST", target: 1, useEvent: true });
  expect(s.players.map((p) => p.caps)).toEqual([10, 11, 10]);
  expect(s.budget.arrest).toBe(1);
  s = act(s, { type: "ARREST", target: 2 });
  expect(s.players[0].caps).toBe(8);
  expect(s.players[2].caps).toBe(12);
});
it("E07 起早贪黑: optional extra bribe, usable once and before inspecting", () => {
  let s = pack(eventGame("night"));
  s = act(s, { type: "ACCEPT", target: 1 });
  s = act(s, { type: "ACCEPT", target: 2, useEvent: true });
  expect(s.players[2].settled).toBe(true);
  expect(s.eventUsed).toBe(true);
});
it("E08 缉私犬长: server reveals the maximal suitcase at once; tie hides equality", () => {
  let s = pack(
    withHands(eventGame("dog"), [[], [1, 3, 0, 0, 0], [2, 2, 1, 0, 0]]),
  );
  s = act(s, { type: "ADVANCE" });
  s = act(s, { type: "INSPECT", target: 1, useEvent: true });
  expect(s.pendingDog).toBe(null);
  expect(viewForSS(s, 0).players[1].luggage).toEqual([
    null,
    { index: 1, bottles: 3 },
  ]);
  expect(s.budget.inspect).toBe(1);
  expect(() => act(s, { type: "INSPECT", target: 1, index: 0 })).toThrow(
    "一个手提箱",
  );
  let t = pack(
    withHands(eventGame("dog"), [[], [2, 2, 0, 0, 0], [1, 1, 1, 0, 0]]),
  );
  t = act(t, { type: "ADVANCE" });
  t = act(t, { type: "INSPECT", target: 1, useEvent: true });
  expect(viewForSS(t, 0).players[1].luggage.filter(Boolean)).toHaveLength(1);
  expect(JSON.stringify(viewForSS(t, 0))).not.toMatch(
    /equal|maximum|seed|random|eventDeck|discard/,
  );
});
it("NEXT_ROUND can be pressed by any player so an absent guard never blocks the table", () => {
  let s = pack(eventGame("dog"));
  for (const _ of [0, 1, 2]) s = act(s, { type: "ADVANCE" });
  expect(s.phase).toBe("ROUND_END");
  const guard = s.guard;
  s = act(s, { type: "NEXT_ROUND" }, (guard + 1) % s.players.length);
  expect(s.round).toBe(2);
  expect(s.guard).toBe((guard + 1) % s.players.length);
});
it("E00 all 8 events drawn once, never shuffled again midgame", () => {
  let s = game(4, 17, true);
  const seen: EventId[] = [];
  while (s.phase !== "FINISHED") {
    seen.push(s.event!);
    s = pack(s);
    s = act(act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" }), {
      type: "ADVANCE",
    });
    if (s.phase === "ROUND_END") s = act(s, { type: "NEXT_ROUND" });
  }
  expect([...seen].sort()).toEqual([...EVENTS].sort());
  assertInvariants(s);
});
it("invalid and expired commands leave original state intact, cannot spend arbitrary event", () => {
  const s = pack(game());
  const copy = structuredClone(s);
  for (const body of [
    { type: "INSPECT", target: 1, index: 0 },
    { type: "ACCEPT", target: 0 },
    { type: "ACCEPT", target: 1, useEvent: true },
    { type: "BOGUS" },
  ]) {
    expect(() => act(s, body)).toThrow();
    expect(s).toEqual(copy);
  }
  expect(() =>
    reduceSS(s, { type: "ADVANCE", actor: s.guard, seq: 99, now: 1000 }),
  ).toThrow("序号不连续");
  expect(() =>
    reduceSS(s, { type: "ADVANCE", actor: NaN, seq: 1, now: 1000 }),
  ).toThrow("座位");
});
