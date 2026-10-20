import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARoomStore } from "../src/ma-rooms.ts";

describe("魔法运动员房间", () => {
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

  it("不足 3 人不能开始；最多 6 人", () => {
    const store = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-")));
    const room = store.create();
    const t = room.claim("房主");
    room.claim("二");
    expect(() => room.lobby(t, { type: "START" })).toThrow("MA_NEED_PLAYERS");
    for (const n of ["三", "四", "五", "六"]) room.claim(n);
    expect(() => room.claim("七")).toThrow("ROOM_FULL");
  });
});
