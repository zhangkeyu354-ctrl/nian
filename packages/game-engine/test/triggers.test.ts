// 自然触发测试（Claude 2026-10-19）
// 和 skills.test.ts 不同：这里从不手动设置技能窗口。只发出正常的游戏命令
// （移动、交互、结束行动、计划……），检查引擎是否在"正确的时机、给正确的人"
// 提供该技能或物品，用掉之后效果是否正确；以及在不该触发时不会出现。
import { describe, it, expect } from "vitest";
import { reduce } from "./autoroll.ts";
import { itemActions } from "../src/controls.ts";
import { legalRoutes } from "../src/graph.ts";
import { fixture, put } from "./fixtures.ts";
import type { GameState, Command, Payload } from "../../shared/src/types.ts";

const F = "foundry_upper_floor"; // 起点：有发电机、厄咒图腾、储物柜、木板
const L = "foundry_lower_floor"; // 经蓝色路线 mm_p07 相连
const FAR = "macmillan_none";

type Offer = { event: string; actor: string; perks: string[]; items: boolean };
interface Use {
  actor: string;
  perk?: string;
  item?: Payload; // USE_ITEM 的参数
  args?: Payload;
  event?: string; // 只在这个时机使用
}

/** 搭一个"正在行动阶段"的局面：所有人在 F，回合顺序为 4 位逃生者 → 杀手 ×2 */
function table(killer = "trapper", survivors = ["dwight", "claudette", "jake", "ace"]) {
  const s = fixture(killer, survivors);
  s.turnOrder = [...survivors, killer, killer];
  s.cursor = 0;
  for (const a of Object.values(s.actors)) {
    s.plans[a.id] = a.side === "killer" ? ["blue", "blue"] : ["blue"];
    s.hands[a.ownerId] =
      a.side === "killer" ? ["green", "red", "yellow", "wait"] : ["green", "red", "yellow"];
  }
  s.turn!.stage = "MOVE";
  // 只把发电机等留在 F，其余房间的道具保持翻开状态，避免移动时大量翻牌
  return s;
}
/** 把当前回合交给某人 */
function turnOf(s: GameState, id: string, stage: "MOVE" | "INTERACT" = "MOVE") {
  s.cursor = s.turnOrder.indexOf(id);
  s.turn = {
    actorId: id,
    card: "blue",
    index: 0,
    bonus: false,
    stage,
    interactionSpent: false,
    interacted: false,
    token: s.events.length + 1,
  };
  return s;
}

/**
 * 执行命令，然后一路推进：遇到窗口时，若是要用的那个技能/物品就使用，否则"跳过"；
 * 遇到翻道具/保留骰子等选择用默认项。到没有窗口和选择（等某人正常行动）时停止。
 * 返回最终状态、过程中所有"提供给谁、哪些技能"的记录、以及是否真的用上了。
 */
function play(s: GameState, cmds: Command | Command[], use?: Use) {
  const offers: Offer[] = [];
  let used = false;
  for (const c of Array.isArray(cmds) ? cmds : [cmds]) {
    s = reduce(s, c);
    for (let i = 0; i < 200 && !s.winner; i++) {
      const w = s.window;
      if (w) {
        const who = w.actors[w.index];
        offers.push({
          event: w.event,
          actor: who,
          perks: w.eligible[who] ?? [],
          items: (w.itemActors ?? []).includes(who),
        });
        if (!used && use && who === use.actor && (!use.event || use.event === w.event)) {
          if (use.perk && w.eligible[who]?.includes(use.perk)) {
            s = reduce(s, { type: "USE_PERK", actorId: who, perkId: use.perk, ...use.args });
            used = true;
            continue;
          }
          if (use.item && (w.itemActors ?? []).includes(who) && s.actors[who].item) {
            s = reduce(s, { type: "USE_ITEM", actorId: who, ...use.item });
            used = true;
            continue;
          }
        }
        s = reduce(s, { type: "PASS", actorId: who });
        continue;
      }
      const ch = s.choice;
      if (ch?.kind === "REVEAL") {
        const p = s.props.find((p) => p.room === ch.room && !p.revealed && !p.removed)!;
        s = reduce(s, { type: "SELECT", actorId: ch.actorId, propId: p.id });
        continue;
      }
      if (ch?.kind === "KEEP") {
        s = reduce(s, { type: "SELECT", actorId: ch.actorId, index: 0 });
        continue;
      }
      if (ch?.kind === "BONUS_CARD") {
        s = reduce(s, {
          type: "SELECT",
          actorId: ch.actorId,
          card: s.hands[s.actors[ch.actorId].ownerId][0],
        });
        continue;
      }
      if (ch?.kind === "OPTIONAL_MOVE") {
        s = reduce(s, { type: "SELECT", actorId: ch.actorId });
        continue;
      }
      break;
    }
  }
  return { s, offers, used };
}
const offered = (o: Offer[], actor: string, perk: string) =>
  o.some((x) => x.actor === actor && x.perks.includes(perk));
const moveL = (id: string): Command => ({ type: "MOVE", actorId: id, pathId: "mm_p07", to: L });
const interact = (id: string, action: string, targetId: string, extra: Payload = {}): Command => ({
  type: "INTERACT",
  actorId: id,
  action,
  targetId,
  ...extra,
});
const end = (id: string): Command => ({ type: "END_TURN", actorId: id });
const prop = (s: GameState, kind: string, room = F) =>
  s.props.find((p) => p.kind === kind && p.room === room && !p.removed) ?? put(s, "", kind, room);
/** 找一个首颗骰子为失败（或指定面）的随机数种子，让"掷出失败"类技能可测 */
function withFace(s: GameState, run: (t: GameState) => GameState, face = 0) {
  for (let seed = 1; seed < 2000; seed++) {
    const t = structuredClone(s);
    t.rng = seed;
    const r = run(t);
    if (r.events.some((e) => e.type === "DICE_ROLLED" && (e.data.faces as number[])[0] === face))
      return { seed, s: r };
  }
  throw new Error("no seed");
}

// ───────────────────────── 逃生者 ─────────────────────────
describe("逃生者技能：自然触发", () => {
  it("德怀特①证明自己：自己将要交互时出现；改由同空间的另一位逃生者交互", () => {
    const s = turnOf(table(), "dwight", "INTERACT");
    const g = prop(s, "generator");
    const r = play(s, interact("dwight", "repair", g.id), {
      actor: "dwight",
      perk: "board_dwight_1",
      args: { targetId: "jake", action: "repair", interactionTargetId: g.id },
    });
    expect(r.used).toBe(true);
    expect(r.s.events.some((e) => e.type === "DICE_ROLLED" && e.data.actorId === "jake")).toBe(true);
  });
  it("德怀特②领袖群雄：同空间的人移动时可以跟着走；自己移动时也可以带人", () => {
    let s = turnOf(table(), "claudette");
    s.turn!.card = "blue";
    let r = play(s, moveL("claudette"), { actor: "dwight", perk: "board_dwight_2" });
    expect(r.used).toBe(true);
    expect(r.s.actors.dwight.room).toBe(L);
    s = turnOf(table(), "dwight");
    r = play(s, moveL("dwight"), {
      actor: "dwight",
      perk: "board_dwight_2",
      args: { targetId: "jake" },
    });
    expect(r.used).toBe(true);
    expect(r.s.actors.jake.room).toBe(L);
  });
  it("德怀特③携手合作：相连空间的另一位逃生者做技能检定前出现；自己检定时不出现", () => {
    let s = turnOf(table(), "jake", "INTERACT");
    s.actors.dwight.room = L;
    const g = prop(s, "generator");
    let r = play(s, interact("jake", "repair", g.id), { actor: "dwight", perk: "board_dwight_3" });
    expect(r.used).toBe(true);
    expect(r.s.events.find((e) => e.type === "DICE_ROLLED")!.data.faces).toHaveLength(2);
    s = turnOf(table(), "dwight", "INTERACT");
    r = play(s, interact("dwight", "repair", prop(s, "generator").id));
    expect(offered(r.offers, "dwight", "board_dwight_3")).toBe(false);
  });
  it("梅格②肾上腺素：本轮修好发电机后，清理阶段开始时出现，获得额外回合", () => {
    let s = table("trapper", ["meg", "dwight", "jake", "ace"]);
    turnOf(s, s.killerId, "INTERACT");
    s.cursor = s.turnOrder.length - 1;
    s.turn!.index = 1;
    s.killerBonusUsed = true;
    s.generatorsThisRound = 1;
    const r = play(s, end("trapper"), { actor: "meg", perk: "board_meg_2" });
    expect(r.used).toBe(true);
    expect(r.s.events.some((e) => e.type === "BONUS_TURN_GRANTED" && e.data.actorId === "meg")).toBe(true);
  });
  it("梅格③急速静谧：杀手进入梅格所在空间时出现，在杀手交互前躲进柜子", () => {
    const s = turnOf(table("trapper", ["meg", "dwight", "jake", "ace"]), "trapper");
    s.actors.meg.room = L;
    const locker = put(s, "", "locker", L);
    for (const id of ["dwight", "jake", "ace"]) s.actors[id].room = F;
    const r = play(s, moveL("trapper"), {
      actor: "meg",
      perk: "board_meg_3",
      args: { propId: locker.id },
    });
    expect(r.used).toBe(true);
    expect(r.s.actors.meg.lockerId).toBe(locker.id);
    // 杀手进的不是梅格的空间：不出现
    const t = turnOf(table("trapper", ["meg", "dwight", "jake", "ace"]), "trapper");
    t.actors.meg.room = FAR;
    expect(offered(play(t, moveL("trapper")).offers, "meg", "board_meg_3")).toBe(false);
  });
  it("克劳黛特①精研百草：自己回合移动前、移动后都出现；别人移动时不出现", () => {
    let s = table("trapper", ["dwight", "claudette", "jake", "ace"]);
    turnOf(s, "dwight", "INTERACT");
    s.actors.jake.health = "wounded";
    // 德怀特结束 → 克劳黛特回合开始：移动前
    let r = play(s, end("dwight"), {
      actor: "claudette",
      perk: "board_claudette_1",
      args: { targetId: "jake" },
    });
    expect(r.used).toBe(true);
    expect(r.offers.some((o) => o.event === "BEFORE_OWN_MOVE" && o.perks.includes("board_claudette_1"))).toBe(true);
    // 移动后
    s = turnOf(table(), "claudette");
    s.actors.jake.room = L;
    s.actors.jake.health = "wounded";
    r = play(s, moveL("claudette"), {
      actor: "claudette",
      perk: "board_claudette_1",
      args: { targetId: "jake" },
    });
    expect(r.used).toBe(true);
    // 德怀特移动时克劳黛特跟着（领袖群雄）不算她的回合
    s = turnOf(table(), "dwight");
    r = play(s, moveL("dwight"), { actor: "dwight", perk: "board_dwight_2", args: { targetId: "claudette" } });
    expect(offered(r.offers, "claudette", "board_claudette_1")).toBe(false);
  });
  it("克劳黛特②心灵共鸣、③自我疗愈：自己回合开始时出现", () => {
    for (const [perk, args] of [
      ["board_claudette_2", { targetId: "jake", option: "give", consent: true }],
      ["board_claudette_3", {}],
    ] as const) {
      const s = turnOf(table(), "dwight", "INTERACT");
      s.actors.claudette.health = "wounded";
      const r = play(s, end("dwight"), { actor: "claudette", perk, args });
      expect(r.used).toBe(true);
    }
  });
  it("杰克①钢铁意志：相连空间里有人掷出失败后出现，改为成功、杀手仍得血点", () => {
    const s = turnOf(table(), "dwight", "INTERACT");
    s.actors.jake.room = L;
    const g = prop(s, "generator");
    const { s: r } = withFace(s, (t) =>
      play(t, interact("dwight", "repair", g.id), { actor: "jake", perk: "board_jake_1", args: { index: 0 } }).s,
    );
    expect(r.events.some((e) => e.type === "PERK_USED" && e.data.perkId === "board_jake_1")).toBe(true);
    expect(r.props.find((p) => p.id === g.id)!.progress).toBe(1);
    expect(r.events.some((e) => e.type === "BLOODPOINTS" && e.data.actorId === "trapper" && (e.data.delta as number) > 0)).toBe(true);
  });
  it("杰克②安抚生灵：作为交互，把本空间的乌鸦移到任意空间", () => {
    const s = turnOf(table(), "jake", "INTERACT");
    const crow = put(s, "", "crow", F);
    const r = play(s, interact("jake", "crow", crow.id), {
      actor: "jake",
      perk: "board_jake_2",
      args: { propId: crow.id, to: L },
    });
    expect(r.used).toBe(true);
    expect(r.s.props.find((p) => p.id === crow.id)!.room).toBe(L);
    expect(r.s.events.some((e) => e.type === "CROW_STARTLED")).toBe(false);
  });
  it("杰克③破坏手：破坏（救援）钩子之后出现", () => {
    const s = turnOf(table(), "jake", "INTERACT");
    const hook = put(s, "", "hook", F);
    s.actors.ace.hookId = hook.id;
    const r = play(s, interact("jake", "rescue", hook.id), {
      actor: "jake",
      perk: "board_jake_3",
      args: { option: "blood" },
    });
    expect(r.used).toBe(true);
    expect(r.s.actors.ace.hookId).toBeNull();
  });
  it("妮娅①平稳着陆：替代交互，可逆着单向路线移动并得 1 血点", () => {
    const s = turnOf(table("trapper", ["nea", "dwight", "jake", "ace"]), "nea", "INTERACT");
    const g = prop(s, "generator");
    s.actors.nea.blood = 2;
    const blood = s.actors.nea.blood;
    const r = play(s, interact("nea", "repair", g.id), {
      actor: "nea",
      perk: "board_nea_1",
      args: { pathId: "mm_p07", to: L },
    });
    expect(r.used).toBe(true);
    expect(r.s.actors.nea.room).toBe(L);
    expect(r.s.actors.nea.blood).toBe(blood + 1);
  });
  it("妮娅②暴走族：任意逃生者回合开始时出现", () => {
    const s = turnOf(table("trapper", ["dwight", "nea", "jake", "ace"]), "dwight", "INTERACT");
    const wall = Object.values(s.paths).find((p) => p.wall)!;
    const r = play(s, end("dwight"), { actor: "nea", perk: "board_nea_2", args: { pathId: wall.id } });
    expect(r.used).toBe(true);
    expect(r.s.paths[wall.id].temporaryWall).toBe(true);
  });
  it("妮娅③都市生存：开完箱子后出现，箱子留下", () => {
    const s = turnOf(table("trapper", ["nea", "dwight", "jake", "ace"]), "nea", "INTERACT");
    const chest = put(s, "", "chest", F);
    const r = play(s, interact("nea", "chest", chest.id), { actor: "nea", perk: "board_nea_3" });
    expect(r.used).toBe(true);
    expect(r.s.props.find((p) => p.id === chest.id)!.removed).toBe(false);
  });
  it("埃斯①稳操胜券：任意逃生者回合开始时出现，翻开杀手一张计划牌", () => {
    const s = turnOf(table("trapper", ["dwight", "jake", "claudette", "ace"]), "dwight", "INTERACT");
    const r = play(s, end("dwight"), { actor: "ace", perk: "board_ace_1", args: { index: 0 } });
    expect(r.used).toBe(true);
    expect(r.s.events.some((e) => e.type === "PLANNED_CARD_REVEALED")).toBe(true);
  });
  it("埃斯②锦囊妙计：自己交互之前出现，与相连空间的同类道具交换", () => {
    const s = turnOf(table(), "ace", "INTERACT");
    const chests = s.props.filter((p) => p.kind === "chest");
    const [here, there] = chests;
    here.room = F;
    there.room = L;
    const r = play(s, interact("ace", "chest", here.id), {
      actor: "ace",
      perk: "board_ace_2",
      args: { propId: here.id, otherPropId: there.id },
    });
    expect(r.used).toBe(true);
    // 换走了正要搜的箱子 → 自动改为搜换进来的那个箱子，不会卡住
    expect(r.s.props.find((p) => p.id === there.id)!.removed).toBe(true);
    expect(r.s.props.find((p) => p.id === here.id)!.room).toBe(L);
  });
  it("埃斯③好运会传染：只在自己回合结束时出现", () => {
    let s = turnOf(table(), "ace", "INTERACT");
    let r = play(s, end("ace"), { actor: "ace", perk: "board_ace_3" });
    expect(r.used).toBe(true);
    s = turnOf(table(), "dwight", "INTERACT");
    r = play(s, end("dwight"));
    expect(r.offers.some((o) => o.event === "OWN_TURN_END" && o.perks.includes("board_ace_3"))).toBe(false);
  });
  it("凤敏②警戒：杀手摧毁木板时出现，凤敏沿任意路线移动", () => {
    const s = turnOf(table("trapper", ["feng_min", "dwight", "jake", "ace"]), "trapper");
    s.paths.mm_p07.pallet = true;
    const r = play(s, moveL("trapper"), {
      actor: "feng_min",
      perk: "board_feng_min_2",
      args: { pathId: "mm_p08", to: "coal_tower_ground" },
    });
    expect(r.used).toBe(true);
    expect(r.s.actors.feng_min.room).toBe("coal_tower_ground");
  });
  it("凤敏③技术员：修发电机掷出失败后出现，再交互一次", () => {
    const s = turnOf(table("trapper", ["feng_min", "dwight", "jake", "ace"]), "feng_min", "INTERACT");
    const g = prop(s, "generator");
    const totem = prop(s, "hex_totem");
    const { s: r } = withFace(s, (t) =>
      play(t, interact("feng_min", "repair", g.id), {
        actor: "feng_min",
        perk: "board_feng_min_3",
        args: { action: "cleanse", targetId: totem.id },
      }).s,
    );
    expect(r.events.some((e) => e.type === "PERK_USED" && e.data.perkId === "board_feng_min_3")).toBe(true);
    expect(r.events.filter((e) => e.type === "DICE_ROLLED").length).toBe(2);
  });
});

// ───────────────────────── 杀手 ─────────────────────────
describe("杀手技能与力量：自然触发", () => {
  it("设陷者①所向无敌、③欣喜若狂：攻击健康逃生者之后出现", () => {
    let s = turnOf(table(), "trapper", "INTERACT");
    let r = play(s, interact("trapper", "attack", "jake"), {
      actor: "trapper",
      perk: "board_trapper_1",
      args: { pathId: "mm_p07", to: L },
    });
    expect(r.used).toBe(true);
    expect(r.s.actors.jake.room).toBe(L);
    s = turnOf(table(), "trapper", "INTERACT");
    r = play(s, interact("trapper", "attack", "jake"), {
      actor: "trapper",
      perk: "board_trapper_3",
      args: { pathId: "mm_p07", to: L },
    });
    expect(r.used).toBe(true);
    expect(r.s.actors.trapper.room).toBe(L);
  });
  it("设陷者②恐慌降临：相连空间的逃生者技能检定前出现，改掷危险骰", () => {
    const s = turnOf(table(), "dwight", "INTERACT");
    s.actors.trapper.room = L;
    const r = play(s, interact("dwight", "repair", prop(s, "generator").id), {
      actor: "trapper",
      perk: "board_trapper_2",
    });
    expect(r.used).toBe(true);
    expect(r.s.events.find((e) => e.type === "DICE_ROLLED")!.data.die).toBe("danger");
  });
  it("设陷者被动：逃生者走过有捕兽夹的路线时掷危险骰", () => {
    const s = turnOf(table(), "dwight");
    s.paths.mm_p07.bearTrap = true;
    const r = play(s, moveL("dwight"));
    expect(r.s.events.some((e) => e.type === "CHECK_RESOLVED" && e.data.kind === "beartrap")).toBe(true);
  });
  it("幽灵①暗夜之睛：计划阶段结束时出现，放第三张牌", () => {
    const s = table("wraith");
    s.phase = "PLANNING";
    s.turn = null;
    s.plans = {};
    const cmds: Command[] = ["dwight", "claudette", "jake", "ace"].map((id) => ({ type: "PLAN", actorId: id, cards: ["blue"] }));
    cmds.push({ type: "PLAN", actorId: "wraith", cards: ["blue", "red"] });
    s.hands.wraith = ["blue", "green", "red", "yellow", "wait"];
    for (const id of ["dwight", "claudette", "jake", "ace"]) s.hands[id] = ["blue", "green", "red", "yellow"];
    const r = play(s, cmds, { actor: "wraith", perk: "board_wraith_1", args: { card: "green" } });
    expect(r.used).toBe(true);
    expect(r.s.plans.wraith).toHaveLength(3);
  });
  it("幽灵②血气追踪：献祭（挂钩）之后出现", () => {
    const s = turnOf(table("wraith"), "wraith", "INTERACT");
    put(s, "", "hook", F);
    s.actors.jake.health = "wounded";
    s.actors.jake.woundedRound = 0;
    const r = play(s, interact("wraith", "pickup", "jake"), { actor: "wraith", perk: "board_wraith_2" });
    expect(r.used).toBe(true);
    expect(r.s.actors.jake.hookId).toBeTruthy();
  });
  it("幽灵力量骷髅丧钟：移动到不相连的空间", () => {
    const s = turnOf(table("wraith"), "wraith", "INTERACT");
    const far = ["macmillan_none", "ironworks", "mine_depths", "storehouse", "shack", "cottage"].find(
      (r) => r !== F && !legalRoutes(s, F, "killer", undefined, true, true, true).some((x) => x.to === r) &&
        Object.values(s.paths).some((p) => p.rooms.includes(r)),
    )!;
    const r = play(s, interact("wraith", "power", "", { to: far }));
    expect(r.s.actors.wraith.room).toBe(far);
  });
  it("农场主①光明之眼：计划阶段结束时出现", () => {
    const s = table("hillbilly");
    s.phase = "PLANNING";
    s.turn = null;
    s.plans = {};
    s.hands.hillbilly = ["blue", "green", "red", "yellow", "wait"];
    for (const id of ["dwight", "claudette", "jake", "ace"]) s.hands[id] = ["blue", "green", "red", "yellow"];
    const cmds: Command[] = ["dwight", "claudette", "jake", "ace"].map((id) => ({ type: "PLAN", actorId: id, cards: ["blue"] }));
    cmds.push({ type: "PLAN", actorId: "hillbilly", cards: ["blue", "red"] });
    const r = play(s, cmds, { actor: "hillbilly", perk: "board_hillbilly_1", args: { index: 0 } });
    expect(r.used).toBe(true);
  });
  it("农场主②耐力持久：要穿过木板时出现，摧毁木板并照常移动、仍可交互", () => {
    const s = turnOf(table("hillbilly"), "hillbilly");
    s.paths.mm_p07.pallet = true;
    const r = play(s, moveL("hillbilly"), { actor: "hillbilly", perk: "board_hillbilly_2" });
    expect(r.used).toBe(true);
    expect(r.s.actors.hillbilly.room).toBe(L);
    expect(r.s.turn!.interactionSpent).toBe(false);
  });
  it("农场主③工匠：有发电机被修好时出现（即使是逃生者的回合）", () => {
    const s = turnOf(table("hillbilly"), "dwight", "INTERACT");
    const g = prop(s, "generator");
    g.progress = 2;
    const { s: r } = withFace(
      s,
      (t) =>
        play(t, interact("dwight", "repair", g.id), {
          actor: "hillbilly",
          perk: "board_hillbilly_3",
          args: { index: 1, card: "green" },
        }).s,
      3,
    );
    expect(r.events.some((e) => e.type === "PERK_USED" && e.data.perkId === "board_hillbilly_3")).toBe(true);
    expect(r.plans.hillbilly[1]).toBe("green");
  });
  it("护士①喘鸣感知：计划阶段开始时（有受伤逃生者）出现", () => {
    const s = turnOf(table("nurse"), "nurse", "INTERACT");
    s.cursor = s.turnOrder.length - 1;
    s.turn!.index = 1;
    s.killerBonusUsed = true;
    s.actors.jake.health = "wounded";
    const r = play(s, end("nurse"), { actor: "nurse", perk: "board_nurse_1", args: { targetId: "jake" } });
    expect(r.used).toBe(true);
    expect(r.s.publicPlans).toContain("jake");
  });
  it("护士②死亡恐惧：受伤的逃生者做技能检定前出现（不论距离）", () => {
    const s = turnOf(table("nurse"), "dwight", "INTERACT");
    s.actors.dwight.health = "wounded";
    s.actors.nurse.room = "mine_depths";
    const r = play(s, interact("dwight", "repair", prop(s, "generator").id), {
      actor: "nurse",
      perk: "board_nurse_2",
    });
    expect(r.used).toBe(true);
  });
  it("护士③护士的呼唤：逃生者变为健康之后出现", () => {
    const s = turnOf(table("nurse"), "dwight", "INTERACT");
    s.actors.jake.health = "wounded";
    const { s: r } = withFace(
      s,
      (t) => play(t, interact("dwight", "heal", "jake"), { actor: "nurse", perk: "board_nurse_3" }).s,
      3,
    );
    expect(r.events.some((e) => e.type === "PERK_USED" && e.data.perkId === "board_nurse_3")).toBe(true);
  });
  it("护士力量：忽略木板和墙、可逆向移动", () => {
    const s = turnOf(table("nurse"), "nurse", "INTERACT");
    s.paths.mm_p07.pallet = true;
    const r = play(s, interact("nurse", "power", "", { pathId: "mm_p07", to: L }));
    expect(r.s.actors.nurse.room).toBe(L);
    expect(r.s.paths.mm_p07.pallet).toBe(true);
  });
  it("妖巫②吞噬希望：本轮修好发电机后，清理阶段开始时出现", () => {
    const s = turnOf(table("hag"), "hag", "INTERACT");
    s.cursor = s.turnOrder.length - 1;
    s.turn!.index = 1;
    s.generatorsThisRound = 1;
    s.killerBonusUsed = false;
    s.hands.hag = ["green"];
    const r = play(s, [end("hag"), { type: "KILLER_BONUS", actorId: "hag", accept: false }], {
      actor: "hag",
      perk: "board_hag_2",
    });
    expect(r.used).toBe(true);
  });
  it("妖巫③毁灭：计划阶段开始时出现，发电机所在空间没有逃生者时 -1 进度", () => {
    const s = turnOf(table("hag"), "hag", "INTERACT");
    s.cursor = s.turnOrder.length - 1;
    s.turn!.index = 1;
    s.killerBonusUsed = true;
    const g = put(s, "", "generator", L, 2);
    const r = play(s, end("hag"), { actor: "hag", perk: "board_hag_3", args: { propId: g.id } });
    expect(r.used).toBe(true);
    expect(r.s.props.find((p) => p.id === g.id)!.progress).toBe(1);
  });
  it("妖巫被动：逃生者进入鬼灵陷阱空间时掷骰，然后妖巫可选择传送攻击", () => {
    const s = turnOf(table("hag"), "dwight");
    s.phantasms = [L];
    s.actors.hag.room = "mine_depths";
    const r = play(s, moveL("dwight"));
    expect(r.s.choice?.kind).toBe("PHANTASM");
    const price = r.s.choice!.price as number;
    r.s.actors.hag.blood = 12;
    const t = play(r.s, { type: "SELECT", actorId: "hag", option: "teleport", targetId: "dwight", action: "attack" });
    expect(t.s.actors.hag.room).toBe(L);
    expect(t.s.actors.dwight.health).toBe("wounded");
    expect(t.s.actors.hag.blood).toBe(12 - price);
  });
  it("医生①行监坐守：清理阶段开始时没人被献祭时出现；有人在钩子上时不出现", () => {
    for (const hooked of [false, true]) {
      const s = turnOf(table("doctor"), "doctor", "INTERACT");
      s.cursor = s.turnOrder.length - 1;
      s.turn!.index = 1;
      s.killerBonusUsed = true;
      if (hooked) s.actors.ace.hookId = put(s, "", "hook", L).id;
      const r = play(s, end("doctor"), { actor: "doctor", perk: "board_doctor_1" });
      expect(r.used).toBe(!hooked);
    }
  });
  it("医生②电量超载：破坏发电机后出现，相连空间的逃生者受伤", () => {
    const s = turnOf(table("doctor"), "doctor", "INTERACT");
    const g = prop(s, "generator");
    g.progress = 1;
    s.actors.jake.room = L;
    const r = play(s, interact("doctor", "damage", g.id), {
      actor: "doctor",
      perk: "board_doctor_2",
      args: { targetId: "jake" },
    });
    expect(r.used).toBe(true);
    expect(r.s.actors.jake.health).toBe("wounded");
  });
  it("医生③压迫性气场：附近逃生者打出物品时出现", () => {
    const s = turnOf(table("doctor"), "dwight", "INTERACT");
    s.actors.jake.item = "broken_key";
    const r = play(s, { type: "USE_ITEM", actorId: "jake", option: "blood", targetId: "jake" }, {
      actor: "doctor",
      perk: "board_doctor_3",
    });
    expect(r.used).toBe(true);
  });
  it("设陷者力量：在相连的空路线上放捕兽夹", () => {
    const s = turnOf(table(), "trapper", "INTERACT");
    const r = play(s, interact("trapper", "power", "", { pathId: "mm_p07" }));
    expect(r.s.paths.mm_p07.bearTrap).toBe(true);
  });
  it("医生力量卡特的电火花：杀手只选空间，空间里的逃生者各自在自己手机上选择", () => {
    const s = turnOf(table("doctor"), "doctor", "INTERACT");
    s.actors.dwight.madness = true;
    s.actors.ace.blood = 0;
    let r = play(s, interact("doctor", "power", "", { to: F }));
    // 依次询问德怀特、克劳黛特、杰克（埃斯没血点，直接获得疯狂）
    expect(r.s.choice).toMatchObject({ kind: "DOCTOR_SHOCK", actorId: "dwight" });
    // 杀手不能替逃生者回答
    expect(() =>
      reduce(r.s, { type: "SELECT", actorId: "doctor", option: "pay" }),
    ).toThrow();
    r = play(r.s, { type: "SELECT", actorId: "dwight", option: "effect" });
    expect(r.s.choice).toMatchObject({ actorId: "claudette" });
    r = play(r.s, { type: "SELECT", actorId: "claudette", option: "effect" });
    const jakeBlood = r.s.actors.jake.blood;
    r = play(r.s, { type: "SELECT", actorId: "jake", option: "pay" });
    expect(r.s.choice?.kind).not.toBe("DOCTOR_SHOCK");
    expect(r.s.actors.dwight.health).toBe("wounded");
    expect(r.s.actors.claudette.madness).toBe(true);
    expect(r.s.actors.jake.madness).toBe(false);
    expect(r.s.actors.jake.blood).toBe(jakeBlood - 1);
    expect(r.s.actors.ace.madness).toBe(true);
  });
  it("杀手额外回合：第二个回合之后可付 4 血点；医生按神经紊乱人数减费", () => {
    const s = turnOf(table("doctor"), "doctor", "INTERACT");
    s.cursor = s.turnOrder.length - 1;
    s.turn!.index = 1;
    s.actors.dwight.madness = true;
    s.actors.jake.madness = true;
    s.actors.doctor.blood = 5;
    let r = play(s, end("doctor"));
    expect(r.s.phase).toBe("BONUS_OFFER");
    r = play(r.s, { type: "KILLER_BONUS", actorId: "doctor", accept: true });
    expect(r.s.actors.doctor.blood).toBe(3);
  });
  it("医生被动：神经紊乱的逃生者修发电机改掷危险骰", () => {
    const s = turnOf(table("doctor"), "dwight", "INTERACT");
    s.actors.dwight.madness = true;
    const r = play(s, interact("dwight", "repair", prop(s, "generator").id));
    expect(r.s.events.find((e) => e.type === "DICE_ROLLED")!.data.die).toBe("danger");
  });
});

// ───────────────────────── 物品 ─────────────────────────
describe("物品：在可以用的时机都能用，不能用的时机不出现", () => {
  it("工具箱：自己回合（移动前、交互阶段）可用；别人回合不可用", () => {
    const s = turnOf(table(), "dwight");
    prop(s, "generator");
    s.actors.dwight.item = "toolbox";
    expect(itemActions(s, "dwight").length).toBe(1);
    turnOf(s, "dwight", "INTERACT");
    expect(itemActions(s, "dwight").length).toBe(1);
    turnOf(s, "jake");
    expect(itemActions(s, "dwight").length).toBe(0);
  });
  it("宽敞工具箱 / 急救箱 / 地图 / 彩虹地图：任意逃生者回合可用，杀手回合不可用", () => {
    for (const item of ["commodious_toolbox", "first_aid_kit", "map", "rainbow_map"]) {
      const s = turnOf(table(), "jake");
      prop(s, "generator");
      s.actors.dwight.item = item;
      s.actors.dwight.health = "wounded";
      expect(itemActions(s, "dwight").length, item).toBeGreaterThan(0);
      turnOf(s, "trapper");
      expect(itemActions(s, "dwight").length, item).toBe(0);
    }
  });
  it("手电筒：杀手在你空间宣告交互时自动询问；杀手不在你的空间时不问", () => {
    let s = turnOf(table(), "trapper", "INTERACT");
    s.actors.ace.item = "flashlight";
    let r = play(s, interact("trapper", "attack", "jake"), { actor: "ace", item: { itemId: "flashlight" } });
    expect(r.used).toBe(true);
    expect(r.s.actors.jake.health).toBe("healthy");
    s = turnOf(table(), "trapper", "INTERACT");
    s.actors.ace.item = "flashlight";
    s.actors.ace.room = L;
    r = play(s, interact("trapper", "attack", "jake"));
    expect(r.offers.some((o) => o.actor === "ace")).toBe(false);
    expect(r.s.actors.jake.health).toBe("wounded");
  });
  it("鞭炮：杀手要进入你的空间时询问；同空间拿着用不上的物品（地图）的人不被询问（用户 2026-10-20）", () => {
    const s = turnOf(table(), "trapper");
    for (const id of ["dwight", "jake"]) s.actors[id].room = L;
    s.actors.dwight.item = "firecracker";
    s.actors.jake.item = "map";
    const r = play(s, moveL("trapper"), { actor: "dwight", item: { option: "block" } });
    // 每人只问一次（用完不再追问）
    expect(r.offers.filter((o) => o.event === "KILLER_WOULD_ENTER").map((o) => o.actor).sort()).toEqual(["dwight"]);
    expect(r.used).toBe(true);
    expect(r.s.actors.trapper.room).toBe(F);
  });
  it("鞭炮：妖巫传送、幽灵骷髅丧钟、护士力量进入你的空间时也能阻止", () => {
    // 幽灵
    let s = turnOf(table("wraith"), "wraith", "INTERACT");
    const far = "mine_depths";
    s.actors.jake.room = far;
    s.actors.jake.item = "firecracker";
    let r = play(s, interact("wraith", "power", "", { to: far }), { actor: "jake", item: { option: "block" } });
    expect(r.used).toBe(true);
    expect(r.s.actors.wraith.room).toBe(F);
    // 护士
    s = turnOf(table("nurse"), "nurse", "INTERACT");
    s.actors.jake.room = L;
    s.actors.jake.item = "firecracker";
    r = play(s, interact("nurse", "power", "", { pathId: "mm_p07", to: L }), { actor: "jake", item: { option: "block" } });
    expect(r.used).toBe(true);
    expect(r.s.actors.nurse.room).toBe(F);
  });
  it("钥匙：任何逃生者掷出失败后询问持有物品的人，可以重掷", () => {
    const s = turnOf(table(), "dwight", "INTERACT");
    s.actors.ace.item = "dull_key";
    s.actors.ace.room = "mine_depths"; // 不在同一空间也可以（"任意一位逃生者"）
    const g = prop(s, "generator");
    const { s: r } = withFace(
      s,
      (t) => play(t, interact("dwight", "repair", g.id), { actor: "ace", item: { option: "reroll", index: 0 } }).s,
    );
    expect(r.events.some((e) => e.type === "DIE_REROLLED")).toBe(true);
  });
  it("钥匙的血点用法：任何时候可用（计划阶段、杀手回合也可以）", () => {
    const s = turnOf(table(), "trapper");
    s.actors.ace.item = "skeleton_key";
    expect(itemActions(s, "ace").some((a) => a.command.option === "blood")).toBe(true);
    s.phase = "PLANNING";
    s.turn = null;
    expect(itemActions(s, "ace").some((a) => a.command.option === "blood")).toBe(true);
  });
  it("鞭炮移除墙壁：任何时候可用", () => {
    const s = turnOf(table(), "trapper");
    const wall = Object.values(s.paths).find((p) => p.wall)!;
    s.actors.ace.room = wall.rooms[0];
    s.actors.ace.item = "firecracker";
    expect(itemActions(s, "ace").some((a) => a.command.option === "wall")).toBe(true);
  });
});

// ───────────────────────── 交互顺序与点击 ─────────────────────────
describe("用完不追问", () => {
  it("用掉技能后，没有别的可用技能时直接轮到下一位，不再问第二遍", () => {
    const s = turnOf(table(), "jake", "INTERACT");
    const r = play(s, interact("jake", "repair", prop(s, "generator").id), {
      actor: "dwight",
      perk: "board_dwight_3",
    });
    expect(r.used).toBe(true);
    expect(r.offers.filter((o) => o.event === "BEFORE_ROLL" && o.actor === "dwight")).toHaveLength(1);
  });
  it("宣告交互后对象被合法换走/失效：交互作废，游戏继续（不会卡住）", () => {
    const s = turnOf(table(), "ace", "INTERACT");
    const lockers = s.props.filter((p) => p.kind === "locker");
    const chest = put(s, "", "chest", F);
    lockers[0].room = L;
    for (const p of lockers.slice(1)) p.room = "nowhere";
    const r = play(s, interact("ace", "chest", chest.id), {
      actor: "ace",
      perk: "board_ace_2",
      args: { propId: chest.id, otherPropId: lockers[0].id },
    });
    expect(r.used).toBe(true);
    expect(r.s.window).toBeNull();
    expect(r.s.events.some((e) => e.type === "INTERACTION_LOST")).toBe(true);
  });
});
// ─────────────
describe("响应顺序", () => {
  it("同一时机多人可用时，按逃生者顺序、最后杀手依次询问（B01 p16）", () => {
    const s = turnOf(table("trapper", ["dwight", "claudette", "jake", "ace"]), "jake", "INTERACT");
    // 携手合作（德怀特）与恐慌降临（设陷者）都在杰克检定前
    const r = play(s, interact("jake", "repair", prop(s, "generator").id));
    const before = r.offers.filter((o) => o.event === "BEFORE_ROLL");
    expect(before.map((o) => o.actor)).toEqual(["dwight", "trapper"]);
  });
});

// ───────────────── Q11 用户裁定后新实现的 4 个技能 + 物品规则更新（2026-10-20） ─────────────────
describe("Q11 四个技能：自然触发", () => {
  it("梅格①冲刺爆发：用移动牌移动之后出现；可走任意颜色的另一条路线，不能原路返回", () => {
    let s = turnOf(table("trapper", ["meg", "dwight", "jake", "ace"]), "meg");
    const out = legalRoutes(s, L, "survivor").find((r) => r.pathId !== "mm_p07")!;
    // 原路返回：拒绝
    let r = play(s, moveL("meg"));
    expect(offered(r.offers, "meg", "board_meg_1")).toBe(true);
    s = turnOf(table("trapper", ["meg", "dwight", "jake", "ace"]), "meg");
    expect(() =>
      play(s, moveL("meg"), { actor: "meg", perk: "board_meg_1", args: { pathId: "mm_p07", to: F } }),
    ).toThrow(/other than the one just moved/);
    r = play(s, moveL("meg"), { actor: "meg", perk: "board_meg_1", args: { pathId: out.pathId, to: out.to } });
    expect(r.used).toBe(true);
    expect(r.s.actors.meg.room).toBe(out.to);
    // 之后仍可交互
    expect(r.s.turn!.stage).toBe("INTERACT");
    expect(r.s.turn!.interactionSpent).toBe(false);
  });
  it("梅格①冲刺爆发：被别的效果移动（如德怀特带着走）时不出现", () => {
    const s = turnOf(table("trapper", ["dwight", "meg", "jake", "ace"]), "dwight");
    const r = play(s, moveL("dwight"), { actor: "dwight", perk: "board_dwight_2", args: { targetId: "meg" } });
    expect(r.s.actors.meg.room).toBe(L);
    expect(offered(r.offers, "meg", "board_meg_1")).toBe(false);
  });
  it("凤敏①轻盈敏捷：穿过路线上的木板时出现；离开有木板道具的空间时也出现；都没有时不出现", () => {
    const out = (s: GameState) => legalRoutes(s, L, "survivor").find((r) => r.pathId !== "mm_p07")!;
    // 路线上的木板
    let s = turnOf(table("trapper", ["feng_min", "dwight", "jake", "ace"]), "feng_min");
    for (const p of s.props) if (p.kind === "pallet") p.room = "nowhere";
    s.paths.mm_p07.pallet = true;
    let o = out(s);
    let r = play(s, moveL("feng_min"), { actor: "feng_min", perk: "board_feng_min_1", args: { pathId: o.pathId, to: o.to } });
    expect(r.used).toBe(true);
    expect(r.s.actors.feng_min.room).toBe(o.to);
    // 离开有木板道具的空间
    s = turnOf(table("trapper", ["feng_min", "dwight", "jake", "ace"]), "feng_min");
    prop(s, "pallet", F);
    o = out(s);
    r = play(s, moveL("feng_min"), { actor: "feng_min", perk: "board_feng_min_1", args: { pathId: o.pathId, to: o.to } });
    expect(r.used).toBe(true);
    // 都没有
    s = turnOf(table("trapper", ["feng_min", "dwight", "jake", "ace"]), "feng_min");
    for (const p of s.props) if (p.kind === "pallet") p.room = "nowhere";
    r = play(s, moveL("feng_min"));
    expect(offered(r.offers, "feng_min", "board_feng_min_1")).toBe(false);
  });
  function planning(killer: string) {
    const s = table(killer);
    s.phase = "PLANNING";
    s.turn = null;
    s.plans = {};
    s.hands[killer] = ["blue", "green", "red", "yellow", "wait"];
    for (const id of ["dwight", "claudette", "jake", "ace"]) s.hands[id] = ["blue", "green", "red", "yellow"];
    return s;
  }
  const plansFor = (killer: string, kcards: string[] = ["blue", "red"]): Command[] => [
    ...["dwight", "claudette", "jake", "ace"].map((id) => ({ type: "PLAN", actorId: id, cards: ["blue"] })),
    { type: "PLAN", actorId: killer, cards: kcards },
  ];
  it("幽灵③穷追不舍：计划阶段结束时出现；被选的逃生者弃牌后从手牌重放一张（本轮不能再用弃掉的牌）", () => {
    let s = planning("wraith");
    let r = play(s, plansFor("wraith"), { actor: "wraith", perk: "board_wraith_3", args: { targetId: "jake" } });
    expect(r.used).toBe(true);
    expect(r.s.choice).toMatchObject({ kind: "REPLAN", actorId: "jake" });
    expect(r.s.hands.jake).not.toContain("blue");
    // 别人看不到新牌，也看不到弃掉的是哪张（用户裁定 Q15：不公开）
    const t = play(r.s, { type: "SELECT", actorId: "jake", card: "green" });
    expect(t.s.plans.jake).toEqual(["green"]);
    expect(t.s.hands.jake).toEqual(["red", "yellow"]);
    expect(t.s.events.find((e) => e.type === "PLANNED_CARD_DISCARDED")!.data.card).toBeUndefined();
  });
  it("妖巫①第三封印：计划阶段开始时出现；本轮用同色移动牌的逃生者无法移动、不能交互，额外回合也一样", async () => {
    // 从上一轮清理进入新一轮计划
    const s = turnOf(table("hag"), "hag", "INTERACT");
    s.cursor = s.turnOrder.length - 1;
    s.turn!.index = 1;
    s.killerBonusUsed = true;
    let r = play(s, end("hag"), { actor: "hag", perk: "board_hag_1", args: { card: "blue" } });
    expect(r.used).toBe(true);
    expect(r.s.sealedCard).toBe("blue");
    expect(r.s.hands.hag).not.toContain("blue");
    // 计划：本轮先手出蓝（被封），其余出绿
    for (const a of Object.values(r.s.actors)) a.perks = [];
    const firstId = r.s.survivors[r.s.firstPlayer];
    r = play(r.s, [
      ...r.s.survivors.map((id) => ({ type: "PLAN", actorId: id, cards: [id === firstId ? "blue" : "green"] })),
      { type: "PLAN", actorId: "hag", cards: ["green", "red"] },
    ]);
    expect(r.s.turn!.actorId).toBe(firstId);
    const blocked = play(r.s, { type: "MOVE", actorId: firstId });
    expect(blocked.s.events.some((e) => e.type === "SEALED_MOVE_FAILED")).toBe(true);
    expect(blocked.s.turn!.interactionSpent).toBe(true);
    // 被封住后，颜色对所有人公开
    const { viewFor } = await import("../src/index.ts");
    expect(viewFor(blocked.s, "jake").sealedCard).toBe("blue");
  });
  it("妖巫①第三封印：在额外回合用被封的颜色同样走不动；下一轮解除", () => {
    const s = turnOf(table("hag"), "dwight");
    s.sealedCard = "blue";
    s.turn!.bonus = true;
    const r = play(s, { type: "MOVE", actorId: "dwight", pathId: "mm_p07", to: L });
    expect(r.s.actors.dwight.room).toBe(F);
    expect(r.s.events.some((e) => e.type === "SEALED_MOVE_FAILED")).toBe(true);
  });
  it("第三封印弃掉的牌：杀手看得到，逃生者在被封住之前看不到", async () => {
    const { viewFor, HIDDEN } = await import("../src/index.ts");
    const s = turnOf(table("hag"), "dwight");
    s.sealedCard = "red";
    expect(viewFor(s, "hag").sealedCard).toBe("red");
    expect(viewFor(s, "dwight").sealedCard).toBe(HIDDEN);
  });
});

describe("物品规则更新（2026-10-20 用户裁定）", () => {
  it("鞭炮可以在杀手搬运途中阻止他进入你的空间；不消耗步数，杀手可用剩余步数改道", () => {
    const s = turnOf(table(), "trapper", "INTERACT");
    for (const p of s.props) if (p.kind === "hook") p.room = "nowhere";
    s.actors.jake.health = "wounded";
    s.actors.jake.woundedRound = 0;
    s.actors.ace.room = L;
    s.actors.ace.item = "firecracker";
    let r = play(s, interact("trapper", "pickup", "jake"));
    expect(r.s.choice?.kind).toBe("CARRY");
    // 选 2 颗骰子、先走进艾斯所在的 L；找一颗不出大成功的种子
    const cmd = { type: "SELECT", actorId: "trapper", dice: 2, route: [{ pathId: "mm_p07", to: L }] };
    let found: ReturnType<typeof play> | null = null;
    for (let seed = 1; seed < 300 && !found; seed++) {
      const t = structuredClone(r.s);
      t.rng = seed;
      const x = play(t, cmd, { actor: "ace", item: { option: "block" }, event: "KILLER_WOULD_ENTER" });
      if (x.used) found = x;
    }
    expect(found).not.toBeNull();
    const f = found!;
    expect(f.s.actors.trapper.room).toBe(F);
    expect(f.s.choice).toMatchObject({ kind: "CARRY_REROUTE", budget: 2 });
    // 改道走另一条路线
    const other = legalRoutes(f.s, F, "killer", undefined, true).find((x) => x.to !== L)!;
    const g = play(f.s, { type: "SELECT", actorId: "trapper", pathId: other.pathId, to: other.to });
    expect(g.s.actors.trapper.room).toBe(other.to);
    expect(g.s.actors.jake.room).toBe(other.to);
  });
  it("钥匙：没有掷出失败时也可以重掷（争取大成功）", () => {
    const s = turnOf(table(), "dwight", "INTERACT");
    s.actors.ace.item = "broken_key";
    const g = prop(s, "generator");
    const { s: r } = withFace(
      s,
      (t) => play(t, interact("dwight", "repair", g.id), { actor: "ace", item: { option: "reroll", index: 0 } }).s,
      3,
    );
    expect(r.events.some((e) => e.type === "DIE_REROLLED" && e.data.from === 3)).toBe(true);
  });
  it("手电筒：杀手宣告使用力量（占用交互机会）时也可以阻止", () => {
    const s = turnOf(table(), "trapper", "INTERACT");
    s.actors.ace.item = "flashlight";
    const r = play(s, interact("trapper", "power", "", { pathId: "mm_p07" }), {
      actor: "ace",
      item: { itemId: "flashlight" },
    });
    expect(r.used).toBe(true);
    expect(r.s.paths.mm_p07.bearTrap).toBe(false);
  });
});

describe("掷骰必须由掷骰者自己操作（用户 2026-10-20）", () => {
  it("修发电机：先停在 ROLL_DICE，只有修理者本人能掷，掷完才出现结果", async () => {
    const { reduce: raw } = await import("../src/index.ts");
    let s = turnOf(table(), "dwight", "INTERACT");
    const g = prop(s, "generator");
    s = raw(s, interact("dwight", "repair", g.id));
    for (let i = 0; i < 20 && s.window; i++)
      s = raw(s, { type: "PASS", actorId: s.window.actors[s.window.index] });
    expect(s.choice).toMatchObject({ kind: "ROLL_DICE", actorId: "dwight" });
    expect(s.roll!.faces).toEqual([]);
    expect(() => raw(s, { type: "SELECT", actorId: "trapper" })).toThrow();
    const before = s.events.length;
    s = raw(s, { type: "SELECT", actorId: "dwight" });
    expect(s.events.slice(before).some((e) => e.type === "DICE_ROLLED")).toBe(true);
    expect(s.roll?.faces.length ?? 1).toBeGreaterThan(0);
  });
});
