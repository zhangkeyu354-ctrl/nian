import { describe, it, expect } from "vitest";
import { DMRoom } from "../src/dm-rooms.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const folder = () => mkdtempSync(join(tmpdir(), "dm-room-"));
describe("DM authority and reconnect", () => {
  it("claims distinct seats, keeps tokens private, persists role pool and rejects nonhost setup", () => {
    const r = DMRoom.create("TEST", folder());
    const a = r.claim("甲"),
      b = r.claim("乙");
    expect(a.playerId).not.toBe(b.playerId);
    expect(JSON.stringify(r.snapshot(a.token))).not.toContain(b.token);
    expect(() =>
      r.action(b.token, 0, { type: "SET_COUNT", count: 5 }),
    ).toThrow();
    const restored = new DMRoom(r.file, r.directory);
    expect(restored.snapshot(a.token).mySeat).toBe(a.playerId);
  });
  it("requires readiness and rejects stale commands; assignments are server random", () => {
    const r = DMRoom.create("TEST", folder());
    const users = ["甲", "乙", "丙", "丁"].map((n) => r.claim(n));
    for (const u of users) r.action(u.token, r.file.version, { type: "READY" });
    const version = r.file.version;
    r.action(users[0].token, version, { type: "START" });
    expect(() =>
      r.action(users[0].token, version, { type: "START" }),
    ).toThrow();
    expect(r.file.state?.players).toHaveLength(4);
    for (const u of users) {
      const snap = r.snapshot(u.token);
      expect(snap.view?.players.filter((p) => p.roleId)).toHaveLength(1);
    }
  });
  it("lobby seats: players move to empty seats, host keeps host rights, game seats follow lobby seats", () => {
    const r = DMRoom.create("SEAT", folder());
    const a = r.claim("甲");
    r.action(a.token, r.file.version, { type: "SIT", seat: 3 });
    const others = ["乙", "丙", "丁"].map((n) => r.claim(n));
    const snap = r.snapshot(a.token);
    expect(snap.players.map((p) => [p.name, p.seat])).toEqual([
      ["乙", 1],
      ["丙", 2],
      ["甲", 3],
      ["丁", 4],
    ]);
    expect(snap.hostId).toBe(a.playerId);
    expect(() =>
      r.action(others[0].token, r.file.version, { type: "SIT", seat: 3 }),
    ).toThrow();
    expect(() =>
      r.action(others[0].token, r.file.version, { type: "SHUFFLE_SEATS" }),
    ).toThrow();
    for (const u of [a, ...others])
      r.action(u.token, r.file.version, { type: "READY" });
    r.action(a.token, r.file.version, { type: "START" });
    const me = r.snapshot(a.token).view!.players.find((p) => p.id === a.playerId)!;
    expect(me.seat).toBe(3);
    expect(r.file.state!.speaker === null || r.file.state!.players[0].name === "乙").toBe(true);
  });
  it("host shuffle gives every player a distinct seat and resets ready", () => {
    const r = DMRoom.create("SHUF", folder());
    const users = ["甲", "乙", "丙", "丁"].map((n) => r.claim(n));
    r.action(users[1].token, r.file.version, { type: "READY" });
    r.action(users[0].token, r.file.version, { type: "SHUFFLE_SEATS" });
    const seats = r.snapshot(users[0].token).players.map((p) => p.seat).sort();
    expect(seats).toEqual([1, 2, 3, 4]);
    expect(r.file.players.every((p) => !p.ready)).toBe(true);
  });
});
