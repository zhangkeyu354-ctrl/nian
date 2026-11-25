import { writeFileSync, mkdirSync } from "node:fs";
import { testRace, reduceMA } from "../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
import type { MAState } from "../packages/magical-athlete/src/types.ts";
import { DRAFTABLE } from "../packages/magical-athlete/src/racers.ts";
import { SECOND_WIND_PREVIEW_IDS } from "../packages/magical-athlete/src/second-wind-preview.ts";

const roster = ["banana", "lovable_loser", "twin", "alchemist", "legs", "sisyphus", "centaur", "skipper"];
const counts = new Map<number, number>();
const portals = new Map<string, number>();
const checkRequired = new Map<string, number>();
const checkRequiredCases: Array<{ players: number; seed: number; step: number; message: string }> = [];
const completed: Array<{ players: number; seed: number; steps: number; finale: boolean }> = [];
const failures: Array<{ players: number; seed: number; step: number; message: string; racers?: string[]; drawn?: number[]; current?: string; pending?: string; tokens?: Array<{ racer: string; pos: number; out: boolean; place: number | null }>; tail?: string[] }> = [];
const seeds = Number(process.env.MA_STRESS_SEEDS ?? 20);
const onlySeed = Number(process.env.MA_STRESS_ONLY ?? 0);
const maxSteps = Number(process.env.MA_STRESS_MAX_STEPS ?? 400);
const mixed = process.env.MA_STRESS_ROSTER === "mixed";
const setup = process.env.MA_STRESS_SETUP === "1";
const track = process.env.MA_STRESS_TRACK === "whirly-world" ? "whirly-world" : "twisty-twirl";
const pool = [...DRAFTABLE, ...SECOND_WIND_PREVIEW_IDS];

function racersFor(players: number, seed: number) {
  if (!mixed) return roster.slice(0, players);
  const cards = [...pool];
  let state = seed;
  for (let i = cards.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards.slice(0, players);
}

function assertState(s: MAState) {
  const r = s.race!;
  for (const t of r.tokens) {
    if (t.pos < 0 || t.pos > 30) throw new Error(`${t.racer} 位置越界：${t.pos}`);
    if (t.out && (t.place !== null || r.finishers.includes(t.racer)))
      throw new Error(`${t.racer} 淘汰后仍有名次`);
  }
  const duplicates = r.finishers.filter((id, i) => r.finishers.indexOf(id) !== i);
  if (duplicates.some(id => r.tokens.find(t => t.racer === id)?.base !== "mastermind"))
    throw new Error(`冲线名单重复：${duplicates.join(",")}`);
  if (r.finale && (r.index !== r.finaleOrigin?.index || r.tokens.length !== 2))
    throw new Error("附加决赛实例或参赛人数错误");
  for (const p of s.players) {
    if (p.chips.filter(ch => ch.race === r.index && ch.kind === "gold").length > 1)
      throw new Error(`${p.id} 同场重复得金牌`);
  }
  const outsider = s.players.find(p => p.id !== s.pending?.player)?.id ?? null;
  const view = viewForMA(s, outsider) as unknown as Record<string, unknown>;
  if (view.deck || view.turn || view.rng) throw new Error("视图泄露服务端秘密状态");
  if (s.pending && (view.pending as { options: unknown[] }).options.length) throw new Error("泄露其他人的选项");
}

for (const players of [2, 4, 6, 8]) for (let seed = 1; seed <= seeds; seed++) {
  const gameSeed = seed * 101 + players;
  if (onlySeed && gameSeed !== onlySeed) continue;
  const racers = racersFor(players, gameSeed);
  const positions = racers.map((_, i) => i === 0 ? 13 : (gameSeed * (i * 7 + 3)) % 30);
  let s = testRace({ racers, pos: positions, seed: gameSeed, track, skipSetup: !setup, secondWindPreview: true });
  let random = gameSeed;
  let steps = 0;
  let sawFinale = false;
  try {
    while (s.phase === "race" && !s.race!.over) {
      if (++steps > maxSteps) throw new Error(`${maxSteps} 次选择后仍未结束比赛`);
      assertState(s);
      const pending = s.pending;
      if (!pending) throw new Error("比赛中缺少待处理选择");
      random = (random * 1664525 + 1013904223) >>> 0;
      const no = pending.options.find(o => o.value === "no");
      const stop = pending.kind === "showoff" ? pending.options.find(o => o.value === "stop") : undefined;
      const chosen = stop ?? (no && random % 10 < 7 ? no : pending.options[random % pending.options.length]);
      s = reduceMA(s, { type: "ANSWER", player: pending.player, value: chosen.value });
      sawFinale ||= s.race?.finale === true;
    }
    assertState(s);
    const cards = s.race?.finaleOrigin?.twist?.drawn ?? s.race?.twist?.drawn ?? [];
    for (const card of cards) counts.set(card, (counts.get(card) ?? 0) + 1);
    for (const entry of s.log) if (entry.text.includes("进入螺旋通道") && entry.fx?.kind === "warp") {
      const pair = `${entry.fx.from}→${entry.fx.to}`;
      portals.set(pair, (portals.get(pair) ?? 0) + 1);
    }
    completed.push({ players, seed: gameSeed, steps, finale: sawFinale });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("尚待裁定") || message.includes("尚待核对") || message.includes("CHECK_REQUIRED")) {
      checkRequired.set(message, (checkRequired.get(message) ?? 0) + 1);
      checkRequiredCases.push({ players, seed: gameSeed, step: steps, message });
    } else failures.push({ players, seed: gameSeed, step: steps, message, racers, drawn: s.race?.finaleOrigin?.twist?.drawn ?? s.race?.twist?.drawn, current: s.race?.current, pending: s.pending?.kind, tokens: s.race?.tokens.map(t => ({ racer: t.racer, pos: t.pos, out: t.out, place: t.place })), tail: s.log.slice(-8).map(x => x.text) });
  }
}

mkdirSync("output/ma-tracks", { recursive: true });
const result = { track, roster: mixed ? "mixed" : "base", setup, completed: completed.length, byPlayers: Object.fromEntries([2, 4, 6, 8].map(n => [n, completed.filter(x => x.players === n).length])), finale: completed.filter(x => x.finale).length, cards: Object.fromEntries(counts), portals: Object.fromEntries(portals), checkRequired: Object.fromEntries(checkRequired), checkRequiredCases, failures };
writeFileSync(`output/ma-tracks/stress-${track}-${mixed ? "mixed" : "base"}${setup ? "-setup" : ""}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
