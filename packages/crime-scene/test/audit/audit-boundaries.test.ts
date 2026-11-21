import { describe, expect, it } from "vitest";
import { createGame, gameView, reduceGame } from "../../src/game.ts";
import { roleCounts } from "../../src/roles.ts";

describe("上线审核：人数、阶段与隐私边界", () => {
  it("12 人困难局发足 55 对不同的牌，身份数与徽章数正确", () => {
    const state = createGame(12, 0, 5, true, 0, () => 0.25);
    expect(roleCounts(12)).toEqual({ forensic: 1, investigator: 8, killer: 1, accomplice: 1, witness: 1 });
    expect(state.players.flatMap((player) => player.clues)).toHaveLength(55);
    expect(new Set(state.players.flatMap((player) => player.clues)).size).toBe(55);
    expect(state.players.flatMap((player) => player.means)).toHaveLength(55);
    expect(new Set(state.players.flatMap((player) => player.means)).size).toBe(55);
    expect(state.badges.filter(Boolean)).toHaveLength(11);
  });

  it("准备、夜晚、搜证、反杀和结算的非法命令均不能改变状态", () => {
    let state = createGame(6, 0, 4, false, 0, () => 0.25);
    expect(() => reduceGame(state, { type: "mark", seat: 0, tile: "death", option: 0 }, 0)).toThrow();
    state = reduceGame(state, { type: "start", seat: 0, location: "location-1" }, 0, () => 0);
    expect(() => reduceGame(state, { type: "solve", seat: 1, guess: { owner: 2, clue: "x", means: "y" } }, 1)).toThrow();
    state = reduceGame(state, { type: "tick" }, 60_000, () => 0);
    expect(() => reduceGame(state, { type: "brief", seat: 0 }, 60_001)).toThrow();
    const solver = state.roles.indexOf("investigator");
    state = reduceGame(state, { type: "solve", seat: solver, guess: state.answer! }, 60_001);
    expect(state.phase).toBe("witness_hunt");
    expect(() => reduceGame(state, { type: "mark", seat: 0, tile: "death", option: 0 }, 60_002)).toThrow();
    state = reduceGame(state, { type: "tick" }, 120_001);
    expect(state.phase).toBe("result");
    expect(() => reduceGame(state, { type: "solve", seat: solver, guess: state.answer! }, 120_002)).toThrow();
    expect(() => reduceGame(state, { type: "suggest", seat: state.roles.indexOf("killer"), target: solver }, 120_002)).toThrow();
  });

  it("每个阶段的调查员和目击者均看不到答案或角色对应关系", () => {
    let state = createGame(8, 0, 4, true, 0, () => 0.25);
    const investigator = state.roles.indexOf("investigator");
    const witness = state.roles.indexOf("witness");
    const killer = state.roles.indexOf("killer");
    const accomplice = state.roles.indexOf("accomplice");
    const check = () => {
      for (const seat of [investigator, witness]) {
        const view = gameView(state, seat);
        expect(view.answer).toBeUndefined();
        expect(view.roles).toBeUndefined();
        expect(view.records).toBeUndefined();
        expect(view.nightDeadline).toBeUndefined();
        expect(view.hunt).toBeUndefined();
      }
      expect(gameView(state, witness).witnessCandidates?.sort()).toEqual([killer, accomplice].sort());
    };
    state = reduceGame(state, { type: "start", seat: 0, location: "location-1" }, 0, () => 0);
    state = reduceGame(state, { type: "choose", seat: killer, clue: state.players[killer].clues[0], means: state.players[killer].means[0] }, 1);
    check();
    state = reduceGame(state, { type: "tick" }, 60_000, () => 0);
    check();
    state = reduceGame(state, { type: "solve", seat: investigator, guess: state.answer! }, 60_001);
    check();
    state = reduceGame(state, { type: "tick" }, 120_002);
    expect(gameView(state, investigator).answer).toEqual(state.answer);
    expect(gameView(state, witness).roles).toEqual(state.roles);
  });
});
