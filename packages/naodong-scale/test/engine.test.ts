import { describe, it, expect } from "vitest";
import {
  createND,
  reduceND,
  viewForND,
  assertInvariantsND,
  NDGameError,
  type NDState,
  type NDCommand,
  type NDQuestion,
} from "../src/index.ts";

const bank: NDQuestion[] = Array.from({ length: 40 }, (_, i) => ({
  id: `fixture-${i}`,
  text: `测试题 ${i}`,
  low: "低",
  high: "高",
  spicy: i % 4 === 0,
}));
const names = (n: number) =>
  Array.from({ length: n }, (_, i) => `玩家${i + 1}`);
const make = (n = 4, options: Record<string, unknown> = {}) =>
  createND(names(n), { seed: 123, bank, ...options });
const send = (
  s: NDState,
  type: string,
  data: Record<string, unknown> = {},
  seat = s.captain,
) => reduceND(s, { type, seat, seq: s.seq[seat] + 1, ...data } as NDCommand);
const choose = (s: NDState) =>
  send(s, "CHOOSE_TOPIC", {
    topicId: s.topicCards[s.round - 1].questions[0].id,
  });
const answerers = (s: NDState) =>
  s.players.map((_, i) => i).filter((i) => i !== s.captain);
function ready(s: NDState) {
  const a = answerers(s);

  for (const seat of a.filter((i) => i !== s.captain))
    s = send(s, "SUBMIT_ANSWER", { text: `回答${seat}` }, seat);
  return s;
}
function fixed(s: NDState, values: number[]) {
  const copy = structuredClone(s);
  let i = 0;
  copy.numbers = copy.players.map((_, seat) =>
    !copy.options.expert && seat === copy.captain ? null : values[i++],
  );
  copy.unusedNumbers = Array.from({ length: 10 }, (_, i) => i + 1).filter(
    (v) => !copy.numbers.includes(v),
  );
  assertInvariantsND(copy);
  return copy;
}
const ascending = (s: NDState) =>
  answerers(s).sort((a, b) => s.numbers[a]! - s.numbers[b]!);
function finishBaseRound(s: NDState, reverse = false) {
  if (s.phase === "CHOOSE_TOPIC") s = choose(s);
  if (s.phase === "ANSWER") s = ready(s);
  const order = ascending(s);
  if (reverse) order.reverse();
  s = send(s, "LOCK_ORDER", { order });
  while (s.phase === "REVEAL") s = send(s, "REVEAL_NEXT");
  return s;
}
function win(s: NDState) {
  while (s.phase !== "FINISHED") {
    s = finishBaseRound(s);
    if (s.phase === "ROUND_END") s = send(s, "NEXT_ROUND");
  }
  return s;
}
function expertUntilGuess(s: NDState, wrong = false) {
  s = ready(choose(s));
  for (const target of answerers(s).filter((i) => i !== s.captain)) {
    const guess = wrong
      ? s.numbers[target] === 1
        ? 2
        : 1
      : s.numbers[target]!;
    s = send(s, "GUESS_EXACT", { target, guess });
    if (s.phase === "FINISHED") break;
  }
  return s;
}

describe("Top Ten rules and deterministic reducer", () => {
  it("ND01 accepts 4–9, rejects invalid sizes, options and seeds", () => {
    for (const n of [4, 5, 6, 7, 8, 9]) expect(make(n).players).toHaveLength(n);
    for (const n of [0, 3, 10]) expect(() => make(n)).toThrow(NDGameError);
    expect(() => make(4, { seed: NaN })).toThrow();
    expect(() => make(4, { scale: "other" })).toThrow();
    expect(() => make(4, { firstCaptain: 9 })).toThrow();
    expect(() => createND(["a", "b", "c", ""], { seed: 1, bank })).toThrow();
  });
  it("ND02 finishes with one team outcome and no personal scores", () => {
    const s = win(make());
    expect(s.round).toBe(5);
    expect(s.result?.success).toBe(true);
    expect(s.result?.level).toBe("champions");
    expect(JSON.stringify(viewForND(s, 0))).not.toMatch(/scores|winners|rank/);
  });
  it("ND03 conserves ten number cards and the active team tokens", () => {
    for (const n of [4, 6, 9]) {
      const s = choose(make(n));
      expect(
        s.numbers.filter((v) => v !== null).length + s.unusedNumbers.length,
      ).toBe(10);
      expect(s.unicorns + s.poops).toBe(Math.min(n, 8));
      assertInvariantsND(s);
    }
  });
  it("ND04 gives unique 1–10 numbers and keeps unused numbers hidden", () => {
    const s = choose(make());
    expect(new Set(s.numbers.filter((n) => n !== null)).size).toBe(3);
    expect(
      s.numbers.filter((v) => v !== null).every((v) => v! >= 1 && v! <= 10),
    ).toBe(true);
    expect(viewForND(s, 0)).not.toHaveProperty("unusedNumbers");
  });
  it("ND05 draws five distinct pairs without repeating any of the ten candidate questions", () => {
    const s = make();
    expect(s.topicCards).toHaveLength(5);
    expect(
      new Set(s.topicCards.flatMap((c) => c.questions.map((q) => q.id))).size,
    ).toBe(10);
    expect(make()).toEqual(s);
    expect(make(4, { seed: 124 })).not.toEqual(s);
  });
  it("ND06 starts with one unicorn per player at 4–8", () => {
    for (let n = 4; n <= 8; n++) {
      expect(make(n).unicorns).toBe(n);
      expect(make(n).poops).toBe(0);
    }
  });
  it("ND07 uses the selected first captain and advances to the next seat", () => {
    let s = finishBaseRound(make(4, { firstCaptain: 3 }));
    s = send(s, "NEXT_ROUND");
    expect(s.captain).toBe(0);
    expect(s.round).toBe(2);
  });
  it("ND08 restricts choice to this pair and to the captain", () => {
    let s = make();
    expect(() =>
      send(s, "CHOOSE_TOPIC", { topicId: s.topicCards[0].questions[0].id }, 1),
    ).toThrow();
    expect(() =>
      send(s, "CHOOSE_TOPIC", { topicId: s.topicCards[1].questions[0].id }),
    ).toThrow();
    const id = s.topicCards[0].questions[1].id;
    s = send(s, "CHOOSE_TOPIC", { topicId: id });
    expect(s.topic?.id).toBe(id);
  });
  it("ND09 captain guesses and only other players write and sort cards", () => {
    for (const n of [4, 7, 8, 9]) {
      const s = choose(make(n));
      expect(s.numbers[s.captain]).toBeNull();
      expect(answerers(s)).toHaveLength(n - 1);
    }
  });
  it("ND10 accepts non-captains in any order and rejects captain submission", () => {
    let s = choose(make());
    expect(() => send(s, "SUBMIT_ANSWER", { text: "队长" })).toThrow(/队长/);
    for (const seat of [3, 1, 2])
      s = send(s, "SUBMIT_ANSWER", { text: `回答${seat}` }, seat);
    expect(s.phase).toBe("ORDER");
    expect(s.order).toEqual([1, 2, 3]);
  });
  it("ND11 preserves 1 and 10 endpoint directions exactly", () => {
    let s = make();
    const q = s.topicCards[0].questions[0];
    s = choose(s);
    expect(s.topic).toEqual(q);
    expect(viewForND(s, 0).topic?.low).toBe(q.low);
  });
  it("ND12 stores own text privately until all cards are submitted", () => {
    const s = send(choose(make()), "SUBMIT_ANSWER", { text: "私密" }, 1);
    expect(s.ready).toEqual([1]);
    expect(JSON.stringify(viewForND(s, 0))).not.toContain("私密");
  });
  it("ND13 rejects changing a submitted card before withdrawal", () => {
    const s = send(choose(make()), "SUBMIT_ANSWER", { text: "私密" }, 1);
    expect(() => send(s, "SUBMIT_ANSWER", { text: "换" }, 1)).toThrow(/已提交/);
  });
  it("ND14 permits only the captain to reveal the next locked seat", () => {
    let s = ready(choose(make()));
    s = send(s, "LOCK_ORDER", { order: [2, 3, 1] });
    expect(() => send(s, "REVEAL_NEXT", {}, 1)).toThrow(/队长/);
    s = send(s, "REVEAL_NEXT");
    expect(s.revealed[0].seat).toBe(2);
  });
  it("ND15 never penalizes the first revealed card", () => {
    let s = ready(fixed(choose(make()), [10, 1, 2]));
    s = send(s, "LOCK_ORDER", { order: [1, 2, 3] });
    s = send(s, "REVEAL_NEXT");
    expect(s.poops).toBe(0);
  });
  it("ND16 moves exactly one token for a descending neighbor", () => {
    let s = ready(fixed(choose(make()), [4, 2, 3]));
    s = send(s, "LOCK_ORDER", { order: [1, 2, 3] });
    s = send(send(s, "REVEAL_NEXT"), "REVEAL_NEXT");
    expect(s.poops).toBe(1);
    expect(s.unicorns).toBe(3);
  });
  it("ND17 counts 4→2→3 as one mistake, not two", () => {
    let s = ready(fixed(choose(make()), [4, 2, 3]));
    s = send(s, "LOCK_ORDER", { order: [1, 2, 3] });
    for (let i = 0; i < 3; i++) s = send(s, "REVEAL_NEXT");
    expect(s.poops).toBe(1);
  });
  it("ND18 continues after mistakes while unicorns remain", () => {
    const s = finishBaseRound(fixed(choose(make()), [4, 3, 2, 1]), true);
    expect(s.phase).toBe("ROUND_END");
    expect(s.poops).toBe(2);
    expect(s.unicorns).toBe(2);
  });
  it("ND19 has no exact-guess or distance scoring in base mode", () => {
    const s = ready(choose(make()));
    expect(() => send(s, "GUESS_EXACT", { target: 1, guess: 5 })).toThrow();
    expect(viewForND(s, 0)).not.toHaveProperty("distance");
  });
  it("ND20 rejects duplicate, missing, out-of-range and malformed order entries", () => {
    const s = ready(choose(make()));
    for (const order of [
      [0, 1, 2],
      [0, 0, 2, 3],
      [0, 1, 2, 9],
      [0, 1, 2, 1.5],
      ["0", 1, 2, 3],
    ])
      expect(() => send(s, "LOCK_ORDER", { order })).toThrow();
  });
  it("ND21 returns all number cards and deals again in the next round", () => {
    let s = finishBaseRound(make());
    s = send(s, "NEXT_ROUND");
    expect(s.numbers.every((v) => v === null)).toBe(true);
    expect(s.unusedNumbers).toHaveLength(10);
    s = choose(s);
    assertInvariantsND(s);
  });
  it("ND22 carries mistakes across rounds", () => {
    let s = finishBaseRound(make(), true);
    const poops = s.poops;
    s = send(s, "NEXT_ROUND");
    expect(s.poops).toBe(poops);
  });
  it("ND23 loses immediately with no remaining unicorns, mid-round", () => {
    let s = finishBaseRound(make(), true);
    s = send(s, "NEXT_ROUND");
    s = ready(choose(s));
    s = send(s, "LOCK_ORDER", { order: ascending(s).reverse() });
    s = send(send(send(s, "REVEAL_NEXT"), "REVEAL_NEXT"), "REVEAL_NEXT");
    expect(s.phase).toBe("FINISHED");
    expect(s.result?.success).toBe(false);
    expect(s.revealed).toHaveLength(3);
    expect(() => send(s, "REVEAL_NEXT")).toThrow();
  });
  it("ND25 gives team-only rating at zero, half, more-poop and all-unicorn boundaries", () => {
    const start = ready(choose(make()));
    const order = ascending(start);
    for (const [initialPoops, level] of [
      [0, "champions"],
      [1, "professionals"],
      [2, "professionals"],
      [3, "honorable"],
    ] as const) {
      let s = structuredClone(start);
      s.round = 5;
      s.topic = structuredClone(s.topicCards[4].questions[0]);
      s.poops = initialPoops;
      s.unicorns = 4 - initialPoops;
      s = send(s, "LOCK_ORDER", { order });
      while (s.phase === "REVEAL") s = send(s, "REVEAL_NEXT");
      expect(s.result?.level).toBe(level);
    }
  });
  it("ND26 gives nine players eight numbers and no captain answer", () => {
    let s = choose(make(9));
    expect(s.unicorns).toBe(8);
    expect(s.numbers[s.captain]).toBeNull();
    expect(() => send(s, "READY")).toThrow();
    s = ready(s);
    expect(s.ready).toHaveLength(8);
  });
  it("ND27 wrong exact guesses cost one token and validate guess bounds", () => {
    let s = ready(choose(make(4, { expert: true })));
    expect(() => send(s, "GUESS_EXACT", { target: 1, guess: 0 })).toThrow();
    expect(() => send(s, "GUESS_EXACT", { target: 1, guess: 11 })).toThrow();
    const guess = s.numbers[1] === 1 ? 2 : 1;
    s = send(s, "GUESS_EXACT", { target: 1, guess });
    expect(s.poops).toBe(1);
  });
  it("ND28 expert guesses need not ascend and can repeat without double penalties", () => {
    let s = ready(fixed(choose(make(4, { expert: true })), [9, 4, 2, 3]));
    s = send(s, "GUESS_EXACT", { target: 1, guess: 4 });
    s = send(s, "GUESS_EXACT", { target: 2, guess: 4 });
    expect(s.poops).toBe(1);
    s = send(s, "GUESS_EXACT", { target: 3, guess: 3 });
    expect(s.poops).toBe(1);
  });
  it("ND29 leaves the captain hidden until a non-captain submits the team guess", () => {
    let s = expertUntilGuess(make(4, { expert: true }));
    expect(s.phase).toBe("CAPTAIN_GUESS");
    expect(s.revealed.some((r) => r.seat === s.captain)).toBe(false);
    expect(() =>
      send(s, "GUESS_CAPTAIN", { guess: s.numbers[s.captain] }),
    ).toThrow(/队友/);
    s = send(s, "GUESS_CAPTAIN", { guess: s.numbers[s.captain] }, 1);
    expect(s.revealed).toHaveLength(4);
  });
  it("ND30 recovery transfers an existing token only and wrong team guesses cost nothing", () => {
    let s = expertUntilGuess(make(4, { expert: true }), true);
    expect(s.poops).toBe(3);
    s = send(s, "GUESS_CAPTAIN", { guess: s.numbers[s.captain] }, 1);
    expect(s.poops).toBe(2);
    let clean = expertUntilGuess(make(4, { expert: true }));
    clean = send(clean, "GUESS_CAPTAIN", { guess: clean.numbers[0] }, 1);
    expect(clean.unicorns).toBe(4);
    let wrong = expertUntilGuess(make(4, { expert: true }), true);
    const g = wrong.numbers[0] === 1 ? 2 : 1;
    wrong = send(wrong, "GUESS_CAPTAIN", { guess: g }, 1);
    expect(wrong.poops).toBe(3);
  });
  it("ND31 cannot recover after expert tokens have all been lost", () => {
    let s = expertUntilGuess(make(4, { expert: true }), true);
    s = send(s, "GUESS_CAPTAIN", { guess: s.numbers[0] === 1 ? 2 : 1 }, 1);
    s = send(s, "NEXT_ROUND");
    s = ready(choose(s));
    const target = answerers(s).find((i) => i !== s.captain)!;
    s = send(s, "GUESS_EXACT", {
      target,
      guess: s.numbers[target] === 1 ? 2 : 1,
    });
    expect(s.phase).toBe("FINISHED");
    expect(() => send(s, "GUESS_CAPTAIN", { guess: 1 }, 0)).toThrow();
  });
  it("ND32 defaults expert off and keeps nine-player adaptation mandatory", () => {
    expect(make().options.expert).toBe(false);
    expect(() => make(9, { expert: true })).toThrow(/9/);
  });
  it("NDA01 freezes the full base order before any reveals", () => {
    let s = ready(choose(make()));
    expect(() => send(s, "REVEAL_NEXT")).toThrow();
    s = send(s, "LOCK_ORDER", { order: ascending(s) });
    expect(s.revealed).toHaveLength(0);
    expect(() =>
      send(s, "LOCK_ORDER", { order: ascending(s).reverse() }),
    ).toThrow();
  });
  it("NDA02 views cannot distinguish changes to other hidden numbers or future topics", () => {
    const s = choose(make());
    const altered = structuredClone(s);
    [altered.numbers[1], altered.numbers[2]] = [
      altered.numbers[2],
      altered.numbers[1],
    ];
    altered.topicCards[1].questions.reverse();
    altered.random = 77;
    expect(viewForND(s, 0)).toEqual(viewForND(altered, 0));
    for (const key of [
      "numbers",
      "unusedNumbers",
      "random",
      "seed",
      "receipts",
      "topicCards",
    ])
      expect(viewForND(s, 0)).not.toHaveProperty(key);
    expect(viewForND(s, null).myNumber).toBeNull();
    expect(() => viewForND(s, 99)).toThrow();
  });
  it("NDA04 emits one public reveal event per shown number with team token counts", () => {
    let s = ready(choose(make()));
    s = send(s, "LOCK_ORDER", { order: ascending(s) });
    expect(s.history.filter((e) => e.type === "REVEALED")).toHaveLength(0);
    s = send(s, "REVEAL_NEXT");
    expect(s.history.filter((e) => e.type === "REVEALED")).toHaveLength(1);
    expect(viewForND(s, 1).revealed).toHaveLength(1);
  });
  it("ND24 stops exactly at round five and cannot start a sixth round", () => {
    const s = win(make(9));
    expect(s.round).toBe(5);
    expect(s.result?.success).toBe(true);
    expect(() => send(s, "NEXT_ROUND")).toThrow(/结束/);
  });
  it("NDA03 rejects text/audio attachments rather than storing them in receipts", () => {
    const s = choose(make());
    expect(() =>
      send(s, "READY", { answerText: "private spoken answer" }),
    ).toThrow();
    expect(() => send(s, "READY", { recording: "private audio" })).toThrow();
    expect(s.seq[0]).toBe(1);
  });
  it("NDA05 explicitly refuses unsupported expert and nine-player combination", () => {
    expect(() => make(9, { expert: true })).toThrow(/9 人/);
    expect(make(8, { expert: true }).options.expert).toBe(true);
  });
  it("NDA06 has no invented timeout, recording or skip commands", () => {
    const s = make();
    expect(() => send(s, "TIMEOUT")).toThrow();
    expect(s).not.toHaveProperty("deadline");
  });
  it("NDA07 filters spicy in normal mode and validates unique, sufficient content", () => {
    const s = make(4, { scale: "normal" });
    expect(
      s.topicCards.flatMap((c) => c.questions).every((q) => !q.spicy),
    ).toBe(true);
    expect(() => make(4, { bank: bank.slice(0, 9) })).toThrow();
    expect(() => make(4, { bank: [...bank, bank[0]] })).toThrow();
  });
  it("NDA08 loads the authorized question bank without exposing it in views", () => {
    const s = createND(names(4), { seed: 1 });
    expect(s.topicCards).toHaveLength(5);
    expect(viewForND(s, 1).choices).toEqual([]);
  });
  it("retries are idempotent, stale payload reuse and sequence gaps are rejected", () => {
    const s = make();
    const command = {
      type: "CHOOSE_TOPIC",
      seat: 0,
      seq: 1,
      topicId: s.topicCards[0].questions[0].id,
    } as const;
    const next = reduceND(s, command);
    expect(reduceND(next, command)).toBe(next);
    const later = send(next, "SUBMIT_ANSWER", { text: "回答" }, 1);
    expect(reduceND(later, command)).toBe(later);
    expect(() => reduceND(later, { ...command, topicId: "different" })).toThrow(
      /序号/,
    );
    expect(() =>
      reduceND(next, { type: "SUBMIT_ANSWER", text: "回答", seat: 0, seq: 9 }),
    ).toThrow(/序号/);
  });
  it("invalid commands are atomic and views do not share mutable state", () => {
    const s = make();
    const original = structuredClone(s);
    expect(() => send(s, "READY")).toThrow();
    expect(s).toEqual(original);
    const view = viewForND(s, 0);
    view.players[0].name = "changed";
    view.choices[0].text = "changed";
    expect(s).toEqual(original);
  });
  it("invariants detect duplicate cards, token loss and invalid role state", () => {
    const s = choose(make());
    const bad = structuredClone(s);
    bad.numbers[1] = bad.numbers[2];
    expect(() => assertInvariantsND(bad)).toThrow();
    const lost = structuredClone(s);
    lost.unicorns--;
    expect(() => assertInvariantsND(lost)).toThrow();
  });
});
