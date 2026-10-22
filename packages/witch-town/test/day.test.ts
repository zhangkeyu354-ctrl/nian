import { describe, expect, it } from "vitest";
import {
  createWitchTown,
  seededRandom,
  viewForWitchTown,
  type WTState,
  type CardKind,
} from "../src/index.ts";
import {
  reduceWitchTown,
  accusationValue,
  trialThreshold,
} from "../src/day.ts";

function fresh(n = 4, seed = 1) {
  let s = createWitchTown(
    {
      players: Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `玩家${i}`,
      })),
      countsProfile: "candidate-59",
      allowCandidateCounts: true,
    },
    seededRandom(seed),
  );
  for (const p of s.players) p.character = "william_phips";
  for (const p of s.players.filter((p) => p.everWitch))
    s = reduceWitchTown(s, p.id, { type: "DAWN_TARGET", targetId: "p0" });
  // Neutral roles and known factions for focused rule fixtures; real setup stays random.
  for (const p of s.players) {
    p.character = "william_phips";
    p.everWitch = false;
    for (const t of p.tryals) t.kind = "not_witch";
  }
  s.players[n - 1].everWitch = true;
  s.players[n - 1].tryals[0].kind = "witch";
  return s;
}
function give(s: WTState, kind: CardKind, to = "p0") {
  const zones = [
    s.deck,
    s.discard,
    ...s.players.flatMap((p) => [p.hand, p.table]),
  ];
  for (const zone of zones) {
    const i = zone.findIndex((c) => c.kind === kind);
    if (i >= 0) {
      const [c] = zone.splice(i, 1);
      s.players.find((p) => p.id === to)!.hand.push(c);
      return c.id;
    }
  }
  throw Error(`missing ${kind}`);
}
const play = (
  s: WTState,
  kind: CardKind,
  targetId = "p1",
  extra: Record<string, unknown> = {},
) =>
  reduceWitchTown(s, "p0", {
    type: "PLAY",
    cardId: give(s, kind),
    targetId,
    ...extra,
  } as any);
function points(s: WTState, target: string, n: number) {
  for (let i = 0; i < n; i++) {
    const id = give(s, "accusation", target),
      p = s.players.find((p) => p.id === target)!;
    p.table.push(
      p.hand.splice(
        p.hand.findIndex((c) => c.id === id),
        1,
      )[0],
    );
  }
}
function conservation(s: WTState) {
  const cards = [
    ...s.deck,
    ...s.discard,
    ...s.players.flatMap((p) => [...p.hand, ...p.table]),
    ...(s.dawnBlackCat ? [s.dawnBlackCat] : []),
    ...(s.pending?.kind === "black-event" ? [s.pending.card] : []),
  ];
  expect(cards.length).toBe(59);
  expect(new Set(cards.map((c) => c.id)).size).toBe(59);
}

describe("M2 day actions and trials", () => {
  it("Giles takes one bonus card without recursively triggering, Rebecca can actually draw her reward", () => {
    let s = fresh();
    s.players[0].character = "giles_corey";
    const ordered = [];
    for (const kind of ["accusation", "accusation", "evidence"] as const) {
      const id = give(s, kind),
        p = s.players[0];
      ordered.push(
        p.hand.splice(
          p.hand.findIndex((c) => c.id === id),
          1,
        )[0],
      );
    }
    s.deck.unshift(...ordered);
    const count = s.players[0].hand.length;
    s = reduceWitchTown(s, "p0", { type: "DRAW" });
    s = reduceWitchTown(s, "p0", { type: "ABILITY_DECISION", use: true });
    expect(s.players[0].hand).toHaveLength(count + 3);
    expect(s.turnPlayerId).toBe("p1");
    expect(s.log.some((e) => e.type === "GILES_SHOWS_TWO_ACCUSATIONS")).toBe(
      true,
    );
    conservation(s);
    s = fresh();
    s.players[2].character = "rebecca_nurse";
    const id = give(s, "evidence"),
      p = s.players[0];
    s.deck.unshift(
      p.hand.splice(
        p.hand.findIndex((c) => c.id === id),
        1,
      )[0],
    );
    const before = s.players[2].hand.length;
    points(s, "p1", 6);
    s = play(s, "accusation");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    s = reduceWitchTown(s, "p2", { type: "ABILITY_DECISION", use: true });
    expect(s.players[2].hand).toHaveLength(before + 1);
    expect(s.turnPlayerId).toBe("p0");
    expect(s.phase).toBe("day");
    conservation(s);
  });
  it("green-card trials do not count as directly playing the final red accusation for Ann", () => {
    let s = fresh();
    s.players[0].character = "ann_putnam";
    s = play(s, "piety");
    points(s, "p1", 7);
    s = play(s, "curse", "p1", {
      blueId: s.players[1].table.find((c) => c.kind === "piety")!.id,
    });
    expect(s.pending?.kind).toBe("trial");
  });
  it("Cotton death revalues existing copied Evidence, blocks only the unresolved crossing", () => {
    for (const count of [1, 2]) {
      let s = fresh();
      s.players[0].character = "cotton_mather";
      s.players[1].character = "martha_corey";
      for (let i = 0; i < count; i++) {
        const id = give(s, "evidence", "p1"),
          p = s.players[1];
        p.table.push(
          p.hand.splice(
            p.hand.findIndex((c) => c.id === id),
            1,
          )[0],
        );
      }
      expect(accusationValue(s, "p1")).toBe(count);
      s.players[0].tryals.slice(1).forEach((t) => (t.revealed = true));
      points(s, "p0", 6);
      s.turnPlayerId = "p2";
      const id = give(s, "accusation", "p2");
      s = reduceWitchTown(s, "p2", {
        type: "PLAY",
        cardId: id,
        targetId: "p0",
      });
      const before = structuredClone(s);
      if (count === 2) {
        expect(() =>
          reduceWitchTown(s, "p2", { type: "REVEAL_TRYAL", index: 0 }),
        ).toThrow("CHECK_REQUIRED:X03");
        expect(s).toEqual(before);
      } else {
        s = reduceWitchTown(s, "p2", { type: "REVEAL_TRYAL", index: 0 });
        expect(accusationValue(s, "p1")).toBe(3);
        conservation(s);
      }
    }
  });
  it("requires secret unanimous dawn targets, permits self, hides votes from townspeople", () => {
    let s = createWitchTown(
      {
        players: Array.from({ length: 6 }, (_, i) => ({
          id: `p${i}`,
          name: `P${i}`,
        })),
        countsProfile: "candidate-59",
        allowCandidateCounts: true,
      },
      seededRandom(2),
    );
    // Two known witches using existing identities; do not split the shuffled deck in production.
    s.players.forEach((p, i) => (p.everWitch = i < 2));
    expect(() =>
      reduceWitchTown(s, "p2", { type: "DAWN_TARGET", targetId: "p0" }),
    ).toThrow("WITCH_ONLY");
    s = reduceWitchTown(s, "p0", { type: "DAWN_TARGET", targetId: "p0" });
    expect(s.phase).toBe("dawn");
    expect(JSON.stringify(viewForWitchTown(s, "p2"))).not.toContain(
      "dawnVotes",
    );
    s = reduceWitchTown(s, "p1", { type: "DAWN_TARGET", targetId: "p2" });
    expect(s.phase).toBe("dawn");
    s = reduceWitchTown(s, "p1", { type: "DAWN_TARGET", targetId: "p0" });
    expect(s.phase).toBe("day");
    expect(s.turnPlayerId).toBe("p0");
    conservation(s);
  });
  for (let n = 4; n <= 12; n++)
    it(`${n} players: draw, play, end, pending black card, every seat can act`, () => {
      let s = fresh(n, n);
      // A full ring of legal play actions doesn't rely on the size of remaining draw deck.
      for (let i = 0; i < n; i++) {
        const p = `p${i}`,
          target = `p${(i + 1) % n}`,
          id = give(s, "accusation", p);
        expect(s.turnPlayerId).toBe(p);
        s = reduceWitchTown(s, p, {
          type: "PLAY",
          cardId: id,
          targetId: target,
        });
        expect(() => reduceWitchTown(s, p, { type: "DRAW" })).toThrow(
          "DRAW_AFTER_PLAY",
        );
        s = reduceWitchTown(s, p, { type: "END_TURN" });
        conservation(s);
      }
      expect(s.turnPlayerId).toBe("p0");
      const id = give(s, "night");
      const holder = s.players[0];
      s.deck.unshift(
        holder.hand.splice(
          holder.hand.findIndex((c) => c.id === id),
          1,
        )[0],
      );
      const count = holder.hand.length;
      s = reduceWitchTown(s, "p0", { type: "DRAW" });
      expect(s.phase).toBe("black-event");
      expect(s.players[0].hand.length).toBe(count);
      expect(s.tasks[0]).toMatchObject({ kind: "draw", remaining: 1 });
      expect(() => reduceWitchTown(s, "p0", { type: "END_TURN" })).toThrow(
        "BLACK_EVENT_PENDING",
      );
      conservation(s);
    });
  it("draws two only, ends turn, rejects out-of-turn and empty end turn without mutation", () => {
    let s = fresh();
    for (const kind of ["accusation", "evidence"] as const) {
      const id = give(s, kind);
      const p = s.players[0];
      s.deck.unshift(
        p.hand.splice(
          p.hand.findIndex((c) => c.id === id),
          1,
        )[0],
      );
    }
    const before = structuredClone(s),
      count = s.players[0].hand.length;
    expect(() => reduceWitchTown(s, "p1", { type: "DRAW" })).toThrow(
      "NOT_YOUR_TURN",
    );
    expect(() => reduceWitchTown(s, "p0", { type: "END_TURN" })).toThrow(
      "MUST_DRAW_OR_PLAY",
    );
    expect(s).toEqual(before);
    s = reduceWitchTown(s, "p0", { type: "DRAW" });
    expect(s.players[0].hand.length).toBe(count + 2);
    expect(s.turnPlayerId).toBe("p1");
    conservation(s);
  });
  it("ordinary 7-point trial chooses exactly one concealed ordinal and discards all excess", () => {
    let s = fresh();
    points(s, "p1", 5);
    s = play(s, "evidence");
    expect(s.pending).toMatchObject({
      kind: "trial",
      actorId: "p0",
      targetId: "p1",
    });
    expect(() =>
      reduceWitchTown(s, "p2", { type: "REVEAL_TRYAL", index: 0 }),
    ).toThrow("NOT_YOUR_CHOICE");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.players[1].tryals.filter((c) => c.revealed)).toHaveLength(1);
    expect(accusationValue(s, "p1")).toBe(0);
    expect(s.phase).toBe("day");
    expect(s.turnPlayerId).toBe("p0");
    conservation(s);
  });
  it.each([
    [false, false, 7, 14],
    [true, false, 6, 12],
    [false, true, 8, 16],
    [true, true, 7, 14],
  ])("judge=%s strong=%s thresholds=%s/%s", (judge, strong, normal, piety) => {
    let s = fresh();
    if (judge) s.players[0].character = "thomas_danforth";
    if (strong) s.players[1].character = "george_burroughs";
    expect(trialThreshold(s, "p0", "p1")).toBe(normal);
    const id = give(s, "piety", "p1"),
      p = s.players[1];
    p.table.push(
      p.hand.splice(
        p.hand.findIndex((c) => c.id === id),
        1,
      )[0],
    );
    expect(trialThreshold(s, "p0", "p1")).toBe(piety);
  });
  it("Cotton values evidence as 1, doctor plays Alibi as a real 7-point Witness contribution", () => {
    let s = fresh();
    s.players[1].character = "cotton_mather";
    s = play(s, "evidence");
    expect(accusationValue(s, "p1")).toBe(1);
    s.players[0].character = "will_griggs";
    s = play(s, "alibi", "p1", { asWitness: true });
    expect(accusationValue(s, "p1")).toBe(8);
    expect(s.pending?.kind).toBe("trial");
    conservation(s);
  });
  it("Alibi selects whole cards <=3 points, doesn't remove Witness or guess Cotton ambiguity", () => {
    let s = fresh();
    const evidence = give(s, "evidence", "p1"),
      p = s.players[1];
    p.table.push(
      p.hand.splice(
        p.hand.findIndex((c) => c.id === evidence),
        1,
      )[0],
    );
    s = play(s, "alibi", "p1", { removeIds: [evidence] });
    expect(accusationValue(s, "p1")).toBe(0);
    conservation(s);
    s.players[1].character = "cotton_mather";
    const e = give(s, "evidence", "p1");
    p.table = s.players[1].table;
    const current = s.players[1];
    current.table.push(
      current.hand.splice(
        current.hand.findIndex((c) => c.id === e),
        1,
      )[0],
    );
    const id = give(s, "alibi");
    const before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", {
        type: "PLAY",
        cardId: id,
        targetId: "p1",
        removeIds: [e],
      }),
    ).toThrow("CHECK_REQUIRED:X01");
    expect(s).toEqual(before);
  });
  it("Curse removes exactly one selected blue card; Stocks survives until its skipped turn", () => {
    let s = fresh();
    s = play(s, "asylum");
    s = play(s, "piety");
    const asylum = s.players[1].table.find((c) => c.kind === "asylum")!.id;
    s = play(s, "curse", "p1", { blueId: asylum });
    expect(s.players[1].table.map((c) => c.kind)).toEqual(["piety"]);
    s = play(s, "stocks");
    s = reduceWitchTown(s, "p0", { type: "END_TURN" });
    expect(s.turnPlayerId).toBe("p2");
    expect(s.discard.some((c) => c.kind === "stocks")).toBe(true);
    conservation(s);
  });
  it("Robbery uses two different others, Sarah can receive but cannot be robbed or burned", () => {
    let s = fresh();
    s.players[2].character = "sarah_good";
    const a = s.players[1].hand.length,
      b = s.players[2].hand.length;
    s = play(s, "robbery", "p1", { recipientId: "p2" });
    expect(s.players[1].hand.length).toBe(0);
    expect(s.players[2].hand.length).toBe(a + b);
    const before = s.players[2].hand.length;
    s = play(s, "arson", "p2");
    expect(s.players[2].hand.length).toBe(before);
    conservation(s);
  });
  it("Scapegoat transfers all table colors, triggers trial, and never moves hidden hands", () => {
    let s = fresh();
    points(s, "p1", 4);
    points(s, "p2", 3);
    s = play(s, "stocks");
    const count = s.players[1].hand.length;
    s = play(s, "scapegoat", "p1", { recipientId: "p2" });
    expect(s.players[1].table.length).toBe(0);
    expect(s.players[1].hand.length).toBe(count);
    expect(s.pending).toMatchObject({ kind: "trial", targetId: "p2" });
    expect(s.players[2].table.some((c) => c.kind === "stocks")).toBe(true);
    conservation(s);
  });
  it("Piety removal immediately triggers ordinary trial and blocks unresolved special-threshold case", () => {
    let s = fresh();
    s = play(s, "piety");
    points(s, "p1", 7);
    s = play(s, "curse", "p1", {
      blueId: s.players[1].table.find((c) => c.kind === "piety")!.id,
    });
    expect(s.pending?.kind).toBe("trial");
    s = fresh();
    s.players[1].character = "george_burroughs";
    s = play(s, "piety");
    points(s, "p1", 7);
    const id = give(s, "curse"),
      before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", {
        type: "PLAY",
        cardId: id,
        targetId: "p1",
        blueId: s.players[1].table.find((c) => c.kind === "piety")!.id,
      }),
    ).toThrow("CHECK_REQUIRED:X07");
    expect(s).toEqual(before);
  });
  it("Ann reward is optional before reveal and black interruption retains the original trial", () => {
    let s = fresh();
    s.players[0].character = "ann_putnam";
    points(s, "p1", 6);
    s = play(s, "accusation");
    expect(s.pending).toMatchObject({ kind: "ability", ability: "ann" });
    const id = give(s, "conspiracy"),
      p = s.players[0];
    s.deck.unshift(
      p.hand.splice(
        p.hand.findIndex((c) => c.id === id),
        1,
      )[0],
    );
    s = reduceWitchTown(s, "p0", { type: "ABILITY_DECISION", use: true });
    expect(s.phase).toBe("black-event");
    expect(s.tasks.some((t) => t.kind === "trial")).toBe(true);
    expect(s.players[1].tryals.every((c) => !c.revealed)).toBe(true);
    conservation(s);
  });
  it("Abigail may clear all her red contributions including Evidence at final accusation", () => {
    let s = fresh();
    s.players[0].character = "abigail_williams";
    points(s, "p0", 2);
    const evidence = give(s, "evidence"),
      self = s.players[0];
    self.table.push(
      self.hand.splice(
        self.hand.findIndex((c) => c.id === evidence),
        1,
      )[0],
    );
    points(s, "p1", 6);
    s = play(s, "accusation");
    expect(s.pending).toMatchObject({ ability: "abigail" });
    s = reduceWitchTown(s, "p0", { type: "ABILITY_DECISION", use: true });
    expect(accusationValue(s, "p0")).toBe(0);
    expect(s.pending?.kind).toBe("trial");
    conservation(s);
  });
  it("Rebecca gets an optional draw after a nonfatal revelation; fatal ambiguous reward is explicit", () => {
    let s = fresh();
    s.players[2].character = "rebecca_nurse";
    points(s, "p1", 6);
    s = play(s, "accusation");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.pending).toMatchObject({
      kind: "ability",
      ability: "rebecca",
      playerId: "p2",
    });
    s = reduceWitchTown(s, "p2", { type: "ABILITY_DECISION", use: false });
    expect(s.phase).toBe("day");
    conservation(s);
  });
  it("Giles offers a bonus draw only for two ordinary Accusations on his draw action", () => {
    let s = fresh();
    s.players[0].character = "giles_corey";
    for (let i = 0; i < 2; i++) {
      const id = give(s, "accusation"),
        p = s.players[0];
      s.deck.unshift(
        p.hand.splice(
          p.hand.findIndex((c) => c.id === id),
          1,
        )[0],
      );
    }
    s = reduceWitchTown(s, "p0", { type: "DRAW" });
    expect(s.pending).toMatchObject({ ability: "giles" });
    s = reduceWitchTown(s, "p0", { type: "ABILITY_DECISION", use: false });
    expect(s.turnPlayerId).toBe("p1");
    conservation(s);
  });
  it("revealing one of two Witch tryals keeps owner alive, final revealed Witch ends game", () => {
    let s = fresh(6);
    const p = s.players[5];
    p.tryals[1].kind = "witch";
    points(s, "p5", 6);
    s = play(s, "accusation", "p5");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.players[5].alive).toBe(true);
    expect(s.phase).toBe("day");
    points(s, "p5", 6);
    s = play(s, "accusation", "p5");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.phase).toBe("over");
    expect(s.outcome?.team).toBe("townspeople");
    conservation(s);
  });
  it("blocks repeated Matchmaker, self targeting, invalid indices and non-held cards atomically", () => {
    let s = fresh();
    s = play(s, "matchmaker");
    const id = give(s, "matchmaker"),
      before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", { type: "PLAY", cardId: id, targetId: "p1" }),
    ).toThrow("ALREADY_MATCHED");
    expect(() =>
      reduceWitchTown(s, "p0", { type: "PLAY", cardId: id, targetId: "p0" }),
    ).toThrow("NO_SELF_TARGET");
    expect(() =>
      reduceWitchTown(s, "p0", {
        type: "PLAY",
        cardId: "fake",
        targetId: "p1",
      }),
    ).toThrow("CARD_NOT_HELD");
    expect(s).toEqual(before);
  });
  it("resolves repeated trials sequentially, rejects invalid concealed index without consuming red cards", () => {
    let s = fresh();
    points(s, "p1", 6);
    s = play(s, "accusation");
    const before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 99 }),
    ).toThrow("BAD_TRYAL_INDEX");
    expect(s).toEqual(before);
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    points(s, "p1", 6);
    s = play(s, "accusation");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.players[1].tryals.filter((t) => t.revealed)).toHaveLength(2);
    expect(accusationValue(s, "p1")).toBe(0);
    conservation(s);
  });
  it("stacked Stocks skips consecutive visits without silencing passive abilities", () => {
    let s = fresh();
    s = play(s, "stocks");
    s = play(s, "stocks");
    s = reduceWitchTown(s, "p0", { type: "END_TURN" });
    expect(s.turnPlayerId).toBe("p2");
    expect(s.players[1].table.filter((c) => c.kind === "stocks")).toHaveLength(
      1,
    );
    for (const p of ["p2", "p3", "p0"]) {
      const id = give(s, "accusation", p);
      s = reduceWitchTown(s, p, {
        type: "PLAY",
        cardId: id,
        targetId: p === "p0" ? "p2" : "p0",
      });
      s = reduceWitchTown(s, p, { type: "END_TURN" });
    }
    expect(s.turnPlayerId).toBe("p2");
    expect(s.players[1].table.some((c) => c.kind === "stocks")).toBe(false);
    conservation(s);
  });
  it("direct ordinary Witch reveal eliminates target and cleans their hand and blue cards", () => {
    let s = fresh();
    s = play(s, "asylum", "p3");
    points(s, "p3", 6);
    s = play(s, "accusation", "p3");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.players[3].alive).toBe(false);
    expect(s.players[3].hand).toHaveLength(0);
    expect(s.players[3].table.some((c) => c.kind === "asylum")).toBe(false);
    expect(s.players[3].tryals.every((t) => t.revealed)).toBe(true);
    expect(s.outcome?.team).toBe("townspeople");
    conservation(s);
  });
  it("Matchmaker eliminates partner, Mary is immune to collateral but still triggers partner on her own death", () => {
    let s = fresh();
    s = play(s, "matchmaker", "p1");
    s = play(s, "matchmaker", "p2");
    s.players[1].tryals.slice(1).forEach((t) => (t.revealed = true));
    points(s, "p1", 6);
    s = play(s, "accusation");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.players[1].alive).toBe(false);
    expect(s.players[2].alive).toBe(false);
    conservation(s);
    s = fresh();
    s = play(s, "matchmaker", "p1");
    s = play(s, "matchmaker", "p2");
    s.players[2].character = "mary_warren";
    s.players[1].tryals.slice(1).forEach((t) => (t.revealed = true));
    points(s, "p1", 6);
    s = play(s, "accusation");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.players[2].alive).toBe(true);
    conservation(s);
    s = fresh();
    s = play(s, "matchmaker", "p1");
    s = play(s, "matchmaker", "p2");
    s.players[1].character = "mary_warren";
    s.players[1].tryals.slice(1).forEach((t) => (t.revealed = true));
    points(s, "p1", 6);
    s = play(s, "accusation");
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.players[2].alive).toBe(false);
    conservation(s);
  });
  it("the last townsperson's matched Witch partner survives the both-teams-eliminated exception", () => {
    let s = fresh();
    s = play(s, "matchmaker", "p1");
    s = play(s, "matchmaker", "p3");
    s.players[0].alive = false;
    s.players[2].alive = false;
    s.turnPlayerId = "p3";
    s.day.played = 0;
    s.players[1].tryals.slice(1).forEach((t) => (t.revealed = true));
    points(s, "p1", 6);
    const id = give(s, "accusation", "p3");
    s = reduceWitchTown(s, "p3", { type: "PLAY", cardId: id, targetId: "p1" });
    s = reduceWitchTown(s, "p3", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.players[3].alive).toBe(true);
    expect(s.outcome?.team).toBe("witches");
    conservation(s);
  });
  it("Sarah's copied passive and Cotton's copied Evidence value follow the first living right neighbour", () => {
    let s = fresh();
    s.players[1].character = "martha_corey";
    s.players[0].character = "cotton_mather";
    s = play(s, "evidence");
    expect(accusationValue(s, "p1")).toBe(1);
    s.players[0].character = "sarah_good";
    const count = s.players[1].hand.length;
    s = play(s, "arson");
    expect(s.players[1].hand.length).toBe(count);
    s.players[0].alive = false;
    s.players[3].character = "cotton_mather";
    expect(accusationValue(s, "p1")).toBe(1);
    conservation(s);
  });
  it("CHECK_REQUIRED death interactions roll back reveals, red discard, rewards and card consumption", () => {
    let s = fresh();
    s.players[2].character = "rebecca_nurse";
    points(s, "p3", 6);
    s = play(s, "accusation", "p3");
    let before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 }),
    ).toThrow("CHECK_REQUIRED:X02");
    expect(s).toEqual(before);
    s.players[2].character = "john_proctor";
    before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 }),
    ).toThrow("CHECK_REQUIRED:X09");
    expect(s).toEqual(before);
  });
  it("doctor effect returns to a normal Alibi after discard and cannot be forged by other roles", () => {
    let s = fresh();
    const id = give(s, "alibi"),
      before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", {
        type: "PLAY",
        cardId: id,
        targetId: "p1",
        asWitness: true,
      }),
    ).toThrow("BAD_AS_WITNESS");
    expect(s).toEqual(before);
    s.players[0].character = "will_griggs";
    s = reduceWitchTown(s, "p0", {
      type: "PLAY",
      cardId: id,
      targetId: "p1",
      asWitness: true,
    });
    s = reduceWitchTown(s, "p0", { type: "REVEAL_TRYAL", index: 0 });
    expect(s.discard.find((c) => c.id === id)).toEqual({ id, kind: "alibi" });
    conservation(s);
  });
  it("Alibi cannot remove a 7-point Witness and Curse cannot remove green Stocks", () => {
    let s = fresh();
    s.players[1].character = "george_burroughs";
    s = play(s, "witness");
    const witness = s.players[1].table.find((c) => c.kind === "witness")!.id,
      id = give(s, "alibi"),
      before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", {
        type: "PLAY",
        cardId: id,
        targetId: "p1",
        removeIds: [witness],
      }),
    ).toThrow("ALIBI_LIMIT");
    expect(s).toEqual(before);
    s = play(s, "stocks");
    const curse = give(s, "curse");
    expect(() =>
      reduceWitchTown(s, "p0", {
        type: "PLAY",
        cardId: curse,
        targetId: "p1",
        blueId: s.players[1].table.find((c) => c.kind === "stocks")!.id,
      }),
    ).toThrow("SELECT_ONE_BLUE_CARD");
  });
  it("Mary and moved second Matchmaker ambiguities reject atomically rather than dropping a card", () => {
    let s = fresh();
    s.players[1].character = "mary_warren";
    const id = give(s, "black_cat"),
      before = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", { type: "PLAY", cardId: id, targetId: "p1" }),
    ).toThrow("CHECK_REQUIRED:X06");
    expect(s).toEqual(before);
    s = fresh();
    s = play(s, "matchmaker", "p1");
    s = play(s, "matchmaker", "p2");
    const scapegoat = give(s, "scapegoat"),
      prior = structuredClone(s);
    expect(() =>
      reduceWitchTown(s, "p0", {
        type: "PLAY",
        cardId: scapegoat,
        targetId: "p1",
        recipientId: "p2",
      }),
    ).toThrow("CHECK_REQUIRED:X06");
    expect(s).toEqual(prior);
  });
  for (let n = 4; n <= 12; n++)
    it(`${n} players: 100 seeded controlled day scenarios conserve cards and hide opponents`, () => {
      for (let seed = 1; seed <= 100; seed++) {
        let s = fresh(n, seed);
        for (const p of s.players) give(s, "accusation", p.id);
        const rnd = seededRandom(seed * 413);
        for (let turn = 0; turn < n && s.phase === "day"; turn++) {
          const actor = s.turnPlayerId!,
            before = structuredClone(s);
          expect(() =>
            reduceWitchTown(s, s.players.find((p) => p.id !== actor)!.id, {
              type: "DRAW",
            }),
          ).toThrow("NOT_YOUR_TURN");
          expect(s).toEqual(before);
          const card = s.players
            .find((p) => p.id === actor)!
            .hand.find((c) => c.kind === "accusation");
          if (rnd() < 0.25 || !card)
            s = reduceWitchTown(s, actor, { type: "DRAW" });
          else {
            const targets = s.players.filter((p) => p.alive && p.id !== actor),
              target = targets[Math.floor(rnd() * targets.length)];
            s = reduceWitchTown(s, actor, {
              type: "PLAY",
              cardId: card.id,
              targetId: target.id,
            });
            if (s.pending?.kind === "trial")
              s = reduceWitchTown(s, actor, { type: "REVEAL_TRYAL", index: 0 });
            if (s.phase === "day")
              s = reduceWitchTown(s, actor, { type: "END_TURN" });
          }
          conservation(s);
          const view = JSON.stringify(viewForWitchTown(s, actor));
          for (const p of s.players.filter((p) => p.id !== actor))
            for (const c of [...p.hand, ...p.tryals.filter((t) => !t.revealed)])
              expect(view).not.toContain(`"${c.id}"`);
          if (s.phase === "black-event")
            expect(() => reduceWitchTown(s, actor, { type: "DRAW" })).toThrow(
              "BLACK_EVENT_PENDING",
            );
        }
      }
    });
});
