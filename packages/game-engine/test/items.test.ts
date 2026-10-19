// Phase 4 物品效果 + 审计缺陷 AUDIT-B01/B02 的回归测试（Claude 2026-10-19）
import { describe, it, expect } from "vitest";
import { reduce, getControls, viewFor, HIDDEN } from "../src/index.ts";
import { itemActions } from "../src/controls.ts";
import { legalRoutes } from "../src/graph.ts";
import { fixture, settle, act, put } from "./fixtures.ts";
import type { GameState } from "../../shared/src/types.ts";

/** 逃生者回合（德怀特），所有人都在同一房间 */
function base(killer = "trapper", survivors = ["dwight", "claudette", "jake", "ace"]) {
  const s = fixture(killer, survivors);
  for (const a of Object.values(s.actors)) a.perks = [];
  for (const a of Object.values(s.actors))
    s.plans[a.id] = a.side === "killer" ? ["blue", "red"] : ["blue"];
  return s;
}
const room = (s: GameState) => s.actors.dwight.room!;
function killerTurn(s: GameState, stage: "MOVE" | "INTERACT" = "INTERACT") {
  s.turn = {
    actorId: s.killerId,
    card: "blue",
    index: 0,
    bonus: false,
    stage,
    interactionSpent: false,
    interacted: false,
    token: 99,
  };
}

describe("物品：打出时公开，弃入弃牌堆（U-ITEM）", () => {
  it("使用后持有者没有物品、弃牌堆有它、所有人都能看到 ITEM_USED", () => {
    let s = base();
    const g = put(s, "x", "generator", room(s), 1);
    s.actors.dwight.item = "toolbox";
    const before = viewFor(s, "trapper");
    expect(before.actors.dwight.item).toBe(HIDDEN);
    s = act(s, { type: "USE_ITEM", actorId: "dwight", itemId: "toolbox", propId: g.id });
    expect(s.actors.dwight.item).toBeNull();
    expect(s.itemDiscard).toContain("toolbox");
    const killerView = viewFor(s, "trapper");
    const used = killerView.events.find((e) => e.type === "ITEM_USED")!;
    expect(used.data.item).toBe("toolbox");
  });
  it("不能用别人的物品、不能用自己没有的物品", () => {
    const s = base();
    s.actors.claudette.item = "flashlight";
    expect(() =>
      reduce(s, { type: "USE_ITEM", actorId: "dwight", itemId: "flashlight" }),
    ).toThrow(/no item held/);
    s.actors.dwight.item = "map";
    expect(() =>
      reduce(s, { type: "USE_ITEM", actorId: "dwight", itemId: "toolbox" }),
    ).toThrow(/item not held/);
  });
  it("被献祭（挂钩）时不能使用物品", () => {
    const s = base();
    s.actors.dwight.item = "broken_key";
    s.actors.dwight.hookId = "h";
    expect(() =>
      reduce(s, { type: "USE_ITEM", actorId: "dwight", option: "blood", targetId: "dwight" }),
    ).toThrow(/sacrificed/);
  });
});

describe("工具箱 / 宽敞工具箱", () => {
  it("工具箱：自己的回合，本空间发电机 +1；满 3 时完成", () => {
    let s = base();
    const g = put(s, "x", "generator", room(s), 2);
    s.actors.dwight.item = "toolbox";
    s = act(s, { type: "USE_ITEM", actorId: "dwight", propId: g.id });
    expect(s.props.find((p) => p.id === g.id)!.removed).toBe(true);
    expect(s.completedGenerators).toBe(1);
    expect(s.turn!.interactionSpent).toBe(false); // 不占用交互
  });
  it("工具箱：不能在别人的回合使用", () => {
    const s = base();
    const g = put(s, "x", "generator", room(s), 0);
    s.actors.claudette.item = "toolbox";
    expect(() =>
      reduce(s, { type: "USE_ITEM", actorId: "claudette", propId: g.id }),
    ).toThrow(/only during your turn/);
  });
  it("宽敞工具箱：任意逃生者回合可用，+1 后抽一张物品", () => {
    let s = base();
    const g = put(s, "x", "generator", room(s), 0);
    s.actors.claudette.item = "commodious_toolbox";
    const deck = s.itemDeck.length;
    s = act(s, { type: "USE_ITEM", actorId: "claudette", propId: g.id });
    expect(s.props.find((p) => p.id === g.id)!.progress).toBe(1);
    expect(s.itemDeck.length).toBe(deck - 1);
    expect(s.actors.claudette.item).toBeTruthy();
  });
  it("宽敞工具箱：杀手回合不能用", () => {
    const s = base();
    const g = put(s, "x", "generator", room(s), 0);
    s.actors.claudette.item = "commodious_toolbox";
    killerTurn(s);
    expect(() =>
      reduce(s, { type: "USE_ITEM", actorId: "claudette", propId: g.id }),
    ).toThrow(/survivor turn/);
  });
  it("别的空间里的发电机不行", () => {
    const s = base();
    const g = put(s, "x", "generator", "mine_entrance", 0);
    s.actors.dwight.item = "toolbox";
    expect(() =>
      reduce(s, { type: "USE_ITEM", actorId: "dwight", propId: g.id }),
    ).toThrow(/generator in your space/);
  });
});

describe("急救箱", () => {
  it("自己或同空间另一位逃生者变为健康", () => {
    let s = base();
    s.actors.jake.health = "wounded";
    s.actors.ace.item = "first_aid_kit";
    s = act(s, { type: "USE_ITEM", actorId: "ace", targetId: "jake" });
    expect(s.actors.jake.health).toBe("healthy");
  });
  it("别的空间的人不行", () => {
    const s = base();
    s.actors.jake.health = "wounded";
    s.actors.jake.room = "mine_entrance";
    s.actors.ace.item = "first_aid_kit";
    expect(() =>
      reduce(s, { type: "USE_ITEM", actorId: "ace", targetId: "jake" }),
    ).toThrow(/wounded survivor/);
  });
});

describe("地图 / 彩虹地图", () => {
  it("地图：依次翻开至多 3 个任意位置的道具，可提前结束", () => {
    let s = base();
    for (const p of s.props) p.revealed = false;
    s.actors.dwight.item = "map";
    s = reduce(s, { type: "USE_ITEM", actorId: "dwight", option: "reveal" });
    expect(s.choice?.kind).toBe("MAP_REVEAL");
    const far = s.props.filter((p) => p.room !== room(s));
    s = reduce(s, { type: "SELECT", actorId: "dwight", propId: far[0].id });
    s = reduce(s, { type: "SELECT", actorId: "dwight", propId: far[1].id });
    s = reduce(s, { type: "SELECT", actorId: "dwight", propId: far[2].id });
    expect(s.choice).toBeNull();
    expect(far.slice(0, 3).every((p) => s.props.find((q) => q.id === p.id)!.revealed)).toBe(true);
    // 提前结束
    let t = base();
    for (const p of t.props) p.revealed = false;
    t.actors.dwight.item = "map";
    t = reduce(t, { type: "USE_ITEM", actorId: "dwight", option: "reveal" });
    t = reduce(t, { type: "SELECT", actorId: "dwight", propId: t.props[0].id });
    t = reduce(t, { type: "SELECT", actorId: "dwight" });
    expect(t.choice).toBeNull();
    expect(t.props.filter((p) => p.revealed).length).toBe(1);
  });
  it("地图：或者抽另一张物品牌", () => {
    let s = base();
    s.actors.dwight.item = "map";
    s = act(s, { type: "USE_ITEM", actorId: "dwight", option: "draw" });
    expect(s.actors.dwight.item).toBeTruthy();
    expect(s.itemDiscard).toContain("map");
  });
  it("彩虹地图：翻开杀手的所有移动牌，杀手的计划牌对所有人公开", () => {
    let s = base();
    s.actors.dwight.item = "rainbow_map";
    s = act(s, { type: "USE_ITEM", actorId: "dwight", option: "killer_cards" });
    const v = viewFor(s, "claudette");
    expect(v.plans.trapper).toEqual(["blue", "red"]);
    expect(v.events.some((e) => e.type === "KILLER_CARDS_REVEALED")).toBe(true);
  });
});

describe("手电筒", () => {
  it("杀手在你的空间宣告交互时使用：这次交互被阻止", () => {
    let s = base();
    killerTurn(s);
    s.actors.jake.item = "flashlight";
    s = reduce(s, { type: "INTERACT", actorId: "trapper", action: "attack", targetId: "dwight" });
    expect(s.window?.event).toBe("WOULD_INTERACT");
    // 同空间所有持有物品的逃生者都有机会（不暴露是哪张）
    expect(s.window?.itemActors).toEqual(["jake"]);
    s = act(s, { type: "USE_ITEM", actorId: "jake", itemId: "flashlight" });
    expect(s.actors.dwight.health).toBe("healthy");
    expect(s.events.some((e) => e.type === "INTERACTION_PREVENTED")).toBe(true);
  });
  it("杀手回合中、杀手还没交互前也可以用：本回合不能交互，但仍可使用杀手力量", () => {
    let s = base();
    killerTurn(s);
    s.actors.jake.item = "flashlight";
    s = act(s, { type: "USE_ITEM", actorId: "jake" });
    expect(() =>
      reduce(s, { type: "INTERACT", actorId: "trapper", action: "attack", targetId: "dwight" }),
    ).toThrow(/flashlight/);
    const path = Object.values(s.paths).find(
      (p) => p.rooms.includes(room(s)) && !p.wall && !p.pallet,
    )!;
    s = act(s, { type: "INTERACT", actorId: "trapper", action: "power", pathId: path.id });
    expect(s.paths[path.id].bearTrap).toBe(true);
  });
  it("逃生者回合不能用", () => {
    const s = base();
    s.actors.jake.item = "flashlight";
    expect(() => reduce(s, { type: "USE_ITEM", actorId: "jake" })).toThrow(/killer turn/);
  });
});

describe("鞭炮", () => {
  function killerMovesIn(s: GameState) {
    // 把逃生者放到相邻房间，杀手用正常移动进入
    const from = s.actors.trapper.room!;
    const r = legalRoutes(s, from, "killer", "blue").find((r) => !s.paths[r.pathId].wall)
      ?? legalRoutes(s, from, "killer").find((r) => !s.paths[r.pathId].wall)!;
    s.turn!.card = s.paths[r.pathId].color;
    s.actors.jake.room = r.to;
    return r;
  }
  it("杀手要进入你的空间时使用：移动失败，也失去交互", () => {
    let s = base();
    killerTurn(s, "MOVE");
    const r = killerMovesIn(s);
    s.actors.jake.item = "firecracker";
    const from = s.actors.trapper.room;
    s = reduce(s, { type: "MOVE", actorId: "trapper", pathId: r.pathId, to: r.to });
    expect(s.window?.event).toBe("KILLER_WOULD_ENTER");
    s = act(s, { type: "USE_ITEM", actorId: "jake", option: "block" });
    expect(s.actors.trapper.room).toBe(from);
    expect(s.turn!.interactionSpent).toBe(true);
    expect(s.events.some((e) => e.type === "MOVE_BLOCKED")).toBe(true);
  });
  it("不使用时照常进入", () => {
    let s = base();
    killerTurn(s, "MOVE");
    const r = killerMovesIn(s);
    s.actors.jake.item = "firecracker";
    s = act(s, { type: "MOVE", actorId: "trapper", pathId: r.pathId, to: r.to });
    expect(s.actors.trapper.room).toBe(r.to);
  });
  it("移除可破坏墙壁的用法仍待用户裁定（Q10），明确报错", () => {
    const s = base();
    s.actors.jake.item = "firecracker";
    expect(() =>
      reduce(s, { type: "USE_ITEM", actorId: "jake", option: "wall", pathId: "x" }),
    ).toThrow(/CHECK_REQUIRED/);
  });
  it("没有人持有物品时不产生多余的询问（不影响原有流程）", () => {
    let s = base();
    killerTurn(s, "MOVE");
    const r = killerMovesIn(s);
    s = reduce(s, { type: "MOVE", actorId: "trapper", pathId: r.pathId, to: r.to });
    expect(s.events.some((e) => e.type === "KILLER_WOULD_ENTER")).toBe(false);
  });
});

describe("钥匙", () => {
  it("掷骰出现失败后，任意持物逃生者可重掷一颗；重掷后的失败不再给杀手血点", () => {
    let s = base();
    const g = put(s, "x", "generator", room(s), 0);
    s.actors.ace.item = "skeleton_key";
    // 找一个首掷为失败的局面
    for (let seed = 1; seed < 400; seed++) {
      let t = structuredClone(s);
      t.rng = seed;
      t = reduce(t, { type: "INTERACT", actorId: "dwight", action: "repair", targetId: g.id });
      while (t.window && t.window.event !== "AFTER_ROLL")
        t = reduce(t, { type: "PASS", actorId: t.window.actors[t.window.index] });
      if (t.window?.event === "AFTER_ROLL" && t.roll?.faces[0] === 0) {
        s = t;
        break;
      }
    }
    expect(s.window?.itemActors).toContain("ace");
    const blood = s.actors.trapper.blood;
    s = reduce(s, { type: "USE_ITEM", actorId: "ace", option: "reroll", index: 0 });
    const reroll = s.events.find((e) => e.type === "DIE_REROLLED")!;
    expect(reroll.data.index).toBe(0);
    // 同一颗不能再重掷
    expect(s.roll?.rerolled).toEqual([0]);
    s = settle(s);
    const face = reroll.data.face as number;
    expect(s.actors.trapper.blood).toBe(Math.min(12, blood + (face === 0 ? 1 : 0)));
  });
  it("或者让任意一位逃生者获得 1/2/3 血点", () => {
    for (const [item, n] of [["broken_key", 1], ["dull_key", 2], ["skeleton_key", 3]] as const) {
      let s = base();
      s.actors.claudette.blood = 0;
      s.actors.dwight.item = item;
      s = act(s, { type: "USE_ITEM", actorId: "dwight", option: "blood", targetId: "claudette" });
      expect(s.actors.claudette.blood).toBe(n);
    }
  });
});

describe("医生「压迫性气场」", () => {
  it("附近的逃生者使用物品时，医生可让他掷危险骰；失败则物品被弃掉且没有效果", () => {
    let outcome = { negated: 0, worked: 0 };
    for (let seed = 1; seed < 60; seed++) {
      let s = base("doctor");
      s.rng = seed;
      s.actors.doctor.perks = ["board_doctor_3"];
      s.actors.jake.health = "wounded";
      s.actors.ace.item = "first_aid_kit";
      s = reduce(s, { type: "USE_ITEM", actorId: "ace", targetId: "jake" });
      expect(s.window?.event).toBe("ITEM_USED");
      s = act(s, { type: "USE_PERK", actorId: "doctor", perkId: "board_doctor_3" });
      expect(s.itemDiscard).toContain("first_aid_kit");
      const fail = s.events.some((e) => e.type === "ITEM_NEGATED");
      expect(s.actors.jake.health).toBe(fail ? "wounded" : "healthy");
      fail ? outcome.negated++ : outcome.worked++;
    }
    expect(outcome.negated).toBeGreaterThan(0);
    expect(outcome.worked).toBeGreaterThan(0);
  });
  it("太远时不触发", () => {
    let s = base("doctor");
    s.actors.doctor.perks = ["board_doctor_3"];
    s.actors.doctor.room = "macmillan_none";
    s.actors.ace.item = "broken_key";
    // 放到一个不相连的房间
    const far = s.props.find((p) => p.room !== room(s))!.room;
    s.actors.doctor.room = far;
    s = reduce(s, { type: "USE_ITEM", actorId: "ace", option: "blood", targetId: "ace" });
    expect(s.window?.event === "ITEM_USED").toBe(false);
  });
});

describe("界面：物品按钮是完整命令", () => {
  it("getControls 在自己的回合列出可用的物品；itemActions 给不在回合中的持有者", () => {
    const s = base();
    const g = put(s, "x", "generator", room(s), 0);
    s.actors.dwight.item = "toolbox";
    s.actors.claudette.item = "first_aid_kit";
    s.actors.jake.health = "wounded";
    const labels = getControls(s).actions.map((a) => a.label);
    expect(labels.some((l) => l.includes("工具箱"))).toBe(true);
    const other = itemActions(s, "claudette");
    expect(other.map((a) => a.command.targetId)).toEqual(["jake"]);
    expect(other[0].label).toContain("急救箱");
    expect(g).toBeTruthy();
  });
});

describe("审计缺陷回归", () => {
  it("AUDIT-B01：克劳黛特跟随德怀特移动后，不会得到「精研百草」的时机", () => {
    let s = base();
    const from = room(s);
    const r = legalRoutes(s, from, "survivor").find((r) => !s.paths[r.pathId].wall)!;
    s.actors.dwight.perks = ["board_dwight_2"];
    s.actors.claudette.perks = ["board_claudette_1"];
    s.actors.dwight.room = r.to;
    s.actors.dwight.health = "wounded";
    s.window = {
      event: "AFTER_MOVE",
      context: { actorId: "dwight", from, to: r.to, pathId: r.pathId },
      actors: ["dwight"],
      index: 0,
      eligible: { dwight: ["board_dwight_2"] },
    };
    s = reduce(s, {
      type: "USE_PERK",
      actorId: "dwight",
      perkId: "board_dwight_2",
      targetId: "claudette",
    });
    for (let i = 0; i < 10 && s.window; i++) {
      expect(s.window.eligible.claudette ?? []).not.toContain("board_claudette_1");
      s = reduce(s, { type: "PASS", actorId: s.window.actors[s.window.index] });
    }
    expect(s.actors.claudette.room).toBe(r.to);
  });
  it("AUDIT-B01：在自己的回合仍然可以用", () => {
    const s = base();
    s.turn!.actorId = "claudette";
    s.actors.claudette.perks = ["board_claudette_1"];
    s.window = {
      event: "BEFORE_OWN_MOVE",
      context: { actorId: "claudette" },
      actors: ["claudette"],
      index: 0,
      eligible: { claudette: ["board_claudette_1"] },
    };
    s.actors.dwight.health = "wounded";
    const t = reduce(s, {
      type: "USE_PERK",
      actorId: "claudette",
      perkId: "board_claudette_1",
      targetId: "dwight",
    });
    expect(t.events.some((e) => e.type === "PERK_USED")).toBe(true);
  });
  function hagSetup(extraSurvivorInRoom: boolean) {
    let s = base("hag", ["meg", "claudette", "jake", "ace"]);
    const from = s.actors.hag.room!;
    const r = legalRoutes(s, from, "killer").find((r) => !s.paths[r.pathId].wall)!;
    s.actors.meg.perks = ["board_meg_3"];
    s.actors.meg.room = r.to;
    if (!extraSurvivorInRoom)
      for (const id of ["claudette", "jake", "ace"]) s.actors[id].room = from;
    else s.actors.jake.room = r.to;
    const locker = s.props.find((p) => p.kind === "locker")!;
    locker.room = r.to;
    locker.revealed = true;
    s.choice = { kind: "PHANTASM", actorId: "hag", room: r.to, price: 0 };
    const p = s.props.find((p) => p.room === r.to && p.id !== locker.id)!;
    p.revealed = false;
    s = reduce(s, {
      type: "SELECT",
      actorId: "hag",
      option: "teleport",
      targetId: "meg",
      action: "attack",
    });
    s = reduce(s, { type: "SELECT", actorId: "hag", propId: p.id });
    s = reduce(s, {
      type: "USE_PERK",
      actorId: "meg",
      perkId: "board_meg_3",
      propId: locker.id,
    });
    return s;
  }
  it("AUDIT-B02：梅格躲柜后，空间里没有别人 → 这次交互作废，游戏继续", () => {
    let s = hagSetup(false);
    s = settle(s);
    expect(s.actors.meg.lockerId).toBeTruthy();
    expect(s.actors.meg.health).toBe("healthy");
    expect(s.events.some((e) => e.type === "INTERACTION_LOST")).toBe(true);
    expect(s.window).toBeNull();
    expect(getControls(s).actions.length).toBeGreaterThan(0);
  });
  it("AUDIT-B02：空间里还有别的逃生者 → 妖巫重新选择交互对象", () => {
    let s = hagSetup(true);
    s = settle(s);
    expect(s.choice?.kind).toBe("PHANTASM_TARGET");
    const options = getControls(s).actions.map((a) => a.command);
    expect(options.every((c) => c.targetId === "jake")).toBe(true);
    s = act(s, options.find((c) => c.action === "attack")!);
    expect(s.actors.jake.health).toBe("wounded");
    expect(s.actors.meg.health).toBe("healthy");
  });
});
