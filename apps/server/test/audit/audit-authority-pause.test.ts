import { describe, expect, it } from "vitest";
import { CrimeSceneRoom } from "../../src/cs-rooms.ts";

function room(count = 6) {
  const room = new CrimeSceneRoom({
    code: "AUDIT", hostId: null, players: [], stage: "lobby",
    cardsPerKind: 4, eventsEnabled: false, forensicSeat: 0,
    state: null, pausedAt: null, version: 0, mode: "online", chatLog: [],
  });
  const tokens = Array.from({ length: count }, (_, seat) => room.claim(`玩家${seat}`));
  room.start(tokens[0], 0, () => 0.25);
  room.command(tokens[0], { type: "start", seat: 999, location: "location-1" }, 0, () => 0);
  return { room, tokens };
}

describe("上线审核：服务器权限与暂停", () => {
  it("伪造座位和 tick 无法替其他玩家选牌或推进计时", () => {
    const { room: r, tokens } = room();
    const killer = r.file.state!.roles.indexOf("killer");
    const pair = r.file.state!.players[killer];
    expect(() => r.command(tokens[1 === killer ? 2 : 1], { type: "choose", seat: killer, clue: pair.clues[0], means: pair.means[0] }, 1)).toThrow();
    expect(() => r.command(tokens[killer], { type: "tick" }, 60_000)).toThrow();
    expect(r.file.state!.answer).toBeUndefined();
    expect(r.file.state!.phase).toBe("night_killer");
  });

  it("非专家离线不暂停，专家离线冻结夜晚、简报与反杀截止时间", () => {
    const { room: r, tokens } = room();
    const deadline = r.file.state!.night!.choiceDeadline;
    r.setConnected(tokens[1], false, 1_000);
    expect(r.file.pausedAt).toBeNull();
    r.setConnected(tokens[0], false, 2_000);
    expect(r.tick(100_000)).toBe(false);
    r.setConnected(tokens[0], true, 12_000);
    expect(r.file.state!.night!.choiceDeadline).toBe(deadline + 10_000);
    r.tick(70_000);
    const board = r.file.state!.board!;
    for (const tile of board.tiles) r.command(tokens[0], { type: "mark", seat: 0, tile, option: 0 }, 70_001);
    r.command(tokens[0], { type: "brief", seat: 0 }, 70_002);
    const speech = r.file.state!.board!.speechStartedAt!;
    r.setConnected(tokens[0], false, 71_000);
    r.setConnected(tokens[0], true, 76_000);
    expect(r.file.state!.board!.speechStartedAt).toBe(speech + 5_000);
    const solver = r.file.state!.roles.indexOf("investigator");
    r.command(tokens[solver], { type: "solve", seat: 999, guess: r.file.state!.answer! }, 76_001);
    const huntDeadline = r.file.state!.hunt!.deadline;
    r.setConnected(tokens[0], false, 77_000);
    expect(r.tick(huntDeadline + 1)).toBe(false);
    r.setConnected(tokens[0], true, 82_000);
    expect(r.file.state!.hunt!.deadline).toBe(huntDeadline + 5_000);
  });
});
