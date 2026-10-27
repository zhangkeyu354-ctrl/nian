import { describe, it, expect } from "vitest";
import {
  arrestText,
  eventCopy,
  recapByRound,
  winnerTitles,
  selectionAfterDrop,
} from "../../src/ss/ui-model.ts";
import type { PublicAction } from "../../../../packages/soda-smugglers/src/index.ts";
describe("汽水走私犯阶段4呈现", () => {
  it("将抓到、误捕和铁面无私误捕分成三种文字，并展示实际赔款", () => {
    expect(
      arrestText({ type: "CONFISCATE", amount: 4 } as PublicAction).title,
    ).toBe("抓到了！");
    expect(
      arrestText({ type: "WRONGFUL", penalty: 2 } as PublicAction).detail,
    ).toContain("赔 2");
    expect(
      arrestText({ type: "WRONGFUL", penalty: 1 } as PublicAction).detail,
    ).toContain("实际赔 1");
    expect(
      arrestText({
        type: "WRONGFUL",
        penalty: 0,
        useEvent: true,
      } as PublicAction).detail,
    ).toContain("不赔");
  });
  it("八张事件牌都有中文标题、卡文和一行摘要", () => {
    expect(Object.keys(eventCopy)).toHaveLength(8);
    for (const e of Object.values(eventCopy)) {
      expect(e.title.length).toBeGreaterThan(1);
      expect(e.text.length).toBeGreaterThan(10);
      expect(e.summary.length).toBeGreaterThan(5);
    }
  });
  it("拖入行李和贿赂时不重复选牌，允许换位并限制容量", () => {
    let x = selectionAfterDrop({ luggage: [], bribe: "" }, "a", "luggage", 2);
    x = selectionAfterDrop(x, "b", "luggage", 2);
    x = selectionAfterDrop(x, "a", "bribe", 2);
    expect(x).toEqual({ luggage: ["b"], bribe: "a" });
    x = selectionAfterDrop(x, "c", "luggage", 2);
    x = selectionAfterDrop(x, "d", "luggage", 2);
    expect(x).toEqual({ luggage: ["b", "c"], bribe: "a" });
  });
  it("回顾只按已公开事件分轮，称号只来自实际统计", () => {
    const h = [
      {
        round: 1,
        type: "CONFISCATE",
        seat: 0,
        target: 1,
        amount: 3,
        bottles: [1, 2],
      },
      { round: 2, type: "WRONGFUL", seat: 1, target: 0, penalty: 2, amount: 1 },
    ] as PublicAction[];
    expect(recapByRound(h).map((x) => x.round)).toEqual([1, 2]);
    const ps = [
      {
        name: "甲",
        caps: 5,
        stats: {
          delivered: 4,
          confiscated: 2,
          wrongful: 0,
          bribesPaid: 0,
          bribesReceived: 1,
        },
      },
      {
        name: "乙",
        caps: 6,
        stats: {
          delivered: 1,
          confiscated: 5,
          wrongful: 1,
          bribesPaid: 1,
          bribesReceived: 0,
        },
      },
    ];
    expect(winnerTitles(ps)).toEqual([
      { name: "甲", label: "汽水运输王", value: 4 },
      { name: "乙", label: "缉私能手", value: 5 },
    ]);
  });
});
