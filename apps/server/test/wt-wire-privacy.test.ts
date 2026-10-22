import { it, expect } from "vitest";
import {
  createWitchTown,
  seededRandom,
  viewForWitchTown,
} from "../../../packages/witch-town/src/index.ts";
import { auditWTUpdate } from "../../../scripts/wt-privacy-audit.ts";
const state = createWitchTown(
  {
    players: Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
    })),
    countsProfile: "candidate-59",
    allowCandidateCounts: true,
  },
  seededRandom(4),
);
function snapshot() {
  return {
    game: "witch-town",
    code: "ABCDEF12",
    capacity: 4,
    stage: "game",
    version: 1,
    mySeat: "p0",
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      host: false,
      ready: true,
      connected: true,
    })),
    view: viewForWitchTown(state, "p0"),
    milestone: "M4_RULE_ENGINE",
  } as any;
}
it("accepts a valid scoped snapshot and an observer", () => {
  auditWTUpdate(snapshot(), "p0", state);
  const v = snapshot();
  v.mySeat = null;
  v.view = viewForWitchTown(state, null);
  auditWTUpdate(v, null, state);
});
for (const leak of [
  "tryals",
  "hand",
  "nightVotes",
  "conspiracyPicks",
  "deck",
]) {
  it(`rejects injected ${leak} even when other fields look legitimate`, () => {
    const v = snapshot();
    if (leak === "tryals" || leak === "hand")
      v.view.players[1][leak] = (state.players[1] as any)[leak];
    else v.view.pending = { kind: "dawn-black-cat", [leak]: ["witch"] };
    expect(() => auditWTUpdate(v, "p0", state)).toThrow();
  });
}
it("rejects early final disclosure and unauthorized private deck", () => {
  let v = snapshot();
  v.view.final = [{ id: "p1", tryals: ["witch"] }];
  expect(() => auditWTUpdate(v, "p0", state)).toThrow();
  v = snapshot();
  v.view.private.choice = { kind: "tituba", deck: state.deck, deadline: 1 };
  expect(() => auditWTUpdate(v, "p0", state)).toThrow();
});
