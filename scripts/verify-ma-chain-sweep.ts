import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createMAGame,
  reduceMA,
  testRace,
  MARuleError,
} from "../packages/magical-athlete/src/engine.ts";
import type { MACommand, MAState } from "../packages/magical-athlete/src/types.ts";
import {
  checkChainInvariants,
  compactChainHistory,
} from "../packages/magical-athlete/test/chain-invariants.ts";

const count = Number(process.env.MA_SWEEP_GAMES ?? 2000);
const engineHash = createHash("sha256");
for (const file of ["engine.ts", "types.ts", "privacy.ts"])
  engineHash.update(readFileSync(`packages/magical-athlete/src/${file}`));
const engineSHA256 = engineHash.digest("hex");
const startGame = Number(process.env.MA_SWEEP_START ?? 0);
const only = process.env.MA_SWEEP_PLAYERS
  ? process.env.MA_SWEEP_PLAYERS.split(",").map(Number)
  : [2, 3, 4, 5, 6, 7, 8];
const out = process.env.MA_SWEEP_OUT ?? "output/ma-chain-sweep";
mkdirSync(out, { recursive: true });
const focus = [
  "scoocher",
  "suckerfish",
  "party_animal",
  "huge_baby",
  "sw_doppelgangster",
  "copycat",
  "twin",
  "sw_mush",
  "sw_switcharoo",
  "sw_spoilsport",
  "mastermind",
  "sw_stepdad",
  "sw_icarus",
  "mouth",
];
const results: object[] = [];
for (const n of only) {
  let commands = 0,
    races = 0,
    stress = 0,
    completedGames = 0,
    completedStress = 0;
  const blocked: Array<{ seed: number; stage: string; error: string }> = [];
  const start = Date.now();
  for (let game = startGame; game < count; game++) {
    const seed = 29000000 + n * 100000 + game;
    writeFileSync(`${out}/progress-${n}.json`, JSON.stringify({ players: n, game, seed, completed: game }));
    let random = seed;
    const pick = (len: number) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return Math.floor((random / 2 ** 32) * len);
    };
    let s = createMAGame({
      players: Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
      })),
      seed,
      settings: { secondWindPreview: true, deal: "random" },
    });
    // Half the games use arranged but legal, unique hands biased toward chain powers.
    if (game % 2 === 0) {
      const all = [...s.players.flatMap((p) => p.hand), ...s.deck];
      const pool = [
        ...focus.slice(game % focus.length),
        ...focus.slice(0, game % focus.length),
        ...all.filter((x) => !focus.includes(x)),
      ];
      for (const p of s.players) p.hand = pool.splice(0, 4);
      s.deck = pool;
    }
    let steps = 0;
    let archivedRaces = 0;
    let stage = "game";
    let archivedLog: MAState["log"] = [];
    const check = () => {
      checkChainInvariants({ ...s, log: [...archivedLog, ...s.log] });
    };
    const history: MACommand[] = [];
    try {
      check();
      while (s.phase !== "over") {
        if (++steps > 2000)
          throw new Error("test command cap exceeded; inspect saved trace, do not truncate the real game");
        let cmd: MACommand;
        if (s.phase === "choose") {
          const p = s.players.find((p) => !p.choices.length)!;
          const choices = p.hand.filter((x) => !p.used.includes(x));
          cmd = {
            type: "CHOOSE",
            player: p.id,
            racer: choices[pick(choices.length)],
          };
        } else {
          const p = s.pending!;
          let options = p.options;
          // Avoid a player deliberately choosing a perpetual optional self-trip.
          if (p.kind === "kingtripper") options = options.filter((o) => o.value === "no");
          cmd = {
            type: "ANSWER",
            player: p.player,
            value: options[pick(options.length)].value,
          };
        }
        if (process.env.MA_SWEEP_DEBUG === "1")
          writeFileSync(`${out}/current.json`, JSON.stringify({ n, game, seed, steps, cmd, state: s }));
        history.push(cmd);
        s = reduceMA(s, cmd);
        commands++;
        check();
        if (process.env.MA_SWEEP_KEEP_HISTORY !== "1") {
          const batch = compactChainHistory(s);
          archivedLog.push(...batch);
          archivedRaces += batch.filter((l) => l.fx?.kind === "podium").length;
        }
      }
      races += archivedRaces + s.log.filter((l) => l.fx?.kind === "podium").length;
      completedGames++;
      if (game % 4 === 0) {
        stage = "stress";
        archivedLog = [];
        s = testRace({
          racers: s.players.map((p) => p.hand[0]),
          pos: Array.from({ length: n }, (_, i) => 27 + ((i + game) % 3)),
          seed,
          secondWindPreview: true,
          skipSetup: true,
        });
        // testRace bypasses the draft; remove physical cards already in hands.
        const cards = new Set(s.players.flatMap((p) => p.hand));
        s.deck = s.deck.filter((id) => !cards.has(id));
        if (s.turn) {
          const snapshot = JSON.parse(s.turn.snapshot) as MAState;
          snapshot.deck = snapshot.deck.filter((id) => !cards.has(id));
          s.turn.snapshot = JSON.stringify(snapshot);
        }
        stress++;
        for (let j = 0; s.phase === "race"; j++) {
          if (j > 3000) throw new Error("stress command cap");
          const p = s.pending!;
          const options = p.kind === "kingtripper" ? p.options.filter((o) => o.value === "no") : p.options;
          const cmd: MACommand = {
            type: "ANSWER",
            player: p.player,
            value: options[pick(options.length)].value,
          };
          history.push(cmd);
          s = reduceMA(s, cmd);
          commands++;
          check();
        }
        completedStress++;
      }
    } catch (error) {
      writeFileSync(
        `${out}/failure-${n}-${seed}.json`,
        JSON.stringify(
          {
            n,
            seed,
            game,
            steps,
            error: String(error),
            code: error instanceof MARuleError ? error.code : null,
            stack: error instanceof Error ? error.stack : null,
            history,
            archivedLog,
            state: s,
          },
          null,
          2,
        ),
      );
      if (
        process.env.MA_SWEEP_CONTINUE_CHECK_REQUIRED === "1" &&
        (String(error).includes("CHECK_REQUIRED_SCORE_LOOP") ||
          (error instanceof MARuleError && error.code === "CHECK_REQUIRED_SCORE_LOOP"))
      ) {
        blocked.push({ seed, stage, error: String(error) });
        console.log("MA_CHAIN_CHECK_REQUIRED", JSON.stringify({ players: n, seed, stage }));
      } else throw new Error(`${n} players seed ${seed} game ${game} step ${steps}: ${error}`);
    }
    if ((game + 1) % 100 === 0)
      console.log(
        JSON.stringify({
          n,
          completed: game + 1,
          commands,
          seconds: Math.round((Date.now() - start) / 1000),
        }),
      );
  }
  const result = {
    players: n,
    engineSHA256,
    games: completedGames,
    attemptedGames: count - startGame,
    seedStart: 29000000 + n * 100000 + startGame,
    seedEnd: 29000000 + n * 100000 + count - 1,
    commands,
    races,
    nearFinishStressRaces: stress,
    completedStressRaces: completedStress,
    blocked,
    seconds: (Date.now() - start) / 1000,
  };
  results.push(result);
  writeFileSync(`${out}/summary-${n}.json`, JSON.stringify(result, null, 2));
  console.log(blocked.length ? "MA_CHAIN_SWEEP_INCOMPLETE" : "MA_CHAIN_SWEEP_PASS", JSON.stringify(result));
  if (blocked.length) process.exitCode = 1;
}
