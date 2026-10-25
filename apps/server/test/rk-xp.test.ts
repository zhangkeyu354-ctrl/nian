import { it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RKRoom } from "../src/rk-rooms.ts";

it("XP requires host opt-in, resets readiness, persists mode and cannot shrink occupied rooms", () => {
  const dir = mkdtempSync(join(tmpdir(), "rk-xp-")),
    r = RKRoom.create("TEST", dir, { allowFixedSeed: true });
  const users = [r.claim("房主"), r.claim("朋友")];
  const act = (i: number, c: any) =>
    r.action(
      users[i].token,
      r.file.version,
      (r.file.seq[users[i].playerId] ?? 0) + 1,
      c,
      1000,
    );
  expect(r.snapshot(users[0].token).variant).toBe("classic");
  expect(() => act(0, { type: "SET_SETTINGS", count: 6 })).toThrow(/人数/);
  expect(() => act(1, { type: "SET_SETTINGS", variant: "xp" })).toThrow(/房主/);
  act(0, { type: "READY" });
  act(1, { type: "READY" });
  act(0, { type: "SET_SETTINGS", variant: "xp", count: 6, minutes: 0 });
  expect(r.file.players.every((p) => !p.ready)).toBe(true);
  for (let i = 2; i < 6; i++) users.push(r.claim(`朋友${i}`));
  expect(() => act(0, { type: "SET_SETTINGS", variant: "classic" })).toThrow(
    /人数/,
  );
  users.forEach((_, i) => act(i, { type: "READY" }));
  act(0, { type: "START", seed: 6006 });
  expect(r.file.state!.pool).toHaveLength(76);
  expect(() => act(0, { type: "SET_SETTINGS", variant: "classic" })).toThrow();
  const actor = r.file.state!.current,
    id = r.file.state!.players[actor].rack[0];
  act(actor, { type: "MOVE", tiles: [id], to: { meld: null } });
  const before = r.snapshot(users[actor].token, 1000);
  const saved = JSON.parse(readFileSync(join(dir, "TEST.json"), "utf8"));
  const restored = new RKRoom(saved, dir);
  expect(restored.snapshot(users[actor].token, 1000)).toEqual(before);
  expect(saved.variant).toBe("xp");
  expect(saved.state.variant).toBe("xp");
});
