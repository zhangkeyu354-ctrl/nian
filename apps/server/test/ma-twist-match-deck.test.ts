// Twist 事件整局去重：服务端牌堆的保存、重连、重放、版本号防重复
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARoomStore } from "../src/ma-rooms.ts";

const fourTwisty = ["twisty-twirl", "twisty-twirl", "twisty-twirl", "twisty-twirl"];

/** 让房间里的人随便做决定，直到条件满足或整局结束 */
function playUntil(room: any, tokens: Record<string, string>, stop: () => boolean) {
  for (let i = 0; i < 40000 && room.state.phase !== "over" && !stop(); i++) {
    const s = room.state;
    const version = room.file.commands.length;
    if (s.phase === "choose") {
      const p = s.players.find((x: any) => !x.choices.length);
      room.apply(tokens[p.id], version, { type: "CHOOSE", racer: p.hand.find((r: string) => !p.used.includes(r)) });
    } else if (s.pending) {
      room.apply(tokens[s.pending.player], version, { type: "ANSWER", value: s.pending.options[0].value });
    } else throw new Error("no decision");
  }
}

function startRoom(dir: string) {
  const store = new MARoomStore(dir);
  const room = store.create();
  const a = room.claim("甲"), b = room.claim("乙");
  room.lobby(a, { type: "SET_SCHEDULE", schedule: fourTwisty } as any);
  room.lobby(a, { type: "SET_DEAL", deal: "random" });
  room.lobby(a, { type: "START" });
  const tokens = Object.fromEntries(room.file.players.map((p: any) => [p.playerId, p.token]));
  return { store, room, tokens, a };
}

describe("服务端：Twist 事件整局牌堆", { timeout: 300_000 }, () => {
  it("开局时标记为整局牌堆，并写进存档", () => {
    const { room } = startRoom(mkdtempSync(join(tmpdir(), "ma-twist-deck-")));
    expect(room.file.twistMatchDeck).toBe(true);
    expect(room.state!.settings.twistMatchDeck).toBe(true);
    expect(room.state!.twistPool).toHaveLength(13);
  });

  it("服务器重启 / 断线重连后，已抽记录和剩余牌堆完全不变，后续抽卡仍不重复", () => {
    const dir = mkdtempSync(join(tmpdir(), "ma-twist-deck-"));
    const { store, room, tokens } = startRoom(dir);
    // 打到第 2 场开始（第 1 场的事件已抽）
    playUntil(room, tokens, () => (room.state!.race?.index ?? 0) >= 1);
    const poolBefore = [...room.state!.twistPool!];
    store.save(room);
    const restored = new MARoomStore(dir).rooms.get(room.code)!;
    expect(restored.state!.twistPool).toEqual(poolBefore);
    expect(restored.state!.settings.twistMatchDeck).toBe(true);
    // 刷新页面：客户端快照里没有未抽的牌
    const snap = JSON.stringify(restored.snapshot(tokens[restored.file.players[0].playerId]));
    expect(snap).not.toContain("twistPool");
    // 接着打完，整局抽到的事件没有重复
    playUntil(restored, tokens, () => false);
    const drawn = restored.state!.log.flatMap((l: any) => (/抽到 Twist 事件 (\d+)/.exec(l.text) ? [Number(RegExp.$1)] : []));
    expect(drawn.length).toBe(new Set(drawn).size);
    expect(restored.state!.twistPool!.length + drawn.length).toBe(13);
  });

  it("重复提交同一条命令（旧版本号）会被拒绝，不会重复抽卡", () => {
    const { room, tokens } = startRoom(mkdtempSync(join(tmpdir(), "ma-twist-deck-")));
    const s = room.state!;
    const p = s.players.find((x) => !x.choices.length)!;
    const v = room.file.commands.length;
    room.apply(tokens[p.id], v, { type: "CHOOSE", racer: p.hand[0] });
    expect(() => room.apply(tokens[p.id], v, { type: "CHOOSE", racer: p.hand[0] })).toThrow();
    expect(room.file.commands.length).toBe(v + 1);
  });

  it("同一房间开新的一局：重新洗成完整 13 张", () => {
    const { room, tokens, a } = startRoom(mkdtempSync(join(tmpdir(), "ma-twist-deck-")));
    playUntil(room, tokens, () => (room.state!.twistPool?.length ?? 13) < 13);
    expect(room.state!.twistPool!.length).toBeLessThan(13);
    room.file.stage = "lobby"; // 模拟回到大厅后房主再开一局
    room.lobby(a, { type: "START" });
    expect(room.state!.twistPool).toHaveLength(13);
  });

  it("旧存档（没有整局牌堆标记）重放不变：仍按每场 13 张", () => {
    const dir = mkdtempSync(join(tmpdir(), "ma-twist-deck-"));
    const { store, room, tokens } = startRoom(dir);
    delete room.file.twistMatchDeck;
    room.state = (room as any).create();
    room.file.commands = [];
    playUntil(room, tokens, () => (room.state!.race?.index ?? 0) >= 1);
    store.save(room);
    const restored = new MARoomStore(dir).rooms.get(room.code)!;
    expect(restored.state!.settings.twistMatchDeck).toBeUndefined();
    expect(restored.state!.twistPool).toBeUndefined();
    expect(JSON.stringify(restored.state!.log)).toBe(JSON.stringify(room.state!.log));
  });
});
