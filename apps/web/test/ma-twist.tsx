import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { testRace } from "../../../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../../../packages/magical-athlete/src/privacy.ts";
import { answer } from "../../../packages/magical-athlete/test/helpers.ts";
import { Overlay, TwistReveal } from "../src/ma/MagicalAthlete.tsx";
import { Track, PLAYER_COLORS } from "../src/ma/Track.tsx";
import { usePlayback } from "../src/ma/playback.ts";
import "../src/ma/ma.css";

const before = testRace({ racers: ["twin", "banana", "lovable_loser"], pos: [13, 20, 25], rolls: [1], track: "twisty-twirl", skipSetup: true });
before.race!.twist!.remaining = [2];
if (before.turn) {
  const snapshot = JSON.parse(before.turn.snapshot);
  snapshot.race.twist.remaining = [2];
  before.turn.snapshot = JSON.stringify(snapshot);
}
const after = answer(before, "roll");

function Demo() {
  const [view, setView] = useState(() => viewForMA(before, "p1"));
  const pb = usePlayback(view);
  return <main className="ma-app" style={{ minHeight: "100vh", padding: 12 }}>
    <button type="button" data-testid="draw-card" onClick={() => setView(viewForMA(after, "p1"))}>跨过 TWIST 抽卡</button>
    <h1 style={{ color: "white" }}>扭扭赛道 · 抽卡演示</h1>
    <div className="ma-board"><Track race={view.race!} colorOf={(id) => PLAYER_COLORS[Number(id.slice(1)) - 1] ?? PLAYER_COLORS[0]}
      me="p1" layout="grid" shown={pb.shown} fit raceFx={pb.raceFx} /></div>
    {pb.twistShow && <TwistReveal card={pb.twistShow.card} racer={pb.twistShow.racer} onDone={pb.dismissTwist} />}
    {pb.show && !pb.twistShow && <Overlay show={pb.show} view={view} name={(id) => id} colorOf={() => PLAYER_COLORS[0]} me="p1" onSkip={pb.skip} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
