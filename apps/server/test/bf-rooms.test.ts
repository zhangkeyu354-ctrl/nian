import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { botFor } from "../../../packages/boss-fighters/src/index.ts";
import { BFRoom, BFRoomStore } from "../src/bf-rooms.ts";

function play(room: BFRoom, token: string) {
  // 真人座位也交给机器人逻辑代打，用协议命令发出去
  for (let i = 0; i < 3000 && !room.over; i++) {
    const bot = room.botMove();
    if (bot) {
      room.commit(bot);
      continue;
    }
    const s = room.state!;
    if (s.phase === "chooseStarter") {
      room.apply(token, { type: "CHOOSE_STARTER", starter: 0, version: room.file.commands.length });
      continue;
    }
    const c = botFor(s, 0);
    if (!c) throw new Error("卡住了：" + s.phase);
    const v = room.file.commands.length;
    if (c.type === "PLAY_CARD") room.apply(token, { type: "PLAY_CARD", card: c.card, target: c.target, version: v });
    else if (c.type === "USE_ITEM") room.apply(token, { type: "USE_ITEM", item: c.item, target: c.target, version: v });
    else if (c.type === "END_ACTIONS") room.apply(token, { type: "END_ACTIONS", version: v });
    else if (c.type === "DISCARD") room.apply(token, { type: "DISCARD", cards: c.cards, version: v });
    else if (c.type === "DECIDE") room.apply(token, { type: "DECIDE", choice: c.choice, version: v });
  }
}

describe("魔王试炼房间", () => {
  const store = () => new BFRoomStore(mkdtempSync(join(tmpdir(), "bf-")));

  it("1 名真人 + 机器人打完一场战役关卡，并能存档重放", () => {
    const st = store();
    const room = st.create();
    const tok = room.claim("阿明");
    room.lobby(tok, { type: "PICK", race: "dwarf", cls: "warrior" });
    room.lobby(tok, { type: "ADD_BOT" });
    room.lobby(tok, { type: "ADD_BOT" });
    expect(room.file.seats.map((s) => s.race)).toEqual(["dwarf", "troll", "halfling"]);
    room.lobby(tok, { type: "START" });
    expect(room.state?.bossId).toBe("puppet");
    play(room, tok);
    expect(room.over).toBe(true);
    st.save(room);
    const again = new BFRoom(JSON.parse(JSON.stringify(room.file)));
    expect(again.state?.phase).toBe(room.state?.phase);
    expect(again.state?.boss.hp).toBe(room.state?.boss.hp);
    if (room.state?.phase === "won") {
      expect(room.file.campaign?.progress).toBe(0);
      expect(room.file.bossId).toBe("prince");
    }
  });

  it("种族不能重复；旧画面的命令被拒绝；观战不能操作", () => {
    const room = store().create();
    const a = room.claim("甲");
    const b = room.claim("乙");
    room.lobby(a, { type: "PICK", race: "elf", cls: "mage" });
    expect(() => room.lobby(b, { type: "PICK", race: "elf", cls: "rogue" })).toThrow("BF_RACE_TAKEN");
    room.lobby(b, { type: "PICK", race: "troll", cls: "rogue" });
    expect(() => room.lobby(b, { type: "START" })).toThrow("HOST_ONLY");
    room.lobby(a, { type: "SET_MODE", mode: "single" });
    room.lobby(a, { type: "SET_BOSS", bossId: "stoneGolem" });
    room.lobby(a, { type: "START" });
    expect(room.state?.bossId).toBe("stoneGolem");
    expect(() => room.apply(a, { type: "END_ACTIONS", version: 99 })).toThrow("BF_STALE");
    const watcher = room.claim("丙");
    expect(() => room.apply(watcher, { type: "END_ACTIONS", version: 0 })).toThrow("NOT_SEATED");
    // 观战者看不到任何人的手牌
    expect(room.snapshot(room.idByToken(watcher)).view!.heroes.every((h) => h.hand.length === 0)).toBe(true);
  });
});

describe("魔王试炼：掉线托管与冒险团存档", () => {
  it("真人掉线超过时限后由机器人代打，回来即停止代打", () => {
    const room = new BFRoomStore(mkdtempSync(join(tmpdir(), "bf-"))).create();
    const a = room.claim("甲");
    const b = room.claim("乙");
    room.lobby(a, { type: "PICK", race: "elf", cls: "mage" });
    room.lobby(b, { type: "PICK", race: "troll", cls: "rogue" });
    room.lobby(a, { type: "START" });
    room.apply(a, { type: "CHOOSE_STARTER", starter: 1, version: 0 }); // 乙先手
    const idB = room.idByToken(b)!;
    expect(room.botMove()).toBeNull();
    let t = 1_000_000;
    room.now = () => t;
    room.awaySince.set(idB, t);
    expect(room.botMove()).toBeNull(); // 刚掉线，还没到时限
    t += 26_000;
    expect(room.botMove()?.seat).toBe(1);
    expect(room.snapshot(null).seats[1].auto).toBe(true);
    room.awaySince.delete(idB); // 重新连上
    expect(room.botMove()).toBeNull();
  });

  it("冒险团用存档码在新房间继续", () => {
    const dir = mkdtempSync(join(tmpdir(), "bf-"));
    const st = new BFRoomStore(dir);
    const r1 = st.create();
    const a = r1.claim("甲");
    r1.lobby(a, { type: "PICK", race: "dwarf", cls: "warrior" });
    r1.lobby(a, { type: "ADD_BOT" });
    r1.lobby(a, { type: "START" });
    const code = r1.file.campaignCode!;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    r1.file.campaign!.progress = 3;
    st.save(r1);
    const st2 = new BFRoomStore(dir); // 模拟服务器重启后、旧房间已清理
    const r2 = st2.create();
    const x = r2.claim("丙");
    expect(() => r2.lobby(x, { type: "LOAD_CAMPAIGN", code: "ZZZZZZ" })).toThrow("BF_NO_CAMPAIGN");
    r2.lobby(x, { type: "LOAD_CAMPAIGN", code: code.toLowerCase() });
    expect(r2.file.campaign!.progress).toBe(3);
    expect(r2.file.seats.map((s) => [s.name, s.race, s.bot])).toEqual([["丙", "dwarf", false], [r1.file.seats[1].name, "troll", true]]);
    expect(r2.file.bossId).toBe("stoneGolem");
    // 按昵称对上：乙的存档英雄是机器人那位，换个房间读档时甲（不叫"丙"）也能对回自己
    const st3 = new BFRoomStore(dir);
    const r3 = st3.create();
    const z = r3.claim("路人");
    const me = r3.claim("甲");
    r3.lobby(z, { type: "LOAD_CAMPAIGN", code });
    expect(r3.file.seats[0].name).toBe("甲");
    expect(r3.file.seats[0].race).toBe("dwarf");
    // 对不上昵称的路人补到空着的英雄（原机器人那位）
    expect(r3.file.seats.map((s) => [s.name, s.bot])).toEqual([["甲", false], ["路人", false]]);
    r3.lobby(me, { type: "TAKE_HERO", index: 1 }); // 真人之间互换
    expect(r3.file.seats.map((s) => [s.name, s.race])).toEqual([["路人", "dwarf"], ["甲", "troll"]]); // 已通关到第 3 关，下一关是第 4 关
  });
});
