/** Exact character identities and image variants; no grep-based counting. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SECOND_WIND_PREVIEW as racers } from "../packages/magical-athlete/src/second-wind-preview.ts";
import { RACERS } from "../packages/magical-athlete/src/racers.ts";
import { strict as assert } from "node:assert";
const base = "apps/web/public/assets/magical-athlete";
const variants = [{ id: "sw_bite_mark_were", parent: "sw_bite_mark", purpose: "巨口变身图，不是可招募角色" }];
const allowed = [...racers.map((r) => r.id), ...variants.map((v) => v.id)].sort();
const files = (folder: string, ext: string) =>
  readdirSync(`${base}/${folder}`)
    .filter((f) => f.startsWith("sw_"))
    .map((f) => f.replace(ext, ""))
    .sort();
assert.equal(racers.length, 36);
assert.equal(new Set(racers.map((r) => r.id)).size, 36);
for (const [folder, ext] of [
  ["tokens", ".png"],
  ["portraits", ".webp"],
  ["cards/zh", ".webp"],
])
  assert.deepEqual(files(folder, ext), allowed);
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const manifest = JSON.parse(readFileSync("assets/magical-athlete-second-wind/manifest.json", "utf8")) as {
  characters: Array<{ id: string; exported_token_size: number[] }>;
};
const report = {
  as_of: "2026-10-26",
  playable_base: RACERS.length,
  preview_characters: racers.length,
  mixed_pool: 36 + racers.length,
  token_images: allowed.length,
  portrait_images: allowed.length,
  card_images: allowed.length,
  extra_image_count: variants.length,
  variants,
  base_roster: RACERS.map(({ id, en, zh }) => ({ id, en, zh })),
  preview_roster: racers.map(({ id, en, zh }) => ({
    id,
    en,
    zh,
    token_size: manifest.characters.find((c) => c.id === id)!.exported_token_size,
    card: `/assets/magical-athlete/cards/zh/${id}.webp`,
    token_sha256: hash(`${base}/tokens/${id}.png`),
  })),
};
writeFileSync("docs/magical-athlete/second-wind/final-roster-inventory.json", JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    base: report.playable_base,
    preview: report.preview_characters,
    pool: report.mixed_pool,
    tokens: report.token_images,
    portraits: report.portrait_images,
    cards: report.card_images,
    extraImages: report.variants,
  }),
);
