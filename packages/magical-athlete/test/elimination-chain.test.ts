import { describe, expect, it } from "vitest";
import { testRace, total } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";
import { answer, tok } from "./helpers.ts";
import { checkChainInvariants } from "./chain-invariants.ts";
import { viewForMA } from "../src/privacy.ts";

function edit(s: MAState, change: (s: MAState) => void) {
  change(s);
  const snapshot = JSON.parse(s.turn!.snapshot) as MAState;
  change(snapshot);
  s.turn!.snapshot = JSON.stringify(snapshot);
  return s;
}
function complete(s: MAState) {
  for (let i = 0; s.phase === "race" && i < 1500; i++) {
    const p = s.pending!;
    s = answer(s, p.options.find((o) => o.value === "no")?.value ?? p.options[0].value);
  }
  expect(s.phase).not.toBe("race");
  return s;
}
describe("淘汰与冠军连锁", () => {
  it("船长循环结束后不能立刻从下一人手里再次插队，其他座位仍须得到行动", () => {
    let s = testRace({
      racers: ["skipper", "banana", "inchworm", "sw_stunner", "gunk"],
      pos: [4, 5, 14, 5, 8], track: "wild", secondWindPreview: true, skipSetup: true,
    });
    s = edit(s, (x) => {
      x.race!.firstTurnDone = [...x.seats];
      x.race!.tokens.forEach((t) => { t.started = true; });
    });
    for (let i = 0; i < 16 && s.pending?.player !== "p3"; i++) s = answer(s, "roll");
    expect(s.pending?.player).toBe("p3");
    expect(s.race!.forcedCycleBlocked).toBeDefined();
    for (const seat of [...s.seats, null]) expect(viewForMA(s, seat).race).not.toHaveProperty("forcedCycleBlocked");
  });
  it("循环被阻止后，其他人的实质移动仍可恢复船长合法插队", () => {
    let s = testRace({
      racers: ["skipper", "banana", "inchworm", "sw_stunner", "gunk"],
      pos: [4, 5, 14, 5, 8], rolls: Array(30).fill(1),
      track: "wild", secondWindPreview: true, skipSetup: true,
    });
    s = edit(s, (x) => {
      x.race!.firstTurnDone = [...x.seats];
      x.race!.tokens.forEach((t) => { t.started = true; });
    });
    for (let i = 0; i < 8 && s.pending?.player !== "p2"; i++) s = answer(s, "roll");
    s = edit(s, (x) => { tok(x, "sw_stunner").pos = 10; });
    s = answer(JSON.parse(JSON.stringify(s)), "roll");
    expect(s.pending?.player).toBe("p1");
    expect(s.race!.insertionResume).toBe("p2");
    for (const seat of [...s.seats, null]) expect(viewForMA(s, seat).race).not.toHaveProperty("insertionResume");
  });
  it("替身取得船长后结束重复插队，接回被打断座位之后的正常顺序", () => {
    let s = testRace({
      racers: ["sw_doppelgangster", "sw_spoilsport", "sw_stunner", "huge_baby"],
      pos: [13, 14, 14, 28], track: "wild", secondWindPreview: true, skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "sw_doppelgangster").base = "skipper";
      x.race!.firstTurnDone = [...x.seats];
      x.race!.tokens.forEach((t) => { t.started = true; });
    });
    for (let i = 0; i < 24 && s.pending?.player !== "p3"; i++) s = answer(s, "roll");
    expect(s.pending?.player).toBe("p3");
  });
  it("船长起身后轮到酒店、酒店又让船长插队的闭合循环不会困住其他人", () => {
    let s = testRace({
      racers: ["skipper", "sw_hotel", "suckerfish", "sw_stunner", "huge_baby"],
      pos: [0, 0, 0, 0, 1],
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 35 && s.pending?.player !== "p5"; i++) {
      const p = s.pending!;
      s = answer(s, p.options.find((o) => o.value === "no")?.value ?? p.options[0].value);
    }
    expect(s.pending?.player).toBe("p5");
  });
  it.each(["romantic", "sw_understudy"])("%s被两名巨婴挡回同一双人格，不会递归溢出", (racer) => {
    let s = testRace({
      racers: ["twin", "huge_baby", "copycat", racer],
      pos: [2, 6, 5, 4],
      rolls: [2],
      secondWindPreview: true,
      skipSetup: true,
    });
    if (racer === "sw_understudy")
      s = edit(s, (x) => {
        tok(x, racer).base = "romantic";
      });
    s = answer(s, "roll");
    expect(tok(s, racer).pos).toBe(4);
    expect(s.log.some((l) => l.text.includes("循环"))).toBe(true);
    checkChainInvariants(s);
  });
  it("候补演员的浪漫者循环停止后，另一名浪漫者仍按次序完成有限移动", () => {
    let s = testRace({
      racers: ["sw_understudy", "huge_baby", "copycat", "twin", "romantic"],
      pos: [2, 6, 5, 4, 0],
      rolls: [2],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "sw_understudy").base = "romantic";
      tok(x, "copycat").copyPick = "huge_baby";
    });
    s = answer(s, "roll");
    expect(tok(s, "romantic").pos).toBe(4);
    expect(tok(s, "sw_understudy").pos).toBe(4);
    checkChainInvariants(s);
  });
  it("用户裁定：浪漫者递归取星星只保留一圈所得分", () => {
    let s = testRace({
      racers: ["twin", "huge_baby", "copycat", "romantic"],
      pos: [11, 15, 14, 13],
      rolls: [2],
      track: "wild",
      secondWindPreview: true,
      skipSetup: true,
    });
    s = answer(s, "roll");
    expect(total(s.players[3].chips)).toBe(1);
    expect(s.log.some((l) => l.text.includes("保留"))).toBe(true);
    checkChainInvariants(s);
  });
  it("未开启新角色时也能终止浪漫者被两名巨婴挡回的递归", () => {
    const s = testRace({
      racers: ["twin", "huge_baby", "copycat", "romantic"],
      pos: [2, 6, 5, 4],
      rolls: [2],
      skipSetup: true,
    });
    expect(() => answer(s, "roll")).not.toThrow();
  });
  it("已经进入酒店强制循环的跳蛙先完成起身这一环，再交给下一位", () => {
    let s = testRace({
      racers: ["sw_hopfrog", "sw_hotel", "huge_baby", "sw_stunner", "dicemonger"],
      pos: [0, 0, 1, 0, 0],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "sw_hopfrog").started = true;
      x.race!.firstTurnDone = ["p1"];
      tok(x, "dicemonger").tripped = true;
    });
    s = answer(s, "roll");
    s = answer(s, "dicemonger");
    expect(s.pending?.kind).toBe("standup");
    expect(tok(s, "sw_hopfrog").tripped).toBe(true);
    expect(s.race!.forcedCycle).toBeTypeOf("string");
    s = answer(JSON.parse(JSON.stringify(s)), "ok");
    expect(tok(s, "sw_hopfrog").tripped).toBe(false);
    expect(s.pending?.player).toBe("p2");
  });
  it("多回合强制循环的中间状态可恢复，内部循环快照不发给任何座位", () => {
    let s = testRace({
      racers: ["skipper", "sw_stunner", "huge_baby"],
      pos: [21, 22, 25],
      track: "wild",
      secondWindPreview: true,
      skipSetup: true,
    });
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.race!.forcedCycle).toBeTypeOf("string");
    expect(tok(s, "skipper").pos).toBe(21);
    for (const seat of [...s.seats, null]) expect(viewForMA(s, seat).race).not.toHaveProperty("forcedCycle");
    s = answer(JSON.parse(JSON.stringify(s)), "roll");
    expect(tok(s, "skipper").pos).toBe(22);
    expect(s.pending?.player).toBe("p2");
    expect(s.race!.forcedCycle).toBeUndefined();
  });
  it("固定1点的船长被巨婴和箭头困在21至22格时，其他玩家仍能行动", () => {
    let s = testRace({
      racers: ["skipper", "sw_stunner", "huge_baby"],
      pos: [21, 22, 25],
      track: "wild",
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 8 && s.pending?.player === "p1"; i++) s = answer(s, "roll");
    expect(s.pending?.player).not.toBe("p1");
    expect(s.race!.over).toBe(false);
  });
  it("用户裁定：跳蛙与尺蠖取星星的强制循环保留一圈得分后交给下一位", () => {
    let s = testRace({
      racers: ["sw_hopfrog", "sw_stunner", "inchworm"],
      pos: [12, 13, 13],
      track: "wild",
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 20 && s.race!.current === "p1"; i++) s = answer(s, "roll");
    expect(s.race!.current).toBe("p2");
    expect(total(s.players[2].chips)).toBeGreaterThan(0);
    expect(s.race!.over).toBe(false);
  });
  it("用户裁定：船长13至16格星星循环恰好保留完整一圈的1分", () => {
    let s = testRace({
      racers: ["skipper", "sw_stunner", "banana"],
      pos: [13, 14, 0],
      track: "wild", secondWindPreview: true, skipSetup: true,
    });
    s = edit(s, (x) => { x.race!.firstTurnDone = ["p1"]; tok(x, "skipper").started = true; });
    for (let i = 0; i < 8 && s.race!.current === "p1"; i++) s = answer(s, "roll");
    expect(s.race!.current).toBe("p2");
    expect(tok(s, "skipper").pos).toBe(13);
    expect(total(s.players[0].chips)).toBe(1);
    expect(s.race!.forcedCycle).toBeUndefined();
  });
  it("可以掷出其他点数脱离星星箭头的船长保留后续行动", () => {
    let s = testRace({
      racers: ["skipper", "banana"], pos: [13, 0], rolls: [1, 1, 6],
      track: "wild", secondWindPreview: true, skipSetup: true,
    });
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.race!.current).toBe("p1");
    expect(s.race!.forcedCycle).toBeUndefined();
    s = answer(s, "roll");
    expect(tok(s, "skipper").pos).toBe(21);
    expect(s.race!.current).toBe("p2");
  });
  it("重掷改变循环路线后，按实际重复的一圈停下，不等待未再经过的旧起点", () => {
    let s = testRace({
      racers: ["skipper", "sw_stunner", "inchworm", "dicemonger", "banana"],
      pos: [15, 15, 14, 15, 0], track: "wild", secondWindPreview: true, skipSetup: true,
    });
    s = edit(s, (x) => {
      x.race!.firstTurnDone = [...x.seats];
      x.race!.tokens.forEach((t) => { t.started = true; });
    });
    let usedReroll = false;
    for (let i = 0; i < 16 && s.race!.current === "p1"; i++) {
      const value = s.pending!.kind === "reroll" ? usedReroll ? "keep" : "dicemonger" : "roll";
      if (value === "dicemonger") usedReroll = true;
      s = answer(s, value);
    }
    expect(s.race!.current).toBe("p2");
    expect(tok(s, "dicemonger").pos).toBe(13);
    expect(total(s.players[3].chips)).toBe(1);
  });
  it("宿命对决仍可跟掷脱困时，连续选择不用不会被误当强制永久循环", () => {
    let s = testRace({
      racers: ["skipper", "sw_stunner", "gunk", "scoocher", "sw_nemesis", "banana"],
      pos: [0, 0, 0, 14, 2, 0], rolls: Array(20).fill(1),
      track: "wild", secondWindPreview: true, skipSetup: true,
    });
    for (let i = 0; i < 2; i++) {
      s = answer(s, "roll");
      expect(s.pending?.kind).toBe("nemesis");
      s = answer(s, "no");
      expect(s.race!.current).toBe("p1");
      expect(s.race!.forcedCycle).toBeUndefined();
    }
    s = answer(s, "roll");
    s = answer(s, "yes");
    expect(tok(s, "sw_nemesis").pos).toBe(3);
    expect(s.race!.forcedCycle).toBeUndefined();
  });
  it("宿命对决六种跟掷结果都只能原地或绕星星一圈时，不能继续无限取分", () => {
    let s = testRace({
      racers: ["skipper", "sw_stunner", "gunk", "sw_nemesis", "banana"],
      pos: [0, 0, 0, 13, 0], rolls: Array(60).fill(1),
      track: "wild", secondWindPreview: true, skipSetup: true,
    });
    s = edit(s, (x) => {
      x.race!.firstTurnDone = [...x.seats];
      x.race!.tokens.forEach((t) => { t.started = true; });
    });
    for (let i = 0; i < 16 && s.race!.current === "p1"; i++)
      s = answer(s, s.pending!.kind === "nemesis" ? "yes" : "roll");
    expect(s.race!.current).toBe("p2");
    expect(total(s.players[3].chips)).toBe(1);
    expect(tok(s, "sw_nemesis").pos).toBe(13);
  });
  it("固定六颗1的骰子先生与原地船长不能互相插队困住其他人", () => {
    let s = testRace({
      racers: ["skipper", "sw_mr_dice_guy", "sw_stunner", "gunk"],
      pos: [0, 0, 0, 0],
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 20 && s.pending?.player !== "p3"; i++) s = answer(s);
    expect(s.pending?.player).toBe("p3");
  });
  it("酒店反复绊倒跳蛙且开放重掷不能脱困时，保留一轮后让其他人行动", () => {
    let s = testRace({
      racers: ["sw_hopfrog", "sw_hotel", "huge_baby", "sw_stunner", "dicemonger"],
      pos: [0, 0, 1, 0, 0],
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 20 && s.pending?.player !== "p2"; i++)
      s = answer(s, s.pending?.kind === "reroll" ? "dicemonger" : undefined);
    expect(s.pending?.player).toBe("p2");
    checkChainInvariants(s);
  });
  it.each([10, 28])("裸奔者从%i格经过选手取得的1分不能被结束比赛的连锁吞掉", (pos) => {
    let s = testRace({
      racers: ["sw_streaker", "scoocher", "twin", "banana"],
      pos: [pos, 29, pos === 10 ? 12 : 29, 30],
      rolls: [3],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "banana").place = 1;
      x.race!.finishers = ["banana"];
    });
    s = answer(s, "roll");
    expect(s.race!.over).toBe(true);
    expect(total(s.players[0].chips)).toBe(1);
  });
  it("酒店已经触发的房费不能被结束比赛的连锁跳过", () => {
    let s = testRace({
      racers: ["twin", "sw_hotel", "scoocher", "banana"],
      pos: [10, 12, 29, 30],
      rolls: [2],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "banana").place = 1;
      x.race!.finishers = ["banana"];
      x.players[0].chips = [{ kind: "bronze", value: 2, race: 0 }];
    });
    s = answer(s, "roll");
    expect(s.race!.over).toBe(true);
    expect(total(s.players[0].chips)).toBe(1);
    expect(total(s.players[1].chips)).toBe(1);
  });
  it("复制巨婴的山寨猫被挤回起点后不能把起点选手挤到负一格", () => {
    let s = testRace({
      racers: ["copycat", "huge_baby", "banana"],
      pos: [0, 1, 0],
      rolls: [1],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = answer(s, "roll");
    expect(tok(s, "copycat").pos).toBe(0);
    expect(tok(s, "banana").pos).toBe(0);
    checkChainInvariants(s);
  });
  it("船长插队后仍能前进时，不能因上一名选手被挡回而取消插队", () => {
    let s = testRace({
      racers: ["twin", "skipper", "huge_baby", "sw_stunner"],
      pos: [28, 26, 29, 27],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "skipper").started = true;
    });
    s = answer(s, "roll");
    expect(s.pending?.player).toBe("p2");
    s = answer(s, "roll");
    expect(tok(s, "skipper").pos).toBe(27);
  });
  it("大牌与水管在不同石头格之间交换也无法脱困", () => {
    let s = testRace({
      racers: ["sw_the_hose", "sw_diva"],
      pos: [5, 26],
      tripped: [true, true],
      track: "wild",
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 20 && s.phase === "race"; i++) s = answer(s);
    expect(s.race!.over).toBe(true);
  });
  it("固定1点的船长与另一名被巨婴挡回的选手不能互相插队困住其他人", () => {
    let s = testRace({
      racers: ["skipper", "twin", "huge_baby", "sw_stunner", "banana"],
      pos: [28, 28, 29, 27, 0],
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 12 && s.pending?.player !== "p3"; i++) s = answer(s);
    expect(s.pending?.player).toBe("p3");
    expect(tok(s, "huge_baby").place).toBeNull();
  });
  it.each(["yes", "no"])("评论家选择%s也无法改变固定1点时，跳蛙的永久循环仍只结算一轮", (value) => {
    let s = testRace({
      racers: ["sw_hopfrog", "huge_baby", "sw_stunner", "sw_critic"],
      pos: [8, 9, 7, 7],
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 12 && s.race!.current === "p1"; i++)
      s = answer(s, s.pending?.kind === "critic" ? value : "roll");
    expect(s.race!.current).not.toBe("p1");
    expect(s.race!.over).toBe(false);
  });
  it("惊艳者固定1点加黏黏怪减速，船长不能在原地永远插自己的队", () => {
    let s = testRace({
      racers: ["skipper", "sw_stunner", "gunk"],
      pos: [0, 0, 0],
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 5 && s.race!.current === "p1"; i++) s = answer(s, "roll");
    expect(s.race!.current).not.toBe("p1");
    expect(s.race!.over).toBe(false);
  });
  it("人字拖换位的技能连锁不能让已冲线挪挪又传送回赛道", () => {
    let s = testRace({
      racers: ["flip_flop", "scoocher", "banana"],
      pos: [25, 29, 0],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = answer(s, "flip:scoocher");
    checkChainInvariants(s);
    expect(tok(s, "scoocher").place).toBe(1);
    expect(tok(s, "scoocher").pos).toBe(30);
  });
  it("跳蛙、巨婴、惊艳者造成的固定1点额外回合循环只结算一轮", () => {
    let s = testRace({
      racers: ["sw_hopfrog", "huge_baby", "sw_stunner"],
      pos: [1, 2, 1],
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 5 && s.pending?.player === "p1"; i++) s = answer(s, "roll");
    expect(s.pending?.player).not.toBe("p1");
    expect(s.log.some((l) => l.text.includes("循环"))).toBe(true);
    expect(s.race!.over).toBe(false);
  });
  it("跳蛙的固定1点仍有位置变化时保留额外回合", () => {
    let s = testRace({
      racers: ["sw_hopfrog", "huge_baby", "sw_stunner"],
      pos: [1, 3, 1],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_hopfrog").pos).toBe(2);
    expect(s.pending?.player).toBe("p1");
    expect(s.log.some((l) => l.text.includes("固定骰点使额外回合"))).toBe(false);
  });
  it("军师猜中真冠军时，继父得分触发的挪挪不能抢走亚军", () => {
    let s = testRace({
      racers: ["twin", "mastermind", "scoocher", "sw_stepdad"],
      pos: [29, 5, 28, 15],
      rolls: [1],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      x.race!.mastermindPick = "twin";
    });
    s = answer(s, "roll");
    expect(s.race!.finishers).toEqual(["twin", "mastermind"]);
    expect(tok(s, "mastermind").place).toBe(2);
    expect(tok(s, "scoocher").pos).toBe(29);
    expect(total(s.players[3].chips)).toBe(3);
  });
  it("大牌与水管同在石头格的强制重复不被无效骰子掩盖", () => {
    let s = testRace({
      racers: ["sw_the_hose", "sw_diva"],
      pos: [5, 5],
      tripped: [true, true],
      track: "wild",
      secondWindPreview: true,
      skipSetup: true,
    });
    for (let i = 0; i < 30 && s.phase === "race"; i++) s = answer(s);
    expect(s.race!.over).toBe(true);
    expect(s.race!.finishers).toEqual([]);
  });
  it("互相选中的两名心有灵犀在石头格反复起身也识别为强制循环", () => {
    let s = testRace({
      racers: ["sw_soulmate", "twin"],
      pos: [18, 18],
      tripped: [true, true],
      track: "wild",
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "twin").base = "sw_soulmate";
      tok(x, "twin").secondWind = { soulmate: "sw_soulmate" };
      tok(x, "sw_soulmate").secondWind = { soulmate: "twin" };
    });
    for (let i = 0; i < 20 && s.phase === "race"; i++) s = answer(s);
    expect(s.race!.over).toBe(true);
  });
  it("两个水管同在石头格仍能起身继续，不能误判强制循环", () => {
    let s = testRace({
      racers: ["sw_the_hose", "twin"],
      pos: [5, 5],
      tripped: [true, true],
      track: "wild",
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "twin").base = "sw_the_hose";
    });
    for (let i = 0; i < 8 && s.pending?.kind !== "main"; i++) s = answer(s);
    expect(s.race!.over).toBe(false);
    expect(s.pending?.kind).toBe("main");
  });
  it("结算兜底过滤旧异常冲线名单中的淘汰者，并重新排列真冠军名次", () => {
    let s = testRace({
      racers: ["twin", "banana", "alchemist"],
      pos: [28, 29, 5],
      rolls: [3],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "banana").out = true;
      tok(x, "banana").place = 1;
      x.race!.finishers = ["banana"];
    });
    s = answer(s, "roll");
    expect(s.race!.finishers).toEqual(["twin"]);
    expect(tok(s, "banana").place).toBeNull();
    expect(tok(s, "twin").place).toBe(1);
    expect(total(s.players[1].chips)).toBe(0);
    expect(s.log.find((l) => l.fx?.kind === "podium")!.fx).toMatchObject({
      places: [{ racer: "twin", place: 1, points: 3 }],
    });
  });
  it("山寨猫复制冠军替身与双胞胎同时拦截，不留下淘汰冠军", () => {
    let s = testRace({
      racers: ["scoocher", "copycat", "twin", "banana"],
      pos: [29, 5, 29, 10],
      rolls: [3],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "twin").base = "sw_doppelgangster";
      tok(x, "copycat").copyPick = "twin";
    });
    s = answer(s, "roll");
    expect(tok(s, "scoocher").out).toBe(true);
    expect(tok(s, "scoocher").place).toBeNull();
    expect(tok(s, "copycat").base).toBe("scoocher");
    expect(tok(s, "twin").base).toBe("scoocher");
    checkChainInvariants(s);
  });
  it("扫兴鬼取消已有冲线的比赛，不再发动挪挪或发奖牌", () => {
    let s = testRace({
      racers: ["twin", "sw_spoilsport", "scoocher", "banana"],
      pos: [6, 0, 29, 30],
      rolls: [1],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "banana").place = 1;
      x.race!.finishers = ["banana"];
      x.players[0].chips = [{ kind: "bronze", value: 2, race: 0 }];
    });
    s = answer(s, "roll");
    expect(s.race!.cancelledBy).toBe("sw_spoilsport");
    expect(tok(s, "scoocher").pos).toBe(29);
    expect(s.players.flatMap((p) => p.chips).filter((c) => c.kind !== "bronze")).toEqual([]);
    expect(total(s.players[0].chips)).toBe(2);
    expect(total(s.players[1].chips)).toBe(3);
  });
  it.each([28, 29])("复制冠军替身在 %i 格拦截挪挪，先退出比赛再连锁", (pos) => {
    let s = testRace({
      racers: ["scoocher", "twin", "banana"],
      pos: [pos, 5, 10],
      rolls: [3],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "twin").base = "sw_doppelgangster";
    });
    s = answer(s, "roll");
    expect(tok(s, "scoocher").out).toBe(true);
    expect(tok(s, "scoocher").place).toBeNull();
    expect(s.race!.finishers).not.toContain("scoocher");
    expect(tok(s, "twin").base).toBe("scoocher");
    const moves = s.log.flatMap((l) =>
      l.fx?.kind === "move" && l.fx.racers.includes("scoocher") ? [l.fx] : [],
    );
    expect(moves).toHaveLength(1);
    const power = s.log.findIndex((l) => l.fx?.kind === "power" && l.fx.power === "sw_doppelgangster");
    const out = s.log.findIndex((l) => l.fx?.kind === "out" && l.fx.racer === "scoocher");
    expect(power).toBeLessThan(out);
    s = complete(s);
    expect(total(s.players[0].chips)).toBe(0);
  });
  it("继父按首次冲线动作得分，冠军替身拦截也算；军师不算猜中", () => {
    let s = testRace({
      racers: ["twin", "sw_doppelgangster", "mastermind", "sw_stepdad"],
      pos: [28, 0, 10, 20],
      rolls: [3],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      x.race!.mastermindPick = "twin";
    });
    s = answer(s, "roll");
    expect(tok(s, "twin").out).toBe(true);
    expect(total(s.players[3].chips)).toBe(3);
    expect(tok(s, "mastermind").place).toBeNull();
    s = complete(s);
    expect(s.players[3].chips.filter((c) => c.kind === "bronze").reduce((a, c) => a + c.value, 0)).toBe(3);
    expect(s.log.some((l) => l.text.includes("猜中了冠军"))).toBe(false);
  });
  it("军师猜中拦截之后的真冠军才取得亚军", () => {
    let s = testRace({
      racers: ["twin", "sw_doppelgangster", "mastermind", "banana"],
      pos: [28, 29, 5, 10],
      rolls: [3, 3],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      x.race!.mastermindPick = "sw_doppelgangster";
    });
    s = answer(s, "roll");
    expect(tok(s, "mastermind").place).toBeNull();
    s = complete(s);
    expect(s.race!.finishers).toEqual(["sw_doppelgangster", "mastermind"]);
    expect(total(s.players[2].chips)).toBe(1);
  });
  it.each(["mouth", "sw_bite_mark"])("%s 吞掉29格挪挪时，受害者不能借技能逃到终点", (racer) => {
    let s = testRace({
      racers: [racer, "scoocher", "twin"],
      pos: [26, 29, 8],
      rolls: [racer === "mouth" ? 3 : 4],
      secondWindPreview: true,
      skipSetup: true,
    });
    if (racer === "sw_bite_mark")
      s = edit(s, (x) => {
        tok(x, racer).secondWind = { wereMouth: true };
      });
    s = answer(s, "roll");
    expect(tok(s, "scoocher").out).toBe(true);
    expect(tok(s, "scoocher").place).toBeNull();
    expect(s.log.some((l) => l.fx?.kind === "move" && l.fx.racers.includes("scoocher"))).toBe(false);
  });
  it("换手发动的连锁结束比赛也必须完成控制权和卡片交换", () => {
    let s = testRace({
      racers: ["sw_switcharoo", "twin", "scoocher", "banana"],
      pos: [26, 28, 29, 30],
      rolls: [1],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "banana").place = 1;
      x.race!.finishers = ["banana"];
    });
    s = answer(s, "roll");
    expect(s.pending?.kind).toBe("switcharoo");
    s = answer(s, "twin");
    expect(s.race!.over).toBe(true);
    expect(tok(s, "sw_switcharoo").owner).toBe("p2");
    expect(tok(s, "twin").owner).toBe("p1");
    expect(s.players[1].hand).toContain("sw_switcharoo");
    expect(s.players[0].hand).toContain("twin");
  });
  it("糊糊发动的连锁结束比赛也必须抽牌并替换能力", () => {
    let s = testRace({
      racers: ["sw_mush", "scoocher", "banana"],
      pos: [0, 29, 30],
      rolls: [1],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "banana").place = 1;
      x.race!.finishers = ["banana"];
      x.deck = ["alchemist", "legs"];
    });
    s = answer(s, "roll");
    expect(s.race!.over).toBe(true);
    expect(tok(s, "sw_mush").base).toBe("alchemist");
    expect(s.deck).toEqual(["legs"]);
  });
  it("浪漫者被拦截淘汰后不再补发技能记录", () => {
    let s = testRace({
      racers: ["twin", "romantic", "sw_doppelgangster", "banana"],
      pos: [11, 28, 0, 15],
      rolls: [4],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = answer(s, "roll");
    expect(tok(s, "romantic").out).toBe(true);
    const out = s.log.findIndex((l) => l.fx?.kind === "out" && l.fx.racer === "romantic");
    expect(s.log.slice(out + 1).some((l) => l.fx?.kind === "power" && l.fx.racer === "romantic")).toBe(false);
  });
  it("伊卡洛斯掷6的连锁结束比赛也不能跳过淘汰", () => {
    let s = testRace({
      racers: ["sw_icarus", "scoocher", "banana"],
      pos: [0, 29, 30],
      rolls: [6],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "banana").place = 1;
      x.race!.finishers = ["banana"];
    });
    s = answer(s, "roll");
    expect(s.race!.over).toBe(true);
    expect(tok(s, "sw_icarus").out).toBe(true);
    expect(tok(s, "sw_icarus").place).toBeNull();
  });
  it("极速失控在连锁暂停等待吸盘鱼选择前已经淘汰", () => {
    const s = testRace({
      racers: ["sw_speed_demon", "scoocher", "suckerfish"],
      pos: [29, 20, 20],
      secondWindPreview: true,
      skipSetup: true,
    });
    expect(s.pending?.kind).toBe("suckerfish");
    expect(tok(s, "sw_speed_demon").out).toBe(true);
    checkChainInvariants(s);
  });
});
