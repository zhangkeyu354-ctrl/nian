import { describe, it, expect } from "vitest";
import { testRace, total } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";
import { answer, tok } from "./helpers.ts";
import { checkChainInvariants } from "./chain-invariants.ts";

function edit(s: MAState, change: (s: MAState) => void) {
  change(s);
  const snapshot = JSON.parse(s.turn!.snapshot);
  change(snapshot);
  s.turn!.snapshot = JSON.stringify(snapshot);
  return s;
}
function twoBets(
  first: string,
  second: string,
  intercept = false,
  silver = 1,
  expansion = true,
) {
  let s = testRace({
    racers: [
      "mastermind",
      "twin",
      "banana",
      ...(intercept ? ["sw_doppelgangster"] : []),
    ],
    pos: [1, 1, 29, ...(intercept ? [0] : [])],
    rolls: [1, 1, 2],
    secondWindPreview: expansion,
    skipSetup: true,
  });
  s = edit(s, (x) => {
    tok(x, "twin").base = "mastermind";
    x.settings.points[0].silver = silver;
  });
  s = answer(s, first);
  s = answer(s, "roll");
  expect(s.pending?.kind).toBe("mastermind");
  expect(s.pending?.racer).toBe("twin");
  s = answer(s, second);
  s = answer(s, "roll");
  s = answer(s, "roll");
  checkChainInvariants(s);
  return s;
}

describe("用户裁定：多人军师独立下注", () => {
  it("关闭新角色时，原版选手取得军师能力也独立下注", () => {
    const s = twoBets("banana", "banana", false, 1, false);
    expect(total(s.players[0].chips)).toBe(1);
    expect(total(s.players[1].chips)).toBe(1);
  });
  it("房主将银牌设为5分时，每名猜中者各得5分，不分摊", () => {
    const s = twoBets("banana", "banana", false, 5);
    expect(total(s.players[0].chips)).toBe(5);
    expect(total(s.players[1].chips)).toBe(5);
  });
  it("冠军押中自己且另一军师也押中时，金牌一次、两份完整银牌", () => {
    let s = testRace({
      racers: ["banana", "mastermind", "twin"],
      pos: [0, 27, 26],
      rolls: [1, 1, 1, 1, 3],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      tok(x, "twin").base = "mastermind";
    });
    s = answer(s, "roll");
    s = answer(s, "mastermind");
    s = answer(s, "roll");
    s = answer(s, "mastermind");
    s = answer(s, "roll");
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.race!.finishers).toEqual(["mastermind", "mastermind", "twin"]);
    expect(total(s.players[1].chips)).toBe(4);
    expect(total(s.players[2].chips)).toBe(1);
    checkChainInvariants(s);
  });
  it("糊糊已行动后才取得军师，下次行动仍可独立下注", () => {
    let s = testRace({
      racers: ["sw_mush", "twin", "banana"],
      rolls: [1, 1, 1],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      x.deck = ["mastermind"];
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_mush").base).toBe("mastermind");
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.pending?.kind).toBe("mastermind");
    s = answer(s, "banana");
    expect(s.race!.mastermindPicks?.sw_mush).toBe("banana");
  });
  it("替身取得被拦截军师的能力后独立下注，不继承被淘汰者的错误预测", () => {
    let s = testRace({
      racers: ["mastermind", "sw_doppelgangster", "banana"],
      pos: [29, 28, 0],
      rolls: [2, 3],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = answer(s, "banana");
    s = answer(s, "roll");
    expect(tok(s, "mastermind").out).toBe(true);
    expect(s.pending?.kind).toBe("mastermind");
    s = answer(s, "sw_doppelgangster");
    s = answer(s, "roll");
    expect(total(s.players[0].chips)).toBe(0);
    expect(total(s.players[1].chips)).toBe(4);
  });
  it("换手后预测随选手保留，猜中奖励给当前控制者", () => {
    let s = testRace({
      racers: ["sw_switcharoo", "mastermind", "twin"],
      pos: [0, 2, 29],
      rolls: [1, 6, 6],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = edit(s, (x) => {
      x.race!.mastermindPicks = { mastermind: "twin" };
      tok(x, "mastermind").started = true;
    });
    s = answer(s, "roll");
    s = answer(s, "mastermind");
    expect(tok(s, "mastermind").owner).toBe("p1");
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(total(s.players[0].chips)).toBe(1);
    expect(total(s.players[1].chips)).toBe(0);
    expect(total(s.players[2].chips)).toBe(3);
  });
  it("两人押中同一冠军，各拿完整银牌，领奖台展示两个亚军", () => {
    const s = twoBets("banana", "banana");
    expect(total(s.players[0].chips)).toBe(1);
    expect(total(s.players[1].chips)).toBe(1);
    expect(total(s.players[2].chips)).toBe(3);
    expect(tok(s, "mastermind").place).toBe(2);
    expect(tok(s, "twin").place).toBe(2);
    expect(s.log.find((l) => l.fx?.kind === "podium")?.fx).toMatchObject({
      places: [
        { racer: "banana", place: 1, points: 3 },
        { racer: "mastermind", place: 2, points: 1 },
        { racer: "twin", place: 2, points: 1 },
      ],
    });
  });
  it("一人押中、一人押错，仅押中者获奖", () => {
    const s = twoBets("banana", "mastermind");
    expect(total(s.players[0].chips)).toBe(1);
    expect(total(s.players[1].chips)).toBe(0);
    expect(tok(s, "twin").place).toBeNull();
  });
  it("山寨猫复制军师押中自己，同时拿金银牌并保留名单重复例外", () => {
    let s = testRace({
      racers: ["mastermind", "copycat", "banana"],
      pos: [28, 29, 0],
      rolls: [1, 2],
      secondWindPreview: true,
      skipSetup: true,
    });
    s = answer(s, "banana");
    s = answer(s, "roll");
    expect(s.pending?.kind).toBe("mastermind");
    s = answer(s, "copycat");
    s = answer(s, "roll");
    expect(s.race!.finishers).toEqual(["copycat", "copycat"]);
    expect(total(s.players[1].chips)).toBe(4);
    expect(total(s.players[0].chips)).toBe(0);
  });
  it("所有人押的首位冲线者被冠军替身拦截，不结算任何猜中奖励", () => {
    const s = twoBets("banana", "banana", true);
    expect(tok(s, "banana").out).toBe(true);
    expect(s.race!.finishers).toEqual([]);
    expect(total(s.players[0].chips)).toBe(0);
    expect(total(s.players[1].chips)).toBe(0);
  });
});
