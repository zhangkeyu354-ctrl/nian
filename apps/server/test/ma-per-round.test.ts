import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARoomStore, TRACK_PICK_TIMEOUT_MS } from "../src/ma-rooms.ts";
import { createMAGame, reduceMA } from "../../../packages/magical-athlete/src/engine.ts";
import type { MAState } from "../../../packages/magical-athlete/src/types.ts";

const twoPlayers = [{ id: "p1", name: "甲" }, { id: "p2", name: "乙" }];

/** 跑一步：选图 / 选角 / 回答第一个选项 */
function step(s: MAState, pickTrack: (race: number) => "mild" | "wild"): MAState {
  if (s.phase === "choose" && s.trackPick) return reduceMA(s, { type: "TRACK", player: "p1", track: pickTrack(s.trackPick.race) });
  if (s.phase === "choose") {
    const p = s.players.find((x) => !x.choices.length)!;
    return reduceMA(s, { type: "CHOOSE", player: p.id, racer: p.hand.find((r) => !p.used.includes(r))! });
  }
  return reduceMA(s, { type: "ANSWER", player: s.pending!.player, value: s.pending!.options[0].value });
}

describe("魔法运动员逐轮选图", () => {
  it("引擎：每场选角前都要先锁图，锁定后按所选地图开赛，四场都能跑完", () => {
    let s = createMAGame({ players: twoPlayers, seed: 7, settings: { deal: "random", trackMode: "perRound", schedule: ["mild", "mild", "mild", "mild"] } });
    expect(s.trackPick).toEqual({ race: 0 });
    expect(() => reduceMA(s, { type: "CHOOSE", player: "p1", racer: s.players[0].hand[0] })).toThrow(/房主还没确定/);
    const wanted = ["wild", "mild", "wild", "wild"] as const;
    const picksSeen: number[] = [];
    const started: string[] = [];
    for (let i = 0; i < 20000 && s.phase !== "over"; i++) {
      if (s.trackPick) picksSeen.push(s.trackPick.race);
      const before = s.race?.index;
      s = step(s, (race) => wanted[race]);
      if (s.race && s.race.index !== before) started.push(s.race.track);
    }
    expect(s.phase).toBe("over");
    expect(picksSeen).toEqual([0, 1, 2, 3]);
    expect(started).toEqual([...wanted]);
    expect(s.settings.schedule).toEqual([...wanted]);
  });

  it("引擎：锁图后、比赛中都不能再改；未验收地图被拒绝", () => {
    let s = createMAGame({ players: twoPlayers, seed: 3, settings: { deal: "random", trackMode: "perRound" } });
    expect(() => reduceMA(s, { type: "TRACK", player: "p1", track: "twisty-twirl" })).toThrow();
    s = reduceMA(s, { type: "TRACK", player: "p1", track: "wild" });
    expect(() => reduceMA(s, { type: "TRACK", player: "p1", track: "mild" })).toThrow(/已经锁定/);
    for (const p of s.players) s = reduceMA(s, { type: "CHOOSE", player: p.id, racer: p.hand[0] });
    expect(s.race!.track).toBe("wild");
    if (s.phase === "race") expect(() => reduceMA(s, { type: "TRACK", player: "p1", track: "mild" })).toThrow(/已经锁定/);
  });

  it("预定模式（旧房间）不出现选图步骤", () => {
    const s = createMAGame({ players: twoPlayers, seed: 3, settings: { deal: "random" } });
    expect(s.trackPick).toBeUndefined();
    expect(s.settings.trackMode).toBeUndefined();
  });

  it("服务器：只有房主能选；开局后大厅设置全部锁死；重启后照样恢复", () => {
    const dir = mkdtempSync(join(tmpdir(), "ma-per-round-"));
    const store = new MARoomStore(dir);
    const room = store.create();
    const host = room.claim("甲");
    const guest = room.claim("乙");
    expect(() => room.lobby(guest, { type: "SET_TRACK_MODE", mode: "perRound" })).toThrow("HOST_ONLY");
    room.lobby(host, { type: "SET_TRACK_MODE", mode: "perRound" });
    room.lobby(host, { type: "SET_DEAL", deal: "random" });
    room.lobby(host, { type: "START" });
    expect(room.snapshot(null).trackMode).toBe("perRound");
    expect(room.snapshot(null).trackPickDeadline).toBeGreaterThan(Date.now());
    expect(() => room.apply(guest, 0, { type: "TRACK", track: "wild" })).toThrow("HOST_ONLY");
    for (const a of [{ type: "SET_SCHEDULE", schedule: ["mild", "mild", "mild", "mild"] }, { type: "SHUFFLE_SCHEDULE" }, { type: "SET_TRACK_MODE", mode: "preset" }] as const)
      expect(() => room.lobby(host, a as any)).toThrow("ALREADY_STARTED");
    room.apply(host, 0, { type: "TRACK", track: "wild" });
    expect(room.snapshot(null).schedule[0]).toBe("wild");
    expect(room.snapshot(null).trackPickDeadline).toBeUndefined();
    store.save(room);
    const restored = new MARoomStore(dir).rooms.get(room.code)!;
    expect(restored.state!.trackPick).toBeNull();
    expect(restored.state!.settings.schedule[0]).toBe("wild");
  });

  it("服务器：房主超时（例如掉线）就自动用预定地图，不会卡住", () => {
    const store = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-per-round-")));
    const room = store.create();
    const host = room.claim("甲");
    room.claim("乙");
    room.lobby(host, { type: "SET_SCHEDULE", schedule: ["wild", "mild", "mild", "mild"] });
    room.lobby(host, { type: "SET_TRACK_MODE", mode: "perRound" });
    room.lobby(host, { type: "SET_DEAL", deal: "random" });
    room.lobby(host, { type: "START" });
    const deadline = room.file.trackPickDeadline!;
    expect(deadline - Date.now()).toBeLessThanOrEqual(TRACK_PICK_TIMEOUT_MS);
    expect(room.expireTrackPick(deadline - 1)).toBe(false);
    expect(room.expireTrackPick(deadline)).toBe(true);
    expect(room.state!.trackPick).toBeNull();
    expect(room.state!.settings.schedule[0]).toBe("wild");
    expect(room.file.commands.at(-1)).toMatchObject({ type: "TRACK", track: "wild" });
  });
});
