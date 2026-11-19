import { describe, expect, it } from "vitest";
import { CARDS, createSK, reduceSK, resolveTrick, legalPlays, countsFor, deckFor, scoreRow, DEFAULT_SETTINGS, viewForSK, type Played, type SKState } from "../src/index.ts";
import { botMove } from "../src/bot.ts";

const S = { green: 0, purple: 14, yellow: 28, black: 42 } as const;
const n = (suit: keyof typeof S, v: number) => S[suit] + v - 1;
const ESC = [56, 57, 58, 59, 60];
const PIR = { rosie: 61, bendt: 62, rascal: 63, juanita: 64, harry: 65 };
const TIG = 66, KING = 67, MER = [68, 69], KRAKEN = 70, WHALE = 71, LOOT = [72, 73];
const t = (...cards: [number, number, ("pirate" | "escape")?][]): Played[] => cards.map(([seat, id, as]) => ({ seat, id, ...(as ? { as } : {}) }));

describe("牌库", () => {
  it("基础 70 张，扩展最多 74 张", () => {
    expect(CARDS.length).toBe(74);
    expect(deckFor(DEFAULT_SETTINGS).length).toBe(70);
    expect(deckFor({ kraken: true, whale: true, loot: true }).length).toBe(74);
  });
  it("8 人局最后几轮重复 8 张；7 人 10 张够", () => {
    expect(countsFor(8, DEFAULT_SETTINGS)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 8]);
    expect(countsFor(7, DEFAULT_SETTINGS)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("吃墩判定（规则书例子）", () => {
  it("绿7 绿12 绿8 → 12 赢", () => expect(resolveTrick(t([0, n("green", 7)], [1, n("green", 12)], [2, n("green", 8)])).winner).toBe(1));
  it("黄12 黄5 紫14 → 不同色输", () => expect(resolveTrick(t([0, n("yellow", 12)], [1, n("yellow", 5)], [2, n("purple", 14)])).winner).toBe(0));
  it("黄12 黄5 黑2 → 王牌赢", () => expect(resolveTrick(t([0, n("yellow", 12)], [1, n("yellow", 5)], [2, n("black", 2)])).winner).toBe(2));
  it("海盗相同：先出赢", () => expect(resolveTrick(t([0, n("black", 14)], [1, PIR.rosie], [2, PIR.harry])).winner).toBe(1));
  it("骷髅王 > 海盗（含母老虎当海盗）", () => expect(resolveTrick(t([0, TIG, "pirate"], [1, KING])).winner).toBe(1));
  it("美人鱼 < 海盗", () => expect(resolveTrick(t([0, MER[0]], [1, PIR.bendt])).winner).toBe(1));
  it("两条美人鱼：先出赢", () => expect(resolveTrick(t([0, n("black", 3)], [1, MER[1]], [2, MER[0]])).winner).toBe(1));
  it("三者同墩：美人鱼赢，只算 +40", () => {
    const r = resolveTrick(t([0, n("yellow", 14)], [1, PIR.rosie], [2, KING], [3, MER[0]]));
    expect(r.winner).toBe(3);
    expect(r.bonus.map((b) => b.pts).sort()).toEqual([10, 40]);
  });
  it("全是逃跑：首出赢", () => expect(resolveTrick(t([0, ESC[0]], [1, TIG, "escape"], [2, ESC[1]])).winner).toBe(0));
  it("逃跑引牌：下一张数字定花色", () => {
    const tr = t([0, ESC[0]], [1, n("green", 3)]);
    expect(legalPlays([n("green", 9), n("purple", 14)], tr)).toEqual([n("green", 9)]);
    expect(resolveTrick([...tr, ...t([2, n("purple", 14)])]).winner).toBe(1);
  });
  it("角色引牌：无须跟色", () => expect(legalPlays([n("green", 9), n("purple", 14)], t([0, PIR.rosie])).length).toBe(2));
  it("特殊牌随时可出", () => expect(legalPlays([n("green", 9), ESC[0], KING], t([0, n("green", 3)]))).toEqual([n("green", 9), ESC[0], KING]));
  it("奖励分：14 与角色", () => {
    expect(resolveTrick(t([0, n("black", 14)], [1, n("black", 2)])).bonus).toEqual([{ label: "黑色 14", pts: 20 }]);
    expect(resolveTrick(t([0, PIR.rosie], [1, PIR.harry], [2, KING])).bonus[0].pts).toBe(60);
    expect(resolveTrick(t([0, MER[0]], [1, MER[1]], [2, PIR.harry])).bonus[0].pts).toBe(40);
  });
  it("母老虎当逃跑被吃不给奖励", () => expect(resolveTrick(t([0, TIG, "escape"], [1, KING])).bonus).toEqual([]));
});

describe("巨兽", () => {
  it("克拉肯：没人赢，本该赢的人带下一墩", () => {
    const r = resolveTrick(t([0, n("yellow", 12)], [1, n("black", 3)], [2, KRAKEN]));
    expect(r.winner).toBeNull();
    expect(r.next).toBe(1);
  });
  it("白鲸：特殊失效，最大数字赢（规则书例子）", () => {
    const r = resolveTrick(t([0, n("black", 2)], [1, PIR.rosie], [2, n("yellow", 14)], [3, KING], [4, WHALE]));
    expect(r.winner).toBe(2);
  });
  it("白鲸：只有特殊牌则作废，白鲸主人带下一墩", () => {
    const r = resolveTrick(t([0, PIR.rosie], [1, WHALE], [2, KING]));
    expect(r.winner).toBeNull();
    expect(r.next).toBe(1);
  });
  it("FAQ：白鲸后出克拉肯 → 克拉肯生效，黑3 的人带下一墩", () => {
    const r = resolveTrick(t([0, n("yellow", 12)], [1, n("black", 3)], [2, WHALE], [3, KRAKEN]));
    expect(r.destroyed).toBe("kraken");
    expect(r.next).toBe(1);
  });
  it("FAQ：白鲸中途打出，后面的人仍要跟色", () => expect(legalPlays([n("green", 2), n("yellow", 2)], t([0, n("green", 9)], [1, WHALE]))).toEqual([n("green", 2)]));
  it("战利品引牌后全逃跑：战利品主人赢", () => expect(resolveTrick(t([0, LOOT[0]], [1, ESC[0]])).winner).toBe(0));
});

describe("计分", () => {
  const sk = DEFAULT_SETTINGS;
  it("规则书例子", () => {
    expect(scoreRow(sk, 3, { bid: 3, won: 3, bonus: [], rascalBet: null }, 0).total).toBe(60);
    expect(scoreRow(sk, 4, { bid: 2, won: 4, bonus: [], rascalBet: null }, 0).total).toBe(-20);
    expect(scoreRow(sk, 7, { bid: 0, won: 0, bonus: [], rascalBet: null }, 0).total).toBe(70);
    expect(scoreRow(sk, 9, { bid: 0, won: 2, bonus: [], rascalBet: null }, 0).total).toBe(-90);
  });
  it("猜错拿不到奖励", () => expect(scoreRow(sk, 3, { bid: 1, won: 2, bonus: [{ label: "x", pts: 40 }], rascalBet: null }, 0).total).toBe(-10));
  it("无赖计分（例子 B）", () => {
    const r = { ...sk, scoring: "rascal" as const };
    expect(scoreRow(r, 4, { bid: 1, won: 1, bonus: [], rascalBet: null }, 0).total).toBe(40);
    expect(scoreRow(r, 4, { bid: 0, won: 1, bonus: [], rascalBet: null }, 0).total).toBe(20);
    expect(scoreRow(r, 4, { bid: 4, won: 2, bonus: [], rascalBet: null }, 0).total).toBe(0);
  });
  it("炮弹：6 张猜中 90，差 1 得 0", () => {
    const r = { ...sk, scoring: "rascal" as const, cannon: true };
    expect(scoreRow(r, 6, { bid: 3, won: 3, shot: "cannon", bonus: [], rascalBet: null }, 0).total).toBe(90);
    expect(scoreRow(r, 6, { bid: 3, won: 2, shot: "cannon", bonus: [], rascalBet: null }, 0).total).toBe(0);
    expect(scoreRow(r, 6, { bid: 3, won: 2, shot: "grape", bonus: [], rascalBet: null }, 0).total).toBe(30);
  });
  it("战利品结盟 +20 且需猜中", () => {
    expect(scoreRow(sk, 2, { bid: 1, won: 1, bonus: [], rascalBet: null }, 1).total).toBe(40);
  });
});

function playOut(s: SKState) {
  let guard = 0;
  while (s.phase !== "FINISHED" && guard++ < 5000) {
    if (s.phase === "ROUND_END") {
      s = reduceSK(s, { type: "NEXT_ROUND", actor: 0 });
      continue;
    }
    const seats = s.phase === "BID" ? s.players.flatMap((p, i) => (p.bid === null ? [i] : [])) : s.phase === "SHOT" ? s.players.flatMap((p, i) => (p.shot === null ? [i] : [])) : s.phase === "ABILITY" ? [s.ability!.seat] : [s.order[s.trick.length]];
    s = reduceSK(s, botMove(s, seats[0]));
  }
  return s;
}

describe("整局模拟", () => {
  for (const players of [2, 3, 5, 8])
    for (const seed of [1, 7, 42]) {
      it(`${players} 人 种子 ${seed}：所有扩展 + 技能打完不报错`, () => {
        const s = playOut(createSK(Array.from({ length: players }, (_, i) => "P" + i), { seed, settings: { kraken: true, whale: true, loot: true, abilities: true } }));
        expect(s.phase).toBe("FINISHED");
        expect(s.players[0].rows.length).toBe(10);
        expect(s.winners.length).toBeGreaterThan(0);
      });
    }
  it("无赖+炮弹+漩涡方案打完", () => {
    const s = playOut(createSK(["A", "B", "C", "D"], { seed: 3, settings: { scoring: "rascal", cannon: true, schedule: "whirlpool" } }));
    expect(s.phase).toBe("FINISHED");
  });
});

describe("隐藏信息", () => {
  it("下注没齐时看不到别人的数字，看不到别人手牌", () => {
    let s = createSK(["A", "B", "C"], { seed: 5 });
    s = reduceSK(s, { type: "BID", actor: 1, bid: 1 });
    const v = viewForSK(s, 0);
    expect(v.players[1].bid).toBeNull();
    expect(v.players[1].bidDone).toBe(true);
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.players[1].hand));
  });
  it("双人局有灰胡子幽灵并且他排第二个出", () => {
    let s = createSK(["A", "B"], { seed: 9, dealer: 0 });
    s = reduceSK(s, { type: "BID", actor: 0, bid: 0 });
    s = reduceSK(s, { type: "BID", actor: 1, bid: 0 });
    expect(s.order).toEqual([1, 2, 0]);
  });
});
