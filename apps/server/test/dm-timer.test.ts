import { describe, it, expect } from "vitest";
import { DMRoom } from "../src/dm-rooms.ts";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("DM server timer and persistence", () => {
  it("preserves random assignments and five-minute speech through disk restore, and rejects fake client timeout", () => {
    const dir = mkdtempSync(join(tmpdir(), "dm-clock-")),
      r = DMRoom.create("TEST", dir),
      users = ["甲", "乙", "丙", "丁"].map((n) => r.claim(n));
    for (const u of users) r.action(u.token, r.file.version, { type: "READY" });
    r.action(users[0].token, r.file.version, { type: "START" }, 1000);
    let s = r.file.state!,
      k = s.players.find((p) => p.roleId === "killer")!,
      victim = s.players.find((p) => p.roleId === "civilian")!;
    const token = (id: string) => users.find((u) => u.playerId === id)!.token;
    const act = (id: string, a: any) =>
      r.action(token(id), r.file.version, a, 2000);
    act(k.id, { type: "KILL", targets: [victim.id] });
    s = r.file.state!;
    act(victim.id, { type: "TRUE", cards: [s.pool[0]] });
    act(k.id, { type: "FAKE", cards: s.pool.slice(1, 3) });
    const before = r.file.state!,
      speaker = before.speaker!,
      deadline = before.deadline!;
    expect(deadline).toBe(302000);
    const restored = new DMRoom(
      JSON.parse(readFileSync(join(dir, "TEST.json"), "utf8")),
      dir,
    );
    expect(restored.file.state).toEqual(before);
    expect(restored.tick(deadline - 1)).toBe(false);
    expect(() =>
      restored.action(
        token(speaker),
        restored.file.version,
        { type: "SPEAK_TIMEOUT" },
        deadline,
      ),
    ).toThrow();
    expect(restored.tick(deadline)).toBe(true);
    expect(restored.file.state?.speaker).not.toBe(speaker);
    expect(restored.file.state?.deadline).toBe(deadline + 300000);
    expect(restored.snapshot(token(victim.id)).view?.me.alive).toBe(false);
  });
});
