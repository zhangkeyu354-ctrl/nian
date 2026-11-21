import { describe, expect, it } from "vitest";
import { CrimeSceneRoom, CrimeSceneRoomStore } from "../src/cs-rooms.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("犯罪现场房间凭证与暂停", () => {
  const room = () => new CrimeSceneRoom({ code: "TEST", hostId: null, players: [], stage: "lobby", cardsPerKind: 4, eventsEnabled: false, forensicSeat: 0, state: null, pausedAt: null, version: 0 });

  it("必须凭座位凭证操作，房主才能开局", () => {
    const r = room();
    const tokens = Array.from({ length: 4 }, (_, i) => r.claim(`玩家${i + 1}`));
    expect(() => r.start(tokens[1], 1000, () => 0.25)).toThrow();
    r.start(tokens[0], 1000, () => 0.25);
    expect(r.file.state?.phase).toBe("setup");
    expect(() => r.command("invalid", { type: "start", seat: 0, location: "location-1" }, 1000)).toThrow();
    expect(r.snapshot(tokens[2]).view?.myRole).toBe(r.file.state?.roles[2]);
  });

  it("房主可开启特殊事件并传入对局状态", () => {
    const r = room();
    const token = r.claim("房主");
    for (const name of ["乙", "丙", "丁"]) r.claim(name);
    r.configure(token, { eventsEnabled: true });
    expect(r.file.eventsEnabled).toBe(true);
    r.start(token, 1000, () => 0.25);
    expect(r.file.state?.eventsEnabled).toBe(true);
  });

  it("专家掉线暂停计时，重连后将截止时间整体顺延", () => {
    const r = room();
    const tokens = Array.from({ length: 4 }, (_, i) => r.claim(`玩家${i + 1}`));
    r.start(tokens[0], 1000, () => 0.25);
    r.command(tokens[0], { type: "start", seat: 99, location: "location-1" }, 1000, () => 0);
    const oldDeadline = r.file.state!.night!.choiceDeadline;
    r.setConnected(tokens[0], false, 5000);
    expect(r.file.pausedAt).toBe(5000);
    expect(r.tick(100000)).toBe(false);
    r.setConnected(tokens[0], true, 15000);
    expect(r.file.pausedAt).toBeNull();
    expect(r.file.state!.night!.choiceDeadline).toBe(oldDeadline + 10000);
  });

  it("结案后专家离线不显示对局暂停", () => {
    const r = room();
    const tokens = Array.from({ length: 4 }, (_, i) => r.claim(`玩家${i + 1}`));
    r.start(tokens[0], 1000, () => 0.25);
    r.file.state!.phase = "result";
    r.setConnected(tokens[0], true, 2000);
    r.setConnected(tokens[0], false, 3000);
    expect(r.snapshot(tokens[1]).paused).toBe(false);
  });

  it("房间和私密状态可从磁盘恢复，重连仍使用原凭证", () => {
    const dir = mkdtempSync(join(tmpdir(), "crime-scene-"));
    try {
      const store = new CrimeSceneRoomStore(dir);
      const r = store.create();
      const token = r.claim("甲");
      for (const name of ["乙", "丙", "丁"]) r.claim(name);
      r.start(token, 1000, () => 0.25);
      r.command(token, { type: "start", seat: 99, location: "location-1" }, 1000, () => 0);
      store.save(r);
      const restored = new CrimeSceneRoomStore(dir).rooms.get(r.file.code)!;
      expect(restored.snapshot(token).mySeat).toBe(0);
      expect(restored.file.players[0].token).toBe(token);
      expect(restored.file.state?.roles).toEqual(r.file.state?.roles);
      expect(restored.file.state?.night?.choiceDeadline).toBe(r.file.state?.night?.choiceDeadline);
      expect(restored.file.pausedAt).not.toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("线上模式在搜证和简报阶段可发文字，夜晚和线下模式不开放聊天", () => {
    const r = room();
    const tokens = Array.from({ length: 4 }, (_, i) => r.claim(`玩家${i + 1}`));
    r.start(tokens[0], 1000, () => 0.25);
    expect(() => r.chat(tokens[1], "现在讨论", 2000)).toThrow();
    r.file.mode = "online";
    r.file.state!.phase = "night_killer";
    expect(() => r.chat(tokens[1], "夜里说话", 2000)).toThrow();
    r.file.state!.phase = "round2_search";
    r.chat(tokens[1], "专家在放标记", 2500);
    r.file.mode = "local";
    r.file.state!.phase = "round1_brief";
    expect(() => r.chat(tokens[1], "现在讨论", 2000)).toThrow();
    r.file.mode = "online";
    r.chat(tokens[1], "  我觉得是钥匙  ", 3000);
    expect(r.snapshot(tokens[2]).chat.at(-1)).toEqual({ seat: 1, text: "我觉得是钥匙", at: 3000 });
  });

  it("帮凶指认真证据只得到私下提示，房间版本不变", () => {
    const r = room();
    const tokens = Array.from({ length: 6 }, (_, i) => r.claim(`玩家${i + 1}`));
    r.start(tokens[0], 1000, () => 0.25);
    r.command(tokens[0], { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
    const s = r.file.state!;
    const killer = s.roles.indexOf("killer");
    const helper = s.roles.indexOf("accomplice");
    const clue = s.players[killer].clues[0];
    const means = s.players[killer].means[0];
    r.command(tokens[killer], { type: "choose", seat: 99, clue, means }, 2000);
    r.tick(61000);
    const version = r.file.version;
    const result = r.command(tokens[helper], { type: "solve", seat: 0, guess: { owner: killer, clue, means } }, 62000);
    expect(result).toEqual({ privateMessage: "不能指认真实证据，请重新选择" });
    expect(r.file.version).toBe(version);
  });

  it("结案后只有房主能再来一局：回到房间、保留座位与设置、清空聊天", () => {
    const r = room();
    const tokens = Array.from({ length: 4 }, (_, i) => r.claim(`玩家${i + 1}`));
    r.configure(tokens[0], { cardsPerKind: 5, mode: "online" });
    r.start(tokens[0], 1000, () => 0.25);
    expect(() => r.rematch(tokens[0])).toThrow();
    r.file.state!.phase = "result";
    r.file.chatLog = [{ seat: 1, text: "好险", at: 1 }];
    expect(() => r.rematch(tokens[1])).toThrow();
    r.rematch(tokens[0]);
    const snap = r.snapshot(tokens[2]);
    expect(snap.stage).toBe("lobby");
    expect(snap.view).toBeNull();
    expect(snap.players.map((p) => p.name)).toEqual(["玩家1", "玩家2", "玩家3", "玩家4"]);
    expect(snap.cardsPerKind).toBe(5);
    expect(snap.chat).toEqual([]);
    r.start(tokens[0], 5000, () => 0.25);
    expect(r.snapshot(tokens[1]).stage).toBe("game");
  });
});
