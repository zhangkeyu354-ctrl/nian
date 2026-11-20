import { describe, expect, it } from "vitest";
import { createGame, reduceGame, gameView } from "../src/game.ts";

describe("完整基础局状态流", () => {
  it("4 人：开局、夜晚、六标记、简报、正确破案后好人胜", () => {
    let s = createGame(4, 0, 3, false, 1000, () => 0.25);
    expect(s.phase).toBe("setup");
    s = reduceGame(s, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
    expect(s.phase).toBe("night_killer");
    const killer = s.roles.indexOf("killer");
    const answer = { owner: killer, clue: s.players[killer].clues[0], means: s.players[killer].means[0] };
    s = reduceGame(s, { type: "choose", seat: killer, clue: answer.clue, means: answer.means }, 2000);
    s = reduceGame(s, { type: "tick" }, 61000, () => 0);
    expect(s.phase).toBe("round1_search");
    expect(gameView(s, s.roles.indexOf("investigator")).answer).toBeUndefined();
    for (const tile of s.board!.tiles) s = reduceGame(s, { type: "mark", seat: 0, tile, option: 0 }, 62000);
    s = reduceGame(s, { type: "brief", seat: 0 }, 62000);
    expect(s.phase).toBe("round1_brief");
    const solver = s.roles.indexOf("investigator");
    s = reduceGame(s, { type: "solve", seat: solver, guess: answer }, 63000);
    expect(s.phase).toBe("result");
    expect(s.winner).toBe("good");
    expect(gameView(s, solver).roles).toEqual(s.roles);
    expect(gameView(s, solver).records).toHaveLength(1);
    expect(gameView(s, solver).records?.[0].markers.death).toBe(0);
  });

  it("8 人：正确破案后只有凶手能提交反杀", () => {
    let s = createGame(8, 0, 4, false, 1000, () => 0.25);
    s = reduceGame(s, { type: "start", seat: 0, location: "location-2" }, 1000, () => 0);
    const killer = s.roles.indexOf("killer");
    const answer = { owner: killer, clue: s.players[killer].clues[0], means: s.players[killer].means[0] };
    s = reduceGame(s, { type: "choose", seat: killer, clue: answer.clue, means: answer.means }, 2000);
    s = reduceGame(s, { type: "tick" }, 61000, () => 0);
    s = reduceGame(s, { type: "solve", seat: s.roles.indexOf("investigator"), guess: answer }, 62000);
    expect(s.phase).toBe("witness_hunt");
    const witness = s.roles.indexOf("witness");
    expect(gameView(s, killer).hunt?.candidates).toContain(witness);
    expect(gameView(s, s.roles.indexOf("investigator")).hunt).toBeUndefined();
    s = reduceGame(s, { type: "suggest", seat: killer, target: witness }, 63000);
    s = reduceGame(s, { type: "submit_hunt", seat: killer }, 64000);
    expect(s.winner).toBe("evil");
  });

  it("坏人真证据只私下拒绝，错误证据才进入公共日志", () => {
    let s = createGame(6, 0, 3, false, 1000, () => 0.25);
    s = reduceGame(s, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
    const killer = s.roles.indexOf("killer");
    const accomplice = s.roles.indexOf("accomplice");
    const answer = { owner: killer, clue: s.players[killer].clues[0], means: s.players[killer].means[0] };
    s = reduceGame(s, { type: "choose", seat: killer, clue: answer.clue, means: answer.means }, 2000);
    s = reduceGame(s, { type: "tick" }, 61000, () => 0);
    const unchanged = reduceGame(s, { type: "solve", seat: accomplice, guess: answer }, 62000);
    expect(unchanged).toBe(s);
    const wrong = reduceGame(s, { type: "solve", seat: accomplice, guess: { ...answer, clue: s.players[killer].clues[1] } }, 62000);
    expect(wrong.log.at(-1)?.detail).toBe("错！");
    expect(wrong.badges[accomplice]).toBe(false);
  });

  it("第二轮替补板由服务端牌堆抽取，客户端不能指定", () => {
    let s = createGame(4, 0, 3, false, 1000, () => 0.25);
    s = reduceGame(s, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
    s = reduceGame(s, { type: "tick" }, 61000, () => 0);
    for (const tile of s.board!.tiles) s = reduceGame(s, { type: "mark", seat: 0, tile, option: 0 }, 62000);
    s = reduceGame(s, { type: "brief", seat: 0 }, 62000);
    for (let i = 0; i < 3; i++) s = reduceGame(s, { type: "next_speaker", seat: 0 }, 63000);
    expect(s.phase).toBe("round2_search");
    const drawn = s.orangeDeck[0];
    s = reduceGame(s, { type: "replace", seat: 0, oldTile: s.board!.tiles[2] }, 64000);
    expect(s.board!.tiles).toContain(drawn);
    expect(s.orangeDeck).not.toContain(drawn);
  });

  it("简报发言可延长计时，只有发言人或专家可操作", () => {
    let s = createGame(4, 0, 3, false, 1000, () => 0.25);
    s = reduceGame(s, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
    s = reduceGame(s, { type: "tick" }, 61000, () => 0);
    for (const tile of s.board!.tiles) s = reduceGame(s, { type: "mark", seat: 0, tile, option: 0 }, 62000);
    s = reduceGame(s, { type: "brief", seat: 0 }, 63000);
    expect(() => reduceGame(s, { type: "extend_speaker", seat: 2 }, 64000)).toThrow();
    s = reduceGame(s, { type: "extend_speaker", seat: 1 }, 64000);
    expect(s.board!.speechDurationMs).toBe(60000);
    s = reduceGame(s, { type: "next_speaker", seat: 0 }, 65000);
    expect(s.board!.speechDurationMs).toBe(30000);
  });

  for (const count of [4, 8, 12]) {
    it(`${count} 人三轮无人破案，第三轮简报结束坏人胜`, () => {
      let s = createGame(count, 0, 4, false, 1000, () => 0.25);
      s = reduceGame(s, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
      s = reduceGame(s, { type: "tick" }, 61000, () => 0);
      for (let round = 1; round <= 3; round++) {
        if (round > 1) s = reduceGame(s, { type: "replace", seat: 0, oldTile: s.board!.tiles[2] }, 62000 + round);
        for (const tile of s.board!.tiles) if (!(tile in s.board!.markers)) s = reduceGame(s, { type: "mark", seat: 0, tile, option: 0 }, 62000 + round);
        s = reduceGame(s, { type: "brief", seat: 0 }, 63000 + round);
        for (let speaker = 0; speaker < count - 1; speaker++) s = reduceGame(s, { type: "next_speaker", seat: 0 }, 64000 + round);
      }
      expect(s.phase).toBe("result");
      expect(s.winner).toBe("evil");
      expect(gameView(s, 1).records?.map((record) => record.round)).toEqual([1, 2, 3]);
    });
  }
});
