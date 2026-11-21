import { describe, expect, it } from "vitest";
import { CrimeSceneRoom } from "../../src/cs-rooms.ts";

describe("上线审核：夜晚选牌进度不向普通调查员发送", () => {
  it("凶手提前选完后，调查员的快照及版本号保持相同", () => {
    const room = new CrimeSceneRoom({
      code: "AUDIT", hostId: null, players: [], stage: "lobby",
      cardsPerKind: 4, eventsEnabled: false, forensicSeat: 0,
      state: null, pausedAt: null, version: 0, mode: "online", chatLog: [],
    });
    const tokens = Array.from({ length: 6 }, (_, seat) => room.claim(`玩家${seat}`));
    room.start(tokens[0], 0, () => 0.25);
    room.command(tokens[0], { type: "start", seat: 0, location: "location-1" }, 0, () => 0);
    const state = room.file.state!;
    const killer = state.roles.indexOf("killer");
    const investigator = state.roles.indexOf("investigator");
    const before = room.snapshot(tokens[investigator]);

    room.command(tokens[killer], {
      type: "choose", seat: killer,
      clue: state.players[killer].clues[0], means: state.players[killer].means[0],
    }, 1_000);

    const after = room.snapshot(tokens[investigator]);
    expect(after.view).toEqual(before.view);
    expect(after.version).toBe(before.version);
  });
});
