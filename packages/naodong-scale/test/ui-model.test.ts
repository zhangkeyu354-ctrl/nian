import { it, expect } from "vitest";
import {
  swapSeats,
  moveSeat,
  recapRounds,
  entertainmentTitles,
} from "../../../apps/web/src/nd/ui-model.ts";
it("tap swaps and drag moves preserve complete unique order", () => {
  expect(swapSeats([0, 1, 2], 0, 2)).toEqual([2, 1, 0]);
  expect(moveSeat([0, 1, 2], 0, 2)).toEqual([1, 2, 0]);
  expect(moveSeat([0, 1], 7, 0)).toEqual([0, 1]);
});
it("recap and entertainment use only actual public history", () => {
  const h = [
    {
      id: 1,
      type: "REVEALED" as const,
      round: 1,
      captain: 0,
      seat: 2,
      number: 6,
      correct: false,
      penalty: 1,
    },
  ];
  expect(recapRounds(h)[0].mistakes).toBe(1);
  expect(entertainmentTitles(h)).toEqual([
    { seat: 2, title: "最离谱答案", detail: "秘密数字被排错 1 次" },
  ]);
  expect(entertainmentTitles([])).toEqual([]);
});
