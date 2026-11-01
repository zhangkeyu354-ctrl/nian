import { describe, expect, it } from "vitest";
import {
  chaseTarget,
  createKB,
  previewKB,
  reduceKB,
  simpleAI,
  viewForKB,
  valueOf,
  type KBState,
} from "../src/index.ts";

function rng(seed: number) {
  let x = seed || 1;
  return () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
}

/** 构造一个干净局面：清空水塘和手牌，再放指定内容（牌从牌库里挪，保持守恒） */
function setup(s: KBState, pond: Record<number, number>, hand: number[], seat = s.turn) {
  const pool = [...s.deck, ...s.pond.flat(), ...s.players.flatMap((p) => [...p.hand, ...p.pile])];
  s.pond = s.pond.map(() => []);
  s.players.forEach((p) => ((p.hand = []), (p.pile = [])));
  const take = (v: number) => {
    const i = pool.findIndex((id) => valueOf(id) === v);
    return pool.splice(i, 1)[0];
  };
  for (const [v, n] of Object.entries(pond)) for (let k = 0; k < n; k++) s.pond[+v].push(take(+v));
  s.players[seat].hand = hand.map(take);
  s.players.forEach((p, i) => {
    if (i !== seat) p.hand = pool.splice(0, 5);
  });
  s.deck = pool;
  s.turn = seat;
  return s;
}

const mk = (n = 3, mode: "solo" | "team" = "solo") =>
  createKB(Array.from({ length: n }, (_, i) => `玩家${i + 1}`), { seed: 42, mode, first: 0 });

const P = (s: KBState, seat: number, ids: string[], seq = (s.seq[String(seat)] ?? 0) + 1) =>
  reduceKB(s, { type: "PLAY", actor: seat, seq, now: 0, cardIds: ids });

describe("配件与准备 R01–R03", () => {
  it("64 张，每人 5 张，剩余为牌库", () => {
    const s = mk(4);
    expect(s.totalCards).toBe(64);
    expect(s.players.every((p) => p.hand.length === 5)).toBe(true);
    expect(s.deck.length).toBe(44);
  });
  it("个人战 2–5 人；6 人以上被拒", () => {
    expect(() => mk(2)).not.toThrow();
    expect(() => mk(5)).not.toThrow();
    expect(() => mk(6)).toThrow("2–5");
  });
});

describe("出牌 R04–R05", () => {
  it("只能打同种动物", () => {
    const s = setup(mk(), {}, [3, 4]);
    expect(() => P(s, 0, s.players[0].hand)).toThrow("同一种动物");
  });
  it("不在手里的牌被拒", () => {
    const s = setup(mk(), {}, [3]);
    expect(() => P(s, 0, ["A8-01"])).toThrow();
  });
  it("没轮到被拒并说明在等谁", () => {
    const s = mk();
    expect(() => P(s, 1, [s.players[1].hand[0]])).toThrow("还没轮到你，等待 1号 玩家1");
  });
});

describe("赶走 R06–R09", () => {
  it("达到 3 张赶走最近的较小动物，收入得分堆", () => {
    let s = setup(mk(), { 4: 2, 3: 2 }, [4]);
    s = P(s, 0, s.players[0].hand);
    expect(s.players[0].pile.length).toBe(2);
    expect(s.pond[3].length).toBe(0);
    expect(s.pond[4].length).toBe(3);
  });
  it("跳过空位置", () => {
    expect(chaseTarget([[], [], [1, 2] as any, [], [], [], [], [1, 2, 3] as any, []], 7)).toBe(2);
  });
  it("不足 3 张不触发", () => {
    let s = setup(mk(), { 4: 1, 3: 2 }, [4]);
    s = P(s, 0, s.players[0].hand);
    expect(s.players[0].pile.length).toBe(0);
  });
  it("没有较小动物则什么也拿不到", () => {
    let s = setup(mk(), { 5: 2, 6: 3 }, [5]);
    s = P(s, 0, s.players[0].hand);
    expect(s.players[0].pile.length).toBe(0);
    expect(s.log.at(-1)!.events.some((e) => e.type === "NO_CHASE")).toBe(true);
  });
  it("已有 3 张以上，再打 1 张也会再次触发", () => {
    let s = setup(mk(), { 6: 4, 2: 1 }, [6]);
    s = P(s, 0, s.players[0].hand);
    expect(s.players[0].pile.length).toBe(1);
  });
  it("一次打多张直接到 3 张", () => {
    let s = setup(mk(), { 2: 3 }, [5, 5, 5]);
    s = P(s, 0, s.players[0].hand);
    expect(s.players[0].pile.length).toBe(3);
  });
  it("大象正常赶犀牛", () => {
    expect(previewKB([[], [], [], [], [], [], [], ["x"], ["a", "b"]], 8, 1)).toMatchObject({ target: 7, cards: 1 });
  });
});

describe("老鼠与大象 R10–R11", () => {
  it("老鼠 3 张赶走大象", () => {
    let s = setup(mk(), { 1: 2, 8: 4 }, [1]);
    s = P(s, 0, s.players[0].hand);
    expect(s.players[0].pile.length).toBe(4);
    expect(s.players[0].stats.mouseElephant).toBe(4);
  });
  it("老鼠不能赶其他动物", () => {
    expect(chaseTarget([[], ["a", "b", "c"], [], [], [], [], [], ["x"], []], 1)).toBe(0);
  });
  it("老鼠可以被赶", () => {
    expect(chaseTarget([[], ["m"], ["a", "b", "c"], [], [], [], [], [], []], 2)).toBe(1);
  });
});

describe("补牌与终局 R12–R15", () => {
  it("出牌后补到 5 张", () => {
    let s = mk();
    s = P(s, 0, [s.players[0].hand[0]]);
    expect(s.players[0].hand.length).toBe(5);
  });
  it("牌库空后不补；个人战有人打完最后一张立刻结束，按张数计分", () => {
    let s = setup(mk(), { 3: 2, 2: 3 }, [3]);
    s.deck = [];
    s.players.forEach((p, i) => i && (p.pile.push(...p.hand.splice(0)), p.hand.push(p.pile.pop()!)));
    s.totalCards = s.deck.length + s.pond.flat().length + s.players.reduce((n, p) => n + p.hand.length + p.pile.length, 0);
    s = P(s, 0, s.players[0].hand);
    expect(s.phase).toBe("FINISHED");
    expect(s.players[0].pile.length).toBe(3);
  });
  it("并列都算胜者", () => {
    let s = setup(mk(2), {}, [7]);
    s.deck.push(...s.players[1].hand.splice(1));
    s.deck = [];
    s.totalCards = s.deck.length + s.pond.flat().length + s.players.reduce((n, p) => n + p.hand.length + p.pile.length, 0);
    s = P(s, 0, s.players[0].hand);
    expect(s.phase).toBe("FINISHED");
    expect(viewForKB(s, 0).winners).toEqual([0, 1]);
  });
});

describe("组队 HR-KB-01", () => {
  it("人数与牌数：4→64、6→96、8→128；5、7 人不能组队", () => {
    expect(mk(4, "team").totalCards).toBe(64);
    expect(mk(6, "team").totalCards).toBe(96);
    expect(mk(8, "team").totalCards).toBe(128);
    expect(() => mk(5, "team")).toThrow();
    expect(() => mk(7, "team")).toThrow();
  });
  it("默认交叉座位，队友不相邻；手动分队相邻被拒", () => {
    expect(mk(8, "team").players.map((p) => p.team)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(() =>
      createKB(["a", "b", "c", "d"], { seed: 1, mode: "team", teams: [0, 0, 1, 1] }),
    ).toThrow("挨着");
  });
  it("队伍分 = 两人合计；队友手牌互不可见", () => {
    const s = mk(4, "team");
    s.players[0].pile = s.deck.splice(0, 3);
    s.players[2].pile = s.deck.splice(0, 2);
    s.totalCards = s.totalCards; // 守恒：牌从牌库挪入
    const v = viewForKB(s, 0);
    expect(v.players[2].teamScore).toBe(5);
    expect(JSON.stringify(v)).not.toContain(s.players[2].hand[0]);
  });
  it("终局补齐一圈：每人出牌次数相同", () => {
    for (const n of [4, 6, 8]) {
      for (let seed = 1; seed <= 20; seed++) {
        let s = createKB(Array.from({ length: n }, (_, i) => `p${i}`), { seed, mode: "team" });
        const r = rng(seed);
        while (s.phase === "PLAY") s = P(s, s.turn, simpleAI(s, s.turn, r));
        const turns = s.players.map((p) => p.turns);
        expect(Math.max(...turns) - Math.min(...turns)).toBe(0);
      }
    }
  }, 60_000);
});

describe("隐私、幂等、不变量", () => {
  it("视图不含他人手牌、牌库顺序", () => {
    const s = mk(4);
    const txt = JSON.stringify(viewForKB(s, 0));
    for (const id of [...s.players[1].hand, ...s.deck.slice(0, 5)]) expect(txt).not.toContain(id);
    expect(viewForKB(s, -1).hand).toEqual([]);
  });
  it("重复 seq 幂等，跳号被拒，原状态不变", () => {
    const s = mk();
    const before = structuredClone(s);
    const a = P(s, 0, [s.players[0].hand[0]], 1);
    expect(s).toEqual(before);
    expect(reduceKB(a, { type: "PLAY", actor: 0, seq: 1, now: 0, cardIds: [] })).toBe(a);
    expect(() => P(a, 1, [a.players[1].hand[0]], 3)).toThrow("不连续");
  });
  it("超时自动打出最小的一张", () => {
    let s = setup(mk(), {}, [6, 2, 7]);
    s.deadline = 100;
    s = reduceKB(s, { type: "TIMEOUT", actor: "server", seq: 1, now: 200 });
    expect(s.pond[2].length).toBe(1);
  });
  it("随机模拟 2/3/4/5 人个人战、4/6/8 人组队各 200 局打到终局", () => {
    const cases: [number, "solo" | "team"][] = [
      [2, "solo"], [3, "solo"], [4, "solo"], [5, "solo"], [4, "team"], [6, "team"], [8, "team"],
    ];
    for (const [n, mode] of cases)
      for (let seed = 1; seed <= 200; seed++) {
        let s = createKB(Array.from({ length: n }, (_, i) => `p${i}`), { seed, mode });
        const r = rng(seed * 7);
        let guard = 0;
        while (s.phase === "PLAY" && guard++ < 1000) s = P(s, s.turn, simpleAI(s, s.turn, r));
        expect(s.phase, `n=${n} ${mode} seed=${seed}`).toBe("FINISHED");
      }
  }, 180_000);
});
