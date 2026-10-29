import { describe, it, expect } from "vitest";
import { testRace, reduceMA, powerOf, total, createMAGame } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
import { answer, tok } from "./helpers.ts";
import { SECOND_WIND_PREVIEW_IDS } from "../src/second-wind-preview.ts";
import type { MAState } from "../src/types.ts";
const make = (racers: string[], pos: number[], rolls: number[] = [], extra = {}) =>
  testRace({ racers, pos, rolls, secondWindPreview: true, skipSetup: true, ...extra });
const restore = (s: MAState) => JSON.parse(JSON.stringify(s)) as MAState;
const snap = (s: MAState, edit: (s: MAState) => void) => {
  const x = JSON.parse(s.turn!.snapshot);
  edit(x);
  s.turn!.snapshot = JSON.stringify(x);
  return s;
};
const pts = (s: MAState, p: string) => total(s.players.find((x) => x.id === p)!.chips);
const completeRace = (s: MAState) => {
  for (let i = 0; s.phase === "race" && i < 1000; i++) {
    const p = s.pending!;
    s = answer(
      s,
      p.options.find((o) => o.value === "no")?.value ??
        p.options.find((o) => o.value === "keep")?.value ??
        p.options[0].value,
    );
  }
  expect(s.phase).not.toBe("race");
  return s;
};
describe("Second Wind最后8名", () => {
  it("被虚无抑制的山寨猫不再要求选复制对象，普通主移动仍正常", () => {
    const s = make(["copycat", "sw_null", "banana", "twin"], [5, 0, 20, 20], [3]);
    expect(s.pending?.kind).toBe("main");
  });
  it("虚无抑制已经下注的军师时，不绕过能力查询直接发亚军", () => {
    let s = make(["twin", "mastermind", "sw_null"], [28, 10, 0], [3]);
    s = snap(s, (x) => {
      x.race!.mastermindPick = "twin";
    });
    s = answer(s, "roll");
    expect(tok(s, "twin").place).toBe(1);
    expect(tok(s, "mastermind").place).toBeNull();
    expect(s.race!.over).toBe(false);
  });
  it("返场跑者两人标准局的后续首回合仍行动两名，赛前可定顺序", () => {
    let s = createMAGame({
      players: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      seed: 17,
      settings: { secondWindPreview: true, deal: "random" },
    });
    s.players[0].hand = ["sw_re_runner", "alchemist", "legs", "twin"];
    s.players[1].hand = ["banana", "coach", "gunk", "hare"];
    s.deck = s.deck.filter((x) => !s.players.some((p) => p.hand.includes(x)));
    s.nextFirst = "a";
    s = reduceMA(s, { type: "CHOOSE", player: "a", racer: "sw_re_runner" });
    s = reduceMA(s, { type: "CHOOSE", player: "b", racer: "banana" });
    s = completeRace(s);
    s.nextFirst = "a";
    s.forcedRolls = [3, 3];
    s = reduceMA(s, { type: "CHOOSE", player: "a", racer: "alchemist" });
    s = reduceMA(s, { type: "CHOOSE", player: "b", racer: "coach" });
    expect(s.pending?.kind).toBe("lineup");
    s = answer(s, "sw_re_runner");
    expect(s.pending?.kind).toBe("main");
    s = answer(s, "roll");
    expect(s.pending?.player).toBe("a");
    expect(s.pending?.racer).toBe("alchemist");
    expect(s.pending?.kind).toBe("main");
  });
  it("返场跑者首次第4场使用不创建第5场，只有一名该角色实体", () => {
    let s = testRace({
      racers: ["sw_re_runner", "twin", "banana"],
      pos: [28, 29, 10],
      rolls: [2, 1],
      secondWindPreview: true,
    });
    s = snap(s, (x) => {
      x.race!.index = 3;
    });
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.phase).toBe("over");
    expect(s.race!.tokens.filter((t) => t.racer === "sw_re_runner")).toHaveLength(1);
  });
  it("返场跑者本场淘汰不会清除已登记的后续返场资格", () => {
    let s = testRace({
      racers: ["mouth", "sw_re_runner", "twin"],
      pos: [0, 4, 20],
      rolls: [4],
      secondWindPreview: true,
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_re_runner").out).toBe(true);
    expect(s.returningRacers?.some((r) => r.racer === "sw_re_runner" && r.owner === "p2")).toBe(true);
  });
  it("吸盘鱼与骑士同时到达不夺走野猪；后续单独停格才接走", () => {
    let s = testRace({
      racers: ["sw_hog_knight", "suckerfish", "twin"],
      pos: [0, 0, 20],
      rolls: [3],
      secondWindPreview: true,
    });
    s = answer(s, "roll");
    s = answer(s, "yes");
    expect(tok(s, "suckerfish").pos).toBe(5);
    expect(s.race!.hogs?.[0].rider).toBe("sw_hog_knight");
  });
  it("野猪加成照常经过香蕉和狂野箭头，虚无压制源时不加2", () => {
    let s = testRace({
      racers: ["sw_hog_knight", "banana", "twin"],
      pos: [0, 2, 20],
      rolls: [5],
      track: "wild",
      secondWindPreview: true,
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_hog_knight").pos).toBe(10);
    expect(tok(s, "sw_hog_knight").tripped).toBe(true);
    let n = testRace({
      racers: ["sw_hog_knight", "sw_null", "twin"],
      pos: [5, 0, 20],
      rolls: [3],
      secondWindPreview: true,
    });
    n = answer(n, "roll");
    expect(tok(n, "sw_hog_knight").pos).toBe(7);
  });
  it("糊糊1点抽卡替换能力，本场不叠加；抽卡不会改变角色身份", () => {
    let s = make(["sw_mush", "twin", "banana"], [0, 10, 20], [1]);
    s = snap(s, (x) => {
      x.deck = ["sw_icarus"];
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_mush").base).toBe("sw_icarus");
    expect(tok(s, "sw_mush").racer).toBe("sw_mush");
    expect(tok(s, "sw_mush").pos).toBe(4);
    expect(s.deck).toHaveLength(0);
  });
  it("糊糊空牌堆保留能力；旧2重掷为4不抽卡", () => {
    let s = make(["sw_mush", "twin", "banana"], [0, 10, 20], [2]);
    s = snap(s, (x) => {
      x.deck = [];
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_mush").base).toBe("sw_mush");
    expect(tok(s, "sw_mush").pos).toBe(2);
    let r = make(["sw_mush", "dicemonger", "twin"], [0, 10, 20], [2, 4]);
    r = snap(r, (x) => {
      x.deck = ["sw_null"];
    });
    r = answer(r, "roll");
    r = answer(r, "dicemonger");
    expect(r.deck).toEqual(["sw_null"]);
  });
  it("糊糊抽到赛前能力不追溯补发赛前积分，抽到返场能力可以登记未来返场", () => {
    let s = make(["sw_mush", "twin", "banana"], [0, 10, 20], [1]);
    s = snap(s, (x) => {
      x.deck = ["sisyphus"];
    });
    s = answer(s, "roll");
    expect(pts(s, "p1")).toBe(0);
    let r = make(["sw_mush", "twin", "banana"], [0, 10, 20], [2]);
    r = snap(r, (x) => {
      x.deck = ["sw_re_runner"];
    });
    r = answer(r, "roll");
    expect(r.returningRacers?.[0].racer).toBe("sw_mush");
  });
  it("糊糊被虚无压制时不抽卡，取得虚无后压制其他人", () => {
    let s = make(["sw_mush", "sw_null", "twin"], [5, 0, 20], [1]);
    s = snap(s, (x) => {
      x.deck = ["alchemist"];
    });
    s = answer(s, "roll");
    expect(s.deck).toEqual(["alchemist"]);
    let r = make(["sw_mush", "hare", "banana"], [0, 10, 20], [2]);
    r = snap(r, (x) => {
      x.deck = ["sw_null"];
    });
    r = answer(r, "roll");
    expect(powerOf(r, tok(r, "hare"))).toBeNull();
  });
  it("换手角色卡和已使用状态随卡转移，已得分保留给原玩家", () => {
    let s = make(["sw_switcharoo", "twin", "banana"], [0, 4, 20], [3]);
    s = snap(s, (x) => {
      x.players[0].chips = [{ kind: "bronze", race: 0, value: 2 }];
      x.returningRacers = [{ racer: "twin", owner: "p2", base: "sw_re_runner" }];
    });
    s = answer(s, "roll");
    s = answer(s, "twin");
    expect(s.players[0].hand).toContain("twin");
    expect(s.players[1].hand).toContain("sw_switcharoo");
    expect(pts(s, "p1")).toBe(2);
    expect(pts(s, "p2")).toBe(0);
    expect(s.returningRacers?.[0].owner).toBe("p1");
  });
  it("换手选择暂停时恢复不会提前交换，旁观者和错误控制者不能替选", () => {
    let s = answer(make(["sw_switcharoo", "twin", "banana"], [0, 4, 20], [3]), "roll");
    expect(tok(s, "sw_switcharoo").owner).toBe("p1");
    expect(viewForMA(s, "p2").pending?.options).toEqual([]);
    expect(() => reduceMA(s, { type: "ANSWER", player: "p2", value: "twin" })).toThrow();
    s = answer(restore(s), "twin");
    expect(s.log.filter((l) => l.fx?.kind === "control")).toHaveLength(1);
  });
  it("不同秘密骰在揭晓前产生完全相同的旁观者视图", () => {
    const start = answer(make(["sw_cheatah", "twin", "banana"], [0, 10, 20]), "roll");
    expect(viewForMA(answer(start, "2"), null)).toEqual(viewForMA(answer(start, "5"), null));
  });
  it("作弊豹受虚无抑制时正常掷骰；没有偷偷设点", () => {
    let s = make(["sw_cheatah", "sw_null", "twin"], [5, 0, 20], [4]);
    s = answer(s, "roll");
    expect(tok(s, "sw_cheatah").pos).toBe(8);
    expect(s.pending?.kind).not.toBe("cheatah_set");
  });
  it("六面魔法1点也可被毛毛虫截停，不会绕过原有掷骰反应", () => {
    const s = answer(make(["sw_magical_athlete", "inchworm", "twin"], [0, 10, 20], [1]), "roll");
    expect(tok(s, "sw_magical_athlete").pos).toBe(0);
    expect(tok(s, "inchworm").pos).toBe(11);
  });
  it("六面魔法4点最终改为5时不获得额外行动", () => {
    let s = answer(make(["sw_magical_athlete", "dicemonger", "twin"], [0, 20, 10], [4, 5]), "roll");
    s = answer(s, "dicemonger");
    expect(tok(s, "sw_magical_athlete").pos).toBe(0);
    expect(s.race!.current).not.toBe("p1");
  });
  it("六面魔法6点被较真怪阻止过头时不误绊倒，冲线经过仍先绊倒", () => {
    const blocked = answer(make(["sw_magical_athlete", "twin", "stickler"], [28, 29, 10], [6]), "roll");
    expect(tok(blocked, "twin").tripped).toBe(false);
    const finish = answer(make(["sw_magical_athlete", "twin", "banana"], [24, 28, 10], [6]), "roll");
    expect(tok(finish, "twin").tripped).toBe(true);
    expect(tok(finish, "sw_magical_athlete").place).toBe(1);
  });
  it("六面魔法2点并列垫底时选择角色id，只有一名被拉", () => {
    let s = answer(make(["sw_magical_athlete", "twin", "banana"], [10, 0, 0], [2]), "roll");
    expect(s.pending?.kind).toBe("magical_tie");
    s = answer(s, "twin");
    expect(tok(s, "twin").pos).toBe(10);
    expect(tok(s, "banana").pos).toBe(0);
  });
  it("用户裁定：六面魔法5点后退经过香蕉也摔倒", () => {
    const s = answer(make(["sw_magical_athlete", "twin", "banana"], [0, 10, 8], [5]), "roll");
    expect(tok(s, "twin").pos).toBe(5);
    expect(tok(s, "twin").tripped).toBe(true);
  });
  it("虚无下的腿不能选择免骰，香蕉和企鹅被经过时不发动", () => {
    let s = make(["legs", "sw_null", "banana", "sw_penguin"], [5, 0, 7, 8], [4]);
    expect(s.pending?.options.some((o) => o.value === "legs")).toBe(false);
    s = answer(s, "roll");
    expect(tok(s, "legs").pos).toBe(8);
    expect(tok(s, "legs").tripped).toBe(false);
    expect(tok(s, "sw_penguin").tripped).toBe(false);
  });
  it("虚无抑制不会擦除巨口记忆，离开前方后能力恢复", () => {
    let s = make(["sw_bite_mark", "sw_null", "twin"], [5, 0, 20], [3]);
    s = snap(s, (x) => {
      tok(x, "sw_bite_mark").secondWind = { wereMouth: true };
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_bite_mark").secondWind?.wereMouth).toBe(true);
    tok(s, "sw_null").pos = 15;
    expect(powerOf(s, tok(s, "sw_bite_mark"))).toBe("sw_bite_mark");
  });
  it("替身黑帮拦截不算军师冠军猜中，但按用户裁定算继父首次冲线奖金", () => {
    let s = make(["twin", "sw_doppelgangster", "mastermind", "sw_stepdad"], [28, 0, 10, 20], [3]);
    s = snap(s, (x) => {
      x.race!.mastermindPick = "twin";
    });
    s = answer(s, "roll");
    expect(tok(s, "twin").out).toBe(true);
    expect(s.race!.over).toBe(false);
    expect(pts(s, "p3")).toBe(0);
    expect(pts(s, "p4")).toBe(3);
  });
  it("野猪接走后不改变原骑士能力，多个坐骑不重复生成", () => {
    let s = testRace({
      racers: ["twin", "sw_hog_knight", "banana"],
      pos: [0, 3, 20],
      rolls: [3],
      secondWindPreview: true,
    });
    s = answer(restore(s), "roll");
    expect(s.race!.hogs).toHaveLength(1);
    expect(tok(s, "sw_hog_knight").base).toBe("sw_hog_knight");
  });
  it("36名登记不包含巨口形态，基础招募仍36，预览72", () => {
    expect(SECOND_WIND_PREVIEW_IDS).toHaveLength(36);
    expect(new Set(SECOND_WIND_PREVIEW_IDS).size).toBe(36);
    expect(SECOND_WIND_PREVIEW_IDS).not.toContain("sw_bite_mark_were");
    for (const enabled of [false, true]) {
      const s = createMAGame({
        players: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        seed: 1,
        settings: { secondWindPreview: enabled },
      });
      expect(s.deck.length + s.draft!.pool.length).toBe(enabled ? 72 : 36);
    }
  });
  it("作弊豹秘密设骰，右侧玩家猜；猜错按所选数移动", () => {
    let s = answer(make(["sw_cheatah", "twin", "banana"], [0, 10, 20], [1]), "roll");
    expect(s.pending?.kind).toBe("cheatah_set");
    s = answer(s, "6");
    expect(s.pending?.player).toBe("p3");
    expect(JSON.stringify(viewForMA(s, "p2"))).not.toContain('"answers"');
    s = answer(restore(s), "2");
    expect(tok(s, "sw_cheatah").pos).toBe(6);
    expect(s.forcedRolls).toEqual([1]);
  });
  it("作弊豹猜中不移动，也不消耗骰子或触发派对扫兴鬼", () => {
    let s = answer(make(["sw_cheatah", "sw_party_pooper", "twin"], [0, 10, 20], [6]), "roll");
    s = answer(s, "6");
    s = answer(s, "6");
    expect(tok(s, "sw_cheatah").pos).toBe(0);
    expect(tok(s, "sw_party_pooper").pos).toBe(10);
    expect(s.forcedRolls).toEqual([6]);
  });
  it("作弊豹秘密值不会出现在旁观者日志或待猜提示，错误玩家被拒绝", () => {
    let s = answer(make(["sw_cheatah", "twin", "banana"], [0, 10, 20]), "roll");
    s = answer(s, "5");
    const v = viewForMA(s, null);
    expect(v.pending?.prompt).not.toContain("5");
    expect(v.pending?.options).toEqual([]);
    expect(v.log.some((l) => l.text.includes("设为 5"))).toBe(false);
    expect(() => reduceMA(s, { type: "ANSWER", player: "p2", value: "5" })).toThrow();
  });
  for (const [die, dest] of [
    [1, 7],
    [4, 4],
    [6, 6],
  ])
    it(`魔法运动员${die}分支主移动${dest}`, () => {
      const s = answer(make(["sw_magical_athlete", "twin", "banana"], [0, 15, 20], [die]), "roll");
      expect(tok(s, "sw_magical_athlete").pos).toBe(dest);
      if (die === 4) expect(s.race!.current).toBe("p1");
    });
  it("魔法运动员2拉垫底者，不另走2格", () => {
    const s = answer(make(["sw_magical_athlete", "twin", "banana"], [10, 0, 20], [2]), "roll");
    expect(tok(s, "twin").pos).toBe(10);
    expect(tok(s, "sw_magical_athlete").pos).toBe(10);
  });
  it("魔法运动员3选择角色id传送并绊倒，恢复后不重复", () => {
    let s = answer(make(["sw_magical_athlete", "twin", "banana"], [0, 10, 20], [3]), "roll");
    expect(s.pending?.kind).toBe("magical_warp");
    s = answer(restore(s), "twin");
    expect(tok(s, "sw_magical_athlete").pos).toBe(10);
    expect(tok(s, "twin").tripped).toBe(true);
  });
  it("魔法运动员5让领先者后退5，自身不额外移动", () => {
    const s = answer(make(["sw_magical_athlete", "twin", "banana"], [5, 20, 10], [5]), "roll");
    expect(tok(s, "twin").pos).toBe(15);
    expect(tok(s, "sw_magical_athlete").pos).toBe(5);
  });
  it("魔法运动员6绊倒经过者，同格不算经过；箭头后续不继续绊", () => {
    const s = answer(make(["sw_magical_athlete", "twin", "banana"], [0, 3, 6], [6]), "roll");
    expect(tok(s, "twin").tripped).toBe(true);
    expect(tok(s, "banana").tripped).toBe(false);
  });
  it("虚无压制前方能力和主移动，同格不压制", () => {
    let s = make(["hare", "sw_null", "twin"], [5, 0, 20], [3]);
    expect(powerOf(s, tok(s, "hare"))).toBeNull();
    s = answer(s, "roll");
    expect(tok(s, "hare").pos).toBe(7);
    const tie = make(["hare", "sw_null", "twin"], [0, 0, 20], [3]);
    expect(powerOf(tie, tok(tie, "hare"))).toBe("hare");
  });
  it("最落后的虚无抑制前方虚无，不产生递归；移出范围恢复", () => {
    let s = make(["sw_null", "twin", "banana"], [0, 5, 20], [6]);
    s = snap(s, (x) => {
      tok(x, "twin").base = "sw_null";
    });
    s = answer(s, "roll");
    expect(powerOf(s, tok(s, "twin"))).toBe("sw_null");
    expect(powerOf(s, tok(s, "sw_null"))).toBeNull();
  });
  it("虚无抑制惊艳者和派对扫兴鬼时不强制改骰", () => {
    const s = answer(make(["twin", "sw_null", "sw_stunner", "sw_party_pooper"], [10, 0, 11, 20], [6]), "roll");
    expect(tok(s, "twin").pos).toBe(15);
    expect(tok(s, "sw_party_pooper").pos).toBe(20);
  });
  it("替身黑帮淘汰原第一冲线者，继承其能力，未发金牌也无冠军历史", () => {
    const s = answer(make(["alchemist", "sw_doppelgangster", "banana"], [28, 0, 10], [3]), "roll");
    expect(tok(s, "alchemist").out).toBe(true);
    expect(tok(s, "alchemist").place).toBeNull();
    expect(tok(s, "sw_doppelgangster").base).toBe("alchemist");
    expect(s.race!.finishers).toEqual([]);
    expect(pts(s, "p1")).toBe(0);
  });
  it("替身黑帮自己先冲线也会被淘汰，不复制为自己发奖", () => {
    const s = answer(make(["sw_doppelgangster", "twin", "banana"], [28, 5, 10], [3]), "roll");
    expect(tok(s, "sw_doppelgangster").out).toBe(true);
    expect(pts(s, "p1")).toBe(0);
  });
  it("虚无抑制替身黑帮时普通第一名照常冲线", () => {
    const s = answer(make(["twin", "sw_doppelgangster", "sw_null"], [28, 5, 0], [3]), "roll");
    expect(tok(s, "twin").place).toBe(1);
    expect(tok(s, "twin").out).toBe(false);
  });
  it("野猪骑士赛前创建坐骑，骑手主移动加2", () => {
    let s = testRace({
      racers: ["sw_hog_knight", "twin", "banana"],
      pos: [0, 10, 20],
      rolls: [3],
      secondWindPreview: true,
    });
    expect(s.race!.hogs).toHaveLength(1);
    s = answer(s, "roll");
    expect(tok(s, "sw_hog_knight").pos).toBe(5);
  });
  it("其他人停到野猪格接走坐骑，之后主移动加2；控制权不交换", () => {
    let s = testRace({
      racers: ["twin", "sw_hog_knight", "banana"],
      pos: [0, 3, 20],
      rolls: [3],
      secondWindPreview: true,
    });
    s = answer(s, "roll");
    expect(s.race!.hogs?.[0].rider).toBe("twin");
    expect(tok(s, "twin").owner).toBe("p1");
  });
  it("野猪骑士经过并不停留不转移坐骑", () => {
    let s = testRace({
      racers: ["twin", "sw_hog_knight", "banana"],
      pos: [0, 3, 20],
      rolls: [4],
      secondWindPreview: true,
    });
    s = answer(s, "roll");
    expect(s.race!.hogs?.[0].rider).toBe("sw_hog_knight");
  });
  it("返场跑者首场登记但不重复出现，之后每场作为额外选手从起点重置", () => {
    let s = testRace({
      racers: ["sw_re_runner", "twin", "banana"],
      pos: [28, 29, 10],
      rolls: [2, 1],
      secondWindPreview: true,
    });
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.phase).toBe("choose");
    expect(s.returningRacers).toHaveLength(1);
    for (const p of [...s.players]) {
      s.players.find((x) => x.id === p.id)!.hand.push(p.id === "p1" ? "alchemist" : p.id === "p2" ? "legs" : "gunk");
      s = reduceMA(s, {
        type: "CHOOSE",
        player: p.id,
        racer: p.id === "p1" ? "alchemist" : p.id === "p2" ? "legs" : "gunk",
      });
    }
    expect(s.race!.tokens.filter((t) => t.racer === "sw_re_runner")).toHaveLength(1);
    expect(tok(s, "sw_re_runner").pos).toBe(0);
    expect(s.pending?.kind).toBe("lineup");
  });
  it("换手袋鼠回合末选角色id并交换控制权；旧玩家不能操作新角色", () => {
    let s = answer(make(["sw_switcharoo", "twin", "banana"], [0, 4, 20], [3]), "roll");
    expect(s.pending?.kind).toBe("switcharoo");
    s = answer(restore(s), "twin");
    expect(tok(s, "sw_switcharoo").owner).toBe("p2");
    expect(tok(s, "twin").owner).toBe("p1");
    expect(s.race!.current).toBe("p2");
    expect(s.pending?.player).toBe("p2");
    expect(() => reduceMA(s, { type: "ANSWER", player: "p1", value: "roll" })).toThrow();
  });
  it("换手袋鼠可放弃，距离2以上不询问", () => {
    let s = answer(make(["sw_switcharoo", "twin", "banana"], [0, 4, 20], [3]), "roll");
    s = answer(s, "no");
    expect(tok(s, "sw_switcharoo").owner).toBe("p1");
    const far = answer(make(["sw_switcharoo", "twin", "banana"], [0, 10, 20], [3]), "roll");
    expect(far.pending?.kind).not.toBe("switcharoo");
  });
});
