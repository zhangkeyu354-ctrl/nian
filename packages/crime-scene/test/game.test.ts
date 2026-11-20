import { describe, expect, it } from "vitest";
import { createGame, reduceGame, gameView } from "../src/game.ts";

function secondRound(count = 6) {
  let s = createGame(count, 0, 3, true, 1000, () => 0.25);
  s = reduceGame(s, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
  s = reduceGame(s, { type: "tick" }, 61000, () => 0);
  for (const tile of s.board!.tiles) s = reduceGame(s, { type: "mark", seat: 0, tile, option: 0 }, 62000);
  s = reduceGame(s, { type: "brief", seat: 0 }, 63000);
  for (let i = 0; i < count - 1; i++) s = reduceGame(s, { type: "next_speaker", seat: 0 }, 64000, () => 0.25);
  return s;
}

function forceEvent(id: string, count = 6) {
  let s = secondRound(count);
  s = { ...s, orangeDeck: [id, ...s.orangeDeck.filter((tile) => tile !== id)] };
  return reduceGame(s, { type: "replace", seat: 0, oldTile: s.board!.tiles[2] }, 65000);
}

describe("完整基础局状态流", () => {
  it("开启事件后，第二轮换板抽到事件会进入事件流程，处理后回到搜证", () => {
    let s = createGame(6, 0, 3, true, 1000, () => 0.25);
    s = reduceGame(s, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
    s = reduceGame(s, { type: "tick" }, 61000, () => 0);
    for (const tile of s.board!.tiles) s = reduceGame(s, { type: "mark", seat: 0, tile, option: 0 }, 62000);
    s = reduceGame(s, { type: "brief", seat: 0 }, 63000);
    for (let i = 0; i < 5; i++) s = reduceGame(s, { type: "next_speaker", seat: 0 }, 64000);
    s = { ...s, orangeDeck: ["event-04", "scene-21", ...s.orangeDeck.filter((tile) => tile !== "scene-21")] };
    s = reduceGame(s, { type: "replace", seat: 0, oldTile: s.board!.tiles[2] }, 65000);
    expect(s.phase).toBe("event");
    expect(s.board!.tiles).toContain("scene-21");
    s = reduceGame(s, { type: "event_misinformation", seat: 0, tile: "death", option: 1 }, 66000);
    expect(s.phase).toBe("round2_search");
    expect(s.board!.markers.death).toBe(1);
  });

  it("秘密证供由目击者选橙板，无目击者时自动跳过", () => {
    let s = forceEvent("event-01");
    const witness = s.roles.indexOf("witness");
    expect(s.phase).toBe("event");
    expect(() => reduceGame(s, { type: "event_secret", seat: 0, oldTile: s.board!.tiles[3] }, 66000)).toThrow();
    const old = s.board!.tiles[3];
    s = reduceGame(s, { type: "event_secret", seat: witness, oldTile: old }, 66000);
    expect(s.phase).toBe("round2_search");
    expect(s.board!.tiles).not.toContain(old);
    expect(forceEvent("event-01", 4).phase).toBe("round2_search");
  });

  it("有据可寻只能从服务端抽出的五块板中选一块替换橙板", () => {
    let s = forceEvent("event-02");
    const drawn = s.pendingEvent!.drawn!;
    expect(drawn).toHaveLength(5);
    expect(gameView(s, 0).event?.drawn).toEqual(drawn);
    expect(gameView(s, 1).event?.drawn).toBeUndefined();
    expect(() => reduceGame(s, { type: "event_traceable", seat: 0, oldTile: "death", newTile: drawn[0] }, 66000)).toThrow();
    expect(() => reduceGame(s, { type: "event_traceable", seat: 0, oldTile: s.board!.tiles[3], newTile: "scene-99" }, 66000)).toThrow();
    s = reduceGame(s, { type: "event_traceable", seat: 0, oldTile: s.board!.tiles[3], newTile: drawn[0] }, 66000);
    expect(s.phase).toBe("round2_search");
    expect(s.board!.tiles).toContain(drawn[0]);
    expect(s.orangeDeck).toContain(drawn[1]);
  });

  it("扭转局势自动补给上一名破案失败者", () => {
    let s = secondRound();
    const seat = s.roles.indexOf("investigator");
    s = { ...s, lastFailed: seat, orangeDeck: ["event-03", ...s.orangeDeck.filter((tile) => tile !== "event-03")] };
    s = reduceGame(s, { type: "replace", seat: 0, oldTile: s.board!.tiles[2] }, 65000);
    expect(s.phase).toBe("event_bonus");
    expect(s.bonusAttempts[seat]).toBe(1);
    expect(s.bonusSeat).toBe(seat);
    expect(() => reduceGame(s, { type: "solve", seat: 0, guess: { owner: 1, clue: "x", means: "y" } }, 66000)).toThrow();
    s = reduceGame(s, { type: "skip_bonus", seat }, 66000);
    expect(s.phase).toBe("round2_search");
    expect(s.bonusAttempts[seat]).toBe(0);
  });

  it("扭转局势无人适用时，专家再抽一块橙板并实际替换", () => {
    let s = forceEvent("event-03");
    expect(s.phase).toBe("event_bonus_scene");
    const drawn = gameView(s, 0).event?.drawn?.[0];
    expect(drawn).toMatch(/^scene-/);
    expect(gameView(s, 1).event?.drawn).toBeUndefined();
    const oldTile = s.board!.tiles[3];
    s = reduceGame(s, { type: "event_bonus_scene", seat: 0, oldTile }, 66000);
    expect(s.phase).toBe("round2_search");
    expect(s.board!.tiles).toContain(drawn);
    expect(s.board!.tiles).not.toContain(oldTile);
  });

  it("证据排除按逆时针逐人翻牌，不能翻关键证物", () => {
    let s = forceEvent("event-05");
    const first = s.roles.length - 1;
    expect(() => reduceGame(s, { type: "event_exclude", seat: 1, clue: s.players[1].clues[0] }, 66000)).toThrow();
    for (let seat = first; seat >= 1; seat--) {
      const clue = s.players[seat].clues.find((card) => !(s.roles[seat] === "killer" && s.answer?.clue === card))!;
      s = reduceGame(s, { type: "event_exclude", seat, clue }, 66000);
      expect(s.players[seat].excludedClues).toContain(clue);
    }
    expect(s.phase).toBe("round2_search");
  });

  it("倒数计时换两块橙板，本轮简报仍可破案，结束后坏人胜", () => {
    let s = forceEvent("event-06");
    const oldTiles = s.board!.tiles.slice(3, 5) as [string, string];
    s = reduceGame(s, { type: "event_countdown", seat: 0, oldTiles }, 66000);
    expect(s.countdownActive).toBe(true);
    expect(s.board!.tiles).not.toContain(oldTiles[0]);
    for (const tile of s.board!.tiles) if (!(tile in s.board!.markers)) s = reduceGame(s, { type: "mark", seat: 0, tile, option: 0 }, 67000);
    s = reduceGame(s, { type: "brief", seat: 0 }, 68000);
    expect(s.phase).toBe("round2_brief");
    for (let i = 0; i < 5; i++) s = reduceGame(s, { type: "next_speaker", seat: 0 }, 69000);
    expect(s.phase).toBe("result");
    expect(s.winner).toBe("evil");
  });

  it("倒数计时简报中仍可正确破案并进入反杀", () => {
    let s = forceEvent("event-06");
    s = reduceGame(s, { type: "event_countdown", seat: 0, oldTiles: s.board!.tiles.slice(3, 5) as [string, string] }, 66000);
    for (const tile of s.board!.tiles) if (!(tile in s.board!.markers)) s = reduceGame(s, { type: "mark", seat: 0, tile, option: 0 }, 67000);
    s = reduceGame(s, { type: "brief", seat: 0 }, 68000);
    s = reduceGame(s, { type: "solve", seat: s.roles.indexOf("investigator"), guess: s.answer! }, 69000);
    expect(s.phase).toBe("witness_hunt");
    expect(s.winner).toBeNull();
  });
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

  it("好人最后一枚徽章用完，结算说明凶手逍遥法外", () => {
    let s = createGame(4, 0, 3, false, 1000, () => 0.25);
    s = reduceGame(s, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
    s = reduceGame(s, { type: "tick" }, 61000, () => 0);
    const solver = s.roles.indexOf("investigator");
    const other = s.roles.lastIndexOf("investigator");
    s = { ...s, badges: s.badges.map((badge, seat) => seat === other ? false : badge) };
    const killer = s.roles.indexOf("killer");
    const guess = { owner: killer, clue: s.players[killer].clues[1], means: s.players[killer].means[0] };
    s = reduceGame(s, { type: "solve", seat: solver, guess }, 62000);
    expect(s.phase).toBe("result");
    expect(gameView(s, solver).resultReason).toBe("all_good_badges");
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
