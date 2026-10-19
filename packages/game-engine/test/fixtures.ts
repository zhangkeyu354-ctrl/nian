import { createGame, reduce } from "../src/index.ts";
import type { GameState, Command } from "../../shared/src/types.ts";
export function fixture(
  killer = "trapper",
  survivors = ["dwight", "claudette", "jake", "ace"],
) {
  const s = createGame({
    seed: 1807,
    mapId: "macmillan_estate",
    survivors,
    killer,
  });
  s.phase = "ACTING";
  s.jobs = [];
  for (const a of Object.values(s.actors)) {
    a.room = "foundry_upper_floor";
    a.blood = a.side === "killer" ? 12 : 6;
  }
  for (const p of s.props) p.revealed = true;
  s.turn = {
    actorId: survivors[0],
    card: "blue",
    index: 0,
    bonus: false,
    stage: "INTERACT",
    interactionSpent: false,
    interacted: false,
    token: 1,
  };
  return s;
}
export function settle(s: GameState) {
  for (let i = 0; i < 100; i++) {
    if (s.window) {
      s = reduce(s, { type: "PASS", actorId: s.window.actors[s.window.index] });
      continue;
    }
    if (s.choice?.kind === "REVEAL") {
      s = reduce(s, {
        type: "SELECT",
        actorId: s.choice.actorId,
        propId: s.props.find(
          (p) => p.room === s.choice!.room && !p.revealed && !p.removed,
        )!.id,
      });
      continue;
    }
    if (s.choice?.kind === "KEEP") {
      s = reduce(s, { type: "SELECT", actorId: s.choice.actorId, index: 0 });
      continue;
    }
    return s;
  }
  throw new Error("settle loop");
}
export function act(s: GameState, c: Command) {
  return settle(reduce(s, c));
}
export function put(
  s: GameState,
  id: string,
  kind: string,
  room: string,
  progress = 0,
) {
  const p = s.props.find((p) => p.kind === kind)!;
  p.room = room;
  p.revealed = true;
  p.progress = progress;
  return p;
}
