import { it, expect } from "vitest";
import {
  createND,
  reduceND,
  viewForND,
  type NDState,
  type NDCommand,
} from "../src/index.ts";
const start = () => {
  let s = createND(["甲", "乙", "丙", "丁"], { seed: 123 });
  return reduceND(s, {
    type: "CHOOSE_TOPIC",
    topicId: s.topicCards[0].questions[0].id,
    seat: 0,
    seq: 1,
  });
};
const act = (s: NDState, seat: number, type: string, extra = {}) =>
  reduceND(s, { type, seat, seq: s.seq[seat] + 1, ...extra } as NDCommand);
it("answer card trims input, stays private, withdraws and same-seq replay is idempotent", () => {
  const before = start();
  const cmd = {
    type: "SUBMIT_ANSWER",
    seat: 1,
    seq: 1,
    text: "  我的私密答题卡  ",
  } as unknown as NDCommand;
  const s = reduceND(before, cmd);
  expect((s as any).answers[1]).toBe("我的私密答题卡");
  expect(reduceND(s, cmd)).toBe(s);
  expect(JSON.stringify(viewForND(s, 0))).not.toContain("我的私密答题卡");
  expect(JSON.stringify(viewForND(s, 2))).not.toContain("我的私密答题卡");
  expect(JSON.stringify(viewForND(s, 1))).toContain("我的私密答题卡");
  expect(() => act(s, 1, "SUBMIT_ANSWER", { text: "更换" })).toThrow(
    /撤回|提交/,
  );
  const withdrawn = act(s, 1, "WITHDRAW_ANSWER");
  expect(withdrawn.ready).not.toContain(1);
  expect((withdrawn as any).answers[1]).toBeNull();
  expect(
    (act(withdrawn, 1, "SUBMIT_ANSWER", { text: "修改后" }) as any).answers[1],
  ).toBe("修改后");
});
it("answer boundaries 0/1/30/31, Unicode codepoints, captain and payload are validated", () => {
  for (const text of ["", "  ", "字".repeat(31)])
    expect(() => act(start(), 1, "SUBMIT_ANSWER", { text })).toThrow(
      /1|30|不能为空/,
    );
  for (const text of ["字", "字".repeat(30), "🙂".repeat(30)])
    expect(() => act(start(), 1, "SUBMIT_ANSWER", { text })).not.toThrow();
  expect(() => act(start(), 0, "SUBMIT_ANSWER", { text: "队长" })).toThrow(
    /队长/,
  );
  expect(() => act(start(), 1, "SUBMIT_ANSWER", { text: 123 })).toThrow();
});
it("XSS is stored as literal text and never copied into public answer-stage history", () => {
  const s = act(start(), 1, "SUBMIT_ANSWER", { text: "<img onerror>" });
  expect((viewForND(s, 1) as any).answers[1]).toBe("<img onerror>");
  expect(JSON.stringify(viewForND(s, 2))).not.toContain("<img onerror>");
  expect(JSON.stringify(s.history)).not.toContain("<img onerror>");
});

it("all submitted fronts publish together; only captain updates order and lock freezes it", () => {
  let s = start();
  for (const seat of [1, 2, 3])
    s = act(s, seat, "SUBMIT_ANSWER", { text: `公开回答${seat}` });
  expect(s.phase).toBe("ORDER");
  expect(viewForND(s, 0).answers).toEqual([
    null,
    "公开回答1",
    "公开回答2",
    "公开回答3",
  ]);
  expect(() => act(s, 1, "UPDATE_ORDER", { order: [3, 2, 1] })).toThrow(/队长/);
  const updated = act(s, 0, "UPDATE_ORDER", { order: [3, 2, 1] });
  expect(viewForND(updated, 2).order).toEqual([3, 2, 1]);
  expect(updated.revealed).toEqual([]);
  expect(() => act(updated, 1, "WITHDRAW_ANSWER")).toThrow();
  const locked = act(updated, 0, "LOCK_ORDER", { order: [3, 2, 1] });
  expect(() => act(locked, 0, "UPDATE_ORDER", { order: [1, 2, 3] })).toThrow();
});
it("withdrawal retries preserve state and changed same-seq payload is rejected", () => {
  const s = act(start(), 1, "SUBMIT_ANSWER", { text: "最初回答" });
  const cmd = { type: "WITHDRAW_ANSWER" as const, seat: 1, seq: s.seq[1] + 1 };
  const next = reduceND(s, cmd);
  expect(reduceND(next, cmd)).toBe(next);
  expect(() =>
    reduceND(next, {
      type: "SUBMIT_ANSWER",
      seat: 1,
      seq: cmd.seq,
      text: "复用",
    }),
  ).toThrow(/序号/);
  expect(() => act(next, 1, "WITHDRAW_ANSWER")).toThrow(/尚未提交/);
});
