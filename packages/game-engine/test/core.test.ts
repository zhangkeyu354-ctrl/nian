import { describe, it, expect } from "vitest";
import {
  createGame,
  reduce,
  legalRoutes,
  connected,
  resolveDice,
  checkRule,
} from "../src/index.ts";

const options = {
  seed: 123,
  mapId: "macmillan_estate",
  survivors: ["dwight", "claudette", "jake", "ace"],
  killer: "trapper",
};
describe("U02 / B01 engine foundation", () => {
  it("R057 replaces failed old results on reroll and refuses a second reroll of the same die", () => {
    expect(
      resolveDice([0, 0], 0, "generator", [{ index: 0, face: 5 }]),
    ).toMatchObject({ killerBloodpoints: 1, amount: 2 });
    expect(() =>
      resolveDice([0], 0, "exit", [
        { index: 0, face: 1 },
        { index: 0, face: 5 },
      ]),
    ).toThrow(/reroll/i);
  });
  it("unavailable Bloodweb/Devout card decks explicitly fail instead of silently running Adept", () => {
    expect(() => createGame({ ...options, mode: "BLOODWEB" })).toThrow(
      /CHECK_REQUIRED/,
    );
  });
  it("sets up a real 44-prop map deterministically without mutating options", () => {
    const s = createGame(options);
    expect(s).toEqual(createGame(options));
    expect(s.props).toHaveLength(44);
    expect(Object.values(s.paths).filter((x) => x.wall)).toHaveLength(4);
    expect(s.phase).toBe("SETUP");
  });
  it("Q02 counts all failures including discarded dice; different actions use different success amounts", () => {
    expect(resolveDice([0, 0, 5], 2, "generator")).toMatchObject({
      killerBloodpoints: 2,
      amount: 2,
    });
    expect(resolveDice([5], 0, "exit")).toMatchObject({ amount: 1 });
    expect(resolveDice([0], 0, "generator")).toMatchObject({ amount: 0 });
  });
  it("Q09 shared icon is a one-step clique but blocker belongs to the icon", () => {
    const s = createGame({ ...options, mapId: "autohaven_wreckers" });
    expect(connected(s, "maze", "diner")).toBe(true);
    expect(
      legalRoutes(s, "maze", "survivor", "green").some(
        (x) => x.to === "diner" && x.pathId === "ah_p02",
      ),
    ).toBe(true);
    s.paths.ah_p02.wall = true;
    expect(
      legalRoutes(s, "maze", "survivor", "green").some(
        (x) => x.pathId === "ah_p02",
      ),
    ).toBe(false);
    expect(
      legalRoutes(s, "diner", "survivor", "green").some(
        (x) => x.pathId === "ah_p02",
      ),
    ).toBe(false);
  });
  it("Q01 carrying respects one-way and blocks walls, unlike normal killer movement", () => {
    const s = createGame(options);
    expect(connected(s, "backlot", "shack")).toBe(true);
    expect(
      legalRoutes(s, "backlot", "killer", undefined, true).some(
        (x) => x.to === "shack",
      ),
    ).toBe(false);
    expect(
      legalRoutes(s, "shack", "killer", "yellow").some(
        (x) => x.to === "backlot",
      ),
    ).toBe(true);
    expect(
      legalRoutes(s, "shack", "killer", undefined, true).some(
        (x) => x.pathId === "mm_p22",
      ),
    ).toBe(false);
  });
  it("requires four explicit survivor setup reveals and preserves input on errors", () => {
    let s = createGame(options);
    const before = structuredClone(s);
    expect(() =>
      reduce(s, { type: "PLAN", actorId: "dwight", cards: ["red"] }),
    ).toThrow();
    expect(s).toEqual(before);
    for (const actorId of options.survivors)
      s = reduce(s, {
        type: "SETUP_REVEAL",
        actorId,
        propId: s.props.find((x) => !x.revealed)!.id,
      });
    // 出生：从先手玩家起，逃生者依次、最后杀手，各自掷骰
    expect(s.choice).toMatchObject({ kind: "SPAWN_ROLL", actorId: options.survivors[0] });
    const rolled: string[] = [];
    while (s.choice?.kind === "SPAWN_ROLL") {
      rolled.push(s.choice.actorId);
      s = reduce(s, { type: "SELECT", actorId: s.choice.actorId });
    }
    expect(rolled).toEqual([...options.survivors, options.killer]);
    expect(s.phase).toBe("PLANNING");
    expect(s.actors.dwight.room).toBeTruthy();
  });
  it("unresolved Q11 fails explicitly", () => {
    expect(() => checkRule("Q11")).toThrow(/CHECK_REQUIRED/);
  });
});
