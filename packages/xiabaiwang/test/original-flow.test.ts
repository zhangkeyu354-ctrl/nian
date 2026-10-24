import { it, expect } from "vitest";
import { createGame, act, viewFor } from "../src/engine.ts";
for (const n of [3, 6, 10])
  it(`${n}人解释按座位轮流、跳过想想、追问不改变顺序、重连保留`, () => {
    let s = createGame(
      Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `玩家${i}` })),
      123,
    );
    const order = s.players.filter((p) => p.id !== s.guesser).map((p) => p.id);
    expect(viewFor(s, "p0").explanationOrder).toEqual(order);
    expect(viewFor(s, "p0").explainer).toBe(order[0]);
    expect(() =>
      act(s, s.guesser, { type: "EXPLAIN_NEXT", round: 1 }),
    ).not.toThrow();
    expect(() =>
      act(s, order[1], { type: "EXPLAIN_NEXT", round: 1 }),
    ).toThrow();
    s = act(s, s.guesser, { type: "SPEAK", target: order[1], round: 1 });
    expect(viewFor(s, "p0").explainer).toBe(order[0]);
    for (const id of order) {
      expect(viewFor(s, id).explainer).toBe(id);
      s = act(s, id, { type: "EXPLAIN_NEXT", round: 1 });
      s = JSON.parse(JSON.stringify(s));
    }
    expect(viewFor(s, "p0").explainer).toBeNull();
    s = act(s, s.guesser, { type: "GUESS", target: s.truth, round: 1 });
    s = act(s, s.host, { type: "NEXT", round: 1 });
    expect(viewFor(s, "p0").explainer).toBe("p0");
  });
it("质疑禁言不淘汰，解释队列跳过禁言者", () => {
  let s = createGame(
    ["a", "b", "c"].map((id) => ({ id, name: id })),
    1,
  );
  s = act(s, s.guesser, { type: "CHALLENGE", target: "b", round: 1 });
  expect(viewFor(s, "a").explainer).toBe("c");
  s = act(s, s.guesser, { type: "GUESS", target: "b", round: 1 });
  expect(s.history[0].selected).toBe("b");
});

it("房主确认换词：不改身份、计分、轮次，旧词永久丢弃，分类公开且答案仍保密", () => {
  let s = createGame(
    ["a", "b", "c"].map((id) => ({ id, name: id })),
    123,
  );
  const before = structuredClone(s),
    old = s.topic.question;
  expect(() => act(s, "b", { type: "SWAP_TOPIC", round: 1 })).toThrow();
  s = act(s, s.host, { type: "SWAP_TOPIC", round: 1 });
  expect(s.topic.question).not.toBe(old);
  expect(s.truth).toBe(before.truth);
  expect(s.guesser).toBe(before.guesser);
  expect(s.scores).toEqual(before.scores);
  expect(s.round).toBe(1);
  expect(viewFor(s, "a").theme).toBe(s.topic.theme);
  expect(viewFor(s, s.guesser).answer).toBeUndefined();
  while (s.phase !== "over") {
    expect(s.topic.question).not.toBe(old);
    s = act(s, s.guesser, { type: "GUESS", target: s.truth, round: s.round });
    s = act(s, s.host, { type: "NEXT", round: s.round });
  }
});
