import { describe, expect, it } from "vitest";
import {
  CHARACTERS,
  CARDS,
  PLAYER_CONFIGS,
  CANDIDATE_COUNTS,
} from "../src/data.ts";
import {
  createWitchTown,
  viewForWitchTown,
  seededRandom,
  buildPlayingDeck,
} from "../src/index.ts";

const lineup = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `玩家${i}` }));
const make = (n: number, seed = 1) =>
  createWitchTown(
    {
      players: lineup(n),
      countsProfile: "candidate-59",
      allowCandidateCounts: true,
    },
    seededRandom(seed),
  );

describe("Salem standard M1 setup", () => {
  it("keeps 15 distinct characters, source status, timing and limits", () => {
    expect(CHARACTERS).toHaveLength(15);
    expect(new Set(CHARACTERS.map((c) => c.key)).size).toBe(15);
    for (const c of CHARACTERS) {
      expect(c.nameEn).toBeTruthy();
      expect(c.nameZh).toBeTruthy();
      expect(c.timing).toBeTruthy();
      expect(c.abilityZh).toBeTruthy();
      expect(c.implementation).toBe("metadata-only");
    }
  });
  it("models color independently of duration and never silently confirms candidate counts", () => {
    expect(CARDS).toHaveLength(15);
    expect(CARDS.find((c) => c.key === "stocks")).toMatchObject({
      color: "green",
      lifecycle: "until-skipped-turn",
    });
    expect(CARDS.find((c) => c.key === "night")).toMatchObject({
      color: "black",
      lifecycle: "immediate-event",
    });
    expect(Object.values(CANDIDATE_COUNTS).reduce((a, b) => a + b, 0)).toBe(59);
    expect(() => buildPlayingDeck("official-standard")).toThrow(
      "CHECK_REQUIRED:X11",
    );
    expect(() => buildPlayingDeck("candidate-59")).toThrow(
      "CANDIDATE_COUNTS_DISABLED",
    );
  });
  for (const config of PLAYER_CONFIGS)
    describe(`${config.players} players`, () => {
      it("deals exact identity configuration and unique public characters", () => {
        const s = make(config.players);
        const all = s.players.flatMap((p) => p.tryals);
        expect(all).toHaveLength(config.total);
        expect(new Set(all.map((c) => c.id)).size).toBe(config.total);
        for (const p of s.players) {
          expect(p.tryals).toHaveLength(config.tryalsPerPlayer);
          expect(p.tryals.every((c) => !c.revealed)).toBe(true);
          expect(p.everWitch).toBe(p.tryals.some((c) => c.kind === "witch"));
        }
        expect(all.filter((c) => c.kind === "not_witch")).toHaveLength(
          config.notWitch,
        );
        expect(all.filter((c) => c.kind === "witch")).toHaveLength(
          config.witch,
        );
        expect(all.filter((c) => c.kind === "constable")).toHaveLength(1);
        expect(new Set(s.players.map((p) => p.character)).size).toBe(
          config.players,
        );
      });
      it("deals three non-black cards and reserves cat for dawn, Night in bottom half", () => {
        const s = make(config.players);
        expect(s.phase).toBe("dawn");
        expect(s.turnPlayerId).toBeNull();
        expect(s.blackCatOwnerId).toBeNull();
        for (const p of s.players) {
          expect(p.hand).toHaveLength(3);
          expect(
            p.hand.some((c) =>
              ["night", "conspiracy", "black_cat"].includes(c.kind),
            ),
          ).toBe(false);
        }
        const all = [
          ...s.deck,
          ...s.players.flatMap((p) => p.hand),
          s.dawnBlackCat,
        ];
        expect(all).toHaveLength(59);
        expect(new Set(all.map((c) => c.id)).size).toBe(59);
        for (const [kind, count] of Object.entries(CANDIDATE_COUNTS))
          expect(all.filter((c) => c.kind === kind)).toHaveLength(count);
        expect(
          s.deck.findIndex((c) => c.kind === "night"),
        ).toBeGreaterThanOrEqual(Math.floor((s.deck.length - 1) / 2));
        expect(s.unusedCharacters).toHaveLength(15 - config.players);
        expect(s.frameCharacters).toEqual(s.players.map((p) => p.character));
        expect(s.gavelTargetId).toBeNull();
      });
      it("isolates private projections, creates detached snapshots, no seeds or opponent IDs", () => {
        const s = make(config.players);
        const v = viewForWitchTown(s, "p0");
        expect(v.private?.tryals).toEqual(s.players[0].tryals);
        expect(v.private?.hand).toEqual(s.players[0].hand);
        expect(viewForWitchTown(s, null).private).toBeNull();
        expect(viewForWitchTown(s, "unknown").private).toBeNull();
        expect(
          v.players.every(
            (p) => !("hand" in p) && !("tryals" in p) && !("everWitch" in p),
          ),
        ).toBe(true);
        const wire = JSON.stringify(v);
        for (const p of s.players.slice(1))
          for (const c of [...p.tryals, ...p.hand])
            expect(wire).not.toContain(`"${c.id}"`);
        expect(wire).not.toContain('"deck":');
        expect(wire).not.toContain('"seed":');
        v.private!.hand.length = 0;
        expect(s.players[0].hand).toHaveLength(3);
      });
      it("1000 reproducible shuffled deals preserve every instance and include non-fixed night positions", () => {
        const signatures = new Set<string>(),
          nights = new Set<number>();
        for (let seed = 1; seed <= 1000; seed++) {
          const s = make(config.players, seed);
          const identities = s.players.flatMap((p) => p.tryals);
          expect(identities).toHaveLength(config.total);
          expect(new Set(identities.map((c) => c.id)).size).toBe(config.total);
          expect(identities.filter((c) => c.kind === "witch")).toHaveLength(
            config.witch,
          );
          expect(identities.filter((c) => c.kind === "constable")).toHaveLength(
            1,
          );
          expect(identities.filter((c) => c.kind === "not_witch")).toHaveLength(
            config.notWitch,
          );
          const cards = [
            ...s.deck,
            ...s.players.flatMap((p) => p.hand),
            s.dawnBlackCat,
          ];
          expect(new Set(cards.map((c) => c.id)).size).toBe(59);
          for (const [kind, count] of Object.entries(CANDIDATE_COUNTS))
            expect(cards.filter((c) => c.kind === kind)).toHaveLength(count);
          expect(
            s.players.every((p) =>
              p.hand.every(
                (c) => !["night", "conspiracy", "black_cat"].includes(c.kind),
              ),
            ),
          ).toBe(true);
          expect(
            s.players.every(
              (p) =>
                p.hand.length === 3 &&
                p.tryals.length === config.tryalsPerPlayer,
            ),
          ).toBe(true);
          signatures.add(identities.map((c) => c.id).join(","));
          nights.add(s.deck.findIndex((c) => c.kind === "night"));
        }
        expect(signatures.size).toBeGreaterThan(990);
        expect(nights.size).toBeGreaterThan(2);
        expect(make(config.players, 77)).toEqual(make(config.players, 77));
      });
    });
  it("rejects invalid rosters, duplicate IDs, invalid randomness and unsupported profiles", () => {
    for (const n of [0, 3, 13])
      expect(() => make(n)).toThrow("BAD_PLAYER_COUNT");
    expect(() =>
      createWitchTown(
        {
          players: [...lineup(3), lineup(1)[0]],
          countsProfile: "candidate-59",
          allowCandidateCounts: true,
        },
        seededRandom(1),
      ),
    ).toThrow("BAD_ROSTER");
    expect(() =>
      createWitchTown({ players: lineup(4) }, seededRandom(1)),
    ).toThrow("CHECK_REQUIRED:X11");
    expect(() =>
      createWitchTown(
        {
          players: lineup(4),
          countsProfile: "candidate-59",
          allowCandidateCounts: true,
        },
        () => 1,
      ),
    ).toThrow("BAD_RANDOM");
  });
  it("allows two witch cards and constable to belong to same player", () => {
    let same = false,
      evilConstable = false;
    for (let seed = 1; seed <= 300; seed++)
      for (const p of make(6, seed).players) {
        if (p.tryals.filter((c) => c.kind === "witch").length === 2)
          same = true;
        if (p.everWitch && p.tryals.some((c) => c.kind === "constable"))
          evilConstable = true;
      }
    expect(same).toBe(true);
    expect(evilConstable).toBe(true);
  });
});
