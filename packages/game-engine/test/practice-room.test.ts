import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Room, RoomStore } from "../../../apps/server/src/rooms.ts";

it.each(["killer", "survivor"] as const)("creates a five-seat practice game for a human %s", (side) => {
  const path = mkdtempSync(join(tmpdir(), "dbd-bot-room-"));
  try {
    const room = new RoomStore(path).create({ playerCount: 3 }, false);
    const token = room.claim(undefined, "练习");
    room.lobby(token, { type: "SET_SIDE", side });
    room.lobby(token, { type: "START_PRACTICE", level: "easy" });
    const owner = room.idByToken(token);
    const visible = room.snapshot(owner).lobby;
    const own = visible.draft!.slots.find(slot => slot.playerId === owner)!;
    expect(own.side).toBe(side);
    expect(visible.draft!.slots.filter(slot => slot.playerId !== owner).every(slot => slot.options === null)).toBe(true);
    room.lobby(token, { type: "PICK", slotId: own.slotId, characterId: own.options![0] });
    for (let i = 0; i < 4; i++) expect(room.botStep(() => 0)).toBe(true);
    expect(room.file.stage).toBe("game");
    expect(room.seatInfo().filter(seat => seat.bot === "easy")).toHaveLength(4);
    expect(room.file.seats.filter(seat => seat.seatId !== owner).every(seat => seat.token === null)).toBe(true);
    expect(Object.values(room.state!.actors).map(a => a.ownerId).sort()).toEqual(room.file.players.map(p => p.playerId).sort());
    expect(new Room(structuredClone(room.file)).state).toEqual(room.state);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});
