import { describe, expect, it } from "vitest";
import { testRace, reduceMA, total } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
import { answer, tok } from "./helpers.ts";
import type { MAState } from "../src/types.ts";
import {
  racerArtId,
  SECOND_WIND_PREVIEW_IDS,
} from "../src/second-wind-preview.ts";
const make = (racers: string[], pos: number[], rolls: number[], extra = {}) =>
  testRace({
    racers,
    pos,
    rolls,
    skipSetup: true,
    secondWindPreview: true,
    ...extra,
  });
const points = (s: MAState, id: string) =>
  total(s.players.find((p) => p.id === id)!.chips);
const powers = (s: MAState, id: string) =>
  s.log.filter((l) => l.fx?.kind === "power" && l.fx.power === id);
const snap = (s: MAState, edit: (s: MAState) => void) => {
  const x = JSON.parse(s.turn!.snapshot);
  edit(x);
  s.turn!.snapshot = JSON.stringify(x);
  return s;
};
const restore = (s: MAState) => JSON.parse(JSON.stringify(s)) as MAState;

describe("Second Wind第六批5名", () => {
  it("变身只换同一名角色的资源，不增加招募身份或改变控制权", () => {
    const t = {
      racer: "sw_bite_mark",
      owner: "p1",
      secondWind: { wereMouth: true },
    };
    expect(racerArtId(t)).toBe("sw_bite_mark_were");
    expect(t.racer).toBe("sw_bite_mark");
    expect(SECOND_WIND_PREVIEW_IDS).not.toContain("sw_bite_mark_were");
    expect(racerArtId({ racer: "banana" })).toBe("banana");
  });
  it("派对咖同时把变身咬痕向前拉一格，不会把未经过者淘汰", () => {
    let s = make(["party_animal", "sw_bite_mark", "twin"], [4, 0, 2], [2]);
    s = snap(s, (x) => {
      tok(x, "sw_bite_mark").secondWind = { wereMouth: true };
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_bite_mark").pos).toBe(1);
    expect(tok(s, "twin").out).toBe(false);
  });
  it("变身咬痕被海怪传送，不淘汰原来在中间的选手", () => {
    let s = make(["sw_kraken", "sw_bite_mark", "twin"], [10, 0, 5], [2]);
    s = snap(s, (x) => {
      tok(x, "sw_bite_mark").secondWind = { wereMouth: true };
    });
    s = answer(s, "yes");
    expect(tok(s, "sw_bite_mark").pos).toBe(10);
    expect(tok(s, "twin").out).toBe(false);
  });
  it("巨婴把变身咬痕推到身后，没有经过而不淘汰巨婴", () => {
    let s = make(["sw_bite_mark", "huge_baby", "twin"], [0, 2, 20], [2]);
    s = answer(s, "roll");
    expect(tok(s, "sw_bite_mark").pos).toBe(1);
    expect(tok(s, "huge_baby").out).toBe(false);
  });
  it("派对扫兴鬼发技能后挪挪先蹭步，正常的有限连锁能够完成", () => {
    const s = answer(
      make(["twin", "sw_party_pooper", "scoocher"], [10, 0, 20], [6, 2]),
      "roll",
    );
    expect(tok(s, "sw_party_pooper").pos).toBe(1);
    expect(tok(s, "scoocher").pos).toBe(21);
    expect(tok(s, "twin").pos).toBe(12);
  });
  it("扫兴者取消的3分在快照恢复和重复旧回答时不重复发放", () => {
    const s = make(["sw_spoilsport", "twin", "banana"], [0, 5, 20], [2]);
    expect(points(restore(s), "p1")).toBe(3);
    expect(() =>
      reduceMA(s, { type: "ANSWER", player: "p1", value: "roll" }),
    ).toThrow();
    expect(points(s, "p1")).toBe(3);
  });
  it("候补演员从拒绝复刻的双胞胎取得复刻冠军后，仍结算西西弗斯赛前积分", () => {
    let s = testRace({
      racers: ["sw_understudy", "twin", "banana"],
      winners: ["sisyphus"],
      secondWindPreview: true,
    });
    s = answer(s, "no");
    s = answer(s, "twin");
    s = answer(s, "sisyphus");
    expect(points(s, "p1")).toBe(4);
  });
  it("候补演员复制灵魂伴侣也选择本人的赛前目标，传送权限不沿用对手", () => {
    let s = testRace({
      racers: ["sw_understudy", "sw_soulmate", "banana"],
      pos: [0, 4, 20],
      secondWindPreview: true,
    });
    s = answer(s, "sw_soulmate");
    expect(s.pending?.racer).toBe("sw_understudy");
    s = answer(s, "sw_soulmate");
    s = answer(s, "banana");
    expect(tok(s, "sw_understudy").pos).toBe(4);
  });
  it("候补演员循环复制另一名已复制者，只结算一次赛前选择，不无限提问", () => {
    let s = testRace({
      racers: ["sw_understudy", "twin", "banana"],
      winners: ["sw_understudy"],
      secondWindPreview: true,
    });
    s = answer(s, "sw_understudy");
    s = answer(s, "twin");
    s = answer(s, "sw_understudy");
    expect(s.pending?.kind).toBe("main");
    expect(tok(s, "sw_understudy").base).toBe("sw_understudy");
  });
  it("咬痕变身后不会把后退或传送算成经过", () => {
    let s = make(["sw_bite_mark", "sw_le_saboteur", "twin"], [10, 0, 9], [3]);
    s = snap(s, (x) => {
      tok(x, "sw_bite_mark").secondWind = { wereMouth: true };
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_bite_mark").pos).toBe(7);
    expect(tok(s, "twin").out).toBe(false);
  });
  it("咬痕带吸盘鱼一起经过不会淘汰同组跟随者，只淘汰外部选手", () => {
    let s = answer(
      make(
        ["sw_bite_mark", "suckerfish", "twin", "banana"],
        [0, 0, 1, 20],
        [2],
      ),
      "roll",
    );
    s = answer(s, "yes");
    expect(tok(s, "suckerfish").out).toBe(false);
    expect(tok(s, "twin").out).toBe(true);
  });
  it("山寨猫变身后本段超过领先者，仍淘汰这段经过的目标", () => {
    let s = make(["copycat", "sw_bite_mark", "twin"], [0, 3, 2], [4]);
    s = snap(s, (x) => {
      tok(x, "copycat").secondWind = { wereMouth: true };
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_bite_mark").out).toBe(true);
    expect(tok(s, "twin").out).toBe(true);
  });
  it("骰子先生自主重掷要重掷整组六骰，不只重掷选中的一个数字", () => {
    let s = answer(
      make(
        ["sw_mr_dice_guy", "dicemonger", "banana"],
        [0, 10, 20],
        [2, 2, 3, 4, 5, 6, 4, 4, 1, 2, 3, 5],
      ),
      "roll",
    );
    s = answer(s, "2");
    s = answer(s, "dicemonger");
    expect(s.pending?.kind).toBe("dice_pool");
    s = answer(s, "4");
    expect(tok(s, "sw_mr_dice_guy").pos).toBe(4);
    expect(s.forcedRolls).toHaveLength(0);
  });
  it("骰子先生骰池中未选的6不触发跟班，最终选2才作为主骰", () => {
    let s = answer(
      make(
        ["sw_mr_dice_guy", "lackey", "banana"],
        [0, 10, 20],
        [2, 2, 3, 4, 5, 6],
      ),
      "roll",
    );
    s = answer(s, "2");
    expect(tok(s, "lackey").pos).toBe(10);
    expect(tok(s, "sw_mr_dice_guy").pos).toBe(2);
  });
  it("骰子先生六骰内的6仍各受派对扫兴鬼重掷", () => {
    let s = answer(
      make(
        ["sw_mr_dice_guy", "sw_party_pooper", "banana"],
        [10, 0, 20],
        [6, 2, 2, 3, 4, 5, 5],
      ),
      "roll",
    );
    expect(s.pending?.options.map((o) => o.value)).toEqual(["2", "5"]);
    s = answer(s, "2");
    expect(tok(s, "sw_party_pooper").pos).toBe(1);
    expect(tok(s, "sw_mr_dice_guy").pos).toBe(12);
  });
  it("派对扫兴鬼自己的移动会触发香蕉和箭头", () => {
    const s = answer(
      make(["twin", "sw_party_pooper", "banana"], [20, 6, 8], [6, 2], {
        track: "wild",
      }),
      "roll",
    );
    expect(tok(s, "sw_party_pooper").pos).toBe(10);
    expect(tok(s, "sw_party_pooper").tripped).toBe(true);
  });
  it("有限的80个连续6不会按任意小次数截断；巨婴阻挡不影响骰继续重掷", () => {
    const s = answer(
      make(
        ["twin", "sw_party_pooper", "huge_baby"],
        [10, 0, 1],
        [...Array(80).fill(6), 3],
      ),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(13);
    expect(powers(s, "sw_party_pooper")).toHaveLength(80);
  });
  it("派对扫兴鬼重掷水管辅助骰，范围使用重掷后的值", () => {
    let s = make(
      ["sw_the_hose", "sw_party_pooper", "twin"],
      [0, 10, 3],
      [6, 2],
      { tripped: [true, false, false] },
    );
    s = answer(s, "ok");
    s = answer(s, "roll");
    expect(tok(s, "twin").tripped).toBe(false);
    expect(tok(s, "sw_party_pooper").pos).toBe(11);
  });
  it("扫兴者取消已经有第一冲线者的比赛，不发其金牌或添加冠军历史", () => {
    let s = make(["sw_spoilsport", "twin", "banana"], [0, 4, 20], [2]);
    s = snap(s, (x) => {
      tok(x, "twin").pos = 30;
      tok(x, "twin").place = 1;
      x.race!.finishers = ["twin"];
    });
    s = answer(s, "roll");
    expect(s.race!.finishers).toEqual(["twin"]);
    expect(s.winners).not.toContain("twin");
    expect(points(s, "p2")).toBe(0);
    expect(s.log.find((l) => l.fx?.kind === "podium")?.fx).toMatchObject({
      places: [],
    });
  });
  it("扫兴者场上仅剩自己时不因空集合取消", () => {
    let s = make(["sw_spoilsport", "twin", "banana"], [0, 4, 20], [2]);
    s = snap(s, (x) => {
      tok(x, "twin").out = true;
      tok(x, "banana").place = 1;
      tok(x, "banana").pos = 30;
      x.race!.finishers = ["banana"];
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_spoilsport").pos).toBe(2);
    expect(s.race!.over).toBe(false);
  });
  it("候补演员赛前选对手id，复制炼金术士后使用现有主移动选择", () => {
    let s = testRace({
      racers: ["sw_understudy", "alchemist", "banana"],
      secondWindPreview: true,
      rolls: [1],
    });
    expect(s.pending?.kind).toBe("understudy");
    expect(s.pending?.options.map((o) => o.value)).toEqual([
      "alchemist",
      "banana",
    ]);
    s = answer(s, "alchemist");
    s = answer(s, "roll");
    s = answer(s, "yes");
    expect(tok(s, "sw_understudy").pos).toBe(4);
    expect(tok(s, "sw_understudy").base).toBe("alchemist");
  });
  it("候补演员复制西西弗斯获得自己的赛前4分；复制关系户宝宝定位弯道", () => {
    let s = testRace({
      racers: ["sw_understudy", "sisyphus", "twin"],
      secondWindPreview: true,
    });
    s = answer(s, "sisyphus");
    expect(points(s, "p1")).toBe(4);
    expect(points(s, "p2")).toBe(4);
    let n = testRace({
      racers: ["sw_understudy", "sw_nepo_baby", "twin"],
      secondWindPreview: true,
    });
    n = answer(n, "sw_nepo_baby");
    expect(tok(n, "sw_understudy").pos).toBe(12);
  });
  it("候补演员等神秘蛋揭晓后复制其实际能力，不再次抽走牌堆", () => {
    let s = testRace({
      racers: ["sw_understudy", "egg", "banana"],
      secondWindPreview: true,
    });
    expect(s.pending?.kind).toBe("egg");
    const picked = s.pending!.options[0].value;
    s = answer(s, picked);
    expect(s.pending?.kind).toBe("understudy");
    const count = s.deck.length;
    s = answer(s, "egg");
    expect(tok(s, "sw_understudy").base).toBe(picked);
    expect(s.deck.length).toBe(count);
  });
  it("双胞胎复制候补演员，也进行本场复制，选择权限和快照恢复正确", () => {
    let s = testRace({
      racers: ["twin", "alchemist", "banana"],
      winners: ["sw_understudy"],
      secondWindPreview: true,
    });
    s = answer(s, "sw_understudy");
    expect(s.pending?.kind).toBe("understudy");
    expect(viewForMA(s, "p2").pending?.options).toEqual([]);
    expect(() =>
      reduceMA(s, { type: "ANSWER", player: "p2", value: "banana" }),
    ).toThrow();
    s = answer(restore(s), "banana");
    expect(tok(s, "twin").base).toBe("banana");
  });
  it("咬痕最终1或2变身，当前主移动经过的对手淘汰", () => {
    const s = answer(
      make(["sw_bite_mark", "twin", "banana"], [0, 1, 20], [2]),
      "roll",
    );
    expect(tok(s, "sw_bite_mark").secondWind?.wereMouth).toBe(true);
    expect(tok(s, "twin").out).toBe(true);
    expect(tok(s, "sw_bite_mark").pos).toBe(2);
    const power = s.log.findIndex(
      (l) => l.fx?.kind === "power" && l.fx.power === "sw_bite_mark",
    );
    expect(s.log.findIndex((l) => l.fx?.kind === "out")).toBeGreaterThan(power);
  });
  it("咬痕3点不变身，旧2被重掷成4不变身", () => {
    expect(
      tok(
        answer(
          make(["sw_bite_mark", "twin", "banana"], [0, 1, 20], [3]),
          "roll",
        ),
        "twin",
      ).out,
    ).toBe(false);
    let s = answer(
      make(["sw_bite_mark", "dicemonger", "banana"], [0, 10, 20], [2, 4]),
      "roll",
    );
    s = answer(s, "dicemonger");
    expect(tok(s, "sw_bite_mark").secondWind?.wereMouth).not.toBe(true);
  });
  it("咬痕变身保存后，后续额外箭头移动也淘汰经过者；停同格不淘汰", () => {
    let s = make(["sw_bite_mark", "twin", "banana"], [3, 8, 20], [4], {
      track: "wild",
    });
    s = snap(s, (x) => {
      tok(x, "sw_bite_mark").secondWind = { wereMouth: true };
    });
    s = answer(restore(s), "roll");
    expect(tok(s, "sw_bite_mark").pos).toBe(10);
    expect(tok(s, "twin").out).toBe(true);
    const same = answer(
      make(["sw_bite_mark", "twin", "banana"], [0, 2, 20], [2]),
      "roll",
    );
    expect(tok(same, "twin").out).toBe(false);
  });
  it("咬痕冲线经过也淘汰，较真怪阻止过头时不误淘汰", () => {
    let s = make(["sw_bite_mark", "twin", "banana"], [28, 29, 10], [2]);
    s = answer(s, "roll");
    expect(tok(s, "twin").out).toBe(true);
    expect(tok(s, "sw_bite_mark").place).toBe(1);
    let blocked = make(["sw_bite_mark", "twin", "stickler"], [28, 29, 10], [3]);
    blocked = snap(blocked, (x) => {
      tok(x, "sw_bite_mark").secondWind = { wereMouth: true };
    });
    blocked = answer(blocked, "roll");
    expect(tok(blocked, "twin").out).toBe(false);
  });
  it("骰子先生只可选出现至少两次的数字，六骰消费和恢复不重复", () => {
    let s = answer(
      make(
        ["sw_mr_dice_guy", "twin", "banana"],
        [0, 10, 20],
        [2, 2, 3, 3, 4, 5],
      ),
      "roll",
    );
    expect(s.pending?.kind).toBe("dice_pool");
    expect(s.pending?.options.map((o) => o.value)).toEqual(["2", "3"]);
    expect(() => answer(s, "4")).toThrow();
    s = answer(restore(s), "3");
    expect(tok(s, "sw_mr_dice_guy").pos).toBe(3);
    expect(s.forcedRolls).toHaveLength(0);
  });
  it("用户裁定：六骰全不重复则整组重掷，直到有重复数字", () => {
    let s = answer(
      make(
        ["sw_mr_dice_guy", "twin", "banana"],
        [0, 10, 20],
        [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 4, 4, 2, 3, 5, 6],
      ),
      "roll",
    );
    expect(s.pending?.options.map((o) => o.value)).toEqual(["4"]);
    s = answer(s, "4");
    expect(tok(s, "sw_mr_dice_guy").pos).toBe(4);
    expect(s.forcedRolls).toHaveLength(0);
  });
  it("骰子先生受惊艳者影响，六颗均为1，主移动仍正常选择", () => {
    let s = answer(
      make(
        ["sw_mr_dice_guy", "sw_stunner", "banana"],
        [0, 1, 20],
        [6, 5, 4, 3, 2, 1],
      ),
      "roll",
    );
    expect(s.pending?.options.map((o) => o.value)).toEqual(["1"]);
    s = answer(s, "1");
    expect(tok(s, "sw_mr_dice_guy").pos).toBe(1);
  });
  it("派对扫兴鬼让所有6重掷并每次走1，最后骰才触发主移动", () => {
    const s = answer(
      make(["twin", "sw_party_pooper", "lackey"], [10, 0, 20], [6, 6, 3]),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(13);
    expect(tok(s, "sw_party_pooper").pos).toBe(2);
    expect(tok(s, "lackey").pos).toBe(20);
    expect(powers(s, "sw_party_pooper")).toHaveLength(2);
  });
  it("派对扫兴鬼对自己的6也生效；不是6不移动", () => {
    const s = answer(
      make(["sw_party_pooper", "twin", "banana"], [0, 10, 20], [6, 3]),
      "roll",
    );
    expect(tok(s, "sw_party_pooper").pos).toBe(4);
    const no = answer(
      make(["twin", "sw_party_pooper", "banana"], [10, 0, 20], [3]),
      "roll",
    );
    expect(powers(no, "sw_party_pooper")).toHaveLength(0);
  });
  it("派对扫兴鬼也重掷宿敌辅助骰，但不会让宿敌递归跟自己", () => {
    let s = answer(
      make(["twin", "sw_nemesis", "sw_party_pooper"], [10, 0, 20], [3, 6, 3]),
      "roll",
    );
    s = answer(s, "yes");
    expect(tok(s, "sw_nemesis").pos).toBe(3);
    expect(tok(s, "sw_party_pooper").pos).toBe(21);
  });
  it("惊艳者已把6视为1时不再强制重掷", () => {
    const s = answer(
      make(["twin", "sw_stunner", "sw_party_pooper"], [0, 1, 20], [6]),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(1);
    expect(tok(s, "sw_party_pooper").pos).toBe(20);
  });
  it("扫兴者恰好落后所有其他人5格即取消，保留积分，加3分不发金银牌", () => {
    let s = make(["sw_spoilsport", "twin", "banana"], [0, 4, 20], [2]);
    s = snap(s, (x) => {
      tok(x, "twin").pos = 5;
      x.players[0].chips = [{ kind: "bronze", value: 1, race: 0 }];
      x.players[1].chips = [{ kind: "bronze", value: 2, race: 0 }];
    });
    s = answer(s, "roll"); // snapshot is replayed from turn start; cancellation precedes this unused answer.
    expect(s.race!.over).toBe(true);
    expect(points(s, "p1")).toBe(4);
    expect(points(s, "p2")).toBe(2);
    expect(s.log.find((l) => l.fx?.kind === "podium")?.text).toContain("已取消");
    expect(
      s.players.flatMap((p) => p.chips).every((c) => c.kind === "bronze"),
    ).toBe(true);
  });
  it("扫兴者若有人只领先4格、同格或后方则不取消", () => {
    const s = make(["sw_spoilsport", "twin", "banana"], [0, 4, 20], [2]);
    expect(s.pending?.kind).toBe("main");
    expect(s.race!.over).toBe(false);
  });
  it("扫兴者摔倒回合也先检查取消，正常取消仍有4场框架", () => {
    const s = make(["sw_spoilsport", "twin", "banana"], [0, 5, 20], [2], {
      tripped: [true, false, false],
    });
    expect(s.race!.over).toBe(true);
    expect(s.phase).toBe("choose");
    expect(points(s, "p1")).toBe(3);
  });
});
