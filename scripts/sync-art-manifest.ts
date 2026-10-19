import { readFileSync, writeFileSync } from "node:fs";
import { visualCatalog } from "../packages/game-engine/src/presentation.ts";
const manifest = JSON.parse(readFileSync("assets/manifest.json", "utf8"));
for (const a of manifest.assets) {
  const kind = a.id.startsWith("portrait_")
    ? "actor"
    : a.id.startsWith("back_")
      ? "back"
      : a.id;
  a.states = a.id.startsWith("back_")
    ? [a.id.slice(5)]
    : Object.keys(visualCatalog[kind] ?? { decoration: "原创装饰" });
}
for (const file of [
  "assets/manifest.json",
  "apps/web/public/assets/manifest.json",
])
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log("Manifest state coverage synchronized:", manifest.assets.length);
