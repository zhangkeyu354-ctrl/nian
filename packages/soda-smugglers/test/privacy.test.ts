import { expect, it } from "vitest";
import {
  assertInvariants,
  bottlesSS,
  createSS,
  reduceSS,
  viewForSS,
  type Command,
  type SSState,
} from "../src/index.ts";
import { act, game, pack, withHands } from "./helpers.ts";
it("R30-R31 privacy: changing a hidden hand, discarded card or future event never changes opponent view", () => {
  let s = game(5, 99, true);
  const original = viewForSS(s, 0);
  const t = structuredClone(s);
  [t.players[1].hand[0], t.deck[0]] = [t.deck[0], t.players[1].hand[0]];
  t.eventDeck.reverse();
  t.random = 345;
  expect(viewForSS(t, 0)).toEqual(original);
  const own = 1;
  const h = s.players[own].hand;
  s = act(
    s,
    {
      type: "SUBMIT",
      luggage: h.slice(0, s.event === "holiday" ? 3 : 2),
      bribe: h[s.event === "holiday" ? 3 : 2],
    },
    own,
  );
  const a = viewForSS(s, 0);
  const b = structuredClone(s);
  [b.players[1].luggage[0], b.discard[0]] = [
    b.discard[0],
    b.players[1].luggage[0],
  ];
  expect(viewForSS(b, 0)).toEqual(a);
  expect(JSON.stringify(a.history)).not.toMatch(/SS[0-3]-/);
  s = pack(s);
  s = act(s, { type: "ADVANCE" });
  s = act(s, { type: "INSPECT", target: 1, index: 0 });
  const inspected = viewForSS(s, 0);
  const u = structuredClone(s);
  [u.players[1].luggage[1], u.discard[0]] = [
    u.discard[0],
    u.players[1].luggage[1],
  ];
  expect(viewForSS(u, 0)).toEqual(inspected);
  for (const seat of [-1, 0, 2, 3, 4]) {
    const v = viewForSS(s, seat);
    expect(v.players[1].hand).toBeUndefined();
    expect(v.players[1].luggage[1]).toBeNull();
    expect(v).not.toHaveProperty("seq");
    expect(v).not.toHaveProperty("eventDeck");
  }
});
it("invariants reject duplicated or missing cards, negative money, lost value and duplicate events", () => {
  const s = game(3, 1, true);
  const a = structuredClone(s);
  a.deck[0] = a.players[1].hand[0];
  expect(() => assertInvariants(a)).toThrow("36张牌");
  const b = structuredClone(s);
  b.players[0].caps = -1;
  expect(() => assertInvariants(b)).toThrow("负数");
  const c = structuredClone(s);
  c.bank++;
  expect(() => assertInvariants(c)).toThrow("422");
  const d = structuredClone(s);
  d.eventDeck[0] = d.event!;
  expect(() => assertInvariants(d)).toThrow("事件牌");
});
it("HR-SS-01 bank payouts are capped too; no overdraft and no invented caps", () => {
  let s = pack(withHands(game(), [[], [3, 3, 1, 0, 0], [1, 2, 2, 0, 0]]));
  // Exhaust bank into guard's public account in a conserving fixture.
  s.players[0].caps += s.bank - 1;
  s.bank = 1;
  s = act(s, { type: "ACCEPT", target: 1 });
  expect(s.bank).toBe(0);
  expect(s.players[1].caps).toBe(10);
  s = act(act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" }), {
    type: "ADVANCE",
  });
  expect(s.players[2].caps).toBe(10);
  assertInvariants(s);
});
it("sequence retry cannot double-charge or consume another action", () => {
  let s = pack(game());
  const c: Command = {
    type: "ACCEPT",
    actor: s.guard,
    seq: 1,
    now: 1000,
    target: 1,
  };
  s = reduceSS(s, c);
  const after = structuredClone(s);
  expect(reduceSS(s, c)).toEqual(after);
  expect(() => act(s, { type: "ADVANCE" }, 1)).toThrow("警长");
  expect(() => act(s, { type: "ADVANCE" }, "server")).toThrow("代替玩家");
  const bad = structuredClone(s);
  expect(() =>
    reduceSS(bad, {
      ...c,
      seq: 2,
      target: 2,
      useEvent: "yes",
    } as unknown as Command),
  ).toThrow("参数");
  expect(bad).toEqual(s);
});
it("random first guard is seeded and always a real seat, explicit selection still wins", () => {
  const seats = new Set<number>();
  for (let seed = 0; seed < 100; seed++) {
    const a = createSS(["a", "b", "c"], { seed, firstGuard: "random" });
    expect(a).toEqual(
      createSS(["a", "b", "c"], { seed, firstGuard: "random" }),
    );
    seats.add(a.guard);
  }
  expect([...seats].sort()).toEqual([0, 1, 2]);
  expect(createSS(["a", "b", "c"], { seed: 0, firstGuard: 2 }).guard).toBe(2);
  for (const options of [
    { seed: -1 },
    { seed: 1, firstGuard: 3 },
    { seed: 1, seconds: 5 },
  ])
    expect(() => createSS(["a", "b", "c"], options as never)).toThrow();
});
it("dog reveal follows the maximum rule, normal tokens cannot inspect a second box", () => {
  let s: SSState | undefined;
  for (let seed = 1; seed < 100; seed++) {
    const candidate = createSS(["a", "b", "c"], {
      seed,
      events: true,
      seconds: 60,
      now: 1000,
    });
    if (candidate.event === "dog") {
      s = candidate;
      break;
    }
  }
  expect(s).toBeDefined();
  let t = pack(s!);
  t = act(t, { type: "ADVANCE" });
  t = act(t, { type: "INSPECT", target: 1, useEvent: true });
  const max = Math.max(...t.players[1].luggage.map(bottlesSS));
  const i = t.players[1].revealed[0];
  expect(bottlesSS(t.players[1].luggage[i])).toBe(max);
  expect(t.pendingDog).toBe(null);
  expect(() =>
    act(t, { type: "INSPECT", target: 1, index: 1 - i }, 0, 1000),
  ).toThrow("一个手提箱");
});
it("timeout skips each guard stage then releases all; unlimited games reject timeout", () => {
  let s = createSS(["a", "b", "c"], { seed: 1, seconds: 60, now: 1000 });
  s = pack(s);
  for (const now of [61000, 121000, 181000])
    s = act(s, { type: "TIMEOUT" }, "server", now);
  expect(s.phase).toBe("ROUND_END");
  expect(s.players.slice(1).every((p) => p.settled)).toBe(true);
  expect(() => act(game(), { type: "TIMEOUT" }, "server", 1e9)).toThrow(
    "未启用",
  );
});
