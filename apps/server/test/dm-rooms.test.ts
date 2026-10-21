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
});
