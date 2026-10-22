import assert from "node:assert/strict";
import type { WTState } from "../packages/witch-town/src/index.ts";
import type { WTLoot } from "../packages/witch-town/src/day.ts";
import type { WTRoomSnapshot } from "../packages/shared/src/wt-protocol.ts";
const keys = (value: any, allowed: string[], where: string) => {
  assert(value && typeof value === "object", where);
  for (const key of Object.keys(value))
    assert(allowed.includes(key), `${where}: unexpected ${key}`);
};
/** Independent wire allow-list + server-owned oracle; never uses viewForWitchTown. */
export function auditWTUpdate(
  w: WTRoomSnapshot,
  viewer: string | null,
  s: WTState | null,
) {
  keys(
    w,
    [
      "game",
      "code",
      "capacity",
      "stage",
      "version",
      "mySeat",
      "players",
      "view",
      "milestone",
    ],
    "room",
  );
  assert.equal(w.mySeat, viewer, "seat binding");
  for (const p of w.players)
    keys(p, ["id", "name", "ready", "host", "connected"], "lobby player");
  if (!s) {
    assert.equal(w.view, null);
    return;
  }
  const v: any = w.view;
  assert(v);
  assert.equal(v.phase, s.phase);
  keys(
    v,
    [
      "game",
      "rulesProfile",
      "countsProfile",
      "evidenceWarnings",
      "notices",
      "ruleDecisions",
      "phase",
      "turnPlayerId",
      "blackCatOwnerId",
      "gavelTargetId",
      "checkRequired",
      "deckCount",
      "discard",
      "pending",
      "day",
      "log",
      "outcome",
      "final",
      "players",
      "private",
    ],
    "view",
  );
  assert.equal(v.deckCount, s.deck.length);
  assert.deepEqual(v.discard, s.discard);
  assert.equal(v.players.length, s.players.length);
  for (const p of v.players) {
    keys(
      p,
      [
        "id",
        "name",
        "character",
        "alive",
        "hiddenTryalCount",
        "revealedTryals",
        "handCount",
        "table",
        "accusations",
      ],
      "public player",
    );
    const q: WTState["players"][number] = s.players.find((x) => x.id === p.id)!;
    assert(q);
    assert.equal(
      p.hiddenTryalCount,
      q.tryals.filter((t) => !t.revealed).length,
    );
    assert.deepEqual(
      p.revealedTryals,
      q.tryals.filter((t) => t.revealed).map((t) => t.kind),
    );
    assert.equal(p.handCount, q.hand.length);
    assert.deepEqual(p.table, q.table);
  }
  assert.deepEqual(v.log, s.log);
  for (const e of v.log) {
    keys(
      e,
      ["seq", "type", "actorId", "targetId", "cardKind", "tryalKind", "count"],
      "log",
    );
    if (e.type === "DRAW")
      assert(!("cardKind" in e), "drawn hand kind leaked in log");
  }
  if (s.phase !== "over") assert.equal(v.final, null, "early final disclosure");
  else
    assert.deepEqual(
      v.final,
      s.players.map((p) => ({
        id: p.id,
        tryals: p.tryals.map((t) => t.kind),
        everWitch: p.everWitch,
      })),
    );
  if (v.pending)
    keys(
      v.pending,
      [
        "kind",
        "playerId",
        "recipients",
        "remaining",
        "deadline",
        "cardKind",
        "drawerId",
        "stage",
        "confessed",
        "actorId",
        "targetId",
        "ability",
      ],
      "public pending",
    );
  if (!viewer) {
    assert.equal(v.private, null);
    return;
  }
  const q = s.players.find((x) => x.id === viewer)!;
  assert(q);
  const p = v.private;
  assert(p);
  keys(
    p,
    [
      "playerId",
      "tryals",
      "hand",
      "everWitch",
      "abilityUses",
      "choice",
      "lootChoices",
      "witchAllies",
      "dawnVotes",
    ],
    "private",
  );
  assert.equal(p.playerId, viewer);
  assert.deepEqual(p.tryals, q.tryals);
  assert.deepEqual(p.hand, q.hand);
  assert.equal(p.everWitch, q.everWitch);
  assert.deepEqual(p.abilityUses, q.abilityUses);
  if (p.witchAllies || p.dawnVotes) {
    assert(s.phase === "dawn" && q.everWitch, "unauthorized dawn votes");
    for (const [id, target] of Object.entries(p.dawnVotes ?? {})) {
      assert(s.players.some((q) => q.id === id && q.everWitch && q.alive));
      assert(s.players.some((q) => q.id === target));
    }
  }
  const pending = s.pending,
    e = pending?.kind === "black-event" ? pending.event : null,
    c = p.choice;
  if (c) {
    const allowed: Record<string, string[]> = {
      trial: ["targetId", "concealedCount"],
      ability: ["ability"],
      tituba: ["deck", "deadline"],
      loot: ["playerId", "pool", "taken", "recipients"],
      "conspiracy-cat": ["targetId", "concealedCount"],
      "conspiracy-pick": [
        "sourceId",
        "concealedCount",
        "submitted",
        "selectedIndex",
      ],
      "night-witch": ["allies", "votes"],
      "night-constable": ["knownAttackTargetId"],
      "night-witch-wait": ["knownAttackTargetId"],
      confession: [
        "confessed",
        "deadline",
        "governorAvailable",
        "copiedGovernorCheckRequired",
        "knownAttackTargetId",
      ],
    };
    assert(allowed[c.kind], "unknown private choice");
    keys(c, ["kind", ...allowed[c.kind]], "choice");
    if (c.kind === "trial")
      assert(pending?.kind === "trial" && pending.actorId === viewer);
    if (c.kind === "ability")
      assert(pending?.kind === "ability" && pending.playerId === viewer);
    if (c.kind === "tituba") {
      assert(
        pending?.kind === "tituba" && pending.playerId === viewer,
        "unauthorized deck order",
      );
      assert.deepEqual(
        c.deck.map((x: any) => x.id).sort(),
        s.deck.map((x) => x.id).sort(),
      );
    }
    if (c.kind === "conspiracy-cat")
      assert(
        e?.type === "conspiracy" &&
          e.stage === "cat" &&
          pending?.kind === "black-event" &&
          pending.drawerId === viewer,
      );
    if (c.kind === "conspiracy-pick") {
      assert(
        e?.type === "conspiracy" &&
          e.stage === "picking" &&
          e.members.includes(viewer),
      );
      assert.equal(typeof c.submitted, "boolean");
      if (c.submitted)
        assert(
          Number.isInteger(c.selectedIndex) &&
            c.selectedIndex >= 0 &&
            c.selectedIndex < c.concealedCount,
        );
      else assert.equal(c.selectedIndex, null);
    }
    if (c.kind === "night-witch") {
      assert(
        e?.type === "night" && e.stage === "witches" && q.alive && q.everWitch,
        "unauthorized night votes",
      );
      for (const [id, target] of Object.entries(c.votes)) {
        assert(s.players.some((q) => q.id === id && q.everWitch && q.alive));
        assert(s.players.some((q) => q.id === target && q.alive));
      }
    }
    if (c.kind === "night-witch-wait")
      assert(
        e?.type === "night" &&
          e.stage === "constable" &&
          q.alive &&
          q.everWitch,
      );
    if (c.kind === "night-constable")
      assert(
        e?.type === "night" &&
          e.stage === "constable" &&
          q.alive &&
          q.tryals.some((t) => !t.revealed && t.kind === "constable"),
      );
    if (c.kind === "confession")
      assert(e?.type === "night" && e.stage === "confession" && q.alive);
    if ("knownAttackTargetId" in c) {
      assert(q.everWitch && e?.type === "night");
      assert.equal(c.knownAttackTargetId, e.attackTargetId);
    }
  }
  for (const pool of [
    ...(p.lootChoices ?? []),
    ...(c?.kind === "loot" ? [c] : []),
  ]) {
    keys(
      pool,
      ["kind", "playerId", "pool", "taken", "recipients"],
      "private loot",
    );
    assert(
      q.alive && pool.recipients.includes(viewer),
      "unauthorized loot pool",
    );
    const actual: WTLoot | undefined =
      pending?.kind === "loot"
        ? pending
        : s.tasks.find((t) => t.kind === "loot");
    assert(actual?.kind === "loot");
    assert.deepEqual(pool.pool, actual.pool);
  }
}
