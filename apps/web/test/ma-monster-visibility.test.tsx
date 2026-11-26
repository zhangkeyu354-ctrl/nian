import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { testRace } from "../../../packages/magical-athlete/src/engine.ts";
import { Track } from "../src/ma/Track.tsx";
import { Overlay } from "../src/ma/MagicalAthlete.tsx";
import { viewForMA } from "../../../packages/magical-athlete/src/privacy.ts";

it("does not reveal the monster before playback reaches its spawn", () => {
  const state = testRace({ racers: ["twin", "banana"], track: "twisty-twirl", skipSetup: true });
  state.race!.twist!.monster = { pos: 4 };
  const hidden = renderToStaticMarkup(<Track race={state.race!} colorOf={() => "#ffcc22"} me="p1" layout="grid" monsterView={null} />);
  expect(hidden).not.toContain('aria-label="巨口怪物');
  const shown = renderToStaticMarkup(<Track race={state.race!} colorOf={() => "#ffcc22"} me="p1" layout="grid" monsterView={{ pos: 0 }} />);
  expect(shown).toContain('aria-label="巨口怪物，第 0 格"');
});

it("shows the monster's actual die result before its move", () => {
  const view = viewForMA(testRace({ racers: ["twin", "banana"], track: "twisty-twirl", skipSetup: true }), "p1");
  const html = renderToStaticMarkup(<Overlay show={{ kind: "monster_roll", value: 4, rolling: false }} view={view}
    name={(id) => id} colorOf={() => "#ffcc22"} me="p1" onSkip={() => {}} />);
  expect(html).toContain("巨口怪物掷骰");
  expect(html).toContain("掷出 4");
  expect(html).toContain("/dice/player-1-4.svg");
});
