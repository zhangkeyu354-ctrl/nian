import { describe, expect, it } from "vitest";
import { createGame, reduceGame, type GameState } from "../../src/game.ts";

function roundTwo() {
  let state = createGame(6, 0, 4, true, 0, () => 0.25);
  state = reduceGame(state, { type: "start", seat: 0, location: "location-1" }, 0, () => 0);
  state = reduceGame(state, { type: "tick" }, 60_000, () => 0);
  for (const tile of state.board!.tiles) state = reduceGame(state, { type: "mark", seat: 0, tile, option: 0 }, 60_001);
  state = reduceGame(state, { type: "brief", seat: 0 }, 60_002);
  for (let i = 0; i < 5; i++) state = reduceGame(state, { type: "next_speaker", seat: 0 }, 60_003 + i, () => 0.25);
  return state;
}

describe("上线审核：事件边界", () => {
  it("倒数计时即使在第三轮抽到，也只在该轮简报结束后结案", () => {
    let state = roundTwo();
    state = reduceGame(state, { type: "replace", seat: 0, oldTile: state.board!.tiles[2] }, 61_000);
    for (const tile of state.board!.tiles) if (!(tile in state.board!.markers)) state = reduceGame(state, { type: "mark", seat: 0, tile, option: 0 }, 61_001);
    state = reduceGame(state, { type: "brief", seat: 0 }, 61_002);
    for (let i = 0; i < 5; i++) state = reduceGame(state, { type: "next_speaker", seat: 0 }, 61_003 + i);
    expect(state.phase).toBe("round3_search");

    state = { ...state, orangeDeck: ["event-06", ...state.orangeDeck.filter((tile) => tile !== "event-06")] } as GameState;
    state = reduceGame(state, { type: "replace", seat: 0, oldTile: state.board!.tiles[3] }, 62_000);
    expect(state.phase).toBe("event");
    expect(() => reduceGame(state, { type: "solve", seat: state.roles.indexOf("investigator"), guess: state.answer! }, 62_000)).toThrow();
    state = reduceGame(state, { type: "event_countdown", seat: 0, oldTiles: state.board!.tiles.slice(2, 4) as [string, string] }, 62_001);
    expect(state.phase).toBe("round3_search");
    expect(() => reduceGame(state, { type: "replace", seat: 0, oldTile: state.board!.tiles[2] }, 62_001)).toThrow();
    for (const tile of state.board!.tiles) if (!(tile in state.board!.markers)) state = reduceGame(state, { type: "mark", seat: 0, tile, option: 0 }, 62_002);
    state = reduceGame(state, { type: "brief", seat: 0 }, 62_003);
    expect(state.phase).toBe("round3_brief");
    for (let i = 0; i < 5; i++) state = reduceGame(state, { type: "next_speaker", seat: 0 }, 62_004 + i);
    expect(state.phase).toBe("result");
    expect(state.winner).toBe("evil");
    expect(state.resultReason).toBe("countdown");
  });

  it("最后一个好人仅剩扭转局势额外机会时，失败立即结案", () => {
    let state = roundTwo();
    const seat = state.roles.indexOf("investigator");
    state = {
      ...state,
      badges: state.badges.map((badge, index) => ["investigator", "witness"].includes(state.roles[index]) ? false : badge),
      lastFailed: seat,
      orangeDeck: ["event-03", ...state.orangeDeck.filter((tile) => tile !== "event-03")],
    };
    state = reduceGame(state, { type: "replace", seat: 0, oldTile: state.board!.tiles[2] }, 61_000);
    expect(state.phase).toBe("event_bonus");
    expect(state.bonusAttempts[seat]).toBe(1);
    const owner = state.answer!.owner;
    const wrongClue = state.players[owner].clues.find((clue) => clue !== state.answer!.clue)!;
    state = reduceGame(state, { type: "solve", seat, guess: { ...state.answer!, clue: wrongClue } }, 61_001);
    expect(state.phase).toBe("result");
    expect(state.winner).toBe("evil");
    expect(state.resultReason).toBe("all_good_badges");
  });
});
