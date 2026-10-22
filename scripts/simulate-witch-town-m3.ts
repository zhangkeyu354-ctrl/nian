import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createWitchTown,
  seededRandom,
  reduceWitchTown,
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
    ...s.tasks.flatMap((t) =>
      t.kind === "resume-event" ? [t.pending.card] : [],
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
  };
  for (let run = 1; run <= rounds; run++) {
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
        if (p?.kind === "ability") {
          apply(p.playerId, { type: "ABILITY_DECISION", use: false });
          continue;
        }
        if (p?.kind === "trial") {
          const hidden = s.players
            .find((q) => q.id === p.targetId)!
            .tryals.filter((t) => !t.revealed);
          const safe = hidden.findIndex((t) => t.kind !== "witch");
          apply(p.actorId, {
            type: "REVEAL_TRYAL",
            index: safe >= 0 ? safe : 0,
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
              targetId: choose(
                s.players.filter((q) => q.alive && q.id !== c.id),
              ).id,
            });
            continue;
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
        const rebeccas = s.players.filter(
          (q) => q.alive && effectiveCharacter(s, q.id) === "rebecca_nurse",
        );
        for (const card of [...actor.hand].sort(() => rnd() - 0.5)) {
          const others = s.players.filter((q) => q.alive && q.id !== actor.id);
          let targets = [...others].sort(() => rnd() - 0.5);
          const red = ["accusation", "evidence", "witness"].includes(card.kind);
          if (red && rebeccas.length) {
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
  }
  result.push(row);
  console.log("WT_M3_SIM", JSON.stringify(row));
}
const report = {
  profile: "candidate-59",
  townHall:
    "actual random 15-character pool; bots may decline optional abilities",
  attemptedGamesPerPlayerCount: rounds,
  results: result,
  completeOriginalGameAcceptance: false,
};
mkdirSync("docs/witch-town/validation", { recursive: true });
writeFileSync(
  "docs/witch-town/validation/simulations-m3.json",
  JSON.stringify(report, null, 2),
);
assert(
  result.every((r) => r.failures.length === 0),
  "unexpected simulation failures; inspect report",
);
