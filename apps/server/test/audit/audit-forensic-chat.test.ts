import { describe, expect, it } from "vitest";
import { CrimeSceneRoom } from "../../src/cs-rooms.ts";

describe("上线审核：鉴证专家不能发言", () => {
  it("线上简报阶段拒绝专家发送文字讨论", () => {
    const room = new CrimeSceneRoom({
      code: "AUDIT", hostId: null, players: [], stage: "lobby",
      cardsPerKind: 4, eventsEnabled: false, forensicSeat: 0,
      state: null, pausedAt: null, version: 0, mode: "online", chatLog: [],
    });
    const tokens = Array.from({ length: 4 }, (_, seat) => room.claim(`玩家${seat}`));
    room.start(tokens[0], 0, () => 0.25);
    room.command(tokens[0], { type: "start", seat: 0, location: "location-1" }, 0, () => 0);
    room.tick(60_000);
    for (const tile of room.file.state!.board!.tiles) {
      room.command(tokens[0], { type: "mark", seat: 0, tile, option: 0 }, 60_001);
    }
    room.command(tokens[0], { type: "brief", seat: 0 }, 60_002);
    const before = room.snapshot(tokens[1]);

    expect(() => room.chat(tokens[0], "专家发言", 60_003)).toThrow();
    expect(room.snapshot(tokens[1]).chat).toEqual(before.chat);
    expect(room.snapshot(tokens[1]).version).toBe(before.version);
  });
});
