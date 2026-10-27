import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { strict as assert } from "node:assert";
import {
  createSS,
  reduceSS,
  viewForSS,
  assertInvariants,
  EVENTS,
  type SSState,
  type Command,
} from "../packages/soda-smugglers/src/index.ts";
const report: {
  players: number;
  events: boolean;
  seed: number;
  rounds: number;
  commands: number;
  winners: number[];
  eventIds: string[];
}[] = [];
let privacyChecks = 0;
const eventCoverage = new Set<string>();
const started = performance.now();
function step(
  s: SSState,
  body: Record<string, unknown>,
  actor: number | "server" = s.guard,
) {
  const c = {
    ...body,
    actor,
    seq: (s.seq[String(actor)] ?? 0) + 1,
    now: 0,
  } as Command;
  const before = JSON.stringify(s);
  const next = reduceSS(s, c);
  assert.equal(JSON.stringify(s), before, "reduce must not mutate");
  assertInvariants(next);
  // All seats plus spectator: evaluate the actual projection, not CSS hiding.
  for (let seat = -1; seat < s.players.length; seat++) {
    const v = viewForSS(next, seat);
    assert.equal("random" in v, false);
    assert.equal("deck" in v, false);
    assert.equal("eventDeck" in v, false);
    v.players.forEach((p, i) => {
      if (i === seat) return;
      assert.equal(p.hand, undefined);
      if (next.phase === "PACK") assert.equal(p.bribe, null);
      p.luggage.forEach((card, j) => {
        if (card) {
          assert.equal("id" in card, false);
          assert(
            next.players[i].settled || next.players[i].revealed.includes(j),
          );
        } else assert(!next.players[i].settled);
      });
    });
    assert(!/SS[0-3]-\d/.test(JSON.stringify(v.history)));
    privacyChecks++;
  }
  return next;
}
for (const players of [3, 5, 8])
  for (const events of [false, true])
    for (let seed = 1; seed <= 200; seed++) {
      let s = createSS(
        Array.from({ length: players }, (_, i) => `旅客${i}`),
        { seed, events, firstGuard: seed % players, now: 0 },
      );
      let commands = 0;
      const seen: string[] = [];
      const run = (
        body: Record<string, unknown>,
        actor: number | "server" = s.guard,
      ) => {
        s = step(s, body, actor);
        commands++;
        assert(commands < 500, "simulation stuck");
      };
      while (s.phase !== "FINISHED") {
        if (s.phase === "PACK") {
          if (s.event) {
            seen.push(s.event);
            eventCoverage.add(s.event);
          }
          for (let i = players - 1; i >= 0; i--)
            if (i !== s.guard) {
              const own = viewForSS(s, i);
              const hand = own.players[i].hand!;
              const count = s.event === "holiday" ? 3 : 2;
              const sorted = [...hand].sort(
                (a, b) =>
                  (seed % 2 ? a.bottles - b.bottles : b.bottles - a.bottles) ||
                  a.id.localeCompare(b.id),
              );
              run(
                {
                  type: "SUBMIT",
                  luggage: sorted.slice(0, count).map((c) => c.id),
                  bribe: sorted[count].id,
                },
                i,
              );
            }
        } else if (s.phase === "BRIBE") {
          if (s.event === "greedy" && seed % 2 === 0) {
            run({ type: "GREEDY" });
            continue;
          }
          const remaining = s.players.flatMap((p, i) =>
            i !== s.guard && !p.settled ? [i] : [],
          );
          for (const target of remaining.slice(
            0,
            seed % 3 === 0 ? 0 : s.budget.bribe,
          ))
            run({ type: "ACCEPT", target });
          if (s.event === "night") {
            const target = s.players.findIndex(
              (p, i) => i !== s.guard && !p.settled,
            );
            if (target >= 0) run({ type: "ACCEPT", target, useEvent: true });
          }
          run({ type: "ADVANCE" });
        } else if (s.phase === "INSPECT") {
          if (s.pendingDog !== null) {
            const target = s.pendingDog;
            const own = viewForSS(s, target);
            const bags = own.players[target].luggage;
            const max = Math.max(...bags.map((c) => c!.bottles));
            const index = bags.findIndex((c) => c!.bottles === max);
            run({ type: "REVEAL_DOG", index }, target);
            continue;
          }
          const candidates = s.players.flatMap((p, i) =>
            i !== s.guard && !p.settled && p.revealed.length === 0 ? [i] : [],
          );
          if (s.event === "dog" && !s.eventUsed && candidates.length) {
            run({ type: "INSPECT", target: candidates[0], useEvent: true });
            continue;
          }
          if (s.budget.inspect > 0 && candidates.length) {
            run({ type: "INSPECT", target: candidates[0], index: seed % 2 });
            continue;
          }
          if (s.event === "inspection" && !s.eventUsed) {
            const target = s.players.findIndex(
              (p, i) => i !== s.guard && !p.settled,
            );
            if (target >= 0) {
              const index = s.players[target].revealed.includes(0) ? 1 : 0;
              run({ type: "INSPECT", target, index, useEvent: true });
              continue;
            }
          }
          run({ type: "ADVANCE" });
        } else if (s.phase === "ARREST") {
          const target = s.players.findIndex(
            (p, i) => i !== s.guard && !p.settled,
          );
          if (target >= 0 && s.event === "impartial" && !s.eventUsed) {
            run({ type: "ARREST", target, useEvent: true });
            continue;
          }
          if (target >= 0 && s.budget.arrest > 0 && seed % 4 !== 0) {
            run({ type: "ARREST", target });
            continue;
          }
          run({ type: "ADVANCE" });
        } else run({ type: "NEXT_ROUND" });
      }
      assert.equal(s.round, players * (players <= 4 ? 2 : 1));
      assert(s.result!.winners.length >= 1);
      report.push({
        players,
        events,
        seed,
        rounds: s.round,
        commands,
        winners: s.result!.winners,
        eventIds: seen,
      });
    }
assert.deepEqual([...eventCoverage].sort(), [...EVENTS].sort());
const output = {
  games: report.length,
  passed: report.length,
  failed: 0,
  privacyChecks,
  eventCoverage: [...eventCoverage].sort(),
  elapsedMs: Math.round(performance.now() - started),
  batches: [3, 5, 8].flatMap((players) =>
    [false, true].map((events) => ({
      players,
      events,
      seeds: "1..200",
      games: report.filter((r) => r.players === players && r.events === events)
        .length,
    })),
  ),
  runs: report,
};
mkdirSync("docs/soda-smugglers/verification", { recursive: true });
writeFileSync(
  "docs/soda-smugglers/verification/stage2-simulations.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify({ ...output, runs: undefined }));
