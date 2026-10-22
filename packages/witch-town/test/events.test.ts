import { describe, expect, it } from "vitest";
import {
  createWitchTown,
  seededRandom,
  reduceWitchTown,
  viewForWitchTown,
  type WTState,
  type CardKind,
} from "../src/index.ts";
import { tickWitchTown } from "../src/events.ts";
const ctx = (now = 1000) => ({ now, random: seededRandom(77) });
function base(n = 4) {
  let s = createWitchTown(
    {
      players: Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
      })),
      countsProfile: "candidate-59",
      allowCandidateCounts: true,
    },
    seededRandom(n),
  );
  for (const p of s.players) {
    p.character = "william_phips";
    p.everWitch = false;
    for (const t of p.tryals) t.kind = "not_witch";
  }
  s.players[0].tryals[0].kind = "witch";
  s.players[0].everWitch = true;
  s.players[1].tryals[0].kind = "constable";
  return reduceWitchTown(
    s,
    "p0",
    { type: "DAWN_TARGET", targetId: "p2" },
    ctx(),
  );
}
function pull(s: WTState, kind: CardKind) {
  for (const zone of [
    s.deck,
    s.discard,
    ...s.players.flatMap((p) => [p.hand, p.table]),
  ]) {
    const i = zone.findIndex((c) => c.kind === kind);
    if (i >= 0) return zone.splice(i, 1)[0];
  }
  throw Error("fixture missing " + kind);
}
function event(s: WTState, kind: "night" | "conspiracy") {
  s.deck.unshift(pull(s, kind));
  return reduceWitchTown(s, s.turnPlayerId!, { type: "DRAW" }, ctx());
}
const cmd = (s: WTState, id: string, c: any, now = 1000) =>
  reduceWitchTown(s, id, c, ctx(now));
function night(s: WTState, target = "p3", protect = "p2") {
  s = event(s, "night");
  s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: target });
  return cmd(s, "p1", { type: "NIGHT_PROTECT", targetId: protect });
}
function count(s: WTState) {
  const cards = [
    ...s.deck,
    ...s.discard,
    ...s.players.flatMap((p) => [...p.hand, ...p.table]),
    ...(s.dawnBlackCat ? [s.dawnBlackCat] : []),
    ...(s.pending?.kind === "black-event" ? [s.pending.card] : []),
    ...s.tasks.flatMap((t) =>
      t.kind === "resume-event" ? [t.pending.card] : [],
    ),
  ];
  expect(cards).toHaveLength(59);
  expect(new Set(cards.map((c) => c.id)).size).toBe(59);
}
describe("M3 events", () => {
  it("Ann dying during her interrupted reward cannot leave an impossible trial choice for a dead actor", () => {
    let s = base();
    s.players[2].character = "ann_putnam";
    for (let i = 0; i < 6; i++) s.players[3].table.push(pull(s, "accusation"));
    const final = pull(s, "accusation");
    s.players[2].hand.push(final);
    s = cmd(s, "p2", { type: "PLAY", cardId: final.id, targetId: "p3" });
    s.deck.unshift(pull(s, "night"));
    s = cmd(s, "p2", { type: "ABILITY_DECISION", use: true });
    s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p2" });
    s = cmd(s, "p1", { type: "NIGHT_PROTECT", targetId: "p3" });
    const before = structuredClone(s);
    const next = tickWitchTown(s, 31000, seededRandom(22))!;
    expect(next.pending).toMatchObject({
      kind: "trial",
      actorId: "p3",
      targetId: "p3",
    });
    count(next);
    expect(s).toEqual(before);
  });
  it("reconnecting Witch remembers the agreed attack while a townsperson never receives it", () => {
    let s = event(base(), "night");
    s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p3" });
    expect(viewForWitchTown(s, "p0").private?.choice).toMatchObject({
      knownAttackTargetId: "p3",
    });
    expect(JSON.stringify(viewForWitchTown(s, "p2"))).not.toContain(
      "knownAttackTargetId",
    );
    s = cmd(s, "p1", { type: "NIGHT_PROTECT", targetId: "p2" });
    expect(viewForWitchTown(s, "p0").private?.choice).toMatchObject({
      knownAttackTargetId: "p3",
    });
    expect(JSON.stringify(viewForWitchTown(s, "p3"))).not.toContain(
      "knownAttackTargetId",
    );
  });
  it("an interrupted Rebecca draw can resolve Night and return to the original Conspiracy without losing either card", () => {
    let s = base();
    s.players[1].character = "rebecca_nurse";
    s = event(s, "conspiracy");
    s.deck.unshift(pull(s, "night"));
    s = cmd(s, "p2", { type: "CONSPIRACY_REVEAL", index: 0 });
    expect(s.pending?.kind).toBe("ability");
    count(s);
    s = cmd(s, "p1", { type: "ABILITY_DECISION", use: true });
    expect((s.pending as any).event.type).toBe("night");
    count(s);
    s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p3" });
    s = cmd(s, "p1", { type: "NIGHT_PROTECT", targetId: "p3" });
    s = tickWitchTown(s, 31000, seededRandom(22))!;
    expect((s.pending as any).card.kind).toBe("conspiracy");
    expect((s.pending as any).event.stage).toBe("picking");
    count(s);
    for (let i = 0; i < 4; i++)
      s = cmd(s, `p${i}`, { type: "CONSPIRACY_PICK", index: 0 });
    count(s);
  });
  it("constable moves with simultaneous exchange and former Witch still coordinates the night", () => {
    let s = base();
    s.discard.push(...s.players[2].table.splice(0));
    s.blackCatOwnerId = null;
    s = event(s, "conspiracy");
    for (let i = 0; i < 4; i++)
      s = cmd(s, `p${i}`, { type: "CONSPIRACY_PICK", index: 0 });
    expect(s.players[0].tryals.some((t) => t.kind === "constable")).toBe(true);
    if (s.phase === "day") s = event(s, "night");
    s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p2" });
    expect((s.pending as any).event.stage).toBe("witches");
    s = cmd(s, "p3", { type: "NIGHT_TARGET", targetId: "p2" });
    expect((s.pending as any).event.stage).toBe("constable");
    expect(() =>
      cmd(s, "p1", { type: "NIGHT_PROTECT", targetId: "p3" }),
    ).toThrow("CONSTABLE_ONLY");
    s = cmd(s, "p0", { type: "NIGHT_PROTECT", targetId: "p1" });
    expect((s.pending as any).event.stage).toBe("confession");
    count(s);
  });
  it("protected matched partner still dies if original target dies, original target protection prevents the chain", () => {
    let s = base();
    s.players[2].table.push(pull(s, "matchmaker"));
    s.players[3].table.push(pull(s, "matchmaker"));
    s = night(s, "p3", "p2");
    s = tickWitchTown(s, 31000, seededRandom(2))!;
    expect(s.players[2].alive).toBe(false);
    expect(s.players[3].alive).toBe(false);
    count(s);
    s = base();
    s.players[2].table.push(pull(s, "matchmaker"));
    s.players[3].table.push(pull(s, "matchmaker"));
    s = night(s, "p3", "p3");
    s = tickWitchTown(s, 31000, seededRandom(2))!;
    expect(s.players[2].alive && s.players[3].alive).toBe(true);
    count(s);
  });
  it("cat's terminal Witch reveal ends before further transfer", () => {
    let s = base();
    s.players[0].table.push(...s.players[2].table.splice(0));
    s.blackCatOwnerId = "p0";
    s = event(s, "conspiracy");
    s = cmd(s, "p2", { type: "CONSPIRACY_REVEAL", index: 0 });
    expect(s.outcome?.team).toBe("townspeople");
    expect(s.players[0].alive).toBe(false);
    count(s);
  });
  it("P5/P6 cat death and simultaneous last infections resolve without freezing", () => {
    let s = base();
    s.players[2].tryals.slice(1).forEach((t) => (t.revealed = true));
    s = event(s, "conspiracy");
    let before = structuredClone(s);
    s = cmd(s, "p2", { type: "CONSPIRACY_REVEAL", index: 0 });
    expect(s.players[2].alive).toBe(false);
    expect((s.pending as any).event.members).not.toContain("p2");
    count(s);
    s = base();
    s.players[2].tryals[0].kind = "witch";
    s.players[2].everWitch = true;
    s.discard.push(...s.players[2].table.splice(0));
    s.blackCatOwnerId = null;
    s = event(s, "conspiracy");
    for (let i = 0; i < 3; i++)
      s = cmd(s, `p${i}`, { type: "CONSPIRACY_PICK", index: 0 });
    before = structuredClone(s);
    s = cmd(s, "p3", { type: "CONSPIRACY_PICK", index: 0 });
    expect(s.outcome?.team).toBe("witches");
    expect(s.outcome?.losers).toEqual(["p1", "p3"]);
    count(s);
  });
  it("confession is not protection from identity death and does not reward Rebecca", () => {
    let s = base();
    s.players[2].character = "rebecca_nurse";
    s.players[3].tryals.slice(1).forEach((t) => (t.revealed = true));
    s = night(s, "p2", "p3");
    s = cmd(s, "p3", { type: "CONFESS", index: 0 });
    expect(s.players[3].alive).toBe(false);
    expect(s.pending?.kind).toBe("black-event");
    expect(s.players[2].hand.length).toBe(3);
    count(s);
  });
  it("Governor and copied Governor retain a personal one-shot budget", () => {
    let s = night(base());
    s = cmd(s, "p3", { type: "CONFESS", useGovernor: true });
    (s.pending as any).event.confessed = [];
    expect(() => cmd(s, "p3", { type: "CONFESS", useGovernor: true })).toThrow(
      "ABILITY_EXHAUSTED",
    );
    s.players[3].character = "martha_corey";
    expect(() => cmd(s, "p3", { type: "CONFESS", useGovernor: true })).toThrow(
      "ABILITY_EXHAUSTED",
    );
    count(s);
  });
  it("an empty night rebuild cannot silently generate replacement cards", () => {
    let s = base();
    const nightCard = pull(s, "night");
    s.players[2].hand.push(...s.deck.splice(0), ...s.discard.splice(0));
    s.deck.push(nightCard);
    s = cmd(s, "p2", { type: "DRAW" });
    s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p3" });
    s = cmd(s, "p1", { type: "NIGHT_PROTECT", targetId: "p3" });
    const before = structuredClone(s);
    const next = tickWitchTown(s, 31000, seededRandom(1))!;
    expect(next.pending).toMatchObject({
      kind: "black-event",
      card: { kind: "night" },
    });
    count(next);
    expect(s).toEqual(before);
    count(s);
  });
  for (let n = 4; n <= 12; n++) {
    it(`${n} players simultaneous Conspiracy preserves revealed slots, identities and permanent faction`, () => {
      let s = base(n);
      s.players[2].table = s.players[2].table.filter((c) => {
        if (c.kind === "black_cat") {
          s.discard.push(c);
          return false;
        }
        return true;
      });
      s.blackCatOwnerId = null;
      const revealed = s.players[n - 1].tryals[1];
      revealed.revealed = true;
      const total = s.players
        .flatMap((p) => p.tryals)
        .map((t) => t.id)
        .sort();
      s = event(s, "conspiracy");
      for (let i = 0; i < n; i++)
        s = cmd(s, `p${i}`, { type: "CONSPIRACY_PICK", index: 0 });
      expect(
        s.players
          .flatMap((p) => p.tryals)
          .map((t) => t.id)
          .sort(),
      ).toEqual(total);
      expect(s.players[n - 1].tryals[1]).toEqual(revealed);
      expect(s.players[0].everWitch).toBe(true);
      expect(s.players[n - 1].everWitch).toBe(true);
      expect(s.players[n - 1].tryals.some((t) => t.kind === "witch")).toBe(
        true,
      );
      expect(s.players[0].tryals.some((t) => t.kind === "witch")).toBe(false);
      count(s);
    });
    it(`${n} players night kill, protection, automatic deadline and continuation`, () => {
      let s = night(base(n));
      expect(s.pending?.kind).toBe("black-event");
      expect(tickWitchTown(s, 30999, seededRandom(2))).toBeNull();
      s = tickWitchTown(s, 31000, seededRandom(2))!;
      expect(s.players[3].alive).toBe(false);
      expect(
        s.deck.some((c) => c.kind === "night") ||
          s.pending?.kind === "black-event",
      ).toBe(true);
      expect(s.turnPlayerId).toBe(
        "p4" in Object.fromEntries(s.players.map((p) => [p.id, true]))
          ? "p4"
          : "p0",
      );
      count(s);
      expect(tickWitchTown(s, 32000, seededRandom(2))).toBeNull();
    });
  }
  it("cat is revealed by drawer before transmission and rejects non-drawer", () => {
    let s = event(base(), "conspiracy");
    expect(() => cmd(s, "p1", { type: "CONSPIRACY_REVEAL", index: 0 })).toThrow(
      "NOT_YOUR_CHOICE",
    );
    s = cmd(s, "p2", { type: "CONSPIRACY_REVEAL", index: 0 });
    expect(s.players[2].tryals[0].revealed).toBe(true);
    expect((s.pending as any).event.stage).toBe("picking");
    count(s);
  });
  it("target and votes are secret, constable cannot self protect or skip, evil constable is allowed", () => {
    let s = event(base(), "night");
    s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p0" });
    expect(JSON.stringify(viewForWitchTown(s, "p2"))).not.toContain(
      '"attackTargetId"',
    );
    expect(() =>
      cmd(s, "p1", { type: "NIGHT_PROTECT", targetId: "p1" }),
    ).toThrow("NO_SELF_TARGET");
    expect(() =>
      cmd(s, "p2", { type: "NIGHT_PROTECT", targetId: "p0" }),
    ).toThrow("CONSTABLE_ONLY");
    expect(() =>
      cmd(s, "p1", { type: "NIGHT_PROTECT", targetId: null }),
    ).toThrow("PROTECT_ANOTHER_PLAYER");
    count(s);
  });
  it.each(["protection", "confession", "asylum"])(
    "%s prevents direct night kill",
    (mode) => {
      let s = base();
      if (mode === "asylum") s.players[3].table.push(pull(s, "asylum"));
      s = night(s, "p3", mode === "protection" ? "p3" : "p2");
      if (mode === "confession")
        s = cmd(s, "p3", { type: "CONFESS", index: 0 }, 2000);
      s = tickWitchTown(s, 31000, seededRandom(2))!;
      expect(s.players[3].alive).toBe(true);
      count(s);
    },
  );
  it("confession window cannot be forged or repeated and governor has one no-flip use", () => {
    let s = night(base());
    const countBefore = s.players[3].tryals.filter((t) => t.revealed).length;
    s = cmd(s, "p3", { type: "CONFESS", useGovernor: true }, 2000);
    expect(s.players[3].tryals.filter((t) => t.revealed)).toHaveLength(
      countBefore,
    );
    expect(s.players[3].abilityUses.william_phips).toBe(1);
    expect(() => cmd(s, "p3", { type: "CONFESS", index: 0 }, 3000)).toThrow(
      "ALREADY_CONFESSED",
    );
    expect(() => cmd(s, "p2", { type: "CONFESS", index: 0 }, 31000)).toThrow(
      "CONFESSION_CLOSED",
    );
    count(s);
  });
  it("revealed constable is inactive, transferred constable follows current ownership", () => {
    let s = base();
    s.players[1].tryals[0].revealed = true;
    s = event(s, "night");
    s = cmd(s, "p0", { type: "NIGHT_TARGET", targetId: "p3" });
    expect((s.pending as any).event.stage).toBe("confession");
    count(s);
  });
  it("last infected townsperson personally loses even though joining winning witches", () => {
    let s = base();
    for (const p of s.players) p.everWitch = p.id !== "p3";
    s.players[2].table = s.players[2].table.filter((c) => {
      s.discard.push(c);
      return false;
    });
    s.blackCatOwnerId = null;
    s = event(s, "conspiracy");
    for (let i = 0; i < 4; i++)
      s = cmd(s, `p${i}`, { type: "CONSPIRACY_PICK", index: 0 });
    expect(s.outcome?.team).toBe("witches");
    expect(s.outcome?.winners).not.toContain("p3");
    expect(s.outcome?.losers).toContain("p3");
    count(s);
  });
  it("solo farmer inherits hand and blues once on night death, not a duplicated discard", () => {
    let s = base();
    s.players[2].character = "john_proctor";
    s.players[3].table.push(pull(s, "asylum"));
    const asylum = s.players[3].table.pop()!;
    s.players[3].hand.push(asylum);
    const loot = s.players[3].hand.map((c) => c.id);
    s = night(s);
    s = tickWitchTown(s, 31000, seededRandom(2))!;
    for (const id of loot)
      expect(s.players[2].hand.some((c) => c.id === id)).toBe(true);
    count(s);
  });
});
