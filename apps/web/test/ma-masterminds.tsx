// Development-only fixture, using the real engine and production overlay.
import React from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "../src/ma/MagicalAthlete.tsx";
import { PLAYER_COLORS } from "../src/ma/Track.tsx";
import {
  testRace,
  reduceMA,
} from "../../../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../../../packages/magical-athlete/src/privacy.ts";
import type { MAState } from "../../../packages/magical-athlete/src/types.ts";
const count = Number(new URLSearchParams(location.search).get("count") ?? 2);
const roles = [
  "mastermind",
  "twin",
  "copycat",
  "sw_mush",
  "sw_doppelgangster",
  "sw_understudy",
  "sw_re_runner",
].slice(0, count);
let s = testRace({
  racers: ["banana", ...roles],
  pos: [29, ...roles.map(() => 1)],
  rolls: [1],
  secondWindPreview: true,
  skipSetup: true,
});
function prepare(x: MAState) {
  x.race!.mastermindPicks = Object.fromEntries(
    roles.map((id) => [id, "banana"]),
  );
  for (const t of x.race!.tokens.filter((t) => t.racer !== "banana")) {
    t.base = "mastermind";
    t.started = true;
  }
}
prepare(s);
const snapshot = JSON.parse(s.turn!.snapshot);
prepare(snapshot);
s.turn!.snapshot = JSON.stringify(snapshot);
s = reduceMA(s, { type: "ANSWER", player: s.pending!.player, value: "roll" });
const fx = s.log.find((l) => l.fx?.kind === "podium")!.fx!;
if (fx.kind !== "podium") throw Error("Missing podium");
createRoot(document.getElementById("root")!).render(
  <div className="ma-app">
    <Overlay
      show={fx}
      view={viewForMA(s, "p1")}
      name={(id) => s.players.find((p) => p.id === id)!.name}
      colorOf={(id) =>
        PLAYER_COLORS[s.seats.indexOf(id) % PLAYER_COLORS.length]
      }
      me="p1"
      onSkip={() => {}}
    />
  </div>,
);
