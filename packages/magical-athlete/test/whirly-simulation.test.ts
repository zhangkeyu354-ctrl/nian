import { mkdirSync, writeFileSync } from "node:fs";
import { it, expect } from "vitest";
import { testRace, reduceMA } from "../src/engine.ts";
import { DRAFTABLE } from "../src/racers.ts";
import { SECOND_WIND_PREVIEW_IDS } from "../src/second-wind-preview.ts";
import { checkChainInvariants } from "./chain-invariants.ts";
const pool = [...DRAFTABLE, ...SECOND_WIND_PREVIEW_IDS];
it("螺旋世界100固定种子完整单场，逐命令检查不变量", () => {
  let commands = 0;
  const roles = new Set<string>();
  const coverage: Record<string, number[]> = {};
  for (let i = 0; i < 100; i++) {
    const ids = Array.from(
      { length: 4 },
      (_, k) => pool[(i * 5 + k * 17) % pool.length],
    );
    let s = testRace({
      racers: ids,
      seed: 540001 + i,
      track: "whirly-world",
      secondWindPreview: true,
    });
    let steps = 0;
    while (s.phase === "race") {
      if (++steps > 1500) throw new Error(`未终止 seed=${540001 + i}`);
      const p = s.pending!;
      const v =
        p.kind === "cheatah_set"
          ? "4"
          : (p.options.find((o) => o.value === "no")?.value ??
            p.options.find((o) => o.value === "keep")?.value ??
            p.options[0].value);
      s = reduceMA(s, { type: "ANSWER", player: p.player, value: v });
      checkChainInvariants(s);
      for (const t of s.race!.tokens) roles.add(t.racer);
    }
    for (const id of ids) (coverage[id] ??= []).push(540001 + i);
    commands += steps;
    expect(s.race!.over).toBe(true);
  }
  mkdirSync("output/ma-tracks", { recursive: true });
  writeFileSync(
    "output/ma-tracks/whirly-simulation.json",
    JSON.stringify(
      {
        races: 100,
        seeds: [540001, 540100],
        commands,
        roles: roles.size,
        totalRoles: pool.length,
        coverage,
      },
      null,
      2,
    ),
  );
  console.log(
    `WHIRLY_SIM_PASS races=100 seeds=540001..540100 commands=${commands} roles=${roles.size}/${pool.length}`,
  );
}, 120000);
