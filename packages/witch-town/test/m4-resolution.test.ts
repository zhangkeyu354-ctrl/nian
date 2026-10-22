import { expect, it } from "vitest";
import {
  createWitchTown,
  seededRandom,
  reduceWitchTown,
  viewForWitchTown,
  type WTState,
  type CardKind,
} from "../src/index.ts";
import { eliminate, drain, accusationValue } from "../src/day.ts";
import { tickWitchTown } from "../src/events.ts";
const context = (now = 1000) => ({ now, random: seededRandom(37) });
function base(n = 6) {
  let s = createWitchTown(
    {
      players: Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
      })),
      countsProfile: "candidate-59",
      allowCandidateCounts: true,
    },
    seededRandom(77),
  );
  for (const p of s.players) {
    p.character = "william_phips";
    p.everWitch = false;
    for (const t of p.tryals) t.kind = "not_witch";
  }
  s.players[0].tryals[0].kind = "witch";
  s.players[0].everWitch = true;
  if (n >= 6) {
    s.players[1].tryals[0].kind = "witch";
    s.players[1].everWitch = true;
  }
  s.players[2].tryals[0].kind = "constable";
  for (const p of s.players.filter((p) => p.everWitch))
    s = reduceWitchTown(
      s,
      p.id,
      { type: "DAWN_TARGET", targetId: "p3" },
      context(),
    );
  return s;
}
function pull(s: WTState, kind: CardKind) {
  for (const z of [
    s.deck,
    s.discard,
    ...s.players.flatMap((p) => [p.hand, p.table]),
  ]) {
    const i = z.findIndex((c) => c.kind === kind);
    if (i >= 0) return z.splice(i, 1)[0];
  }
  throw Error(kind);
}
function event(s: WTState) {
  s.deck.unshift(pull(s, "conspiracy"));
  return reduceWitchTown(s, s.turnPlayerId!, { type: "DRAW" }, context());
}
const cmd = (s: WTState, id: string, c: any, now = 1000) =>
  reduceWitchTown(s, id, c, context(now));
function cards(s: WTState) {
  const p: any = s.pending;
  return [
    ...s.deck,
    ...s.discard,
    ...s.players.flatMap((p) => [...p.hand, ...p.table]),
    ...(s.dawnBlackCat ? [s.dawnBlackCat] : []),
    ...(p?.kind === "black-event"
      ? [p.card]
      : p?.kind === "loot"
        ? p.pool
        : []),
    ...s.tasks.flatMap((t: any) =>
      t.kind === "resume-event"
        ? [t.pending.card]
        : t.kind === "loot"
          ? t.pool
          : [],
    ),
  ];
}
function conserved(s: WTState) {
  const c = cards(s);
  expect(c).toHaveLength(59);
  expect(new Set(c.map((x) => x.id)).size).toBe(59);
}

// RULE_DERIVED: official P5/P6/P12; death is resolved before rebuilding the live ring.
for (let n = 4; n <= 12; n++)
  it(`${n}: fatal black cat owner (also drawer) leaves the living transmission ring`, () => {
    let s = base(n);
    s.players[3].tryals.slice(1).forEach((t) => (t.revealed = true));
    s = event(s);
    s = cmd(s, "p3", { type: "CONSPIRACY_REVEAL", index: 0 });
    expect(s.players[3].alive).toBe(false);
    expect((s.pending as any).event.members).not.toContain("p3");
    for (const id of (s.pending as any).event.members)
      s = cmd(s, id, { type: "CONSPIRACY_PICK", index: 0 });
    expect(s.phase).toBe("day");
    expect(s.turnPlayerId).not.toBe("p3");
    conserved(s);
  });

it("P6: revealing the last Witch ends immediately without requesting transmission", () => {
  let s = base(4);
  s.turnPlayerId = "p0";
  s.players[0].table.push(pull(s, "black_cat"));
  s.blackCatOwnerId = "p0";
  s = event(s);
  s = cmd(s, "p0", { type: "CONSPIRACY_REVEAL", index: 0 });
  expect(s.outcome?.team).toBe("townspeople");
  conserved(s);
});

it("DEFAULT_PENDING_CONFIRM P5/P14: losing the hidden Witch exemption eliminates after simultaneous transfer", () => {
  let s = base();
  s.players[0].tryals[0].revealed = true;
  [s.players[0].tryals[1].kind, s.players[1].tryals[0].kind] = [
    "witch",
    "not_witch",
  ];
  s.players[3].table.splice(0).forEach((c) => s.discard.push(c));
  s.blackCatOwnerId = null;
  s = event(s);
  for (const p of s.players)
    s = cmd(s, p.id, { type: "CONSPIRACY_PICK", index: 0 });
  expect(s.players[0].alive).toBe(false);
  expect(s.players[5].everWitch).toBe(true);
  expect(s.phase).toBe("day");
  conserved(s);
});

it("P6: simultaneous last infections end for witches; DEFAULT_PENDING_CONFIRM excludes all final infectees personally", () => {
  let s = base();
  for (const p of s.players) p.everWitch = !["p2", "p5"].includes(p.id);
  s.players[1].tryals[0].kind = "not_witch";
  s.players[3].tryals[0].kind = "witch";
  s.players[3].table.splice(0).forEach((c) => s.discard.push(c));
  s.blackCatOwnerId = null;
  s = event(s);
  for (const p of s.players)
    s = cmd(s, p.id, { type: "CONSPIRACY_PICK", index: 0 });
  expect(s.outcome?.team).toBe("witches");
  expect(s.outcome?.losers).toEqual(expect.arrayContaining(["p2", "p5"]));
  conserved(s);
});

// DEFAULT_PENDING_CONFIRM P12: John first, 3 each, remainder John; single farmer remains all.
for (const size of [0, 1, 2, 5, 6, 7, 12])
  it(`shared loot ${size} cards: private alternating choice, remainder to John, conserved across serialization`, () => {
    let s = base();
    s.players[0].character = "john_proctor";
    s.players[1].character = "martha_corey";
    s.deck.push(
      ...s.players[3].hand.splice(0),
      ...s.players[3].table.splice(0),
    );
    s.blackCatOwnerId = null;
    for (let i = 0; i < size; i++)
      s.players[3].hand.push(pull(s, "accusation"));
    eliminate(s, s.players[3]);
    drain(s, 1000);
    const before = s.players.slice(0, 2).map((p) => p.hand.length);
    let picks = 0;
    while ((s.pending as any)?.kind === "loot") {
      const pending: any = s.pending;
      expect(pending.playerId).toBe(picks % 2 ? "p1" : "p0");
      const opponent = JSON.stringify(viewForWitchTown(s, "p2"));
      for (const c of pending.pool)
        expect(opponent).not.toContain(JSON.stringify(c.id));
      conserved(s);
      s = JSON.parse(JSON.stringify(s));
      s = cmd(s, pending.playerId, {
        type: "LOOT_PICK",
        cardId: pending.pool[0].id,
      });
      picks++;
    }
    expect(picks).toBe(Math.min(size, 6));
    // For an empty pool there was no pending task and before already contains final hands.
    expect(s.players[1].hand.length - before[1]).toBe(
      Math.min(3, Math.floor(size / 2)),
    );
    expect(s.players[0].hand.length - before[0]).toBe(
      size - Math.min(3, Math.floor(size / 2)),
    );
    conserved(s);
  });

it("P13: Cotton death immediately rescales Martha's evidence and creates an executable trial", () => {
  let s = base();
  s.players[0].character = "cotton_mather";
  s.players[1].character = "martha_corey";
  for (let i = 0; i < 3; i++) s.players[1].table.push(pull(s, "evidence"));
  expect(accusationValue(s, "p1")).toBe(3);
  eliminate(s, s.players[0]);
  drain(s, 1000);
  expect(accusationValue(s, "p1")).toBe(9);
  expect(s.pending?.kind).toBe("trial");
  const p: any = s.pending;
  s = cmd(s, p.actorId, { type: "REVEAL_TRYAL", index: 0 });
  expect(s.pending?.kind).not.toBe("trial");
  conserved(s);
});

it("P9: a server deadline forces draw if no card was played, with persisted timer and no double draw", () => {
  let s = base();
  s = cmd(s, "p0", { type: "START_HOURGLASS" });
  expect((s.day as any).deadline).toBe(31000);
  s.deck.sort(
    (a, b) =>
      Number(["night", "conspiracy"].includes(a.kind)) -
      Number(["night", "conspiracy"].includes(b.kind)),
  );
  const hand = s.players[3].hand.length;
  expect(tickWitchTown(s, 30999, seededRandom(1))).toBeNull();
  s = tickWitchTown(JSON.parse(JSON.stringify(s)), 31000, seededRandom(1))!;
  expect(s.players[3].hand.length).toBe(hand + 2);
  expect(tickWitchTown(s, 31001, seededRandom(1))).toBeNull();
  conserved(s);
});

it("P5/P6/P12: shared loot interrupts Conspiracy before its live-ring snapshot and resumes the same event", () => {
  let s = base();
  s.players[0].character = "john_proctor";
  s.players[1].character = "martha_corey";
  s.players[3].tryals.slice(1).forEach((t) => (t.revealed = true));
  s = event(s);
  s = cmd(s, "p3", { type: "CONSPIRACY_REVEAL", index: 0 });
  expect(s.pending?.kind).toBe("loot");
  conserved(s);
  while (s.pending?.kind === "loot")
    s = cmd(s, s.pending.playerId, {
      type: "LOOT_PICK",
      cardId: s.pending.pool[0].id,
    });
  expect(s.pending?.kind).toBe("black-event");
  expect((s.pending as any).event.members).not.toContain("p3");
  for (const id of (s.pending as any).event.members)
    s = cmd(s, id, { type: "CONSPIRACY_PICK", index: 0 });
  expect(s.phase).toBe("day");
  conserved(s);
});

it("P9 hourglass ends a played turn without drawing and cannot be restarted", () => {
  let s = base();
  s = cmd(s, "p2", { type: "START_HOURGLASS" });
  expect(() => cmd(s, "p1", { type: "START_HOURGLASS" }, 2000)).toThrow(
    "HOURGLASS_ALREADY_RUNNING",
  );
  const c = pull(s, "accusation");
  s.players[3].hand.push(c);
  s = cmd(s, "p3", { type: "PLAY", cardId: c.id, targetId: "p4" }, 2000);
  const count = s.players[3].hand.length;
  s = tickWitchTown(s, 31000, seededRandom(1))!;
  expect(s.players[3].hand).toHaveLength(count);
  expect(s.turnPlayerId).toBe("p4");
  conserved(s);
});

it("DEFAULT_PENDING_CONFIRM X10: copied limited abilities keep a personal budget across neighbour changes", () => {
  let s = base();
  s.players[0].character = "samuel_parris";
  s.players[1].character = "martha_corey";
  s.turnPlayerId = "p1";
  s = cmd(s, "p1", { type: "PARRIS_DRAW", cardIds: [] });
  expect(s.players[1].abilityUses.samuel_parris).toBe(1);
  expect(s.players[0].abilityUses.samuel_parris).toBeUndefined();
  s.players[0].character = "tituba";
  s.turnPlayerId = "p1";
  s = cmd(s, "p1", { type: "TITUBA_START" });
  s.deck.sort(
    (a, b) =>
      Number(["night", "conspiracy"].includes(a.kind)) -
      Number(["night", "conspiracy"].includes(b.kind)),
  );
  s = cmd(s, "p1", { type: "TITUBA_FINISH" });
  s.players[0].character = "samuel_parris";
  s.turnPlayerId = "p1";
  s = cmd(s, "p1", { type: "PARRIS_DRAW", cardIds: [] });
  s.turnPlayerId = "p1";
  expect(() => cmd(s, "p1", { type: "PARRIS_DRAW", cardIds: [] })).toThrow(
    "ABILITY_EXHAUSTED",
  );
  conserved(s);
});

it("DEFAULT_PENDING_CONFIRM X06: Mary retains harmless Cat and does not reveal for its Conspiracy effect", () => {
  let s = base();
  s.players[3].character = "mary_warren";
  const hidden = s.players[3].tryals.filter((t) => !t.revealed).length;
  s = event(s);
  expect((s.pending as any).event.stage).toBe("picking");
  expect(s.players[3].tryals.filter((t) => !t.revealed)).toHaveLength(hidden);
  conserved(s);
});

it("P13 Matchmaker avoids simultaneous loss even with a third surviving historical Witch", () => {
  const s = base();
  s.players[0].tryals[0].kind = "not_witch";
  s.players[1].tryals[1].kind = "witch";
  for (const i of [3, 4, 5]) eliminate(s, s.players[i]);
  s.players[1].table.push(pull(s, "matchmaker"));
  s.players[2].table.push(pull(s, "matchmaker"));
  eliminate(s, s.players[1]);
  expect(s.players[2].alive).toBe(true);
  expect(s.players[0].alive).toBe(true);
  conserved(s);
});

it("P5/P8/P12: earlier unresolved shared loot is inherited causally when John dies later in the same night", () => {
  let s = base();
  s.players[0].character = "john_proctor";
  s.players[1].character = "martha_corey";
  s.players[3].tryals.slice(1).forEach((t) => (t.revealed = true));
  const night = pull(s, "night");
  s.deck.unshift(night);
  s = cmd(s, "p3", { type: "DRAW" });
  s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p0" });
  s = cmd(s, "p1", { type: "NIGHT_TARGET", targetId: "p0" });
  s = cmd(s, "p2", { type: "NIGHT_PROTECT", targetId: "p4" });
  s = cmd(s, "p3", { type: "CONFESS", index: 0 });
  const earlier = s.tasks.find((t) => t.kind === "loot");
  if (earlier?.kind !== "loot") throw Error("missing queued loot");
  const ids = earlier.pool.map((c) => c.id);
  s = tickWitchTown(s, 31000, seededRandom(2))!;
  expect(s.players[0].alive).toBe(false);
  // Martha receives her split, then inherits John's hand under the pre-death-copy default.
  expect(s.players[1].hand.map((c) => c.id)).toEqual(
    expect.arrayContaining(ids),
  );
  expect(
    s.tasks.some((t) => t.kind === "loot" && t.recipients.includes("p0")),
  ).toBe(false);
  conserved(s);
});

it("ONLINE_CONVENTION P8/P12: shared picks coexist with the confession window without resetting its deadline", () => {
  let s = base();
  s.players[0].character = "john_proctor";
  s.players[1].character = "martha_corey";
  s.players[3].tryals.slice(1).forEach((t) => (t.revealed = true));
  s.deck.unshift(pull(s, "night"));
  s = cmd(s, "p3", { type: "DRAW" });
  s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p4" });
  s = cmd(s, "p1", { type: "NIGHT_TARGET", targetId: "p4" });
  s = cmd(s, "p2", { type: "NIGHT_PROTECT", targetId: "p4" });
  s = cmd(s, "p3", { type: "CONFESS", index: 0 });
  const loot = s.tasks.find((t) => t.kind === "loot");
  if (loot?.kind !== "loot") throw Error("missing queued loot");
  expect(
    (viewForWitchTown(s, "p0").private as any).lootChoices[0].pool,
  ).toEqual(loot.pool);
  expect((viewForWitchTown(s, "p4").private as any).lootChoices).toEqual([]);
  s = cmd(s, "p0", { type: "LOOT_PICK", cardId: loot.pool[0].id }, 2000);
  expect(s.pending?.kind).toBe("black-event");
  expect((s.pending as any).event.deadline).toBe(31000);
  s = cmd(s, "p4", { type: "CONFESS", index: 0 }, 3000);
  expect((s.pending as any).event.confessed).toContain("p4");
  conserved(s);
});
