import { it, expect } from "vitest";
import {
  enqueueEffects,
  ackEffects,
  coalesceEffects,
} from "../src/xb/effect-queue.ts";
it("连续批次在渲染前到达，所有目标保留，确认旧批次不吃掉新批次", () => {
  let queue = enqueueEffects([], 1, [{ from: "a", target: "b", count: 1 }]);
  queue = enqueueEffects(queue, 2, [{ from: "b", target: "c", count: 1 }]);
  expect(coalesceEffects(queue).map((x) => x.target)).toEqual(["b", "c"]);
  const during = enqueueEffects(queue, 3, [
    { from: "c", target: "a", count: 1 },
  ]);
  expect(coalesceEffects(ackEffects(during, 2)).map((x) => x.target)).toEqual([
    "a",
  ]);
});
it("同一目标聚合次数，积压有上限，不重复消费", () => {
  let queue = enqueueEffects([], 1, [{ from: "a", target: "b", count: 1 }]);
  queue = enqueueEffects(queue, 2, [{ from: "c", target: "b", count: 2 }]);
  expect(coalesceEffects(queue)).toHaveLength(1);
  expect(coalesceEffects(queue)[0].count).toBe(3);
  expect(coalesceEffects(ackEffects(queue, 2))).toHaveLength(0);
  for (let i = 3; i < 100; i++)
    queue = enqueueEffects(queue, i, [{ from: "a", target: "b", count: 1 }]);
  expect(queue.length).toBeLessThanOrEqual(32);
});
