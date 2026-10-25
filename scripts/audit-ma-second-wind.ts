/** Offline research audit. Does not import, mutate or deploy the game server. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { RACERS, DRAFTABLE } from "../packages/magical-athlete/src/racers.ts";
import { TRACKS } from "../packages/magical-athlete/src/tracks.ts";
import { DEFAULT_POINTS } from "../packages/magical-athlete/src/engine.ts";
const root = "docs/magical-athlete/second-wind";
const read = (file: string) => JSON.parse(readFileSync(`${root}/${file}`, "utf8"));
const reference = read("reference-base-roster.json").characters as Array<{id: string; en: string}>;
const candidates = read("second-wind-candidates.json").characters as Array<{id: string; en: string; rule_status: string}>;
const names = new Set(RACERS.map(r => r.id));
const refIds = new Set(reference.map(r => r.id));
const normalize = (s: string) => s.normalize("NFKD").replace(/[^a-z0-9]/gi, "").toLowerCase();
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const productionFiles = ["packages/magical-athlete/src/engine.ts","packages/magical-athlete/src/racers.ts","packages/magical-athlete/src/tracks.ts","packages/magical-athlete/src/types.ts","apps/server/src/ma-rooms.ts","apps/web/src/ma/MagicalAthlete.tsx"];
const baseline = execFileSync("git", ["rev-parse", "f356900"], { encoding: "utf8" }).trim();
const changedProductionFiles = execFileSync("git", ["diff", "--name-only", baseline, "--", ...productionFiles], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const result = {
  baseline,
  productionFilesUnchangedByThisResearch: changedProductionFiles.length === 0,
  changedProductionFiles,
  rulesetDescription: "CMYK 2025 base + partial 2026 revisions + documented house rules; no versioned ruleset setting yet",
  roster: RACERS.map(r => ({id:r.id,en:r.en,zh:r.zh,status:r.status,source_ref:r.source_ref,translation_status:r.translation_status})),
  counts: { current: RACERS.length, draftable: DRAFTABLE.length, reference2025: reference.length, secondWindCandidates: candidates.length,
    verifiedSecondWindRules: candidates.filter(r => r.rule_status === "CONFIRMED").length },
  missingFromCurrent: reference.filter(r => !names.has(r.id)),
  extraInCurrent: RACERS.filter(r => !refIds.has(r.id)).map(r => r.id),
  expansionNameCollisions: candidates.filter(r => RACERS.some(base => normalize(base.en) === normalize(r.en))).map(r => r.en),
  tracks: TRACKS,
  runtimeDefaults: { players: [2,8], officialProductPlayers: [2,6], races:4, pointsPerRace:DEFAULT_POINTS, deal:"draft", supportedDeals:["draft","random"], schedule:["mild","wild","mild","wild"], variant:"standard" },
  hashes: Object.fromEntries(productionFiles.map(f => [f,hash(f)])),
};
writeFileSync(`${root}/current-implementation.json`, JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({ ...result.counts, missing:result.missingFromCurrent.length, extra:result.extraInCurrent.length, collisions:result.expansionNameCollisions.length }));
