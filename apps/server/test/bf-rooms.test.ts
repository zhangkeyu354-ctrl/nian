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
