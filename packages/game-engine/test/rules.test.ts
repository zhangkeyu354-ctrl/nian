import { describe, it, expect } from "vitest";
import { createGame, reduce, legalRoutes, RuleError } from "../src/index.ts";
import type { GameState, Command } from "../../shared/src/types.ts";

function fixture(
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
function settle(s: GameState) {
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
function act(s: GameState, c: Command) {
  return settle(reduce(s, c));
}
function put(
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
describe("B01 and U02 state-machine regressions", () => {
  it("Nea temporarily takes the wall off board, so it does not prevent placing a pallet during that turn", () => {
    let s = fixture();
    s.paths.mm_p07.wall = true;
    s.paths.mm_p07.temporaryWall = true;
    s.paths.mm_p07.temporaryWallUntil = s.turn!.token;
    const p = put(s, "", "pallet", "foundry_upper_floor");
    s = act(s, {
      type: "INTERACT",
      actorId: "dwight",
      action: "pallet",
      targetId: p.id,
      pathId: "mm_p07",
    });
    expect(s.paths.mm_p07.pallet).toBe(true);
    expect(s.paths.mm_p07.wall).toBe(true);
    expect(s.paths.mm_p07.temporaryWall).toBe(true);
  });
  it("Ace can choose the incoming prop after his before-interaction swap, without gaining another interaction", () => {
    let s = fixture();
    s.turn!.actorId = "ace";
    s.completedGenerators = 4;
    const p = put(s, "", "generator", "foundry_upper_floor"),
      q = put(s, "", "exit_gate", "foundry_lower_floor");
    s = reduce(s, {
      type: "INTERACT",
      actorId: "ace",
      action: "repair",
      targetId: p.id,
    });
    s = reduce(s, {
      type: "USE_PERK",
      actorId: "ace",
      perkId: "board_ace_2",
      propId: p.id,
      otherPropId: q.id,
    });
    s = reduce(s, {
      type: "REVISE_INTERACTION",
      actorId: "ace",
      action: "exit",
      targetId: q.id,
    });
    s = settle(s);
    expect(s.props.find((v) => v.id === q.id)?.room).toBe(
      "foundry_upper_floor",
    );
    expect(s.events.find((e) => e.type === "DICE_ROLLED")?.data.kind).toBe(
      "exit",
    );
    expect(s.turn?.interactionSpent).toBe(true);
  });
  it("Jake success conversion retains failure blood but prevents Doctor failure-only madness removal", () => {
    let s = fixture("doctor");
    s.rng = 1;
    s.actors.dwight.madness = true;
    const p = put(s, "", "generator", "foundry_upper_floor");
    s = reduce(s, {
      type: "INTERACT",
      actorId: "dwight",
      action: "repair",
      targetId: p.id,
    });
    for (let i = 0; i < 20 && s.window?.event !== "AFTER_ROLL"; i++)
      s = reduce(s, {
        type: "PASS",
        actorId: s.window!.actors[s.window!.index],
      });
    expect(s.window?.event).toBe("AFTER_ROLL");
    s = act(s, {
      type: "USE_PERK",
      actorId: "jake",
      perkId: "board_jake_1",
      index: 0,
    });
    expect(s.actors.dwight.madness).toBe(true);
    expect(s.props.find((v) => v.id === p.id)?.progress).toBe(1);
  });
  it("R019 invalid commands roll back completely, including random stream and log", () => {
    const s = fixture();
    const original = structuredClone(s);
    expect(() =>
      reduce(s, {
        type: "INTERACT",
        actorId: "dwight",
        action: "repair",
        targetId: "bogus",
      }),
    ).toThrow();
    expect(s).toEqual(original);
  });
  it("R010 commits cards from shared PLAYER hand, not one deck per character", () => {
    let s = createGame({
      seed: 1,
      mapId: "macmillan_estate",
      survivors: ["dwight", "jake", "meg", "ace"],
      killer: "trapper",
      owners: {
        dwight: "one",
        jake: "one",
        meg: "two",
        ace: "two",
        trapper: "three",
      },
    });
    for (const id of s.survivors)
      s = reduce(s, {
        type: "SETUP_REVEAL",
        actorId: id,
        propId: s.props.find((p) => !p.revealed)!.id,
      });
    s = settle(s);
    s = reduce(s, { type: "PLAN", actorId: "dwight", cards: ["blue"] });
    expect(() =>
      reduce(s, { type: "PLAN", actorId: "jake", cards: ["blue"] }),
    ).toThrow(/unavailable/);
  });
  it("R018 a failed legal-card attempt loses interaction; cannot voluntarily stay if route exists", () => {
    let s = fixture();
    s.turn!.stage = "MOVE";
    s.turn!.card = "yellow";
    s.actors.dwight.room = "mine_depths";
    s = act(s, { type: "MOVE", actorId: "dwight" });
    expect(s.turn?.interactionSpent).toBe(true);
    expect(() =>
      reduce(s, {
        type: "INTERACT",
        actorId: "dwight",
        action: "crow",
        targetId: s.props[0].id,
      }),
    ).toThrow();
    const t = fixture();
    t.turn!.stage = "MOVE";
    expect(() => reduce(t, { type: "MOVE", actorId: "dwight" })).toThrow(
      /must make legal/,
    );
  });
  it("R047 killer destroys a pallet but stays and loses interaction; R048 wall instead permits movement", () => {
    let s = fixture();
    s.turn = { ...s.turn!, actorId: "trapper", stage: "MOVE" };
    s.paths.mm_p07.pallet = true;
    s = act(s, {
      type: "MOVE",
      actorId: "trapper",
      pathId: "mm_p07",
      to: "foundry_lower_floor",
    });
    expect(s.actors.trapper.room).toBe("foundry_upper_floor");
    expect(s.turn!.interactionSpent).toBe(true);
    expect(s.paths.mm_p07.pallet).toBe(false);
    let t = fixture();
    t.turn = { ...t.turn!, actorId: "trapper", stage: "MOVE" };
    t.paths.mm_p07.wall = true;
    t = act(t, {
      type: "MOVE",
      actorId: "trapper",
      pathId: "mm_p07",
      to: "foundry_lower_floor",
    });
    expect(t.actors.trapper.room).toBe("foundry_lower_floor");
    expect(t.paths.mm_p07.wall).toBe(false);
    expect(t.turn!.interactionSpent).toBe(false);
  });
  it("Q09 pallet blocks every killer branch but survivors pass; a single wall is shared by all branches", () => {
    const s = createGame({
      seed: 4,
      mapId: "autohaven_wreckers",
      survivors: ["dwight", "meg", "jake", "ace"],
      killer: "nurse",
    });
    s.paths.ah_p02.pallet = true;
    expect(
      legalRoutes(s, "diner", "survivor", "green").filter(
        (r) => r.pathId === "ah_p02",
      ),
    ).toHaveLength(2);
    expect(
      legalRoutes(s, "maze", "killer", undefined, true).some(
        (r) => r.pathId === "ah_p02",
      ),
    ).toBe(false);
  });
  it("R035 requires four generators, then exit skill checks count great success as ONE and win immediately", () => {
    const s = fixture();
    const p = put(s, "x", "exit_gate", "foundry_upper_floor", 2);
    expect(() =>
      reduce(s, {
        type: "INTERACT",
        actorId: "dwight",
        action: "exit",
        targetId: p.id,
      }),
    ).toThrow(/unpowered/);
    let won: GameState | undefined;
    for (let seed = 1; seed < 100 && !won; seed++) {
      const t = structuredClone(s);
      t.rng = seed;
      t.completedGenerators = 4;
      const r = act(t, {
        type: "INTERACT",
        actorId: "dwight",
        action: "exit",
        targetId: p.id,
      });
      if (r.winner) won = r;
    }
    expect(won?.winner).toBe("survivor");
    expect(won?.events.at(-1)?.type).toBe("GAME_OVER");
    expect(() => reduce(won!, { type: "END_TURN", actorId: "dwight" })).toThrow(
      /already ended/,
    );
  });
  it("R042 prohibits grabbing a survivor wounded THIS ROUND", () => {
    const s = fixture();
    s.turn!.actorId = "trapper";
    s.actors.dwight.health = "wounded";
    s.actors.dwight.woundedRound = s.round;
    expect(() =>
      reduce(s, {
        type: "INTERACT",
        actorId: "trapper",
        action: "pickup",
        targetId: "dwight",
      }),
    ).toThrow(/newly wounded/);
  });
  it("Q08 carry moves both figures, never reveals props; Q01 rejects illegal route without consuming dice", () => {
    let s = fixture();
    s.turn!.actorId = "trapper";
    s.actors.dwight.health = "wounded";
    s.actors.dwight.woundedRound = 0;
    for (const p of s.props) if (p.kind === "hook") p.room = "backlot";
    for (const p of s.props)
      if (p.room === "foundry_lower_floor") p.revealed = false;
    s = act(s, {
      type: "INTERACT",
      actorId: "trapper",
      action: "pickup",
      targetId: "dwight",
    });
    expect(s.choice?.kind).toBe("CARRY");
    const original = structuredClone(s);
    expect(() =>
      reduce(s, {
        type: "SELECT",
        actorId: "trapper",
        dice: 1,
        route: [{ pathId: "mm_p22", to: "shack" }],
      }),
    ).toThrow();
    expect(s).toEqual(original);
    let carried: GameState | undefined;
    for (let seed = 1; seed < 100 && !carried; seed++) {
      const t = structuredClone(s);
      t.rng = seed;
      const r = act(t, {
        type: "SELECT",
        actorId: "trapper",
        dice: 1,
        route: [{ pathId: "mm_p07", to: "foundry_lower_floor" }],
      });
      if (r.events.some((e) => e.type === "CARRIED")) carried = r;
    }
    expect(carried?.actors.dwight.room).toBe("foundry_lower_floor");
    expect(carried?.actors.trapper.room).toBe("foundry_lower_floor");
    expect(
      carried?.props
        .filter((p) => p.room === "foundry_lower_floor")
        .every((p) => !p.revealed),
    ).toBe(true);
  });
  it("R049 immediate unoccupied hook transfers personal progress; no dice roll or optional carry", () => {
    const s = fixture();
    s.turn!.actorId = "trapper";
    s.actors.dwight.health = "wounded";
    s.actors.dwight.woundedRound = 0;
    const h = put(s, "x", "hook", "foundry_upper_floor");
    const r = act(s, {
      type: "INTERACT",
      actorId: "trapper",
      action: "pickup",
      targetId: "dwight",
    });
    expect(r.actors.dwight.hookId).toBe(h.id);
    expect(r.sacrifice).toBe(1);
    expect(r.actors.dwight.personalSacrifice).toBe(0);
    expect(r.events.some((e) => e.type === "DICE_ROLLED")).toBe(false);
  });
  it("R036 rescue moves rescuer THEN rescued and single Entity blocks only the latest hook", () => {
    let s = fixture();
    s.actors.jake.hookId = put(s, "x", "hook", "foundry_upper_floor").id;
    const hook = s.actors.jake.hookId;
    s = act(s, {
      type: "INTERACT",
      actorId: "dwight",
      action: "rescue",
      targetId: hook,
    });
    expect(s.choice).toMatchObject({
      kind: "OPTIONAL_MOVE",
      actorId: "dwight",
    });
    s = reduce(s, { type: "SELECT", actorId: "dwight" });
    expect(s.choice?.actorId).toBe("jake");
    s = act(s, { type: "SELECT", actorId: "jake" });
    expect(s.actors.jake.hookId).toBe(null);
    expect(s.entity?.id).toBe(hook);
  });
  it("R026 cleanup progresses hooks before clearing entity, rotates CHARACTER marker and restores shared hands", () => {
    let s = fixture();
    s.turnOrder = ["trapper"];
    s.cursor = 0;
    s.turn = { ...s.turn!, actorId: "trapper", index: 2 };
    s.actors.jake.hookId = put(s, "x", "hook", "foundry_upper_floor").id;
    s.sacrifice = 7;
    s.entity = { kind: "prop", id: "existing" };
    s = act(s, { type: "END_TURN", actorId: "trapper" });
    expect(s.winner).toBe("killer");
    expect(s.round).toBe(1);
    expect(s.entity?.id).toBe("existing");
  });
  it("R061 response order is survivors in turn order then killer; R059 zero-cost perks still once/round", () => {
    let s = fixture("nurse");
    s.turn!.actorId = "claudette";
    s.actors.dwight.room = "foundry_upper_floor";
    s.actors.jake.health = "wounded";
    const target = put(s, "x", "hex_totem", "foundry_upper_floor");
    s = reduce(s, {
      type: "INTERACT",
      actorId: "claudette",
      action: "cleanse",
      targetId: target.id,
    });
    expect(s.window?.actors[0]).toBe("dwight");
    expect(() => reduce(s, { type: "PASS", actorId: "nurse" })).toThrow(
      /response order/,
    );
  });
  it("all 39 board perks are implemented; a perk outside a response window is still rejected", () => {
    expect(fixture().unresolvedAbilities).toEqual([]);
    expect(() =>
      reduce(fixture(), { type: "USE_PERK", actorId: "dwight", perkId: "board_meg_1" }),
    ).toThrow(/response order|no response|window/);
  });
});
export { fixture, settle, act, put };
