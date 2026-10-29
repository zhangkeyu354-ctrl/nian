import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARoom, MARoomStore } from "../src/ma-rooms.ts";

describe("魔法运动员房间", () => {
  it("新开局采用香蕉双向经过，并在保存重启后保留", () => {
    const dir = mkdtempSync(join(tmpdir(), "ma-banana-new-"));
    const store = new MARoomStore(dir);
    const room = store.create();
    const host = room.claim("甲");
    room.claim("乙");
    room.lobby(host, { type: "START" });
    expect(room.file.bananaBackwardPass).toBe(true);
    expect(room.state!.settings.bananaBackwardPass).toBe(true);
    expect(room.file.independentMasterminds).toBe(true);
    expect(room.state!.settings.independentMasterminds).toBe(true);
    store.save(room);
    const restored = new MARoomStore(dir).rooms.get(room.code)!;
    expect(restored.state).toEqual(room.state);
    expect(restored.file.bananaBackwardPass).toBe(true);
    expect(restored.state!.settings.independentMasterminds).toBe(true);
  });

  it("旧存档缺少香蕉版本字段时，重放保持旧规则和旧状态结构", () => {
    const store = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-banana-old-")));
    const room = store.create();
    const host = room.claim("甲");
    room.claim("乙");
    room.lobby(host, { type: "START" });
    const oldFile = structuredClone(room.file);
    delete oldFile.bananaBackwardPass;
    delete oldFile.independentMasterminds;
    const restored = new MARoom(oldFile);
    expect(restored.state!.settings).not.toHaveProperty("bananaBackwardPass");
    expect(restored.state!.settings).not.toHaveProperty("independentMasterminds");
    const d = restored.state!.draft!;
    const token = restored.file.players.find(p => p.playerId === d.order[d.step])!.token;
    restored.apply(token, 0, { type: "DRAFT", racer: d.pool[0] });
    expect(new MARoom(structuredClone(restored.file)).state).toEqual(restored.state);
  });
  it("建房 → 3 人加入 → 房主开始 → 选秀；重启后重放恢复一致", () => {
    const dir = mkdtempSync(join(tmpdir(), "ma-"));
    const store = new MARoomStore(dir);
    const room = store.create();
    const tokens = ["阿", "博", "春"].map((n) => room.claim(n));
    expect(() => room.lobby(tokens[1], { type: "START" })).toThrow("HOST_ONLY");
    room.lobby(tokens[0], {
      type: "SET_POINTS",
      points: [1, 2, 3, 4].map((v) => ({ gold: v + 2, silver: v })),
    });
    room.lobby(tokens[0], { type: "START" });
    expect(() => room.claim("迟到")).toThrow("ALREADY_STARTED");
    // 按选秀顺序选几张
    for (let i = 0; i < 4; i++) {
      const d = room.state!.draft!;
      const who = d.order[d.step];
      const tok = tokens[room.file.players.findIndex((p) => p.playerId === who)];
      room.apply(tok, room.file.commands.length, { type: "DRAFT", racer: d.pool[0] });
    }
    // 过期版本号被拒绝（防重复提交）
    expect(() => room.apply(tokens[0], 0, { type: "DRAFT", racer: "x" })).toThrow("STALE");
    store.save(room);
    const again = new MARoomStore(dir).rooms.get(room.code)!;
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(room.state));
    expect(again.state!.settings.points[3]).toEqual({ gold: 6, silver: 4 });
    // 视图不含牌堆与快照
    const v = room.snapshot(room.file.players[1].playerId).view as Record<string, unknown>;
    expect(v.deck).toBeUndefined();
    expect(v.turn).toBeUndefined();
  });

  it("1 人不能开始；2 人可以（双选手）；最多 8 人", () => {
    const store = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-")));
    const room = store.create();
    const t = room.claim("房主");
    expect(() => room.lobby(t, { type: "START" })).toThrow("MA_NEED_PLAYERS");
    room.claim("二");
    expect(room.snapshot(null).variant).toBe("standard");
    for (const n of ["三", "四", "五", "六", "七", "八"]) room.claim(n);
    expect(() => room.claim("九")).toThrow("ROOM_FULL");
  });

  it("房规：2 人、3 人也是每人选秀 4 名、每场 1 名（不开放双选手）", () => {
    for (const n of [2, 3]) {
      const store = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-")));
      const room = store.create();
      const t = room.claim("房主");
      for (let i = 1; i < n; i++) room.claim("玩家" + i);
      room.lobby(t, { type: "START" });
      expect(room.state!.settings.variant).toBe("standard");
      expect(room.state!.draft!.pool).toHaveLength(2 * n);
    }
  });

  it("随机模式：房主切换后开局直接每人随机 4 名、不重复；只有房主能切；重启后恢复一致", () => {
    const dir = mkdtempSync(join(tmpdir(), "ma-"));
    const store = new MARoomStore(dir);
    const room = store.create();
    const t = room.claim("房主");
    const t2 = room.claim("二");
    room.claim("三");
    expect(room.snapshot(null).deal).toBe("draft");
    expect(() => room.lobby(t2, { type: "SET_DEAL", deal: "random" })).toThrow("HOST_ONLY");
    expect(() => room.lobby(t, { type: "SET_DEAL", deal: "x" as "random" })).toThrow("BAD_ACTION");
    room.lobby(t, { type: "SET_DEAL", deal: "random" });
    expect(room.snapshot(null).deal).toBe("random");
    room.lobby(t, { type: "START" });
    const s = room.state!;
    expect(s.phase).toBe("choose");
    const all = s.players.flatMap((p) => p.hand);
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(12);
    store.save(room);
    const again = new MARoomStore(dir).rooms.get(room.code)!;
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(room.state));
  });

  it("同名重进：离线时直接接回原位置（大厅和游戏中都行），在线时要确认；不会多出同名玩家", () => {
    const store = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-")));
    const room = store.create();
    const host = room.claim("房主");
    const rj = room.claim("RJ");
    // 微信退出、本机记录丢了：再输入同一个名字 → 拿回同一个位置
    expect(room.claim("RJ")).toBe(rj);
    expect(room.claim(" RJ ")).toBe(rj);
    expect(room.file.players).toHaveLength(2);
    // 旧窗口还连着：需要本人确认
    const id = room.idByToken(rj)!;
    room.connections.set(id, 1);
    expect(() => room.claim("RJ")).toThrow("NAME_TAKEN");
    expect(room.claim("RJ", true)).toBe(rj);
    room.connections.set(id, 0);
    // 开局后：新名字不能加入，原玩家可以接回
    room.lobby(host, { type: "START" });
    expect(() => room.claim("路人")).toThrow("ALREADY_STARTED");
    expect(room.claim("RJ")).toBe(rj);
    expect(room.file.players).toHaveLength(2);
  });

  it("房主可以在开局前移出多余的玩家；不能移出自己；别人不能移", () => {
    const store = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-")));
    const room = store.create();
    const host = room.claim("房主");
    const a = room.claim("阿");
    room.claim("多余");
    const extra = room.file.players[2].playerId;
    expect(() => room.lobby(a, { type: "KICK", playerId: extra })).toThrow("HOST_ONLY");
    expect(() => room.lobby(host, { type: "KICK", playerId: room.idByToken(host)! })).toThrow("BAD_ACTION");
    room.lobby(host, { type: "KICK", playerId: extra });
    expect(room.file.players.map((p) => p.name)).toEqual(["房主", "阿"]);
  });
});

