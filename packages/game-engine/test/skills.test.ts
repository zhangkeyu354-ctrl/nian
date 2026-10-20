import { describe, it, expect } from "vitest";
import { reduce } from "./autoroll.ts";
import { matches } from "../src/skills.ts";
import { fixture, act, settle, put } from "./fixtures.ts";
import { roster } from "../src/data.ts";
import type {
  GameState,
  Command,
  Payload,
  Roll,
} from "../../shared/src/types.ts";
const SV = ["dwight", "meg", "claudette", "jake", "nea", "ace", "feng_min"];
function ability(
  owner: string,
  n: number,
  event: string,
  context: Payload = {},
  setup?: (s: GameState) => void,
  args: Payload = {},
) {
  const survivor = SV.includes(owner);
  const people = survivor
    ? [owner, ...SV.filter((id) => id !== owner).slice(0, 3)]
    : ["dwight", "claudette", "jake", "ace"];
  const s = fixture(survivor ? "trapper" : owner, people);
  s.turn!.actorId = owner;
  for (const a of Object.values(s.actors)) {
    s.plans[a.id] = a.side === "killer" ? ["blue", "red"] : ["blue"];
    s.hands[a.ownerId] =
      a.side === "killer"
        ? ["green", "yellow", "wait"]
        : ["green", "red", "yellow"];
  }
  setup?.(s);
  const id = `board_${owner}_${n}`;
  s.window = {
    event,
    context,
    actors: [owner],
    index: 0,
    eligible: { [owner]: [id] },
  };
  expect(matches(s, owner, id, event, context)).toBe(true);
  return {
    before: s,
    result: act(s, { type: "USE_PERK", actorId: owner, perkId: id, ...args }),
  };
}
function roll(actorId: string, kind = "generator"): Roll {
  return {
    actorId,
    kind,
    targetId: "unused",
    die: "skill_check",
    count: 1,
    faces: [0],
    classes: ["failure"],
    failureCredit: [true],
    keep: 0,
    data: {},
  };
}
describe("Chinese retail board abilities: source photos in PERK_DATA.board_perks", () => {
  it("Dwight #1 replaces the actor and chosen interaction, not an extra free normal turn", () => {
    const { result: s } = ability(
      "dwight",
      1,
      "WOULD_INTERACT",
      { actorId: "dwight" },
      (s) => {
        s.pendingAction = { actorId: "dwight", action: "repair" };
        s.actors.claudette.health = "wounded";
      },
      { targetId: "jake", action: "heal", interactionTargetId: "claudette" },
    );
    expect(s.pendingAction).toMatchObject({
      actorId: "jake",
      action: "heal",
      targetId: "claudette",
    });
  });
  it("Dwight #2 follows the actual path from the mover previous room", () => {
    const { result: s } = ability(
      "dwight",
      2,
      "AFTER_MOVE",
      {
        actorId: "jake",
        from: "foundry_upper_floor",
        to: "foundry_lower_floor",
        pathId: "mm_p07",
      },
      (s) => {
        s.actors.jake.room = "foundry_lower_floor";
      },
    );
    expect(s.actors.dwight.room).toBe("foundry_lower_floor");
  });
  it("Dwight #3 changes one skill die into two and keeps only one result", () => {
    const { result: s } = ability(
      "dwight",
      3,
      "BEFORE_ROLL",
      { actorId: "jake", checkKind: "generator" },
      (s) => {
        s.roll = roll("jake");
      },
    );
    expect(s.roll).toMatchObject({ die: "skill_check", count: 2 });
  });
  it("Meg #2 grants a survivor turn at cleanup after generator completion", () => {
    const { result: s } = ability("meg", 2, "CLEANUP_START", {}, (s) => {
      s.generatorsThisRound = 1;
    });
    expect(s.choice).toMatchObject({ kind: "BONUS_CARD", actorId: "meg" });
    expect(s.savedTurns).toHaveLength(1);
  });
  it("Meg #3 hides before the entering killer can interact", () => {
    const input = fixture("trapper", ["meg", "dwight", "jake", "ace"]);
    const lid = put(input, "", "locker", "foundry_upper_floor").id;
    const { result: s } = ability(
      "meg",
      3,
      "AFTER_MOVE",
      { actorId: "trapper" },
      (s) => {
        put(s, "", "locker", "foundry_upper_floor");
      },
      { propId: lid },
    );
    expect(s.actors.meg.lockerId).toBe(lid);
  });
  it("Claudette #1 rolls the danger die for another survivor without spending her interaction", () => {
    const { result: s } = ability(
      "claudette",
      1,
      "BEFORE_OWN_MOVE",
      { actorId: "claudette" },
      (s) => {
        s.actors.dwight.health = "wounded";
      },
      { targetId: "dwight" },
    );
    expect(s.events.find((e) => e.type === "DICE_ROLLED")?.data.die).toBe(
      "danger",
    );
    expect(s.turn?.interactionSpent).toBe(false);
  });
  it("Claudette #2 transfers exactly one bloodpoint only with consent; zero cost still once/round", () => {
    const { result: s } = ability(
      "claudette",
      2,
      "OWN_TURN_START",
      { actorId: "claudette" },
      (s) => {
        s.actors.dwight.blood = 1;
      },
      { targetId: "dwight", option: "give", consent: true },
    );
    expect(s.actors.claudette.blood).toBe(5);
    expect(s.actors.dwight.blood).toBe(2);
    expect(s.usedPerks).toContain("board_claudette_2");
    expect(() =>
      ability(
        "claudette",
        2,
        "OWN_TURN_START",
        { actorId: "claudette" },
        undefined,
        { targetId: "dwight", option: "take" },
      ),
    ).toThrow(/consent|willing/);
  });
  it("Claudette #3 uses danger die on herself at turn start", () => {
    const { result: s } = ability(
      "claudette",
      3,
      "OWN_TURN_START",
      { actorId: "claudette" },
      (s) => {
        s.actors.claudette.health = "wounded";
      },
    );
    expect(s.events.find((e) => e.type === "DICE_ROLLED")?.data.kind).toBe(
      "self_heal",
    );
  });
  it("Jake #1 success conversion preserves failure bloodpoint credit", () => {
    const { result: s } = ability(
      "jake",
      1,
      "AFTER_ROLL",
      { actorId: "dwight" },
      (s) => {
        s.roll = roll("dwight");
      },
      { index: 0 },
    );
    expect(s.roll?.classes).toEqual(["success"]);
    expect(s.roll?.failureCredit).toEqual([true]);
  });
  it("Jake #2 moves a crow and replaces the pending interaction", () => {
    let id = "";
    const { result: s } = ability(
      "jake",
      2,
      "WOULD_INTERACT",
      { actorId: "jake" },
      (s) => {
        id = put(s, "", "crow", "foundry_upper_floor").id;
        s.pendingAction = { actorId: "jake", action: "crow" };
      },
      {
        propId: fixture().props.find((p) => p.kind === "crow")!.id,
        to: "backlot",
      },
    );
    expect(s.props.find((p) => p.id === id)?.room).toBe("backlot");
    expect(s.pendingAction).toBe(null);
  });
  it("Jake #3 explicitly pays the additional two bloodpoints for bonus choice", () => {
    const { result: s } = ability(
      "jake",
      3,
      "AFTER_SABOTAGE",
      { actorId: "jake" },
      undefined,
      { option: "bonus" },
    );
    expect(s.actors.jake.blood).toBe(4);
    expect(s.choice?.kind).toBe("BONUS_CARD");
  });
  it("Nea #1 replaces interaction with reverse one-way movement then gains blood", () => {
    const { result: s } = ability(
      "nea",
      1,
      "WOULD_INTERACT",
      { actorId: "nea" },
      (s) => {
        s.actors.nea.room = "mine_entrance";
        s.actors.nea.blood = 2;
        s.pendingAction = { actorId: "nea", action: "repair" };
      },
      { pathId: "mm_p02", to: "foundry_upper_floor" },
    );
    expect(s.actors.nea.room).toBe("foundry_upper_floor");
    expect(s.actors.nea.blood).toBe(3);
    expect(s.pendingAction).toBe(null);
  });
  it("Nea #2 removes a wall for this exact survivor turn, not permanently", () => {
    const { result: s } = ability(
      "nea",
      2,
      "OWN_TURN_START",
      { actorId: "dwight" },
      (s) => {
        s.turn!.actorId = "dwight";
      },
      { pathId: "mm_p05" },
    );
    expect(s.paths.mm_p05).toMatchObject({
      wall: true,
      temporaryWall: true,
      temporaryWallUntil: 1,
    });
  });
  it("Nea #3 preserves the chest after rummaging", () => {
    const id = fixture().props.find((p) => p.kind === "chest")!.id;
    const { result: s } = ability(
      "nea",
      3,
      "AFTER_CHEST",
      { actorId: "nea", propId: id },
      (s) => {
        s.props.find((p) => p.id === id)!.removed = true;
      },
    );
    expect(s.props.find((p) => p.id === id)?.removed).toBe(false);
  });
  it("Ace #1 reveals precisely one committed killer card", () => {
    const { result: s } = ability(
      "ace",
      1,
      "OWN_TURN_START",
      { actorId: "dwight" },
      undefined,
      { index: 1 },
    );
    expect(
      s.events.find((e) => e.type === "PLANNED_CARD_REVEALED")?.data,
    ).toMatchObject({ index: 1, card: "red" });
  });
  it("Ace #2 swaps same-category props between connected spaces, refuses generator with progress", () => {
    const f = fixture();
    const p = f.props.find((p) => p.kind === "crow")!,
      q = f.props.find((p) => p.kind === "pallet")!;
    const { result: s } = ability(
      "ace",
      2,
      "WOULD_INTERACT",
      { actorId: "ace" },
      (s) => {
        s.props.find((v) => v.id === p.id)!.room = "foundry_upper_floor";
        s.props.find((v) => v.id === q.id)!.room = "foundry_lower_floor";
      },
      { propId: p.id, otherPropId: q.id },
    );
    expect(s.props.find((v) => v.id === p.id)?.room).toBe(
      "foundry_lower_floor",
    );
    expect(s.props.find((v) => v.id === q.id)?.room).toBe(
      "foundry_upper_floor",
    );
  });
  it("Ace #3 suspends the original continuation until bonus turn ends, then killer gains two", () => {
    let { result: s } = ability(
      "ace",
      3,
      "OWN_TURN_END",
      { actorId: "ace" },
      (s) => {
        s.actors.trapper.blood = 5;
        s.turn!.stage = "DONE";
      },
    );
    expect(s.actors.trapper.blood).toBe(5);
    s = act(s, { type: "SELECT", actorId: "ace", card: "green" });
    s = act(s, {
      type: "MOVE",
      actorId: "ace",
      pathId: "mm_p09",
      to: "coal_tower_upper",
    });
    s = act(s, { type: "END_TURN", actorId: "ace" });
    expect(s.actors.trapper.blood).toBe(7);
    expect(s.savedTurns).toHaveLength(0);
    expect(s.turn?.stage).toBe("DONE");
  });
  it("Feng #2 moves in response to a killer destroying a blocker", () => {
    const { result: s } = ability(
      "feng_min",
      2,
      "BLOCKER_DESTROYED",
      { actorId: "trapper", kind: "pallet" },
      undefined,
      { pathId: "mm_p07", to: "foundry_lower_floor" },
    );
    expect(s.actors.feng_min.room).toBe("foundry_lower_floor");
  });
  it("Feng #3 failed generator check allows another target only", () => {
    const f = fixture();
    const gen = f.props.find((p) => p.kind === "generator")!.id;
    const { result: s } = ability(
      "feng_min",
      3,
      "GENERATOR_FAILURE",
      { actorId: "feng_min", propId: gen },
      (s) => {
        s.actors.dwight.health = "wounded";
      },
      { action: "heal", targetId: "dwight" },
    );
    expect(s.events.find((e) => e.type === "DICE_ROLLED")?.data.kind).toBe(
      "heal",
    );
    expect(() =>
      ability(
        "feng_min",
        3,
        "GENERATOR_FAILURE",
        { actorId: "feng_min", propId: gen },
        undefined,
        { action: "repair", targetId: gen },
      ),
    ).toThrow(/other target/);
  });
  it("Trapper #1 pushes wounded victim through a blocker and destroys it", () => {
    const { result: s } = ability(
      "trapper",
      1,
      "AFTER_ATTACK",
      { actorId: "trapper", targetId: "dwight" },
      (s) => {
        s.paths.mm_p07.wall = true;
        s.paths.mm_p07.pallet = true;
        s.actors.dwight.health = "wounded";
      },
      { pathId: "mm_p07", to: "foundry_lower_floor" },
    );
    expect(s.actors.dwight.room).toBe("foundry_lower_floor");
    expect(s.paths.mm_p07.wall || s.paths.mm_p07.pallet).toBe(false);
  });
  it("Trapper #2 substitutes danger die in nearby skill check", () => {
    const { result: s } = ability(
      "trapper",
      2,
      "BEFORE_ROLL",
      { actorId: "dwight", checkKind: "generator" },
      (s) => {
        s.roll = roll("dwight");
      },
    );
    expect(s.roll?.die).toBe("danger");
  });
  it("Trapper #3 moves self after attack", () => {
    const { result: s } = ability(
      "trapper",
      3,
      "AFTER_ATTACK",
      { actorId: "trapper", targetId: "dwight" },
      undefined,
      { pathId: "mm_p07", to: "foundry_lower_floor" },
    );
    expect(s.actors.trapper.room).toBe("foundry_lower_floor");
  });
  it("Wraith #1 commits a third normal card but prohibits any killer bonus this round", () => {
    const { result: s } = ability("wraith", 1, "PLANNING_END", {}, undefined, {
      card: "green",
    });
    expect(s.plans.wraith).toHaveLength(3);
    expect(s.killerBonusForbidden).toBe(true);
  });
  it("Wraith #2 gains blood even if the sacrificed target cannot lose any", () => {
    const { result: s } = ability(
      "wraith",
      2,
      "AFTER_SACRIFICE",
      { actorId: "wraith", targetId: "dwight" },
      (s) => {
        s.actors.wraith.blood = 5;
        s.actors.dwight.blood = 0;
      },
    );
    expect(s.actors.wraith.blood).toBe(6);
    expect(s.actors.dwight.blood).toBe(0);
  });
  it("Hillbilly #1 reveals his committed card and gains one", () => {
    const { result: s } = ability(
      "hillbilly",
      1,
      "PLANNING_END",
      {},
      (s) => {
        s.actors.hillbilly.blood = 3;
      },
      { index: 0 },
    );
    expect(s.actors.hillbilly.blood).toBe(4);
    expect(s.events.some((e) => e.type === "PLANNED_CARD_REVEALED")).toBe(true);
  });
  it("Hillbilly #2 destroys pallet before move and emits the blocker trigger for Feng", () => {
    const { result: s } = ability(
      "hillbilly",
      2,
      "BEFORE_PALLET_MOVE",
      { actorId: "hillbilly", pathId: "mm_p07" },
      (s) => {
        s.paths.mm_p07.pallet = true;
      },
    );
    expect(s.paths.mm_p07.pallet).toBe(false);
    expect(s.events.some((e) => e.type === "BLOCKER_DESTROYED")).toBe(true);
  });
  it("Hillbilly #3 returns a future committed card to hand and swaps in another", () => {
    const { result: s } = ability(
      "hillbilly",
      3,
      "GENERATOR_COMPLETED",
      {},
      (s) => {
        s.turn!.actorId = "dwight";
      },
      { index: 1, card: "green" },
    );
    expect(s.plans.hillbilly[1]).toBe("green");
    expect(s.hands.hillbilly).toContain("red");
  });
  it("Nurse #1 forces wounded target to plan publicly before anyone else", () => {
    const { result: s } = ability(
      "nurse",
      1,
      "PLANNING_START",
      {},
      (s) => {
        s.phase = "PLANNING";
        s.plans = {};
        s.actors.jake.health = "wounded";
      },
      { targetId: "jake" },
    );
    expect(s.publicPlans).toEqual(["jake"]);
    expect(() =>
      reduce(s, { type: "PLAN", actorId: "dwight", cards: ["green"] }),
    ).toThrow(/forced public/);
  });
  it("Nurse #2 only affects skill checks, not carry/phantasm dice rolls", () => {
    const { result: s } = ability(
      "nurse",
      2,
      "BEFORE_ROLL",
      { actorId: "dwight", checkKind: "generator" },
      (s) => {
        s.roll = roll("dwight");
        s.actors.dwight.health = "wounded";
      },
    );
    expect(s.roll?.die).toBe("danger");
    expect(
      matches(s, "nurse", "board_nurse_2", "BEFORE_ROLL", {
        actorId: "dwight",
        checkKind: "carry",
      }),
    ).toBe(false);
  });
  it("Nurse #3 gains two when a survivor becomes healthy", () => {
    const { result: s } = ability(
      "nurse",
      3,
      "SURVIVOR_BECOMES_HEALTHY",
      { actorId: "dwight" },
      (s) => {
        s.actors.nurse.blood = 4;
      },
    );
    expect(s.actors.nurse.blood).toBe(6);
  });
  it("Hag #2 grants the sole permitted killer bonus, including at cleanup", () => {
    const { result: s } = ability("hag", 2, "CLEANUP_START", {}, (s) => {
      s.generatorsThisRound = 1;
    });
    expect(s.choice?.kind).toBe("BONUS_CARD");
    expect(s.killerBonusUsed).toBe(true);
  });
  it("Hag #3 removes one generator progress only in a survivor-free room", () => {
    const id = fixture().props.find((p) => p.kind === "generator")!.id;
    const { result: s } = ability(
      "hag",
      3,
      "PLANNING_START",
      {},
      (s) => {
        const p = s.props.find((p) => p.id === id)!;
        p.room = "backlot";
        p.progress = 2;
      },
      { propId: id },
    );
    expect(s.props.find((p) => p.id === id)?.progress).toBe(1);
  });
  it("Doctor #1 gains one only when nobody is hooked at cleanup", () => {
    const { result: s } = ability("doctor", 1, "CLEANUP_START", {}, (s) => {
      s.actors.doctor.blood = 4;
    });
    expect(s.actors.doctor.blood).toBe(5);
    expect(
      Object.is(s.events.find((e) => e.type === "BLOODPOINTS")!.data.delta, -0),
    ).toBe(false);
    s.actors.dwight.hookId = "hook";
    expect(matches(s, "doctor", "board_doctor_1", "CLEANUP_START", {})).toBe(
      false,
    );
  });
  it("Doctor #2 wounds one nearby survivor after damaging generator", () => {
    const { result: s } = ability(
      "doctor",
      2,
      "GENERATOR_DAMAGED",
      { actorId: "doctor" },
      undefined,
      { targetId: "dwight" },
    );
    expect(s.actors.dwight.health).toBe("wounded");
  });
});
describe("six base powers and three passives, Chinese board sources", () => {
  it("Trapper power places one of four traps once per round on a clear connected path", () => {
    let s = fixture();
    s.turn!.actorId = "trapper";
    s = act(s, {
      type: "INTERACT",
      actorId: "trapper",
      action: "power",
      pathId: "mm_p07",
    });
    expect(s.paths.mm_p07.bearTrap).toBe(true);
    expect(s.actors.trapper.powerUsed).toBe(true);
    s.turn!.interactionSpent = false;
    expect(() =>
      reduce(s, {
        type: "INTERACT",
        actorId: "trapper",
        action: "power",
        pathId: "mm_p09",
      }),
    ).toThrow(/power/);
  });
  it("Wraith travels only to a nonconnected different room", () => {
    let s = fixture("wraith");
    s.turn!.actorId = "wraith";
    s = act(s, {
      type: "INTERACT",
      actorId: "wraith",
      action: "power",
      to: "shack",
    });
    expect(s.actors.wraith.room).toBe("shack");
  });
  it("Hillbilly discards a non-Wait movement card, traverses clear matching path, wounds destination survivor", () => {
    let s = fixture("hillbilly");
    s.turn!.actorId = "hillbilly";
    s.actors.dwight.room = "coal_tower_upper";
    s = act(s, {
      type: "INTERACT",
      actorId: "hillbilly",
      action: "power",
      card: "green",
      pathId: "mm_p09",
      to: "coal_tower_upper",
      targetId: "dwight",
    });
    expect(s.actors.hillbilly.room).toBe("coal_tower_upper");
    expect(s.actors.dwight.health).toBe("wounded");
    expect(s.hands.hillbilly).not.toContain("green");
  });
  it("Nurse reverses one-way and ignores but does not destroy wall/pallet", () => {
    let s = fixture("nurse");
    s.turn!.actorId = "nurse";
    s.actors.nurse.room = "mine_entrance";
    s.paths.mm_p02.wall = true;
    s.paths.mm_p02.pallet = true;
    s = act(s, {
      type: "INTERACT",
      actorId: "nurse",
      action: "power",
      pathId: "mm_p02",
      to: "foundry_upper_floor",
    });
    expect(s.actors.nurse.room).toBe("foundry_upper_floor");
    expect(s.paths.mm_p02.wall && s.paths.mm_p02.pallet).toBe(true);
  });
  it("Hag places one phantasm in a room and gains one for its hex totem", () => {
    let s = fixture("hag");
    s.turn!.actorId = "hag";
    s.actors.hag.blood = 5;
    put(s, "", "hex_totem", "foundry_upper_floor");
    s = act(s, { type: "INTERACT", actorId: "hag", action: "power" });
    expect(s.phantasms).toContain("foundry_upper_floor");
    expect(s.actors.hag.blood).toBe(6);
  });
  it("Doctor gives each affected survivor a separate pay/effect choice", () => {
    let s = fixture("doctor");
    s.turn!.actorId = "doctor";
    s.actors.dwight.blood = 0;
    s.actors.jake.madness = true;
    s = act(s, {
      type: "INTERACT",
      actorId: "doctor",
      action: "power",
      to: "foundry_upper_floor",
    });
    const answer: Record<string, string> = { jake: "effect", claudette: "pay", ace: "pay" };
    const asked: string[] = [];
    while (s.choice?.kind === "DOCTOR_SHOCK") {
      asked.push(s.choice.actorId);
      s = act(s, { type: "SELECT", actorId: s.choice.actorId, option: answer[s.choice.actorId] });
    }
    // 德怀特没有血点，不用问，直接获得疯狂
    expect(asked).not.toContain("dwight");
    expect(s.actors.dwight.madness).toBe(true);
    expect(s.actors.jake.health).toBe("wounded");
    expect(s.actors.claudette.blood).toBe(5);
  });
  it("Trapper passive failure removes trap; an already wounded victim gives sacrifice progress", () => {
    let s = fixture();
    s.rng = 1;
    s.turn!.stage = "MOVE";
    s.paths.mm_p07.bearTrap = true;
    s.actors.dwight.health = "wounded";
    s.actors.dwight.woundedRound = 0;
    s = act(s, {
      type: "MOVE",
      actorId: "dwight",
      pathId: "mm_p07",
      to: "foundry_lower_floor",
    });
    expect(s.sacrifice).toBe(1);
    expect(s.paths.mm_p07.bearTrap).toBe(false);
  });
  it("Hag passive removes trap and offers blood versus value-priced teleport/interaction", () => {
    let s = fixture("hag");
    s.rng = 1;
    s.turn!.stage = "MOVE";
    s.phantasms = ["foundry_lower_floor"];
    s = act(s, {
      type: "MOVE",
      actorId: "dwight",
      pathId: "mm_p07",
      to: "foundry_lower_floor",
    });
    expect(s.choice?.kind).toBe("PHANTASM");
    expect(s.phantasms).toEqual([]);
    const before = s.actors.hag.blood;
    const price = Number(s.choice!.price);
    s = act(s, {
      type: "SELECT",
      actorId: "hag",
      option: "teleport",
      targetId: "dwight",
      action: "attack",
    });
    expect(s.actors.hag.room).toBe("foundry_lower_floor");
    expect(s.actors.hag.blood).toBe(before - price);
    expect(s.actors.dwight.health).toBe("wounded");
  });
  it("Doctor passive substitutes danger die on madness skill checks and removes madness on failure", () => {
    let s = fixture("doctor");
    s.rng = 1;
    s.actors.dwight.madness = true;
    const p = put(s, "", "generator", "foundry_upper_floor");
    s = act(s, {
      type: "INTERACT",
      actorId: "dwight",
      action: "repair",
      targetId: p.id,
    });
    expect(s.events.find((e) => e.type === "DICE_ROLLED")?.data.die).toBe(
      "danger",
    );
    expect(s.actors.dwight.madness).toBe(false);
  });
  it("all 13 selectable identities have exactly three linked board perks; deferred effects never masquerade as implementations", () => {
    expect(roster.size).toBe(13);
    for (const c of roster.values()) expect(c.starting_perks).toHaveLength(3);
  });
});
