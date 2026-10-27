import { describe, it, expect } from "vitest";
import {
  createRK,
  createTiles,
  validateMeld,
  reduceRK,
  viewForRK,
  assertInvariants,
  validateTurn,
  scoreGame,
  type RKState,
  type Command,
} from "../src/index.ts";
const game = (n = 2, seed = 1) =>
  createRK(
    Array.from({ length: n }, (_, i) => `玩家${i + 1}`),
    { seed, now: 1000, assertions: true },
  );
function fixture(
  hands: string[][],
  board: string[][] = [],
  opened = true,
): RKState {
  const s = game(hands.length);
  s.current = 0;
  const used = new Set([...hands.flat(), ...board.flat()]);
  s.players.forEach((p, i) => {
    p.rack = hands[i];
    p.opened = opened;
  });
  s.board = board.map((tiles, i) => ({ id: `m${i}`, tiles }));
  s.nextMeld = board.length;
  s.pool = createTiles()
    .map((t) => t.id)
    .filter((id) => !used.has(id));
  s.turn = {
    rack: [...hands[0]],
    board: structuredClone(s.board),
    retrieved: [],
  };
  s.draft = structuredClone(s.turn);
  s.undo = [];
  s.redo = [];
  assertInvariants(s);
  return s;
}
function act(
  s: RKState,
  body: Record<string, unknown>,
  actor: number | "server" = s.current,
): RKState {
  return reduceRK(s, {
    ...body,
    actor,
    seq: (s.seq[String(actor)] ?? 0) + 1,
    now: 1000,
  } as Command);
}
function place(s: RKState, tiles: string[], meld: string | null = null) {
  return act(s, { type: "MOVE", tiles, to: { meld } });
}
describe("RK creation and melds", () => {
  it("106 unique tiles and deterministic public start draw", () => {
    expect(new Set(createTiles().map((t) => t.id)).size).toBe(106);
    for (const n of [2, 3, 4]) {
      const s = game(n);
      expect(s.players.every((p) => p.rack.length === 14)).toBe(true);
      expect(s.pool.length).toBe(106 - 14 * n);
      expect(s.startDraw.length).toBeGreaterThanOrEqual(1);
      expect(game(n)).toEqual(s);
      assertInvariants(s);
    }
  });
  it("rejects unsupported players and malformed seed/settings", () => {
    expect(() => game(1)).toThrow();
    expect(() => game(5)).toThrow();
    expect(() => createRK(["a", "b"], { seed: NaN })).toThrow();
    expect(() =>
      createRK(["a", "b"], { seed: 1, minutes: 3 as any }),
    ).toThrow();
  });
  it("groups require distinct colors, runs have no wrapping or gaps", () => {
    expect(validateMeld(["R07a", "B07a", "K07b"]).length).toBe(1);
    for (const ids of [
      ["R07a", "R07b", "B07a"],
      ["R12a", "R13a", "R01a"],
      ["R05a", "R06a", "R08a"],
      ["J1", "J2"],
      ["bad", "R01a", "R02a"],
    ])
      expect(validateMeld(ids)).toEqual([]);
  });
  it("enumerates joker endpoints and colors without depending on order", () => {
    const all = validateMeld(["J1", "R06a", "R07a"]);
    expect(all.map((x) => x.jokers.J1.value).sort()).toEqual([5, 8]);
    expect(all[0].score).toBe(21);
    expect(validateMeld(["R06a", "R07a", "J1"])).toEqual(all);
    expect(
      validateMeld(["R07a", "B07a", "J1"])
        .map((x) => x.jokers.J1.color)
        .sort(),
    ).toEqual(["K", "O"]);
  });
  it("enumerates both jokers without duplicate color or value assignments", () => {
    expect(
      validateMeld(["R07a", "J1", "J2"]).filter((x) => x.kind === "group"),
    ).toHaveLength(6);
    expect(
      validateMeld(["R12a", "J1", "J2"])
        .filter((x) => x.kind === "run")
        .every((x) => Object.values(x.jokers).every((j) => j.value <= 13)),
    ).toBe(true);
    expect(validateMeld(["J1", "J1", "R07a"])).toEqual([]);
  });
});
describe("RK atomic drafts and privacy", () => {
  it("move/split/merge/undo/redo/reset do not mutate input or formal board", () => {
    const s = fixture([["R04a", "R05a", "R06a"], ["B01a"]]);
    const original = structuredClone(s);
    let d = place(s, s.players[0].rack);
    expect(s).toEqual(original);
    expect(d.board).toEqual([]);
    expect(d.draft.board).toHaveLength(1);
    d = act(d, { type: "SPLIT", meld: d.draft.board[0].id, at: 1 });
    expect(d.draft.board).toHaveLength(2);
    d = act(d, { type: "MERGE", melds: d.draft.board.map((m) => m.id) });
    expect(d.draft.board[0].tiles).toHaveLength(3);
    d = act(d, { type: "UNDO" });
    expect(d.draft.board).toHaveLength(2);
    d = act(d, { type: "REDO" });
    expect(d.draft.board).toHaveLength(1);
    d = act(d, { type: "RESET" });
    expect(d.draft.rack).toEqual(original.draft.rack);
    assertInvariants(d);
  });
  it("idempotently ignores already seen seq without resetting history", () => {
    const s = fixture([["R04a"], ["B01a"]]);
    const cmd = {
      type: "MOVE",
      actor: 0,
      seq: 1,
      now: 1000,
      tiles: ["R04a"],
      to: { meld: null },
    } as Command;
    const a = reduceRK(s, cmd);
    expect(reduceRK(a, cmd)).toBe(a);
    expect(() => reduceRK(s, { ...cmd, actor: 1 })).toThrow(/轮到/);
  });
  it("other views expose neither hands, draft, seed, history nor pool order", () => {
    const s = fixture([["R04a", "R05a", "R06a"], ["B01a"]]);
    const d = place(s, ["R04a"]);
    const other = viewForRK(d, 1);
    expect(other).toEqual(viewForRK(s, 1));
    const json = JSON.stringify(other);
    for (const secret of [
      "R04a",
      "R05a",
      "R06a",
      "seed",
      "undo",
      "draft",
      "retrieved",
    ])
      expect(json).not.toContain(secret);
    expect(viewForRK(d, 0).draft).toBeDefined();
    expect(() => viewForRK(s, 9)).toThrow();
  });
  it("cannot return old table tiles to rack and cannot edit initial table", () => {
    const s = fixture([["B04a"], ["K01a"]], [["R01a", "R02a", "R03a"]]);
    expect(() =>
      act(s, { type: "MOVE", tiles: ["R01a"], to: { rack: true } }),
    ).toThrow(/不能拿回手牌/);
    s.players[0].opened = false;
    expect(() => place(s, ["R01a"])).toThrow(/破冰/);
    expect(() => act(s, { type: "SPLIT", meld: "m0", at: 1 })).toThrow(/破冰/);
  });
  it("rejects invalid command shapes atomically", () => {
    const s = game();
    for (const cmd of [
      { type: "MOVE", tiles: [], to: { meld: null } },
      { type: "SPLIT", meld: "absent", at: 1 },
      { type: "MERGE", melds: ["missing", "missing"] },
      { type: "wat" },
      { type: "UNDO", seq: NaN },
    ])
      expect(() => act(s, cmd)).toThrow();
  });
  it("invariants detect duplicate/lost tiles and draft corruption", () => {
    const s = game();
    s.pool.pop();
    expect(() => assertInvariants(s)).toThrow();
    const t = game();
    t.draft.rack.push(t.pool[0]);
    expect(() => assertInvariants(t)).toThrow();
  });
});
describe("RK turns and scoring", () => {
  it("initial 27 is rejected with shortfall and rollback penalty, exact 30 accepted", () => {
    let s = fixture([["R08a", "R09a", "R10a", "K13a"], ["B01a"]], [], false);
    s = place(s, ["R08a", "R09a", "R10a"]);
    expect(validateTurn(s).reason).toMatch(/27.*3/);
    const end = act(s, { type: "COMMIT" });
    expect(end.lastAction?.error).toMatch(/27.*3/);
    expect(end.players[0].rack.length).toBe(7);
    expect(end.board).toEqual([]);
    expect(end.current).toBe(1);
    let t = fixture([["R09a", "R10a", "R11a", "K13a"], ["B01a"]], [], false);
    t = place(t, ["R09a", "R10a", "R11a"]);
    t = act(t, { type: "COMMIT" });
    expect(t.players[0].opened).toBe(true);
    expect(t.board).toHaveLength(1);
  });
  it("joker initial value follows highest legal interpretation", () => {
    let s = fixture([["R09a", "R10a", "J1", "K13a"], ["B01a"]], [], false);
    s = place(s, ["R09a", "R10a", "J1"]);
    expect(validateTurn(s).points).toBe(30);
    expect(act(s, { type: "COMMIT" }).players[0].opened).toBe(true);
  });
  it("invalid group has concrete Chinese reason and rollback", () => {
    let s = fixture([["R05a", "R06a", "R08a", "K13a"], ["B01a"]]);
    s = place(s, ["R05a", "R06a", "R08a"]);
    expect(validateTurn(s).reason).toMatch(/第 1 组.*红5.*红6.*红8.*不连续/);
    const t = act(s, { type: "COMMIT" });
    expect(t.players[0].rack).toHaveLength(7);
    expect(t.board).toHaveLength(0);
  });
  it("DRAW discards uncommitted draft and ends turn, no zero-tile commit", () => {
    let s = fixture([["R05a"], ["B01a"]]);
    expect(validateTurn(s).ok).toBe(false);
    s = place(s, ["R05a"]);
    const t = act(s, { type: "DRAW" });
    expect(t.players[0].rack).toHaveLength(2);
    expect(t.board).toEqual([]);
    expect(t.current).toBe(1);
  });
  it("only trusted server deadline expires, penalty bounded by remaining pool", () => {
    const s = game();
    expect(() =>
      reduceRK(s, { type: "TIMEOUT", actor: "server", seq: 1, now: 100999 }),
    ).toThrow(/未到/);
    expect(() =>
      reduceRK(s, { type: "TIMEOUT", actor: s.current, seq: 1, now: 101000 }),
    ).toThrow();
    const t = reduceRK(s, {
      type: "TIMEOUT",
      actor: "server",
      seq: 1,
      now: 101000,
    });
    expect(t.players[s.current].rack).toHaveLength(17);
    expect(t.current).not.toBe(s.current);
    const no = createRK(["a", "b"], { seed: 1, now: 1000, minutes: 0 });
    expect(() =>
      reduceRK(no, { type: "TIMEOUT", actor: "server", seq: 1, now: 999999 }),
    ).toThrow();
  });
  it("normal and blocked scores are zero sum, joker costs 30", () => {
    expect(scoreGame([0, 10, 20, 30], false).scores).toEqual([
      60, -10, -20, -30,
    ]);
    expect(scoreGame([10, 20, 30], true).scores).toEqual([30, -10, -20]);
    expect(scoreGame([10, 10, 25], true).scores).toEqual([7.5, 7.5, -15]);
    let s = fixture([["R09a", "R10a", "R11a"], ["J1"]]);
    s = act(place(s, s.players[0].rack), { type: "COMMIT" });
    expect(s.phase).toBe("FINISHED");
    expect(s.result?.scores).toEqual([30, -30]);
    expect(viewForRK(s, 0).players[1].rack).toEqual(["J1"]);
    const next = act(s, { type: "NEXT_GAME" });
    expect(next.game).toBe(2);
    expect(next.players[0].score).toBe(30);
    expect(next.players[0].wins).toBe(1);
    assertInvariants(next);
  });
  it("empty pool needs a full round of passes and scores lowest rack", () => {
    const s = game();
    s.players[0].rack.push(...s.pool.splice(0));
    s.turn = { rack: [...s.players[s.current].rack], board: [], retrieved: [] };
    s.draft = structuredClone(s.turn);
    const a = act(s, { type: "DRAW" });
    expect(a.phase).toBe("PLAYING");
    const b = act(a, { type: "DRAW" });
    expect(b.phase).toBe("FINISHED");
    expect(b.result?.blocked).toBe(true);
    assertInvariants(b);
  });
});

describe("RK official joker retrieval examples and boundary regressions", () => {
  function release(s: RKState, tiles: string[]) {
    return act(place(s, tiles), { type: "COMMIT" });
  }
  it("official example 1: either missing color may replace three-tile group joker", () => {
    for (const replacement of ["K03a", "O03a"]) {
      let s = fixture(
        [[replacement, "K08a", "K09a", "K13a"], ["B01a"]],
        [["R03a", "B03a", "J1"]],
      );
      s = place(s, [replacement], "m0");
      s = release(s, ["J1", "K08a", "K09a"]);
      expect(s.lastAction?.error).toBeUndefined();
      expect(s.board).toHaveLength(2);
      assertInvariants(s);
    }
  });
  it("official example 2: split around joker and use both new endpoints", () => {
    let s = fixture(
      [["R01a", "R07a", "B10a", "B11a", "K13a"], ["B01a"]],
      [["R02a", "R03a", "J1", "R05a", "R06a"]],
    );
    s = act(s, { type: "MOVE", tiles: ["R01a"], to: { meld: "m0", index: 0 } });
    s = place(s, ["R07a"], "m0");
    s = place(s, ["J1", "B10a", "B11a"]);
    s = act(s, { type: "SPLIT", meld: "m0", at: 3 });
    expect(validateTurn(s).ok).toBe(true);
    s = act(s, { type: "COMMIT" });
    expect(s.board).toHaveLength(3);
    assertInvariants(s);
  });
  it("official example 3: adding blue5 frees joker after blue6,7", () => {
    let s = fixture(
      [["B05a", "K10a", "K11a", "K13a"], ["B01a"]],
      [["B06a", "B07a", "J1"]],
    );
    s = act(s, { type: "MOVE", tiles: ["B05a"], to: { meld: "m0", index: 0 } });
    s = release(s, ["J1", "K10a", "K11a"]);
    expect(s.lastAction?.error).toBeUndefined();
    assertInvariants(s);
  });
  it("official example 4: move both black tiles into other groups to free joker", () => {
    let s = fixture(
      [["K10a", "K11a", "K13a"], ["B04a"]],
      [
        ["K01a", "K02a", "J1"],
        ["R01a", "B01a", "O01a"],
        ["R02a", "B02a", "O02a"],
      ],
    );
    s = place(s, ["K01a"], "m1");
    s = place(s, ["K02a"], "m2");
    s = release(s, ["J1", "K10a", "K11a"]);
    expect(s.lastAction?.error).toBeUndefined();
    expect(s.board).toHaveLength(3);
    assertInvariants(s);
  });
  it("a table tile can replace joker, and another rack tile must still be played", () => {
    let s = fixture(
      [["K10a", "K11a", "K13a"], ["B04a"]],
      [
        ["R03a", "B03a", "J1"],
        ["K03a", "K04a", "K05a", "K06a"],
      ],
    );
    s = place(s, ["K03a"], "m0");
    s = release(s, ["J1", "K10a", "K11a"]);
    expect(s.lastAction?.error).toBeUndefined();
    assertInvariants(s);
  });
  it("moved joker cannot simply return to original membership and count as a new set", () => {
    let s = fixture(
      [["B05a", "B06a", "B07a", "K13a"], ["B01a"]],
      [["R03a", "B03a", "J1"]],
    );
    s = place(s, ["J1"]);
    const temp = s.draft.board.find((m) => m.id !== "m0")!.id;
    s = place(s, ["J1"], "m0");
    expect(s.draft.board.some((m) => m.id === temp)).toBe(false);
    s = place(s, ["B05a", "B06a", "B07a"]);
    expect(validateTurn(s).reason).toMatch(/必须用于新组合/);
  });
  it("penalty consumes only remaining tiles and preserves every tile", () => {
    const s = fixture([["R05a", "R06a", "R08a"], ["B01a"]]);
    s.players[1].rack.push(...s.pool.splice(2));
    s.turn.rack = [...s.players[0].rack];
    s.draft = structuredClone(s.turn);
    const t = act(place(s, ["R05a", "R06a", "R08a"]), { type: "COMMIT" });
    expect(t.players[0].rack).toHaveLength(5);
    expect(t.pool).toHaveLength(0);
    assertInvariants(t);
  });
  it("commit is exactly once even when retried after next seat starts", () => {
    const s = fixture([["R09a", "R10a", "R11a", "K13a"], ["B01a"]]);
    const d = place(s, ["R09a", "R10a", "R11a"]);
    const cmd = { type: "COMMIT", actor: 0, seq: 2, now: 1000 } as Command;
    const t = reduceRK(d, cmd);
    expect(reduceRK(t, cmd)).toBe(t);
    expect(t.board).toHaveLength(1);
  });
  it("invalid commit reason must not leak rejected private tiles to opponents", () => {
    let s = fixture([["R05a", "R06a", "R08a"], ["B01a"]]);
    s = act(place(s, ["R05a", "R06a", "R08a"]), { type: "COMMIT" });
    expect(viewForRK(s, 0).lastAction?.error).toContain("红5");
    expect(JSON.stringify(viewForRK(s, 1))).not.toContain("红5");
  });
  it("late player commands resolve timeout and 200-second timer is respected", () => {
    const s = createRK(["a", "b"], {
      seed: 2,
      now: 1000,
      minutes: 2,
      assertions: true,
    });
    expect(s.deadline).toBe(201000);
    const t = reduceRK(s, {
      type: "DRAW",
      actor: s.current,
      seq: 1,
      now: 201000,
    });
    expect(t.lastAction?.type).toBe("TIMEOUT");
    expect(t.lastAction?.count).toBe(3);
    assertInvariants(t);
  });
  it("official board validation does not depend on internal sequence of run tiles", () => {
    expect(validateMeld(["R08a", "R06a", "R07a"])[0].score).toBe(21);
  });
});

describe("RK initial multi-meld and safety checks", () => {
  it("29 points across groups stays below 30 and reports exact one point shortfall", () => {
    let s = fixture(
      [
        ["R05a", "B05a", "K05a", "O02a", "O03a", "O04a", "O05a", "K13a"],
        ["B01a"],
      ],
      [],
      false,
    );
    s = place(s, ["R05a", "B05a", "K05a"]);
    s = place(s, ["O02a", "O03a", "O04a", "O05a"]);
    expect(validateTurn(s).points).toBe(29);
    expect(validateTurn(s).reason).toBe("破冰只有 29 分，还差 1 分");
  });
  it("30 points across two independent melds opens successfully", () => {
    let s = fixture(
      [["R04a", "R05a", "R06a", "B04a", "B05a", "B06a", "K13a"], ["B01a"]],
      [],
      false,
    );
    s = place(s, ["R04a", "R05a", "R06a"]);
    s = place(s, ["B04a", "B05a", "B06a"]);
    expect(validateTurn(s).points).toBe(30);
    expect(act(s, { type: "COMMIT" }).players[0].opened).toBe(true);
  });
  it("rejects merge into old table on initial turn and leaves snapshot untouched", () => {
    let s = fixture(
      [["R04a", "R05a", "R06a", "K13a"], ["B01a"]],
      [["O01a", "O02a", "O03a"]],
      false,
    );
    s = place(s, ["R04a", "R05a", "R06a"]);
    expect(() =>
      act(s, { type: "MERGE", melds: s.draft.board.map((m) => m.id) }),
    ).toThrow(/破冰/);
    expect(s.board[0].tiles).toEqual(["O01a", "O02a", "O03a"]);
  });
  it("rejects noninteger or malformed seq without changing state", () => {
    const s = game();
    expect(() =>
      reduceRK(s, { type: "DRAW", actor: s.current, seq: NaN, now: 1000 }),
    ).toThrow(/seq/);
    expect(() =>
      reduceRK(s, { type: "DRAW", actor: s.current, seq: 1.5, now: 1000 }),
    ).toThrow(/seq/);
    expect(() =>
      reduceRK(s, { type: "DRAW", actor: s.current, seq: 1, now: NaN }),
    ).toThrow(/时间/);
  });
  it("does not penalize unknown commands even after deadline", () => {
    const s = game();
    expect(() =>
      reduceRK(s, {
        type: "BOGUS",
        actor: s.current,
        seq: 1,
        now: 999999,
      } as any),
    ).toThrow(/未知/);
  });
  it("empty-pool pass streak resets on successful play", () => {
    let s = fixture([["R04a", "K13a"], ["B01a"]], [["R01a", "R02a", "R03a"]]);
    s.players[1].rack.push(...s.pool.splice(0));
    s.passes = 1;
    s = place(s, ["R04a"], "m0");
    s = act(s, { type: "COMMIT" });
    expect(s.passes).toBe(0);
    expect(s.phase).toBe("PLAYING");
    assertInvariants(s);
  });
});

import { orderMeld as __orderMeld } from "../src/index.ts";
describe("run ordering", () => {
  it("sorts a valid run ascending, joker by represented value; groups untouched", () => {
    expect(__orderMeld(["R07a", "R05a", "R06a"])).toEqual(["R05a", "R06a", "R07a"]);
    expect(__orderMeld(["R08a", "J1", "R06a"])).toEqual(["R06a", "J1", "R08a"]);
    expect(__orderMeld(["K07a", "R07a", "O07a"])).toEqual(["K07a", "R07a", "O07a"]);
    expect(__orderMeld(["R05a", "R06a", "R08a"])).toEqual(["R05a", "R06a", "R08a"]);
  });
});
