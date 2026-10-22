import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createWitchTown,
  seededRandom,
  reduceWitchTown,
  shuffle,
  PLAYER_CONFIGS,
  type WTState,
  type PlayingCard,
} from "../packages/witch-town/src/index.ts";
import {
  effectiveCharacter,
  type WTCommand,
} from "../packages/witch-town/src/day.ts";
import { tickWitchTown } from "../packages/witch-town/src/events.ts";
const rounds = Number(process.env.WT_SIM_ROUNDS ?? 20);
const activeRoles = process.env.WT_SIM_ACTIVE === "1";
const m4 = process.env.WT_SIM_M4 === "1";
assert(Number.isInteger(rounds) && rounds > 0 && rounds <= 10000);
function invariant(s: WTState, n: number) {
  const c = PLAYER_CONFIGS.find((c) => c.players === n)!;
  const identities = s.players.flatMap((p) => p.tryals);
  assert.equal(identities.length, c.total);
  assert.equal(new Set(identities.map((t) => t.id)).size, c.total);
  assert.equal(identities.filter((t) => t.kind === "witch").length, c.witch);
  assert.equal(identities.filter((t) => t.kind === "constable").length, 1);
  for (const p of s.players) {
    if (!p.alive) assert(p.tryals.every((t) => t.revealed));
    if (p.tryals.some((t) => t.kind === "witch")) assert(p.everWitch);
  }
  const cards = [
    ...s.deck,
    ...s.discard,
    ...s.players.flatMap((p) => [...p.hand, ...p.table]),
    ...(s.dawnBlackCat ? [s.dawnBlackCat] : []),
    ...(s.pending?.kind === "black-event" ? [s.pending.card] : []),
    ...(s.pending?.kind === "loot" ? s.pending.pool : []),
    ...s.tasks.flatMap((t) =>
      t.kind === "resume-event"
        ? [t.pending.card]
        : t.kind === "loot"
          ? t.pool
          : [],
    ),
  ];
  assert.equal(cards.length, 59);
  assert.equal(new Set(cards.map((c) => c.id)).size, 59);
}
const result: any[] = [];
for (let n = 4; n <= 12; n++) {
  const row = {
    players: n,
    attempted: rounds,
    completed: 0,
    ruleBlocked: 0,
    stepLimit: 0,
    blockedSeeds: [] as { seed: number; code: string }[],
    failures: [] as any[],
    blocks: {} as Record<string, number>,
    teams: { townspeople: 0, witches: 0 },
    commands: 0,
    triggers: {
      catFatal: 0,
      sharedLoot: 0,
      simultaneousLastInfections: 0,
      witchExemptionLost: 0,
    },
    ...(activeRoles ? { activeUses: { tituba: 0, samuel_parris: 0 } } : {}),
  };
  for (let run = 1; run <= rounds; run++) {
    const infectionFocus = m4 && run % 3 === 0;
    const seed = n * 10000 + run,
      rnd = seededRandom(seed);
    let now = 1000;
    let s = createWitchTown(
      {
        players: Array.from({ length: n }, (_, i) => ({
          id: `p${i}`,
          name: `P${i}`,
        })),
        countsProfile: "candidate-59",
        allowCandidateCounts: true,
      },
      rnd,
    );
    const apply = (actor: string, c: WTCommand) => {
      s = reduceWitchTown(s, actor, c, { now, random: rnd });
      row.commands++;
      invariant(s, n);
    };
    const choose = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
    try {
      const target = s.players.find(
        (p) =>
          !["mary_warren", "martha_corey"].includes(
            effectiveCharacter(s, p.id),
          ),
      )!.id;
      for (const p of s.players.filter((p) => p.everWitch))
        apply(p.id, { type: "DAWN_TARGET", targetId: target });
      for (let step = 0; step < 2000 && !s.outcome; step++) {
        now += 100;
        const p = s.pending;
        if (p?.kind === "loot") {
          apply(p.playerId, { type: "LOOT_PICK", cardId: choose(p.pool).id });
          continue;
        }
        if (p?.kind === "tituba") {
          apply(p.playerId, {
            type: "TITUBA_REORDER",
            cardIds: shuffle(
              s.deck.map((c) => c.id),
              rnd,
            ),
          });
          apply(p.playerId, { type: "TITUBA_FINISH" });
          continue;
        }
        if (p?.kind === "ability") {
          apply(p.playerId, {
            type: "ABILITY_DECISION",
            use: m4 ? rnd() < 0.65 : false,
          });
          continue;
        }
        if (p?.kind === "trial") {
          const hidden = s.players
            .find((q) => q.id === p.targetId)!
            .tryals.filter((t) => !t.revealed);
          const safe = hidden.findIndex((t) => t.kind !== "witch");
          apply(p.actorId, {
            type: "REVEAL_TRYAL",
            index:
              m4 && !infectionFocus
                ? Math.floor(rnd() * hidden.length)
                : safe >= 0
                  ? safe
                  : 0,
          });
          continue;
        }
        if (p?.kind === "black-event") {
          const e = p.event!;
          if (e.type === "conspiracy") {
            if (e.stage === "cat") {
              const hidden = s.players
                  .find((q) => q.id === s.blackCatOwnerId)!
                  .tryals.filter((t) => !t.revealed),
                safe = hidden.findIndex((t) => t.kind !== "witch");
              apply(p.drawerId, {
                type: "CONSPIRACY_REVEAL",
                index: safe >= 0 ? safe : 0,
              });
            } else {
              const receiver = e.members.find((id) => !e.picks[id])!;
              const source = s.players.find(
                (q) => q.id === e.leftOf[receiver],
              )!;
              apply(receiver, {
                type: "CONSPIRACY_PICK",
                index: Math.floor(
                  rnd() * source.tryals.filter((t) => !t.revealed).length,
                ),
              });
            }
            continue;
          }
          if (e.stage === "witches") {
            const witch = s.players.find(
              (q) => q.alive && q.everWitch && !e.votes[q.id],
            );
            const target =
              Object.values(e.votes)[0] ??
              (infectionFocus
                ? s.players.find(
                    (q) =>
                      q.alive &&
                      !q.tryals.some(
                        (t) => !t.revealed && t.kind === "constable",
                      ),
                  )?.id
                : undefined) ??
              s.players.find(
                (q) =>
                  q.alive &&
                  q.character === "martha_corey" &&
                  ["john_proctor", "rebecca_nurse", "cotton_mather"].includes(
                    effectiveCharacter(s, q.id),
                  ),
              )?.id ??
              s.players.find(
                (q) =>
                  q.alive && effectiveCharacter(s, q.id) === "rebecca_nurse",
              )?.id ??
              choose(s.players.filter((q) => q.alive)).id;
            apply(witch!.id, { type: "NIGHT_TARGET", targetId: target });
            continue;
          }
          if (e.stage === "constable") {
            const c = s.players.find(
              (q) =>
                q.alive &&
                q.tryals.some((t) => t.kind === "constable" && !t.revealed),
            )!;
            apply(c.id, {
              type: "NIGHT_PROTECT",
              targetId:
                infectionFocus && e.attackTargetId !== c.id
                  ? e.attackTargetId!
                  : choose(s.players.filter((q) => q.alive && q.id !== c.id))
                      .id,
            });
            continue;
          }
          if (m4) {
            const loot = s.tasks.find((t) => t.kind === "loot");
            if (loot?.kind === "loot" && rnd() < 0.8) {
              apply(loot.playerId, {
                type: "LOOT_PICK",
                cardId: choose(loot.pool).id,
              });
              continue;
            }
            const confessor = s.players.find(
              (q) => q.alive && !e.confessed.includes(q.id),
            );
            if (confessor && rnd() < 0.35) {
              const governor =
                effectiveCharacter(s, confessor.id) === "william_phips" &&
                !confessor.abilityUses.william_phips;
              const hidden = confessor.tryals.filter((t) => !t.revealed),
                safe = hidden.findIndex((t) => t.kind !== "witch");
              apply(
                confessor.id,
                governor
                  ? { type: "CONFESS", useGovernor: true }
                  : { type: "CONFESS", index: safe >= 0 ? safe : 0 },
              );
              continue;
            }
          }
          now = e.deadline!;
          const next = tickWitchTown(s, now, rnd);
          assert(next);
          s = next;
          row.commands++;
          invariant(s, n);
          continue;
        }
        assert.equal(s.phase, "day");
        const actor = s.players.find((q) => q.id === s.turnPlayerId)!;
        if (s.day.played) {
          apply(actor.id, { type: "END_TURN" });
          continue;
        }
        let played = false;
        if (
          activeRoles &&
          effectiveCharacter(s, actor.id) === "tituba" &&
          !actor.abilityUses.tituba
        ) {
          apply(actor.id, { type: "TITUBA_START" });
          row.activeUses!.tituba++;
          continue;
        }
        if (
          activeRoles &&
          effectiveCharacter(s, actor.id) === "samuel_parris" &&
          (actor.abilityUses.samuel_parris ?? 0) < 2 &&
          s.discard.length
        ) {
          const cardIds = s.discard
            .filter((c) => !["night", "conspiracy"].includes(c.kind))
            .slice(0, 2)
            .map((c) => c.id);
          apply(actor.id, { type: "PARRIS_DRAW", cardIds });
          row.activeUses!.samuel_parris++;
          continue;
        }
        const rebeccas = s.players.filter(
          (q) => q.alive && effectiveCharacter(s, q.id) === "rebecca_nurse",
        );
        for (const card of [...actor.hand].sort(() => rnd() - 0.5)) {
          const others = s.players.filter((q) => q.alive && q.id !== actor.id);
          let targets = [...others].sort(() => rnd() - 0.5);
          const red = ["accusation", "evidence", "witness"].includes(card.kind);
          if (!m4 && red && rebeccas.length) {
            targets = targets.filter(
              (q) => rebeccas.length === 1 && q.id === rebeccas[0].id,
            );
          }
          for (const target of targets) {
            const action: any = {
              type: "PLAY",
              cardId: card.id,
              targetId: target.id,
            };
            if (card.kind === "robbery" || card.kind === "scapegoat") {
              const recipient = others.find((q) => q.id !== target.id);
              if (!recipient) continue;
              action.recipientId = recipient.id;
            }
            if (card.kind === "curse") {
              const blue = target.table.find((c) =>
                ["black_cat", "asylum", "matchmaker", "piety"].includes(c.kind),
              );
              if (!blue) continue;
              action.blueId = blue.id;
            }
            if (card.kind === "alibi") action.removeIds = [];
            try {
              apply(actor.id, action);
              played = true;
              break;
            } catch (e) {
              if (!(e instanceof Error)) throw e;
              if (
                !e.message.startsWith("CHECK_REQUIRED") &&
                !["ALREADY_MATCHED", "NEED_THREE_LIVING_PLAYERS"].includes(
                  e.message,
                )
              )
                throw e;
            }
          }
          if (played) break;
        }
        if (!played) apply(actor.id, { type: "DRAW" });
      }
      if (s.outcome) {
        row.completed++;
        row.teams[s.outcome.team]++;
      } else row.stepLimit++;
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      if (code.startsWith("CHECK_REQUIRED")) {
        row.ruleBlocked++;
        row.blockedSeeds.push({ seed, code });
        row.blocks[code] = (row.blocks[code] ?? 0) + 1;
      } else row.failures.push({ seed, code, phase: s.phase });
    }
    const types = s.log.map((x) => x.type);
    row.triggers.catFatal += types.filter((x) => x === "CAT_FATAL").length;
    row.triggers.sharedLoot += types.filter(
      (x) => x === "SHARED_FARMER_LOOT",
    ).length;
    row.triggers.simultaneousLastInfections += types.filter(
      (x) => x === "SIMULTANEOUS_LAST_INFECTIONS",
    ).length;
    row.triggers.witchExemptionLost += types.filter(
      (x) => x === "WITCH_EXEMPTION_LOST",
    ).length;
  }
  result.push(row);
  console.log(
    activeRoles ? "WT_M4_ACTIVE_SIM" : "WT_M3_SIM",
    JSON.stringify(row),
  );
}
const report = {
  profile: "candidate-59",
  townHall:
    "actual random 15-character pool; bots may decline optional abilities",
  attemptedGamesPerPlayerCount: rounds,
  results: result,
  completeOriginalGameAcceptance: false,
  modeM4: m4,
  policies: m4
    ? "Every third game prioritizes transmission coverage by choosing non-Witch trial slots and protecting the agreed attack target; others use random trial slots. Optional abilities, confession and concurrent night loot are exercised. All transitions are legal commands from randomized setup."
    : undefined,
  ...(activeRoles
    ? {
        mode: "Tituba and Parris actively used; other optional abilities may be declined",
      }
    : {}),
};
mkdirSync("docs/witch-town/validation", { recursive: true });
writeFileSync(
  m4
    ? "docs/witch-town/validation/simulations-m4.json"
    : activeRoles
      ? "docs/witch-town/validation/simulations-m4-active.json"
      : "docs/witch-town/validation/simulations-m3.json",
  JSON.stringify(report, null, 2),
);
assert(
  result.every((r) => r.failures.length === 0),
  "unexpected simulation failures; inspect report",
);
if (m4) {
  assert(
    result.every(
      (r) => r.completed === rounds && r.ruleBlocked === 0 && r.stepLimit === 0,
    ),
    "M4 game completion gate failed; inspect report",
  );
  for (const key of [
    "catFatal",
    "sharedLoot",
    "simultaneousLastInfections",
    "witchExemptionLost",
  ])
    assert(
      result.reduce((n, r) => n + r.triggers[key], 0) > 0,
      `M4 missing actual trigger coverage: ${key}`,
    );
}
