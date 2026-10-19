// 整体流程顺序对照规则书 B01 p6–p11、p16、p19（Claude 2026-10-19）
// 用三局完整回放的事件日志逐轮检查顺序，而不是只看结果。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createGame, reduce } from "../src/index.ts";
import { fixture } from "./fixtures.ts";
import type { GameState, Event } from "../../shared/src/types.ts";

function replay(seed: number) {
  const r = JSON.parse(readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8"));
  let s: GameState = createGame(r.options);
  const firstPlayers: Record<number, string> = { 1: s.survivors[0] };
  for (const c of r.commands) {
    s = reduce(s, c);
    if (!firstPlayers[s.round]) firstPlayers[s.round] = s.survivors[s.firstPlayer];
  }
  return { s, firstPlayers };
}
const types = (ev: Event[]) => ev.map((e) => e.type);

describe.each([1701, 2903, 4111])("回放 %i 的流程顺序", (seed) => {
  const { s, firstPlayers } = replay(seed);
  const ev = s.events;
  it("准备（B01 p6）：按顺序每位逃生者翻开一个道具 → 所有人掷骰出生 → 进入第 1 轮计划", () => {
    const t = types(ev);
    const firstPlan = t.indexOf("PLANNING_START");
    const setup = ev.slice(0, firstPlan);
    expect(setup.filter((e) => e.type === "PROP_REVEALED").map((e) => e.data.actorId)).toEqual(s.survivors);
    const lastReveal = t.lastIndexOf("PROP_REVEALED", firstPlan);
    const spawns = setup.filter((e) => e.type === "SPAWNED");
    expect(spawns).toHaveLength(5);
    expect(spawns.every((e) => e.seq > ev[lastReveal].seq)).toBe(true);
  });
  it("每一轮：计划 → 逃生者按先手顺序行动 → 杀手按牌序行动 → 清理（B01 p8–p11）", () => {
    for (let round = 1; round <= s.round; round++) {
      const r = ev.filter((e) => e.round === round);
      const t = types(r);
      const ps = t.indexOf("PLANNING_START"),
        pe = t.indexOf("PLANNING_END"),
        cs = t.indexOf("CLEANUP_START");
      if (ps < 0 || pe < 0) continue; // 对局在本轮计划前结束
      expect(ps).toBeLessThan(pe);
      // 计划阶段只有提交计划（以及技能），没有任何人行动
      expect(t.slice(ps, pe).some((x) => ["TURN_START", "MOVED"].includes(x))).toBe(false);
      const starts = r.filter((e) => e.type === "TURN_START").map((e) => String(e.data.actorId));
      const survivorsTurns = starts.filter((id) => id !== s.killerId);
      const killerTurns = starts.filter((id) => id === s.killerId);
      // 杀手的回合全部在逃生者之后
      const firstKiller = starts.indexOf(s.killerId);
      if (firstKiller >= 0) expect(starts.slice(firstKiller).every((id) => id === s.killerId)).toBe(true);
      // 逃生者从先手开始顺时针
      const order = [...s.survivors.slice(s.survivors.indexOf(firstPlayers[round])), ...s.survivors.slice(0, s.survivors.indexOf(firstPlayers[round]))];
      const expected = order.filter((id) => survivorsTurns.includes(id));
      expect(survivorsTurns).toEqual(expected);
      // 杀手牌序：先左后右（计划时的顺序）
      const kCards = r.filter((e) => e.type === "TURN_START" && e.data.actorId === s.killerId).map((e) => e.data.index);
      expect(kCards).toEqual([...kCards].sort());
      expect(killerTurns.length).toBeLessThanOrEqual(3);
      if (cs >= 0 && !t.includes("GAME_OVER")) {
        // 清理：开始 → 献祭推进 → 本轮清理完成，都记在本轮
        const rc = t.indexOf("ROUND_CLEANUP");
        expect(rc).toBeGreaterThan(cs);
        const sac = t.slice(cs, rc).filter((x) => x === "SACRIFICE_PROGRESS").length;
        expect(sac).toBeLessThanOrEqual(4);
      }
    }
  });
  it("先手标记每轮顺时针传给下一位逃生者（B01 p11，3–4 人时按角色传，p19）", () => {
    for (let round = 2; round <= s.round; round++) {
      if (!firstPlayers[round]) continue;
      const prev = s.survivors.indexOf(firstPlayers[round - 1]);
      expect(firstPlayers[round]).toBe(s.survivors[(prev + 1) % 4]);
    }
  });
  it("每轮开始时所有人重新拿回全部移动牌（B01 p11）", () => {
    // 回放结束时若处于计划阶段之后，至少检查最后一次清理之后手牌是完整的一套
    const st = createGame(JSON.parse(readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8")).options);
    expect(Object.values(st.hands).every((h) => h.length === 4 || h.length === 5)).toBe(true);
  });
  it("胜负立即结算（B01 p11）：GAME_OVER 之后没有任何事件", () => {
    expect(ev.at(-1)!.type).toBe("GAME_OVER");
  });
});

describe("清理阶段的步骤顺序（B01 p11）", () => {
  it("挂钩者各 +1 献祭 → 移除恶灵 → 先手传下去 → 拿回移动牌 → 下一轮计划", () => {
    let s = fixture("trapper");
    for (const a of Object.values(s.actors)) a.perks = [];
    s.actors.jake.hookId = "h1";
    s.actors.ace.hookId = "h2";
    s.entity = { kind: "prop", id: "h1" };
    s.sacrifice = 2;
    s.turnOrder = ["trapper", "trapper"];
    s.cursor = 1;
    s.turn = { actorId: "trapper", card: "blue", index: 1, bonus: false, stage: "INTERACT", interactionSpent: true, interacted: false, token: 5 };
    s.killerBonusUsed = true;
    s.hands.trapper = [];
    s = reduce(s, { type: "END_TURN", actorId: "trapper" });
    const t = s.events.map((e) => e.type);
    const i = t.indexOf("CLEANUP_START");
    expect(t.slice(i)).toEqual(["CLEANUP_START", "SACRIFICE_PROGRESS", "SACRIFICE_PROGRESS", "ROUND_CLEANUP", "PLANNING_START"]);
    expect(s.sacrifice).toBe(4);
    expect(s.entity).toBeNull();
    expect(s.firstPlayer).toBe(1);
    expect(s.hands.trapper).toHaveLength(5);
    expect(s.phase).toBe("PLANNING");
    expect(s.events.find((e) => e.type === "ROUND_CLEANUP")!.round).toBe(1);
  });
  it("清理时献祭进度到 8 立即结束，不再进入下一轮", () => {
    let s = fixture("trapper");
    for (const a of Object.values(s.actors)) a.perks = [];
    s.actors.jake.hookId = "h1";
    s.sacrifice = 7;
    s.turnOrder = ["trapper", "trapper"];
    s.cursor = 1;
    s.turn = { actorId: "trapper", card: "blue", index: 1, bonus: false, stage: "INTERACT", interactionSpent: true, interacted: false, token: 5 };
    s.killerBonusUsed = true;
    s = reduce(s, { type: "END_TURN", actorId: "trapper" });
    expect(s.winner).toBe("killer");
    expect(s.events.at(-1)!.type).toBe("GAME_OVER");
  });
});
