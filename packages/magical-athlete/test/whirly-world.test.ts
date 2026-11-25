import { describe, expect, it } from "vitest";
import { createMAGame, testRace } from "../src/engine.ts";
import { answer, tok } from "./helpers.ts";
import { PLAYABLE_TRACKS } from "../src/tracks.ts";
const pairs = [
  [4, 6],
  [8, 12],
  [11, 15],
  [17, 22],
  [20, 23],
  [24, 28],
];
describe("螺旋世界：权威引擎落点", () => {
  for (const [a, b] of pairs)
    for (const [from, to] of [
      [a, b],
      [b, a],
    ])
      it(`${from}落点双向传送至${to}且不回跳`, () => {
        let s = testRace({
          racers: ["twin", "banana", "lovable_loser"],
          pos: [from - 1, 0, 0],
          rolls: [1],
          skipSetup: true,
          track: "whirly-world",
        });
        s = answer(s, "roll");
        expect(tok(s, "twin").pos).toBe(to);
        expect(
          s.log
            .filter((e) => e.fx?.kind === "warp" && e.fx.racer === "twin")
            .map((e) => e.fx),
        ).toEqual([{ kind: "warp", racer: "twin", from, to }]);
      });
  it("途经端点不传送", () => {
    const s = answer(
      testRace({
        racers: ["twin", "banana", "lovable_loser"],
        pos: [3, 0, 0],
        rolls: [2],
        skipSetup: true,
        track: "whirly-world",
      }),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(5);
  });
  it("传送不触发香蕉经过，落点仍触发鸡脚小屋", () => {
    let s = testRace({
      racers: ["twin", "banana", "baba_yaga"],
      pos: [16, 20, 22],
      rolls: [1],
      skipSetup: true,
      track: "whirly-world",
    });
    s = answer(s, "roll");
    expect(tok(s, "twin").pos).toBe(22);
    expect(tok(s, "twin").tripped).toBe(true);
    expect(s.log.some((l) => l.text.includes("香蕉皮"))).toBe(false);
  });
  it("技能传送抵达端点也触发通道", () => {
    let s = testRace({
      racers: ["hypnotist", "twin", "banana"],
      pos: [17, 0, 0],
      skipSetup: true,
      track: "whirly-world",
    });
    s = answer(s, "twin");
    expect(tok(s, "twin").pos).toBe(22);
  });
  it("通道到达后结算浪漫者的同格能力", () => {
    const s = answer(testRace({
      racers: ["twin", "romantic", "banana"], pos: [16, 22, 0],
      rolls: [1], skipSetup: true, track: "whirly-world",
    }), "roll");
    expect(tok(s, "twin").pos).toBe(22);
    // Her +2 lands on another portal, so that separate movement warps again.
    expect(tok(s, "romantic").pos).toBe(28);
    expect(s.log.some(l => l.text.includes("见不得成双"))).toBe(true);
  });
  it("通道到达后结算酒店费用，传送本身不重复收费", () => {
    const s = testRace({
      racers: ["twin", "sw_hotel", "banana"], pos: [16, 22, 0],
      rolls: [1], skipSetup: true, track: "whirly-world", secondWindPreview: true,
    });
    s.players[0].chips.push({ kind: "bronze", value: 2, race: 0 });
    const snapshot = JSON.parse(s.turn!.snapshot);
    snapshot.players[0].chips.push({ kind: "bronze", value: 2, race: 0 });
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(s, "roll");
    expect(tok(after, "twin").pos).toBe(22);
    expect(after.players[0].chips.reduce((sum, c) => sum + c.value, 0)).toBe(1);
    expect(after.players[1].chips.reduce((sum, c) => sum + c.value, 0)).toBe(1);
  });
  it("炫耀者追加骰累计落在通道端点时传送一次", () => {
    let s = testRace({
      racers: ["sw_show_off", "banana", "twin"], pos: [0, 10, 20],
      rolls: [1, 3], skipSetup: true, track: "whirly-world", secondWindPreview: true,
    });
    s = answer(s, "roll");
    expect(s.pending?.kind).toBe("showoff");
    s = answer(s, "roll");
    s = answer(s, "stop");
    expect(tok(s, "sw_show_off").pos).toBe(6);
    expect(s.log.filter(l => l.fx?.kind === "warp" && l.fx.racer === "sw_show_off")).toHaveLength(1);
  });
  it("返场跑者在螺旋图冲线后登记下一场返场资格", () => {
    let s = testRace({
      racers: ["sw_re_runner", "banana"], pos: [29, 29], rolls: [1, 1],
      track: "whirly-world", secondWindPreview: true,
    });
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.race!.over).toBe(true);
    expect(s.returningRacers?.some(r => r.racer === "sw_re_runner")).toBe(true);
  });
  it("赛前摆放端点不触发", () => {
    const s = testRace({
      racers: ["twin", "banana", "lovable_loser"],
      pos: [17, 0, 0],
      skipSetup: true,
      track: "whirly-world",
    });
    expect(tok(s, "twin").pos).toBe(17);
    expect(s.log.some((l) => l.fx?.kind === "warp")).toBe(false);
  });
  it("地图优先：端点上的巨婴不能先把到达者挤离通道", () => {
    const s = answer(
      testRace({
        racers: ["twin", "huge_baby", "banana"],
        pos: [3, 4, 0],
        rolls: [1],
        skipSetup: true,
        track: "whirly-world",
      }),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(6);
  });
  it("原移动真实经过香蕉的反应不因传送丢失", () => {
    const s = answer(
      testRace({
        racers: ["twin", "banana", "lovable_loser"],
        pos: [2, 3, 0],
        rolls: [2],
        skipSetup: true,
        track: "whirly-world",
      }),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(6);
    expect(tok(s, "twin").tripped).toBe(true);
  });
  it("未验收地图不进入正式可用池", () => {
    expect(PLAYABLE_TRACKS).toEqual(["mild", "wild"]);
    expect(() =>
      createMAGame({
        players: [
          { id: "a", name: "甲" },
          { id: "b", name: "乙" },
        ],
        seed: 1,
        settings: { schedule: ["whirly-world", "mild", "wild", "mild"] },
      }),
    ).toThrow();
  });
});
