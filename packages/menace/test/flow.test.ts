import { describe, expect, it } from "vitest";
import { botMove, createGame, type State } from "../src/index.ts";
import { collectScenes } from "../../../apps/web/src/ta/scenes.ts";

const view = {
  phase: "resolve", winner: null, you: 0, oxygen: 15, energy: 10, log: [] as string[], logCount: 0,
};

describe("演出事件", () => {
  it("最后一张牌离开结算阶段仍入队，同批事件按揭示、资源、受伤、阵亡、放逐、结局排列", () => {
    const scenes = collectScenes(view, {
      ...view, phase: "over", winner: "crew", oxygen: 13, logCount: 5,
      log: ["揭示：basic_repair", "座位3 受伤：flesh", "座位3 死亡，身份 loyal", "座位2 死亡，身份 loyal", "座位4 被放逐，身份 butcher"],
    });
    expect(scenes.map(scene => scene.kind)).toEqual(["reveal", "resource", "wound", "death", "death", "exile", "ending"]);
    expect(scenes.filter(scene => scene.kind === "death")).toMatchObject([{ seat: 2 }, { seat: 1 }]);
  });

  it("私密牌面仅从本人的私密投影读取，已确认的旧事件不重复", () => {
    const next = { ...view, notes: ["监控：座位2 的牌是 panic"], question: { q: "rush", data: { type: "basic_repair" } } };
    expect(collectScenes(view, next)).toMatchObject([{ kind: "private", card: "panic" }, { kind: "private", card: "basic_repair" }]);
    expect(collectScenes(next, next)).toEqual([]);
    expect(collectScenes(view, { ...view, you: 1 })).toEqual([]);
  });
});

function voting(seed: number): State {
  const state = createGame(4, seed);
  state.phase = "vote";
  state.players.forEach((p, i) => {
    p.agenda = i < 2 ? "loyal" : "butcher";
    p.revealed = i === 2;
  });
  return state;
}

describe("人机投票", () => {
  it("优先投已公开内鬼，约四成弃权，内鬼不投同伴", () => {
    let abstain = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const crew = botMove(voting(seed), 0);
      if (crew.votes[0] === null) abstain++;
      else expect(crew.votes[0]).toBe(2);
      expect([0, 1, null]).toContain(botMove(voting(seed), 3).votes[3]);
    }
    expect(abstain).toBeGreaterThan(55);
    expect(abstain).toBeLessThan(105);
  });

  it("全人机能投出放逐，讨论领袖能主动发起投票", () => {
    let exiled = false;
    let initiated = false;
    for (let seed = 1; seed <= 60; seed++) {
      let state = voting(seed);
      for (const seat of [0, 1, 2, 3]) state = botMove(state, seat);
      exiled ||= state.players.some(player => player.exiled);
      const discussion = voting(seed);
      discussion.phase = "accuse";
      initiated ||= botMove(discussion, 0).phase === "vote";
    }
    expect(exiled).toBe(true);
    expect(initiated).toBe(true);
  });
});
