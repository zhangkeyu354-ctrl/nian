import { describe, expect, it } from "vitest";
import {
  CARDS,
  deckFor,
  createDU,
  reduceDU,
  assertInvariants,
  valueOf,
  viewForDU,
  type DUState,
  type HeldCard,
} from "../src/index.ts";

const h = (id: number, flip = false): HeldCard => ({ id, flip });
/** 找一张 a/b 的牌 id */
const card = (a: number, b: number, nth = 0) =>
  CARDS.filter((c) => c.a === a && c.b === b)[nth].id;

function setup(n: number, hands: HeldCard[][], turn = 0): DUState {
  const s = createDU(Array.from({ length: n }, (_, i) => "P" + i), { seed: 1 });
  s.players.forEach((p, i) => (p.hand = hands[i] ?? []));
  s.turn = turn;
  s.zone = 0;
  return s;
}

describe("牌库", () => {
  it("40 张、28 种配对、频次正确", () => {
    expect(CARDS.length).toBe(40);
    expect(new Set(CARDS.map((c) => c.a + "/" + c.b)).size).toBe(28);
    const freq = (n: number) => {
      const f = Array(11).fill(0);
      deckFor(n).forEach((c) => (f[c.a]++, f[c.b]++));
      return f.slice(1);
    };
    expect(freq(2)).toEqual([7, 7, 6, 6, 6, 6, 6, 4, 3, 1]);
    expect(freq(3)).toEqual([8, 8, 7, 7, 7, 7, 6, 5, 3, 2]);
    expect(freq(4)).toEqual([10, 10, 9, 8, 8, 8, 7, 6, 4, 2]);
    expect(freq(5)).toEqual([10, 10, 10, 9, 9, 9, 8, 7, 5, 3]);
  });
  it.each([
    [2, 13],
    [3, 10],
    [4, 9],
    [5, 8],
    [6, 6],
  ])("%i 人每人 %i 张，星牌持有者先手", (n, per) => {
    const s = createDU(Array(n).fill("x"), { seed: 7 });
    s.players.forEach((p) => expect(p.hand.length).toBe(per));
    expect(s.players[s.turn].hand.some((c) => c.id === 1)).toBe(true);
    assertInvariants(s);
  });
});

describe("出牌与压制", () => {
  it("同张数才比较，必须严格更大；被压的整组旋转回手", () => {
    const s = setup(3, [
      [h(card(3, 4)), h(card(3, 6)), h(card(4, 6))],
      [h(card(5, 7)), h(card(5, 8)), h(card(1, 9))],
      [h(card(2, 9)), h(card(2, 10))],
    ]);
    let t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(3, 4), card(3, 6)] });
    expect(t.turn).toBe(1);
    // 相等不行
    expect(() => reduceDU(t, { type: "PLAY", actor: 1, cards: [card(1, 9)] })).not.toThrow();
    t = reduceDU(t, { type: "PLAY", actor: 1, cards: [card(5, 7), card(5, 8)] });
    // 玩家 0 的两张 3 回手，变成 4 和 6
    expect(t.players[0].hand.map(valueOf).sort()).toEqual([4, 4, 6]);
    expect(t.players[0].zones[0]).toBeNull();
    assertInvariants(t, false);
  });
  it("相等不能出", () => {
    const s = setup(3, [[h(card(3, 4)), h(card(1, 5))], [h(card(3, 5)), h(card(2, 4))], [h(card(2, 9))]]);
    const t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(3, 4)] });
    expect(() => reduceDU(t, { type: "PLAY", actor: 1, cards: [card(3, 5)] })).toThrow();
  });
  it("数字不同不能一起出", () => {
    const s = setup(3, [[h(card(3, 4)), h(card(4, 6))], [h(1)], [h(2)]]);
    expect(() => reduceDU(s, { type: "PLAY", actor: 0, cards: [card(3, 4), card(4, 6)] })).toThrow();
  });
});

describe("加牌、拿牌、旋转", () => {
  it("B：加一张让对手组合变大，压回另一组", () => {
    const s = setup(3, [
      [h(card(1, 5)), h(card(2, 9))],
      [h(card(3, 4)), h(card(3, 5)), h(card(2, 10))],
      [h(card(5, 7)), h(card(4, 6))],
    ]);
    let t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(1, 5)] }); // 一张 1
    t = reduceDU(t, { type: "PLAY", actor: 1, cards: [card(3, 4), card(3, 5)] }); // 两张 3
    t = reduceDU(t, { type: "PLAY", actor: 2, cards: [card(5, 7)] }); // 一张 5 压回玩家0的 1
    expect(t.players[0].hand.map(valueOf)).toContain(5);
    // 玩家0回合：自己没有组合可清；给玩家2的 5 加一张 5（旋转回来的 1/5）
    t = reduceDU(t, { type: "ADD", actor: 0, card: card(1, 5), target: 2 });
    expect(t.players[2].zones[0]!.cards.length).toBe(2);
    expect(t.players[1].zones[0]).toBeNull(); // 两张 3 被两张 5 压回
    expect(t.players[1].hand.length).toBe(3);
    assertInvariants(t, false);
  });
  it("B：加完后不够大不合法", () => {
    const s = setup(3, [[h(card(3, 4)), h(card(3, 5)), h(card(2, 9))], [h(card(5, 7)), h(card(1, 6))], [h(card(3, 6))]]);
    let t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(3, 4), card(3, 5)] });
    t = reduceDU(t, { type: "PLAY", actor: 1, cards: [card(1, 6)] }); // 一张 1
    t = reduceDU(t, { type: "ROTATE", actor: 2 });
    expect(() => reduceDU(t, { type: "ADD", actor: 0, card: card(2, 9), target: 1 })).toThrow();
  });
  it("C：拿走整组并旋转", () => {
    const s = setup(3, [[h(card(2, 5)), h(card(2, 6)), h(card(1, 9))], [h(card(4, 7))], [h(card(4, 8))]]);
    let t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(2, 5), card(2, 6)] });
    t = reduceDU(t, { type: "TAKE", actor: 1, target: 0 });
    expect(t.players[1].hand.map(valueOf).sort()).toEqual([4, 5, 6]);
    assertInvariants(t, false);
  });
  it("D：整手旋转", () => {
    const s = setup(3, [[h(card(2, 5)), h(card(1, 9))], [h(1)], [h(2)]]);
    const t = reduceDU(s, { type: "ROTATE", actor: 0 });
    expect(t.players[0].hand.map(valueOf)).toEqual([5, 9]);
  });
  it("轮到自己时先清掉旧组合", () => {
    const s = setup(3, [[h(card(2, 5)), h(card(1, 9))], [h(card(4, 7))], [h(card(4, 8))]]);
    let t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(2, 5)] });
    t = reduceDU(t, { type: "ROTATE", actor: 1 });
    t = reduceDU(t, { type: "ROTATE", actor: 2 });
    expect(t.players[0].zones[0]).toBeNull();
    expect(t.discard).toBe(1);
  });
});

describe("计分", () => {
  it("第一名 2 分离场，第二名 1 分本轮结束", () => {
    const s = setup(3, [[h(card(2, 5))], [h(card(3, 7)), h(card(1, 6))], [h(card(4, 9))]]);
    let t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(2, 5)] });
    expect(t.players[0].score).toBe(2);
    expect(t.players[0].place).toBe(1);
    t = reduceDU(t, { type: "PLAY", actor: 1, cards: [card(3, 7)] }); // 压过离场者的 2：直接弃掉
    expect(t.players[0].hand.length).toBe(0);
    t = reduceDU(t, { type: "PLAY", actor: 2, cards: [card(4, 9)] });
    expect(t.players[2].score).toBe(1);
    expect(t.phase).toBe("ROUND_END");
    t = reduceDU(t, { type: "NEXT_ROUND", actor: 0 });
    expect(t.phase).toBe("PLAY");
    assertInvariants(t, false);
  });
  it("跳过离场者", () => {
    const s = setup(3, [[h(card(2, 5))], [h(card(3, 7)), h(card(1, 6))], [h(card(4, 9)), h(card(1, 7))]]);
    let t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(2, 5)] });
    t = reduceDU(t, { type: "ROTATE", actor: 1 });
    t = reduceDU(t, { type: "ROTATE", actor: 2 });
    expect(t.turn).toBe(1);
    expect(t.players[0].zones[0]).toBeNull();
  });
  it("达到门槛立即获胜", () => {
    const s = setup(3, [[h(card(2, 5))], [h(1)], [h(2)]]);
    s.players[0].score = 3;
    const t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(2, 5)] });
    expect(t.phase).toBe("FINISHED");
    expect(t.winner).toBe(0);
  });
});

describe("双人局", () => {
  it("星牌先手只做区域2，然后对手做两区", () => {
    const s = createDU(["A", "B"], { seed: 3 });
    expect(s.zone).toBe(1);
    const first = s.turn;
    let t = reduceDU(s, { type: "ROTATE", actor: first });
    expect(t.turn).toBe(1 - first);
    expect(t.zone).toBe(0);
    t = reduceDU(t, { type: "ROTATE", actor: 1 - first });
    expect(t.turn).toBe(1 - first);
    expect(t.zone).toBe(1);
  });
  it("压回自己另一区域后手牌不空，不算赢", () => {
    const s = setup(2, [[h(card(1, 6)), h(card(2, 8))], [h(card(3, 4))]]);
    s.zone = 0;
    let t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(1, 6)] }); // 区域1 出 1
    expect(t.zone).toBe(1);
    t = reduceDU(t, { type: "PLAY", actor: 0, cards: [card(2, 8)] }); // 区域2 出 2，压回自己的 1
    expect(t.phase).toBe("PLAY");
    expect(t.players[0].hand.map(valueOf)).toEqual([6]);
  });
  it("清空手牌赢一轮，先赢两轮", () => {
    const s = setup(2, [[h(card(1, 6))], [h(card(3, 4))]]);
    s.players[0].score = 1;
    const t = reduceDU(s, { type: "PLAY", actor: 0, cards: [card(1, 6)] });
    expect(t.phase).toBe("FINISHED");
  });
});

describe("隐私与随机整局", () => {
  it("视图不含别人手牌", () => {
    const s = createDU(["a", "b", "c", "d"], { seed: 9 });
    const v = viewForDU(s, 1);
    expect(JSON.stringify(v.players)).not.toContain('"hand"');
    expect(v.hand.length).toBe(9);
  });
  it.each([2, 3, 4, 5, 6])("%i 人随机打到结束不出错", (n) => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = createDU(Array(n).fill("x"), { seed });
      let r = seed;
      const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 2 ** 32);
      for (let step = 0; step < 4000 && s.phase !== "FINISHED"; step++) {
        if (s.phase === "ROUND_END") {
          s = reduceDU(s, { type: "NEXT_ROUND", actor: 0 });
          continue;
        }
        const seat = s.turn;
        const p = s.players[seat];
        const tries: any[] = [];
        const groups = new Map<number, number[]>();
        p.hand.forEach((c) => groups.set(valueOf(c), [...(groups.get(valueOf(c)) ?? []), c.id]));
        for (const ids of groups.values()) for (let k = 1; k <= ids.length; k++) tries.push({ type: "PLAY", actor: seat, cards: ids.slice(0, k) });
        s.players.forEach((q, t) => q.zones.forEach((g, zone) => {
          if (!g || t === seat) return;
          if (rnd() < 0.15) tries.push({ type: "TAKE", actor: seat, target: t, zone });
          p.hand.forEach((c) => tries.push({ type: "ADD", actor: seat, card: c.id, target: t, zone }));
        }));
        tries.sort(() => rnd() - 0.5);
        let done = false;
        for (const c of tries) {
          try { s = reduceDU(s, c); done = true; break; } catch {}
        }
        if (!done) s = reduceDU(s, { type: "ROTATE", actor: seat });
        assertInvariants(s);
      }
      expect(s.phase).toBe("FINISHED");
    }
  });
});
