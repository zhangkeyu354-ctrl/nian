// 联机房间规则（用户 2026-10-20）：人数可改、自选阵营、杀手随机、自愿控两名、地图随机、三选一/二选一
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomStore, type Rand } from "../src/rooms.ts";
import { chars } from "../../../packages/game-engine/src/data.ts";

const SURV = chars.characters.filter((c) => c.side === "survivor").map((c) => c.id);
function lcg(seed: number): Rand {
  let x = seed >>> 0 || 1;
  return (n) => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x % n;
  };
}
function room(count: 3 | 4 | 5, seed = 1) {
  const store = new RoomStore(mkdtempSync(join(tmpdir(), "dbd-lobby-")), lcg(seed));
  const r = store.create({ playerCount: count }, false);
  return { store, r };
}
function fill(r: ReturnType<typeof room>["r"], n: number) {
  return Array.from({ length: n }, (_, i) => r.claim(undefined, "玩家" + (i + 1)));
}
/** 每人按顺序把自己的名额都选第一个选项 */
function draftAll(r: ReturnType<typeof room>["r"], tokens: string[]) {
  for (let guard = 0; guard < 20 && r.file.stage === "draft"; guard++)
    for (const t of tokens) {
      const me = r.idByToken(t)!;
      const slot = r.file.draft!.slots.find((s) => s.playerId === me && !s.pick);
      if (slot) r.lobby(t, { type: "PICK", slotId: slot.slotId, characterId: slot.options[0] });
    }
}

describe("房间：人数与加入", () => {
  it("第一个加入的人是房主；人满后不能再加入；房主可以调大人数，但不能少于已在房间的人数", () => {
    const { r } = room(3);
    const [a, b] = fill(r, 3);
    expect(r.file.hostId).toBe("p1");
    expect(() => r.claim(undefined, "多余的人")).toThrow("ROOM_FULL");
    expect(() => r.lobby(b, { type: "SET_PLAYER_COUNT", playerCount: 5 })).toThrow("HOST_ONLY");
    r.lobby(a, { type: "SET_PLAYER_COUNT", playerCount: 5 });
    r.claim(undefined, "第四人");
    expect(() => r.lobby(a, { type: "SET_PLAYER_COUNT", playerCount: 3 })).toThrow("COUNT_BELOW_PLAYERS");
    r.lobby(a, { type: "SET_PLAYER_COUNT", playerCount: 4 });
    expect(r.file.playerCount).toBe(4);
  });
  it("人没到齐、或有人没选阵营时不能开始", () => {
    const { r } = room(3);
    const t = fill(r, 2);
    expect(() => r.lobby(t[0], { type: "START" })).toThrow("NOT_FULL");
    t.push(r.claim(undefined, "c"));
    r.lobby(t[0], { type: "SET_SIDE", side: "survivor" });
    r.lobby(t[1], { type: "SET_SIDE", side: "survivor" });
    expect(() => r.lobby(t[0], { type: "START" })).toThrow("SIDES_PENDING");
  });
});

describe("房间：阵营", () => {
  it("只有一人选杀手：他就是杀手", () => {
    const { r } = room(5);
    const t = fill(r, 5);
    t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i === 3 ? "killer" : "survivor" }));
    r.lobby(t[0], { type: "START" });
    expect(r.file.draft!.killerPlayer).toBe("p4");
  });
  it("多人选杀手：从他们里随机一个，其余变成逃生者", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const { r } = room(5, seed);
      const t = fill(r, 5);
      t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i < 2 ? "killer" : "survivor" }));
      r.lobby(t[0], { type: "START" });
      const k = r.file.draft!.killerPlayer;
      expect(["p1", "p2"]).toContain(k);
      seen.add(k);
      expect(r.file.players.filter((p) => p.side === "killer")).toHaveLength(1);
    }
    expect(seen.size).toBe(2);
  });
  it("所有人都选逃生者：从所有人里随机一个当杀手", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const { r } = room(5, seed);
      const t = fill(r, 5);
      t.forEach((x) => r.lobby(x, { type: "SET_SIDE", side: "survivor" }));
      r.lobby(t[0], { type: "START" });
      seen.add(r.file.draft!.killerPlayer);
    }
    expect(seen.size).toBe(5);
  });
});

describe("房间：一人控两名逃生者", () => {
  it("5 人：没人控两名；3 人：两位逃生者玩家都控两名", () => {
    let { r } = room(5);
    let t = fill(r, 5);
    t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i === 0 ? "killer" : "survivor" }));
    r.lobby(t[0], { type: "START" });
    expect(r.file.draft!.slots.filter((s) => s.side === "survivor").map((s) => s.playerId)).toEqual(["p2", "p3", "p4", "p5"]);
    ({ r } = room(3));
    t = fill(r, 3);
    t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i === 0 ? "killer" : "survivor" }));
    r.lobby(t[0], { type: "START" });
    expect(r.file.draft!.slots.filter((s) => s.side === "survivor").map((s) => s.playerId)).toEqual(["p2", "p2", "p3", "p3"]);
  });
  it("4 人：报名的人里随机一个；没人报名就在逃生者玩家里随机", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const { r } = room(4, seed);
      const t = fill(r, 4);
      t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i === 0 ? "killer" : "survivor" }));
      r.lobby(t[2], { type: "SET_VOLUNTEER", volunteer: true });
      r.lobby(t[0], { type: "START" });
      const s = r.file.draft!.slots.filter((x) => x.side === "survivor").map((x) => x.playerId);
      expect(s.filter((p) => p === "p3")).toHaveLength(2);
    }
    for (let seed = 1; seed < 40; seed++) {
      const { r } = room(4, seed);
      const t = fill(r, 4);
      t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i === 0 ? "killer" : "survivor" }));
      r.lobby(t[0], { type: "START" });
      const s = r.file.draft!.slots.filter((x) => x.side === "survivor").map((x) => x.playerId);
      seen.add(s.find((p, i) => s.indexOf(p) !== i)!);
    }
    expect(seen.size).toBe(3);
  });
});

describe("房间：地图与选角色", () => {
  it("地图每局随机（两张都会出现）；杀手三选一，逃生者每个名额二选一", () => {
    const mapsSeen = new Set<string>();
    for (let seed = 1; seed < 20; seed++) {
      const { r } = room(5, seed);
      const t = fill(r, 5);
      t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i === 0 ? "killer" : "survivor" }));
      r.lobby(t[0], { type: "START" });
      const d = r.file.draft!;
      mapsSeen.add(d.mapId);
      expect(d.slots.find((s) => s.side === "killer")!.options).toHaveLength(3);
      for (const s of d.slots.filter((s) => s.side === "survivor")) {
        expect(s.options).toHaveLength(2);
        expect(new Set(s.options).size).toBe(2);
      }
    }
    expect(mapsSeen.size).toBe(2);
  });
  it("选项只发给本人；被选走的逃生者会从别人的选项里换掉；选完自动开局", () => {
    for (let seed = 1; seed < 50; seed++) {
      const { r } = room(5, seed);
      const t = fill(r, 5);
      t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i === 0 ? "killer" : "survivor" }));
      r.lobby(t[0], { type: "START" });
      const snap = r.snapshot("p2");
      for (const s of snap.lobby.draft!.slots)
        expect(s.options === null).toBe(s.playerId !== "p2");
      // 别人的名额不能替他选
      const other = r.file.draft!.slots.find((s) => s.playerId === "p3")!;
      expect(() => r.lobby(t[1], { type: "PICK", slotId: other.slotId, characterId: other.options[0] })).toThrow("NOT_YOUR_SLOT");
      // 依次选，每次检查剩下的人仍有两个没被选走的选项
      for (const tok of t) {
        const me = r.idByToken(tok)!;
        for (const slot of r.file.draft!.slots.filter((s) => s.playerId === me)) {
          r.lobby(tok, { type: "PICK", slotId: slot.slotId, characterId: slot.options[1] });
          if (r.file.stage !== "draft") break;
          const taken = r.file.draft!.slots.filter((s) => s.pick).map((s) => s.pick);
          for (const o of r.file.draft!.slots.filter((s) => !s.pick && s.side === "survivor")) {
            expect(o.options.some((x) => taken.includes(x))).toBe(false);
            expect(new Set(o.options).size).toBe(2);
          }
        }
      }
      expect(r.file.stage).toBe("game");
      expect(new Set(r.state!.survivors).size).toBe(4);
      expect(r.state!.survivors.every((s) => SURV.includes(s))).toBe(true);
    }
  });
  it("开局后：每位玩家的座位就是自己选的角色；3 人时控两名的人两个角色共用一套移动牌", () => {
    const { r } = room(3, 7);
    const t = fill(r, 3);
    t.forEach((x, i) => r.lobby(x, { type: "SET_SIDE", side: i === 2 ? "killer" : "survivor" }));
    r.lobby(t[0], { type: "START" });
    draftAll(r, t);
    expect(r.file.stage).toBe("game");
    const s = r.state!;
    expect(Object.keys(s.hands).sort()).toEqual(["p1", "p2", "p3"]);
    expect(s.actors[s.killerId].ownerId).toBe("p3");
    expect(r.file.seats.find((x) => x.seatId === "p1")!.actors).toHaveLength(2);
    // 用自己的凭证提交命令
    const first = s.choice!.actorId; // 开局第一步：先手逃生者掷出生骰
    const owner = s.actors[first].ownerId;
    const tok = t[["p1", "p2", "p3"].indexOf(owner)];
    r.apply(tok, 0, { type: "SELECT", actorId: first });
    expect(r.file.commands).toHaveLength(1);
  });
  it("开局后不能再改阵营或加入", () => {
    const { r } = room(3, 3);
    const t = fill(r, 3);
    t.forEach((x) => r.lobby(x, { type: "SET_SIDE", side: "survivor" }));
    r.lobby(t[0], { type: "START" });
    expect(() => r.lobby(t[1], { type: "SET_SIDE", side: "killer" })).toThrow("ALREADY_STARTED");
    draftAll(r, t);
    expect(() => r.claim(undefined, "迟到的人")).toThrow("ALREADY_STARTED");
  });
});

describe("房间：存档恢复", () => {
  it("选阵营、选角色进行到一半时服务器重启，恢复到同一状态", () => {
    const dir = mkdtempSync(join(tmpdir(), "dbd-lobby-"));
    const store = new RoomStore(dir, lcg(5));
    const r = store.create({ playerCount: 4 }, false);
    const t = Array.from({ length: 4 }, (_, i) => r.claim(undefined, "p" + i));
    t.forEach((x) => r.lobby(x, { type: "SET_SIDE", side: "survivor" }));
    r.lobby(t[0], { type: "START" });
    store.save(r);
    const again = new RoomStore(dir, lcg(5)).rooms.get(r.code)!;
    expect(again.file.stage).toBe("draft");
    expect(again.file.draft).toEqual(r.file.draft);
    expect(again.idByToken(t[2])).toBe("p3");
  });
});

describe("闲置房间清理（上线准备）", () => {
  it("超过时限且没人在线的房间被删除，有人在线的保留", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { RoomStore } = await import("../src/rooms.ts");
    const dir = mkdtempSync(join(tmpdir(), "dbd-prune-"));
    const store = new RoomStore(dir);
    const a = store.create({ playerCount: 3 }, false);
    const b = store.create({ playerCount: 3 }, false);
    const later = Date.now() + 25 * 3600_000;
    expect(store.prune(24 * 3600_000, (c) => c === b.code, later)).toBe(1);
    expect(store.rooms.has(a.code)).toBe(false);
    expect(existsSync(join(dir, a.code + ".json"))).toBe(false);
    expect(store.rooms.has(b.code)).toBe(true);
    expect(store.prune(24 * 3600_000)).toBe(0);
  });
});
