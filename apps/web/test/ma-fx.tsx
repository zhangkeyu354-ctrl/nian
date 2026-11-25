import React from "react";
import { createRoot } from "react-dom/client";
import { testRace } from "../../../packages/magical-athlete/src/engine.ts";
import { SECOND_WIND_MAPS } from "../../../packages/magical-athlete/src/second-wind-maps.ts";
import { Track, PLAYER_COLORS } from "../src/ma/Track.tsx";
import type { RaceFxCue, RaceFxKind } from "../src/ma/RaceFx.tsx";
import "../src/ma/ma.css";

const kind = new URLSearchParams(location.search).get("kind") ?? "portal";
const desktop = new URLSearchParams(location.search).has("desktop");
const pair = SECOND_WIND_MAPS["whirly-world"].warpPairs[0];
const config: Record<string, { title: string; track: "whirly-world" | "twisty-twirl" | "mild"; pos: number[]; cues: Array<{ kind: RaceFxKind; pos?: number; racer?: string; color?: string }> }> = {
  portal: { title: "螺旋世界 · 管道传送", track: "whirly-world", pos: [pair[1], 5, 12], cues: [
    { kind: "portal", pos: pair[0], color: SECOND_WIND_MAPS["whirly-world"].spaces[pair[0]].color },
    { kind: "teleport", pos: pair[1], color: SECOND_WIND_MAPS["whirly-world"].spaces[pair[1]].color },
  ] },
  reveal: { title: "扭扭赛道 · 翻开事件卡", track: "twisty-twirl", pos: [14, 8, 20], cues: [{ kind: "reveal", pos: 14 }] },
  monster: { title: "扭扭赛道 · 巨口怪物淘汰", track: "twisty-twirl", pos: [18, 8, 24], cues: [{ kind: "monster", racer: "gunk" }] },
  gold: { title: "温和赛道 · 冲线领奖", track: "mild", pos: [29, 28, 20], cues: [{ kind: "gold", racer: "gunk" }, { kind: "silver", racer: "banana" }] },
};
const scene = config[kind] ?? config.portal;
const state = testRace({ racers: ["gunk", "banana", "twin"], pos: scene.pos, track: scene.track, secondWindPreview: true, skipSetup: true });
if (kind === "monster" && state.race?.twist) state.race.twist.monster = { pos: 16 };
const cues: RaceFxCue[] = scene.cues.map((c, i) => ({ ...c, id: i + 1, duration: 1800 }));
createRoot(document.getElementById("root")!).render(
  <main className="ma-app" style={{ minHeight: "100vh", padding: 12 }}>
    <h1 style={{ margin: "0 0 8px", color: "white" }}>{scene.title}</h1>
    <div className="ma-board"><Track race={state.race!} colorOf={id => PLAYER_COLORS[Number(id.slice(1)) - 1] ?? PLAYER_COLORS[0]}
      me="p1" layout={desktop ? "art" : "grid"} fit raceFx={cues} /></div>
  </main>,
);
