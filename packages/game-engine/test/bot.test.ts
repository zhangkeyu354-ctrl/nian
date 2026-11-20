import { expect, it } from "vitest";
import { currentActor, createGame, reduce } from "../src/index.ts";
import { chooseDbdMove, dbdBotView } from "../src/bot.ts";

it("finishes 50 five-seat games with both human roles and all selectable killers", () => {
  const killers = ["trapper", "wraith", "hillbilly", "nurse", "hag", "doctor"];
  for (let seed = 1; seed <= 50; seed++) {
    const killer = killers[(seed - 1) % killers.length];
    const human = seed % 2 ? killer : "dwight";
    let state = createGame({
      seed, mapId: seed % 3 ? "macmillan_estate" : "autohaven_wreckers",
      survivors: ["dwight", "claudette", "jake", "ace"], killer,
    });
    for (let step = 0; step < 3500 && !state.winner; step++) {
      const actor = currentActor(state)!;
      const cmd = chooseDbdMove(dbdBotView(state, state.actors[actor].ownerId), actor,
        actor === human || seed % 4 < 2 ? "normal" : "easy", () => ((step * 83 + seed * 53) % 997) / 997);
      try { state = reduce(state, cmd); }
      catch (e) { throw new Error(JSON.stringify({ seed, step, cmd, choice: state.choice, cause: String(e) })); }
    }
    expect(state.winner, `seed ${seed} with ${killer}`).toBeTruthy();
  }
}, 240_000);

it("does not let a bot see teammates' or opponents' unrevealed plans, hands, items or the seed", () => {
  const s = createGame({ seed: 812, mapId: "macmillan_estate", survivors: ["dwight","claudette","jake","ace"], killer: "trapper" });
  s.plans.jake = ["red"];
  s.actors.trapper.item = "hidden item";
  const before = dbdBotView(s, "dwight");
  s.rng = 123;
  s.seed = 456;
  s.hands.jake.reverse();
  s.plans.jake = ["blue"];
  s.actors.trapper.item = "another hidden item";
  s.itemDeck.reverse();
  expect(dbdBotView(s, "dwight")).toEqual(before);
  expect(before).not.toHaveProperty("rng");
  expect(before).not.toHaveProperty("itemDeck");
});
