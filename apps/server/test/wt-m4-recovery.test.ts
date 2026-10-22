import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it, expect } from "vitest";
import { WTRoomStore } from "../src/wt-rooms.ts";
import {
  createWitchTown,
  seededRandom,
  reduceWitchTown,
  type WTState,
  type CardKind,
} from "../../../packages/witch-town/src/index.ts";
import {
  eliminate,
  drain,
  type WTCommand,
} from "../../../packages/witch-town/src/day.ts";
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "wt-m4-recovery-"));
  dirs.push(dir);
  return { dir, store: new WTRoomStore(dir) };
}

it("ONLINE_CONVENTION: a client-generated secret claim key recovers a lost response after restart without duplicate seats or plaintext credentials", () => {
  const { dir, store } = setup(),
    code = store.create(4),
    key = "09ab".repeat(16);
  const first = (store.claim as any)(code, "甲", key);
  const publicBefore = store.snapshot(code, null);
  const restored = new WTRoomStore(dir);
  expect((restored.claim as any)(code, "甲", key)).toEqual(first);
  expect(restored.snapshot(code, null)).toEqual(publicBefore);
  expect(restored.snapshot(code, first.token).mySeat).toBe(first.playerId);
  const saved = readFileSync(join(dir, `${code}.json`), "utf8");
  expect(saved).not.toContain(key);
  expect(saved).not.toContain(first.token);
  expect(() => (restored.claim as any)(code, "别名", key)).toThrow(
    "CLAIM_KEY_REUSED",
  );
  expect(
    (restored.claim as any)(code, "乙", "1234".repeat(16)).playerId,
  ).not.toBe(first.playerId);
});

it("default room start uses candidate counts with a visible warning instead of blocking play (X11 user instruction)", () => {
  const { store } = setup(),
    code = store.create(4),
    seats = Array.from({ length: 4 }, (_, i) => store.claim(code, `P${i}`));
  for (const [i, seat] of seats.entries())
    store.action(code, seat.token, {
      requestId: `r${i}`,
      version: store.snapshot(code, null).version,
      action: { type: "READY", ready: true },
    });
  store.action(code, seats[0].token, {
    requestId: "start",
    version: store.snapshot(code, null).version,
    action: { type: "START" },
  });
  const view = store.snapshot(code, seats[0].token).view!;
  expect(view.countsProfile).toBe("candidate-59");
  expect((view as any).notices).toContain("部分张数待官方核实");
});

it("RULE_DERIVED: a saved ordinary day deadline survives restart and resolves once", () => {
  const { dir, store } = setup(),
    code = store.create(4),
    seats = Array.from({ length: 4 }, (_, i) => store.claim(code, `P${i}`));
  for (const [i, seat] of seats.entries())
    store.action(code, seat.token, {
      requestId: `r${i}`,
      version: store.snapshot(code, null).version,
      action: { type: "READY", ready: true },
    });
  store.action(code, seats[0].token, {
    requestId: "start",
    version: store.snapshot(code, null).version,
    action: { type: "START" },
  });
  const file = join(dir, `${code}.json`),
    r = JSON.parse(readFileSync(file, "utf8"));
  r.state.phase = "day";
  r.state.pending = null;
  r.state.turnPlayerId = seats[0].playerId;
  r.state.day = { played: 0, deadline: 31000 };
  r.state.players[0].table.push(r.state.dawnBlackCat);
  r.state.dawnBlackCat = null;
  r.state.deck.sort(
    (a: any, b: any) =>
      Number(["night", "conspiracy"].includes(a.kind)) -
      Number(["night", "conspiracy"].includes(b.kind)),
  );
  writeFileSync(file, JSON.stringify(r));
  const restored = new WTRoomStore(dir);
  expect(restored.tick(30999)).toEqual([]);
  expect(restored.tick(31000)).toEqual([code]);
  expect(
    restored.snapshot(code, seats[0].token).view!.private!.hand,
  ).toHaveLength(5);
  expect(new WTRoomStore(dir).tick(31001)).toEqual([]);
});

function pull(s: WTState, kind: CardKind) {
  for (const z of [
    s.deck,
    s.discard,
    ...s.players.flatMap((p) => [p.hand, p.table]),
  ]) {
    const i = z.findIndex((c) => c.kind === kind);
    if (i >= 0) return z.splice(i, 1)[0];
  }
  throw Error(`missing ${kind}`);
}
const stages = [
  "dawn",
  "day",
  "trial",
  "ability",
  "cat",
  "picking",
  "witches",
  "constable",
  "confession",
  "confession-loot",
  "tituba",
  "loot",
] as const;
for (let n = 4; n <= 12; n++)
  for (const stage of stages)
    it(`${n} players ${stage}: disk restart, private rejoin, next action, durable idempotent retry`, () => {
      const { dir, store } = setup(),
        code = store.create(n),
        seats = Array.from({ length: n }, (_, i) => store.claim(code, `P${i}`));
      const id = (i: number) => seats[i].playerId;
      let s = createWitchTown(
        {
          players: seats.map((p, i) => ({ id: p.playerId, name: `P${i}` })),
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
      if (n >= 6) {
        s.players[1].tryals[0].kind = "witch";
        s.players[1].everWitch = true;
      }
      s.players[2].tryals[0].kind = "constable";
      const apply = (i: number, c: WTCommand) => {
        s = reduceWitchTown(s, id(i), c, {
          now: 1000,
          random: seededRandom(1),
        });
      };
      let actor = 0,
        action: WTCommand = { type: "DAWN_TARGET", targetId: id(3) };
      if (stage !== "dawn") {
        for (let i = 0; i < n; i++)
          if (s.players[i].everWitch)
            apply(i, { type: "DAWN_TARGET", targetId: id(3) });
        actor = 3;
        action = { type: "DRAW" };
        if (stage === "day") {
          s.deck.sort(
            (a, b) =>
              Number(["night", "conspiracy"].includes(a.kind)) -
              Number(["night", "conspiracy"].includes(b.kind)),
          );
        } else if (stage === "trial" || stage === "ability") {
          if (stage === "ability") s.players[3].character = "ann_putnam";
          for (let j = 0; j < 6; j++)
            s.players[2].table.push(pull(s, "accusation"));
          const c = pull(s, "accusation");
          s.players[3].hand.push(c);
          apply(3, { type: "PLAY", cardId: c.id, targetId: id(2) });
          action =
            stage === "ability"
              ? { type: "ABILITY_DECISION", use: false }
              : { type: "REVEAL_TRYAL", index: 0 };
        } else if (stage === "tituba") {
          s.players[3].character = "tituba";
          apply(3, { type: "TITUBA_START" });
          action = {
            type: "TITUBA_REORDER",
            cardIds: s.deck.map((c) => c.id).reverse(),
          };
        } else if (stage === "loot") {
          s.players[0].character = "john_proctor";
          s.players[1].character = "martha_corey";
          eliminate(s, s.players[3]);
          drain(s, 1000);
          if (s.pending?.kind !== "loot") throw Error("missing loot");
          actor = 0;
          action = { type: "LOOT_PICK", cardId: s.pending.pool[0].id };
        } else {
          const conspiracy = stage === "cat" || stage === "picking";
          s.deck.unshift(pull(s, conspiracy ? "conspiracy" : "night"));
          apply(3, { type: "DRAW" });
          if (conspiracy) {
            action = { type: "CONSPIRACY_REVEAL", index: 0 };
            if (stage === "picking") {
              apply(3, action);
              actor = 0;
              action = { type: "CONSPIRACY_PICK", index: 0 };
            }
          } else {
            actor = 0;
            action = { type: "NIGHT_TARGET", targetId: id(3) };
            if (stage !== "witches") {
              for (let i = 0; i < n; i++)
                if (s.players[i].everWitch) apply(i, action);
              actor = 2;
              action = { type: "NIGHT_PROTECT", targetId: id(3) };
              if (stage === "confession" || stage === "confession-loot") {
                apply(2, action);
                actor = 3;
                action = { type: "CONFESS", index: 0 };
                if (stage === "confession-loot") {
                  s.players[0].character = "john_proctor";
                  s.players[1].character = "martha_corey";
                  s.players[3].tryals
                    .slice(1)
                    .forEach((t) => (t.revealed = true));
                  apply(3, action);
                  const loot = s.tasks.find((t) => t.kind === "loot");
                  if (loot?.kind !== "loot")
                    throw Error("missing concurrent loot");
                  actor = 0;
                  action = { type: "LOOT_PICK", cardId: loot.pool[0].id };
                }
              }
            }
          }
        }
      }
      const file = join(dir, `${code}.json`),
        r = JSON.parse(readFileSync(file, "utf8"));
      r.state = s;
      writeFileSync(file, JSON.stringify(r));
      let restored = new WTRoomStore(dir),
        own = restored.snapshot(code, seats[actor].token);
      const checkpoint = JSON.stringify(own);
      restored = new WTRoomStore(dir);
      expect(JSON.stringify(restored.snapshot(code, seats[actor].token))).toBe(
        checkpoint,
      );
      const publicJSON = JSON.stringify(restored.snapshot(code, null));
      expect(publicJSON).not.toContain('"pool":');
      expect(publicJSON).not.toContain('"tryals":');
      const request = { requestId: "resume", version: own.version, action };
      restored.action(code, seats[actor].token, request, 2000);
      const next = restored.snapshot(code, seats[actor].token);
      restored = new WTRoomStore(dir);
      restored.action(code, seats[actor].token, request, 3000);
      expect(restored.snapshot(code, seats[actor].token)).toEqual(next);
    });
