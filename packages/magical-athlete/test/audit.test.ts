/**
 * 2026 规则审计：每名选手「应当触发 / 不应触发 / 非自己回合 / 离场后 / 冲突」。
 * 规则依据见 docs/magical-athlete/CHARACTER_RULE_MATRIX.md。
 */
import { describe, expect, it } from "vitest";
import { reduceMA, testRace, total } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";
import { answer, logText, tok } from "./helpers.ts";

const F = "twin"; // 没有前冠军时没有能力的陪跑
const G = "lovable_loser"; // 第二个陪跑（只有「独自垫底」时得分，不移动别人）
const race = (racers: string[], pos: number[], rolls: number[], extra: object = {}) =>
  testRace({ racers, pos, rolls, skipSetup: true, ...extra });
const roll = (s: MAState) => {
  expect(s.pending?.kind).toBe("main");
  return answer(s, "roll");
};
const keep = (s: MAState) => (s.pending?.kind === "reroll" ? answer(s, "keep") : s);
const chips = (s: MAState, id: string) => total(s.players.find((p) => p.id === id)!.chips);

describe("移动类型：主移动 / 技能移动 / 赛道移动 / 传送 / 位置调整", () => {
  it("传送不算经过：催眠师把香蕉身后的选手拉到前面，不摔倒", () => {
    const s = answer(race(["hypnotist", "banana", F], [10, 5, 0], []), F);
    expect(tok(s, F).pos).toBe(10);
    expect(tok(s, F).tripped).toBe(false);
  });
  it("从同一格出发不算经过（同格不算在后面）", () => {
    const s = roll(race([F, "banana", G], [5, 5, 0], [3]));
    expect(tok(s, F).tripped).toBe(false);
  });
  it("移动途中短暂同格不算停在同格：穿过芭芭雅嘎的格子不摔倒", () => {
    const s = roll(race([F, "baba_yaga", G], [0, 2, 0], [4]));
    expect(tok(s, F).pos).toBe(4);
    expect(tok(s, F).tripped).toBe(false);
  });
  it("后退不会经过任何人：被半人马踢退不触发香蕉", () => {
    const s = roll(race(["centaur", F, "banana"], [3, 4, 2], [2]));
    // 半人马 3→5 经过陪跑(4)，陪跑 −2 回到 2（香蕉格），后退不算经过香蕉
    expect(tok(s, F).pos).toBe(2);
    expect(tok(s, F).tripped).toBe(false);
  });
  it("位置调整（巨婴挤到身后）算停在那一格：停到芭芭雅嘎格子照样摔倒", () => {
    const s = roll(race([F, "huge_baby", "baba_yaga"], [0, 5, 4], [5]));
    expect(tok(s, F).pos).toBe(4);
    expect(tok(s, F).tripped).toBe(true);
  });
  it("赛道箭头是独立的移动：黏黏怪不再 −1，教练不再 +1", () => {
    const s = roll(race([F, "gunk", G], [3, 20, 0], [5], { track: "wild" }));
    // 主移动 5−1=4 → 第 7 格（+3 箭头）→ 第 10 格
    expect(tok(s, F).pos).toBe(10);
  });
  it("移动 0 不算移动：黏黏怪把 1 点减成 0，不触发任何停格能力", () => {
    const s = roll(race([F, "gunk", "romantic"], [3, 3, 0], [1]));
    expect(tok(s, F).pos).toBe(3);
    expect(tok(s, "romantic").pos).toBe(0);
  });
});

describe("掷骰与重掷", () => {
  it("重掷后旧点数不算：先掷 6 重掷成 3，跟班不跑", () => {
    let s = roll(race([F, "dicemonger", "lackey"], [0, 10, 5], [6, 3]));
    s = answer(s, "dicemonger");
    expect(tok(s, "lackey").pos).toBe(5);
    expect(tok(s, F).pos).toBe(3);
  });
  it("重掷后旧点数不算：先掷 1 重掷成 4，尺蠖不动、船长不插队", () => {
    let s = roll(race([F, "dicemonger", "inchworm", "skipper"], [0, 10, 5, 7], [1, 4]));
    s = answer(s, "dicemonger");
    expect(tok(s, "inchworm").pos).toBe(5);
    expect(tok(s, F).pos).toBe(4);
    expect(s.race!.current).toBe("p2");
  });
  it("骰贩子：每回合只能借一次；自己重掷不移动；挪挪每次重掷都蹭", () => {
    let s = roll(race(["dicemonger", "scoocher", G], [0, 10, 0], [2, 3]));
    s = answer(s, "dicemonger");
    expect(tok(s, "dicemonger").pos).toBe(3);
    expect(tok(s, "scoocher").pos).toBe(11);
  });
  it("魔术师 × 骰贩子：最多 2+1 次重掷，挪挪每次都蹭（即使结果没被采用）", () => {
    let s = roll(race(["magician", "dicemonger", "scoocher"], [0, 10, 20], [1, 2, 3, 4]));
    s = answer(s, "magician");
    s = answer(s, "magician");
    s = answer(s, "dicemonger");
    expect(s.pending?.kind).not.toBe("reroll");
    expect(tok(s, "magician").pos).toBe(4);
    expect(tok(s, "dicemonger").pos).toBe(11);
    expect(tok(s, "scoocher").pos).toBe(23);
  });
  it("黏黏怪改的是格数不是点数：掷 6 只走 5，但跟班照样触发", () => {
    const s = roll(race([F, "gunk", "lackey"], [0, 20, 10], [6]));
    expect(tok(s, F).pos).toBe(5);
    expect(tok(s, "lackey").pos).toBe(12);
  });
  it("船长 × 尺蠖：别人掷 1 → 尺蠖走 1，然后船长行动", () => {
    const s = roll(race([F, "inchworm", "skipper"], [0, 5, 10], [1]));
    expect(tok(s, "inchworm").pos).toBe(6);
    expect(tok(s, F).pos).toBe(0);
    expect(s.race!.current).toBe("p3");
  });
  it("船长自己掷 1：再行动一次", () => {
    const s = roll(race(["skipper", F, G], [0, 10, 10], [1]));
    expect(s.race!.current).toBe("p1");
  });
});

describe("非自己回合与离场", () => {
  it("香蕉在别人回合也会绊倒经过者；冲线后不再生效", () => {
    let s = roll(race([F, "banana", G], [0, 3, 0], [5]));
    expect(tok(s, F).tripped).toBe(true);
    s = roll(race([F, "banana", G], [10, 27, 0], [5, 4]));
    expect(tok(s, F).tripped).toBe(false); // 香蕉已在先前位置？这里香蕉 27 在前方，被经过
  });
  it("离场选手的能力停止：被吞掉的跟班不再因掷 6 移动", () => {
    let s = roll(race(["mouth", "lackey", F], [0, 3, 0], [3, 6]));
    expect(tok(s, "lackey").out).toBe(true);
    s = roll(s); // 跟班已出局，轮到陪跑掷 6
    expect(tok(s, "lackey").pos).toBe(3);
  });
  it("已冲线选手的能力停止：冲线的挪挪不再蹭", () => {
    let s = roll(race(["scoocher", F, "gunk"], [28, 0, 0], [2, 3]));
    expect(tok(s, "scoocher").place).toBe(1);
    s = roll(s);
    expect(tok(s, "scoocher").pos).toBe(30);
  });
  it("决斗者在别人回合也能决斗；平局决斗者赢", () => {
    let s = roll(race([F, "duelist", G], [0, 3, 0], [3, 2, 2]));
    expect(s.pending?.player).toBe("p2");
    s = answer(s, F);
    expect(tok(s, "duelist").pos).toBe(5);
  });
  it("不想决斗可以不决斗（可选能力）", () => {
    let s = roll(race([F, "duelist", G], [0, 3, 0], [3]));
    s = answer(s, "no");
    expect(tok(s, "duelist").pos).toBe(3);
  });
});

describe("应当触发 / 不应触发", () => {
  it("炼金术士：掷 3 不触发", () => {
    const s = roll(race(["alchemist", F, G], [0, 10, 10], [3]));
    expect(s.pending?.kind).not.toBe("alchemist");
    expect(tok(s, "alchemist").pos).toBe(3);
  });
  it("芭芭雅嘎：自己停到别人格子上，绊倒对方", () => {
    const s = roll(race(["baba_yaga", F, G], [0, 3, 10], [3]));
    expect(tok(s, F).tripped).toBe(true);
    expect(tok(s, "baba_yaga").tripped).toBe(false);
  });
  it("芭芭雅嘎 × 催眠师：被拉到催眠师格子上，催眠师自己摔倒", () => {
    const s = answer(race(["hypnotist", "baba_yaga", G], [10, 3, 0], []), "baba_yaga");
    expect(tok(s, "hypnotist").tripped).toBe(true);
  });
  it("香蕉 × 半人马：半人马经过香蕉，香蕉后退 2、半人马摔倒", () => {
    const s = roll(race(["centaur", "banana", G], [0, 3, 20], [5]));
    expect(tok(s, "banana").pos).toBe(1);
    expect(tok(s, "centaur").tripped).toBe(true);
  });
  it("半人马一次经过多人，每人 −2", () => {
    const s = roll(race(["centaur", F, G], [0, 2, 3], [5]));
    expect(tok(s, F).pos).toBe(0);
    expect(tok(s, G).pos).toBe(1);
  });
  it("啦啦队长：自己是最后一名时先走 2 再走 1", () => {
    const s = answer(race(["cheerleader", F, G], [0, 5, 5], []), "yes");
    expect(tok(s, "cheerleader").pos).toBe(3);
  });
  it("教练：不在教练格子上的人没有加成；技能移动没有加成", () => {
    let s = roll(race([F, "coach", G], [0, 5, 0], [3]));
    expect(tok(s, F).pos).toBe(3);
    s = roll(race([F, "coach", "lackey"], [4, 4, 4], [6]));
    expect(tok(s, "lackey").pos).toBe(6); // 跟班 +2 是技能移动，不加教练
  });
  it("山寨猫 × 巨婴：复制到巨婴的能力后别人不能与它同格（复制来的能力优先）", () => {
    // 巨婴在 12 独自领先 → 山寨猫（9）拥有巨婴的能力；陪跑 6+3=9 被放到 8
    const s = roll(race([F, "huge_baby", "copycat"], [6, 12, 9], [3]));
    expect(tok(s, F).pos).toBe(8);
  });
  it("山寨猫：自己独自领先时没有可复制的人", () => {
    const s = race(["copycat", "legs", G], [10, 0, 0], []);
    expect(s.pending?.options.map((o) => o.value)).not.toContain("legs");
  });
  it("神秘蛋选到西西弗斯：仍拿到赛前 4 个筹码", () => {
    let s = testRace({ racers: ["egg", F, G], rolls: [] });
    // 让抽到的牌里一定有西西弗斯：直接改牌堆顶
    expect(s.pending?.kind).toBe("egg");
    const opts = s.pending!.options.map((o) => o.value);
    if (opts.includes("sisyphus")) {
      s = answer(s, "sisyphus");
      expect(chips(s, "p1")).toBe(4);
    }
  });
  it("人字拖：交换后两人都算停在新格子（芭芭雅嘎照样绊倒）", () => {
    const s = answer(race(["flip_flop", "baba_yaga", G], [3, 10, 3], []), "flip:baba_yaga");
    expect(tok(s, "flip_flop").pos).toBe(10);
    expect(tok(s, "baba_yaga").pos).toBe(3);
    expect(tok(s, G).tripped).toBe(true);
  });
  it("天才：猜错不再行动", () => {
    let s = answer(race(["genius", F, G], [0, 20, 20], [3]), "5");
    s = roll(s);
    expect(s.race!.current).toBe("p2");
  });
  it("兔子：并列领先时照常移动", () => {
    const s = roll(race(["hare", F, G], [10, 10, 0], [1]));
    expect(tok(s, "hare").pos).toBe(13);
  });
  it("巨婴：起点可以同格", () => {
    const s = race(["hypnotist", "huge_baby", F], [0, 0, 5], []);
    expect(tok(s, "hypnotist").pos).toBe(0);
  });
  it("巨婴：它自己停到别人格子上，别人被挤到它身后", () => {
    const s = roll(race(["huge_baby", F, G], [0, 4, 0], [4]));
    expect(tok(s, F).pos).toBe(3);
  });
  it("跳跳蟾 × 较真怪：跳过人后会走过头就不动", () => {
    const s = roll(race(["leaptoad", "stickler", G], [26, 0, 28], [4]));
    expect(tok(s, "leaptoad").pos).toBe(26);
  });
  it("较真怪自己可以走过头冲线", () => {
    const s = roll(race(["stickler", F, G], [27, 0, 0], [6]));
    expect(tok(s, "stickler").place).toBe(1);
  });
  it("较真怪 × 能力移动：跟班 +2 走过头也不动", () => {
    const s = roll(race([F, "stickler", "lackey"], [0, 0, 29], [6]));
    expect(tok(s, "lackey").pos).toBe(29);
  });
  it("可爱废柴：并列垫底不得分", () => {
    const s = race(["lovable_loser", F, G], [0, 0, 5], []);
    expect(chips(s, "p1")).toBe(0);
  });
  it("军师：预测自己并夺冠，同时拿第 1 和第 2", () => {
    let s = race(["mastermind", F, G], [28, 0, 0], [3]);
    s = answer(s, "mastermind");
    s = roll(s);
    expect(s.race!.over).toBe(true);
    expect(chips(s, "p1")).toBe(4);
  });
  it("血盆大口：格子上有两人时不吞", () => {
    const s = roll(race(["mouth", F, G], [0, 3, 3], [3]));
    expect(tok(s, F).out).toBe(false);
    expect(tok(s, G).out).toBe(false);
  });
  it("血盆大口 × 巨婴：停到巨婴格子会被挤到身后，再看身后那格有没有恰好一人", () => {
    const s = roll(race(["mouth", "huge_baby", G], [0, 4, 3], [4]));
    expect(tok(s, "mouth").pos).toBe(3);
    expect(tok(s, G).out).toBe(true);
  });
  it("血盆大口：起点也是一格，退回起点时同样会吞（规则书：起点算一格，没有例外）", () => {
    const s = roll(race(["centaur", "mouth", G], [0, 1, 0], [3]));
    // 半人马经过血盆大口，它 −2 回到起点（起点上只有陪跑一人）→ 吞掉陪跑
    expect(tok(s, "mouth").pos).toBe(0);
    expect(tok(s, G).out).toBe(true);
  });
  it("浪漫者：自己停进恰好一人的格子也触发", () => {
    const s = roll(race(["romantic", F, G], [0, 3, 10], [3]));
    expect(tok(s, "romantic").pos).toBe(5);
  });
  it("浪漫者：停进三人格子不触发", () => {
    const s = roll(race([F, "romantic", G, "lackey"], [0, 10, 3, 3], [3]));
    expect(tok(s, "romantic").pos).toBe(10);
  });
  it("西西弗斯：筹码已经没有时掷 6 仍回起点（设计师 BGG 澄清）", () => {
    let s = race(["sisyphus", F, G], [10, 0, 0], [6]);
    s.players[0].chips = [];
    s = roll(s);
    expect(tok(s, "sisyphus").pos).toBe(0);
    expect(chips(s, "p1")).toBe(0);
  });
  it("西西弗斯：掷 6 后这次主移动被替代，不会再走 6 格", () => {
    const s = roll(testRace({ racers: ["sisyphus", F, G], pos: [10, 0, 0], rolls: [6] }));
    expect(tok(s, "sisyphus").pos).toBe(0);
    expect(logText(s)).not.toMatch(/西西弗斯 主移动/);
  });
  it("电灯泡：自己所在格子不算目标", () => {
    const s = race(["third_wheel", F, G], [5, 5, 0], [1]);
    expect(s.pending?.kind).toBe("main");
  });
  it("毒舌喷子：摔倒爬起的选手（原地不动）也触发", () => {
    const s = answer(race([F, "heckler", G], [3, 10, 0], [], { tripped: [true, false, false] }));
    expect(tok(s, "heckler").pos).toBe(12);
  });
  it("吸盘鱼：可以不跟", () => {
    let s = roll(race([F, "suckerfish", G], [4, 4, 20], [3]));
    s = answer(s, "no");
    expect(tok(s, "suckerfish").pos).toBe(4);
  });
  it("吸盘鱼：借别人冲过终点", () => {
    let s = roll(race([F, "suckerfish", G], [27, 27, 0], [5]));
    s = answer(s, "yes");
    expect(tok(s, "suckerfish").place).toBe(2);
    expect(s.race!.over).toBe(true);
  });
  it("挪挪 × 吸盘鱼：反复互相触发但局面一直在变，不算循环", () => {
    // 吸盘鱼跟着挪挪移动 → 挪挪蹭 → 吸盘鱼又跟……一路前进直到冲线
    let s = roll(race([F, "scoocher", "suckerfish", "gunk"], [0, 5, 5, 20], [3]));
    let n = 0;
    while (s.pending?.kind === "suckerfish" && n++ < 60) s = answer(s, "yes");
    expect(logText(s)).not.toContain("循环");
    expect(tok(s, "scoocher").pos).toBeGreaterThan(6);
  });
});

describe("命令校验与重复提交", () => {
  it("不是自己的决定会被拒绝；没有待决定事项时回答会被拒绝", () => {
    const s = race([F, "duelist", G], [0, 3, 0], []);
    expect(() => reduceMA(s, { type: "ANSWER", player: "p2", value: "roll" })).toThrow();
    expect(() => reduceMA(s, { type: "ANSWER", player: "p1", value: "nonsense" })).toThrow();
  });
  it("同一个回答提交两次，第二次因版本号过期被房间拒绝（见 ma-rooms.test）；引擎层第二次只会作为下一个决定处理", () => {
    const s = roll(race([F, G, "lackey"], [0, 0, 0], [3, 4]));
    expect(s.race!.current).toBe("p2");
  });
});

describe("同时到达（规则书 Fiddly Details #3 + 浪漫者说明）", () => {
  it("浪漫者 × 吸盘鱼：两人一起停到空格（恰好两人），浪漫者触发两次", () => {
    let s = roll(race([F, "suckerfish", "romantic"], [4, 4, 20], [3]));
    s = answer(s, "yes");
    expect(tok(s, "suckerfish").pos).toBe(7);
    expect(tok(s, "romantic").pos).toBe(24);
  });
  it("血盆大口 × 吸盘鱼：一起到达有一人的格子 → 格子上有两名其他选手，不吞", () => {
    let s = roll(race(["mouth", "suckerfish", G], [0, 0, 3], [3]));
    s = answer(s, "yes");
    expect(tok(s, G).out).toBe(false);
    expect(tok(s, "suckerfish").out).toBe(false);
  });
  it("巨婴：两人一起到达它的格子，都被放到它身后", () => {
    let s = roll(race([F, "suckerfish", "huge_baby"], [2, 2, 5], [3]));
    s = answer(s, "yes");
    expect(tok(s, F).pos).toBe(4);
    expect(tok(s, "suckerfish").pos).toBe(4);
  });
  it("吸盘鱼跟随时同样会被香蕉绊倒（它也经过了香蕉）", () => {
    let s = roll(race([F, "suckerfish", "banana"], [0, 0, 2], [4]));
    s = answer(s, "yes");
    expect(tok(s, F).tripped).toBe(true);
    expect(tok(s, "suckerfish").tripped).toBe(true);
  });
  it("挪挪 × 浪漫者：浪漫者每次发动，挪挪都蹭 1 格", () => {
    const s = roll(race([F, "romantic", "scoocher", G], [0, 20, 10, 3], [3]));
    expect(tok(s, "romantic").pos).toBe(22);
    expect(tok(s, "scoocher").pos).toBe(11);
  });
});
