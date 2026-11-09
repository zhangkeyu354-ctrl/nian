import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARoom, MARoomStore } from "../src/ma-rooms.ts";

/** 房主（真人）也随机作答，人机由 botStep 推进，直到整局结束 */
function playOut(room: MARoom, hostToken: string, hostId: string) {
  for (let i = 0; i < 20000; i++) {
    const s = room.state!;
    if (s.phase === "over") return i;
    if (room.botStep()) continue;
    const v = room.file.commands.length;
    if (s.phase === "draft") room.apply(hostToken, v, { type: "DRAFT", racer: s.draft!.pool[0] });
    else if (s.phase === "choose") {
      const me = s.players.find((p) => p.id === hostId)!;
      room.apply(hostToken, v, { type: "CHOOSE", racer: me.hand.find((r) => !me.used.includes(r))! });
    } else if (s.pending?.player === hostId) room.apply(hostToken, v, { type: "ANSWER", value: s.pending.options[0].value });
    else throw new Error("卡住了：" + JSON.stringify(s.pending ?? s.phase));
  }
  throw new Error("步数过多");
}

describe("魔法运动员人机", () => {
  it("房主可以加人机，人机标记为在线，名字不能被冒领", () => {
    const room = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-bot-"))).create();
    const host = room.claim("甲");
    room.lobby(host, { type: "ADD_BOT" });
    room.lobby(host, { type: "ADD_BOT" });
    const snap = room.snapshot(null);
    expect(snap.players.map((p) => p.name)).toEqual(["甲", "人机1", "人机2"]);
    expect(snap.players[1]).toMatchObject({ bot: true, connected: true });
    expect(() => room.claim("人机1")).toThrow("NAME_TAKEN");
  });

  for (const [deal, secondWind, bots] of [
    ["draft", false, 1],
    ["random", true, 3],
    ["draft", true, 7],
  ] as const) {
    it(`真人 + ${bots} 个人机能打完整局（${deal}${secondWind ? "，开新角色" : ""}）`, () => {
      const dir = mkdtempSync(join(tmpdir(), "ma-bot-"));
      const store = new MARoomStore(dir);
      const room = store.create();
      const host = room.claim("甲");
      for (let i = 0; i < bots; i++) room.lobby(host, { type: "ADD_BOT" });
      room.lobby(host, { type: "SET_DEAL", deal });
      room.lobby(host, { type: "SET_SECOND_WIND", enabled: secondWind });
      room.lobby(host, { type: "START" });
      playOut(room, host, room.idByToken(host)!);
      expect(room.state!.phase).toBe("over");
      // 人机的命令也写进存档，重启后能原样重放
      store.save(room);
      expect(new MARoomStore(dir).rooms.get(room.code)!.state).toEqual(room.state);
    });
  }
});
