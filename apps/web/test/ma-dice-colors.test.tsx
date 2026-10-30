import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Overlay } from "../src/ma/MagicalAthlete.tsx";
import { PLAYER_COLORS } from "../src/ma/Track.tsx";
import { testRace } from "../../../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../../../packages/magical-athlete/src/privacy.ts";
it("all eight player dice match their player colors, including seats seven and eight", () => {
  const view = viewForMA(
    testRace({ racers: ["banana", "alchemist"], skipSetup: true }),
    "p1",
  );
  view.seats = Array.from({ length: 8 }, (_, i) => "p" + (i + 1));
  for (let i = 0; i < 8; i++) {
    const html = renderToStaticMarkup(
      <Overlay
        show={{
          kind: "roll",
          player: view.seats[i],
          racer: "banana",
          value: 3,
          rolling: false,
        }}
        view={view}
        name={(id) => id}
        colorOf={() => PLAYER_COLORS[i]}
        me="p1"
        onSkip={() => {}}
      />,
    );
    expect(html, `seat ${i + 1}`).toContain(`--die-color:${PLAYER_COLORS[i]}`);
  }
});
