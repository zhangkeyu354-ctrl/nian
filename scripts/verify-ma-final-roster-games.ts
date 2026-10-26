/** Full games with deliberately arranged legal, unique hands, one per new racer.
 * Fixture construction guarantees participation; all subsequent commands use
 * the ordinary authoritative reducer. This is not random-deal fairness proof.
 */
import { createMAGame, reduceMA, total } from "../packages/magical-athlete/src/engine.ts";
import { SECOND_WIND_PREVIEW_IDS } from "../packages/magical-athlete/src/second-wind-preview.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import type { MACommand } from "../packages/magical-athlete/src/types.ts";
const games: Array<{
  focus: string;
  players: number;
  seed: number;
  commands: number;
  races: number;
  maxTokens: number;
  controlTransfers: number;
  finalPoints: Array<{ player: string; points: number }>;
  log_sha256: string;
}> = [];
for (const [i, focus] of SECOND_WIND_PREVIEW_IDS.entries()) {
  const n = 2 + (i % 7),
    seed = 1117 + i * 97;
  let s = createMAGame({
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    seed,
    settings: { secondWindPreview: true, deal: "random" },
  });
  const pool = [...s.players.flatMap((p) => p.hand), ...s.deck].filter((id) => id !== focus);
  for (const [j, p] of s.players.entries()) p.hand = j === 0 ? [focus, ...pool.splice(0, 3)] : pool.splice(0, 4);
  s.deck = pool;
  let steps = 0,
    maxTokens = 0,
    swapped = false;
  const seen = new Set<string>();
  while (s.phase !== "over") {
    assert(++steps < 6000, `${focus}: finite game`);
    let cmd: MACommand;
    if (s.phase === "choose") {
      const p = s.players.find((p) => !p.choices.length)!;
      const left = p.hand.filter((id) => !p.used.includes(id));
      cmd = { type: "CHOOSE", player: p.id, racer: left[0] };
    } else {
      const p = s.pending!;
      assert(p && p.options.length, `${focus}: pending`);
      let value =
        p.options.find((o) => o.value === "no")?.value ??
        p.options.find((o) => o.value === "keep")?.value ??
        p.options[0].value;
      if (p.kind === "cheatah_set") value = "4";
      if (p.kind === "switcharoo" && !swapped) {
        value = p.options.find((o) => o.value !== "no")!.value;
        swapped = true;
      }
      cmd = { type: "ANSWER", player: p.player, value };
    }
    s = reduceMA(s, cmd);
    maxTokens = Math.max(maxTokens, s.race?.tokens.length ?? 0);
    for (const t of s.race?.tokens ?? []) {
      seen.add(t.racer);
      assert(s.players.some((p) => p.id === t.owner));
    }
    if (s.pending) {
      for (const pid of [...s.seats.filter((id) => id !== s.pending!.player), null]) {
        const v = viewForMA(s, pid);
        assert.deepEqual(v.pending!.options, []);
        assert(!("turn" in v) && !("rng" in v) && !("deck" in v));
      }
    }
    for (const p of s.players) assert(p.chips.every((c) => c.value >= 0));
  }
  assert(seen.has(focus));
  assert.equal(s.log.filter((l) => l.fx?.kind === "podium").length, 4);
  assert.equal(new Set(s.players.flatMap((p) => p.hand)).size, n * 4, "card ownership stays unique");
  const hash = createHash("sha256").update(JSON.stringify(s.log)).digest("hex");
  games.push({
    focus,
    players: n,
    seed,
    commands: steps,
    races: 4,
    maxTokens,
    controlTransfers: s.log.filter((l) => l.fx?.kind === "control").length,
    finalPoints: s.players.map((p) => ({ player: p.id, points: total(p.chips) })),
    log_sha256: hash,
  });
}
const report = {
  fixture: "deliberately arranged unique hands; actual reducer commands",
  games: games.length,
  races: games.length * 4,
  new_racers_participating: games.map((g) => g.focus),
  players: [2, 3, 4, 5, 6, 7, 8].map((players) => ({
    players,
    games: games.filter((g) => g.players === players).length,
  })),
  results: games,
};
writeFileSync("docs/magical-athlete/second-wind/final-roster-games.json", JSON.stringify(report, null, 2) + "\n");
console.log(
  "MA_FINAL_ROSTER_GAMES_PASS",
  JSON.stringify({
    games: report.games,
    races: report.races,
    uniqueNewRacers: games.length,
    players: report.players,
    commands: games.reduce((n, g) => n + g.commands, 0),
    swaps: games.reduce((n, g) => n + g.controlTransfers, 0),
  }),
);
