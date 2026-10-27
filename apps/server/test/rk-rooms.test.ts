import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RKRoom } from "../src/rk-rooms.ts";
const dir = () => mkdtempSync(join(tmpdir(), "rk-room-"));
const setup = () => {
  const r = RKRoom.create("TEST", dir(), { allowFixedSeed: true });
  const a = r.claim("甲"),
    b = r.claim("乙");
  let seq = [0, 0];
  const users = [a, b];
  const act = (i: number, action: any, now = 1000) =>
    r.action(users[i].token, r.file.version, ++seq[i], action, now);
  act(0, { type: "READY" });
  act(1, { type: "READY" });
  act(0, { type: "START", seed: 1 });
  return { r, users, act, seq };
};
describe("RK room authority and persistence", () => {
  it("host controls settings and production cannot specify random seed", () => {
    const r = RKRoom.create("TEST", dir());
    const a = r.claim("甲"),
      b = r.claim("乙");
    expect(() =>
      r.action(
        b.token,
        r.file.version,
        1,
        { type: "SET_SETTINGS", count: 3 },
        0,
      ),
    ).toThrow(/房主/);
    r.action(a.token, r.file.version, 1, { type: "READY" }, 0);
    r.action(b.token, r.file.version, 1, { type: "READY" }, 0);
    expect(() =>
      r.action(a.token, r.file.version, 2, { type: "START", seed: 1 }, 0),
    ).toThrow(/种子/);
    expect(() =>
      r.action("bad", r.file.version, 1, { type: "DRAW" }, 0),
    ).toThrow(/凭证/);
  });
  it("privately edits without public version changes, persists draft and nextSeq", () => {
    const { r, users, act } = setup();
    const seat = r.file.state!.current;
    const before = r.snapshot(users[1 - seat].token, 1000);
    const v = r.file.version;
    const tile = r.file.state!.players[seat].rack[0];
    expect(
      act(seat, { type: "MOVE", tiles: [tile], to: { meld: null } }).scope,
    ).toBe("private");
    expect(r.file.version).toBe(v);
    expect(r.snapshot(users[1 - seat].token, 1000)).toEqual(before);
    const saved = JSON.parse(
      readFileSync(join(r.directory, "TEST.json"), "utf8"),
    );
    const restored = new RKRoom(saved, r.directory, { allowFixedSeed: true });
    expect(restored.snapshot(users[seat].token, 1000)).toEqual(
      r.snapshot(users[seat].token, 1000),
    );
    expect(
      restored.snapshot(users[seat].token, 1000).view?.draft?.board[0].tiles,
    ).toEqual([tile]);
    expect(
      JSON.stringify(restored.snapshot(users[seat].token, 1000)),
    ).not.toContain(users[1 - seat].token);
  });
  it("duplicate commit is idempotent before stale-version checks", () => {
    const { r, users, act, seq } = setup();
    const seat = r.file.state!.current;
    const v = r.file.version;
    act(seat, { type: "COMMIT" });
    const after = structuredClone(r.file);
    expect(
      r.action(users[seat].token, v, seq[seat], { type: "COMMIT" }, 1000).scope,
    ).toBe("none");
    expect(r.file).toEqual(after);
  });
  it("client actor/time/TIMEOUT injection is rejected and server deadline wins", () => {
    const { r, users, act } = setup();
    const current = r.file.state!.current;
    expect(() =>
      act(current, { type: "TIMEOUT", actor: "server", now: 999999 }),
    ).toThrow(/服务器/);
    expect(() => act(current, { type: "DRAW", actor: 1 - current })).toThrow(
      /身份/,
    );
    expect(() => act(current, { type: "DRAW", now: 0 })).toThrow(/时间/);
    expect(r.tick(100999)).toBe(false);
    expect(r.tick(101000)).toBe(true);
    expect(r.file.state!.players[current].rack).toHaveLength(17);
    expect(r.tick(101000)).toBe(false);
  });
  it("settings validate counts and reset readiness", () => {
    const r = RKRoom.create("TEST", dir());
    const a = r.claim("甲");
    r.action(a.token, r.file.version, 1, { type: "READY" }, 0);
    r.action(
      a.token,
      r.file.version,
      2,
      { type: "SET_SETTINGS", count: 3, minutes: 2, games: 4 },
      0,
    );
    expect(r.file.players[0].ready).toBe(false);
    expect(r.file.minutes).toBe(2);
    expect(() =>
      r.action(
        a.token,
        r.file.version,
        3,
        { type: "SET_SETTINGS", count: 6 },
        0,
      ),
    ).toThrow();
    expect(() =>
      r.action(a.token, r.file.version, 3, { type: "START" }, 0),
    ).toThrow(/人数|准备/);
  });
});
