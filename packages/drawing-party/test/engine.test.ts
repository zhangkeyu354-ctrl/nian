import { describe, it, expect } from "vitest";
import {
  startGame,
  act,
  tick,
  viewFor,
  taskFor,
  validateStroke,
  emptyDrawing,
  appendChunk,
} from "../src/index.ts";
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "玩家" + i }));
const line = {
  id: "s1",
  color: 0,
  width: 8,
  points: [
    [10, 20, 0],
    [80, 90, 20],
  ] as [number, number, number][],
};
describe("3–10人传话", () => {
  for (let n = 3; n <= 10; n++)
    it(n + "人分配、隐私、全链揭晓闭环", () => {
      const ps = players(n);
      let s = startGame("tp", ps, 1000, { fakeIndex: 1, wordIndex: 0 });
      s = tick(s, s.deadline);
      s = tick(s, s.deadline);
      for (const p of ps)
        s = act(s, p.id, { type: "TEXT", text: "初题" + p.id }, 1100);
      expect(s.phase).toBe("TASK");
      expect(s.steps).toBe(2 * Math.floor((n - 1) / 2));
      const seen = new Map<string, Set<string>>();
      for (let r = 1; r <= s.steps; r++) {
        const ids = new Set<string>();
        for (const p of ps) {
          const task = taskFor(s, p.id)!;
          if (r === 1) expect(task.source.author).not.toBe(p.id);
          ids.add(task.chain);
          const set = seen.get(task.chain) ?? new Set();
          expect(set.has(p.id)).toBe(false);
          set.add(p.id);
          seen.set(task.chain, set);
          const v = viewFor(s, p.id);
          for (const other of ps.filter((x) => x.id !== task.source.author))
            expect(JSON.stringify(v)).not.toContain("初题" + other.id);
          if (r % 2) {
            s.drawings[task.id] = emptyDrawing();
            s = act(s, p.id, { type: "SUBMIT" }, 1200 + r);
          } else
            s = act(s, p.id, { type: "TEXT", text: "猜测" + p.id }, 1200 + r);
        }
        expect(ids.size).toBe(n);
      }
      expect(s.phase).toBe("REVEAL");
      expect(viewFor(s, ps[0].id).albums?.length).toBe(n);
      expect(viewFor(s, ps[0].id).albums?.[0].entries.length).toBe(1);
      s = act(s, ps[0].id, { type: "NEXT" }, 9999);
      expect(viewFor(s, ps[1].id).albums?.[0].entries.length).toBe(2);
    });
  it("到时自动封存且离线不会卡死", () => {
    let s = startGame("tp", players(3), 1000, { fakeIndex: 1, wordIndex: 0 });
    s = tick(s, s.deadline);
    s = tick(s, s.deadline);
    s = tick(s, s.deadline);
    expect(s.phase).toBe("TASK");
    while (s.phase === "TASK") s = tick(s, s.deadline);
    expect(s.phase).toBe("REVEAL");
  });
});
describe("伪画家自动主持", () => {
  for (let n = 3; n <= 10; n++)
    it(n + "人两圈、隐藏题目、投票及猜题", () => {
      const ps = players(n);
      let s = startGame("fa", ps, 1000, { fakeIndex: 1, wordIndex: 0 });
      expect(viewFor(s, "p1").word).toBeUndefined();
      expect(JSON.stringify(viewFor(s, "p1"))).not.toContain(s.word);
      expect(viewFor(s, "p0").word).toBe(s.word);
      expect(() => act(s, "p2", { type: "SUBMIT" }, 1100)).toThrow();
      for (let i = 0; i < 2 * n; i++)
        s = act(s, s.players[s.turn % n].id, { type: "SUBMIT" }, 1100 + i);
      expect(s.phase).toBe("DISCUSS");
      s = tick(s, s.deadline);
      expect(s.phase).toBe("VOTE");
      for (const p of ps)
        s = act(
          s,
          p.id,
          { type: "VOTE", target: p.id === "p1" ? "p0" : "p1" },
          1300,
        );
      expect(s.phase).toBe("OBSERVE");
      expect(viewFor(s, "p0").options).toBeUndefined();
      s = act(s, "p1", { type: "BEGIN_GUESS" }, 1400);
      const v = viewFor(s, "p1");
      expect(v.options?.length).toBe(18);
      s = act(s, "p1", { type: "GUESS", answer: s.word }, 1500);
      expect(s.winner).toBe("fake");
      expect(s.phase).toBe("RESULT");
    });
  it("三人一票各一票时卧底胜，重复投票不能加票", () => {
    let s = startGame("fa", players(3), 1000, { fakeIndex: 1, wordIndex: 0 });
    for (let i = 0; i < 6; i++)
      s = act(s, s.players[s.turn % 3].id, { type: "SUBMIT" }, 1100);
    s = tick(s, s.deadline);
    s = act(s, "p0", { type: "VOTE", target: "p1" }, 1200);
    expect(() => act(s, "p0", { type: "VOTE", target: "p2" }, 1201)).toThrow();
    s = act(s, "p1", { type: "VOTE", target: "p2" }, 1202);
    s = act(s, "p2", { type: "VOTE", target: "p0" }, 1203);
    expect(s.phase).toBe("RESULT");
    expect(s.winner).toBe("fake");
  });
  it("卧底猜错及超时均让真画家赢", () => {
    let s = startGame("fa", players(3), 1000, { fakeIndex: 1, wordIndex: 0 });
    for (let i = 0; i < 6; i++) s = tick(s, s.deadline);
    s = tick(s, s.deadline);
    s = act(s, "p0", { type: "VOTE", target: "p1" }, s.deadline - 1);
    s = act(s, "p2", { type: "VOTE", target: "p1" }, s.deadline - 1);
    s = tick(s, s.deadline);
    expect(s.phase).toBe("OBSERVE");
    s = tick(s, s.deadline);
    expect(s.phase).toBe("GUESS");
    s = tick(s, s.deadline);
    expect(s.winner).toBe("artists");
  });
});
describe("画作校验", () => {
  it("拒绝NaN/越界/超大点数/非法颜色", () => {
    expect(() => validateStroke({ ...line, points: [[NaN, 1, 0]] })).toThrow();
    expect(() => validateStroke({ ...line, points: [[2000, 1, 0]] })).toThrow();
    expect(() => validateStroke({ ...line, color: 99 })).toThrow();
    expect(() =>
      validateStroke({ ...line, points: Array(12001).fill([1, 2, 3]) }),
    ).toThrow();
  });
  it("分片幂等、乱序拒绝、不允许已封笔再接另一段", () => {
    const d = emptyDrawing();
    appendChunk(d, {
      id: "x",
      seq: 0,
      points: [[1, 2, 0]],
      color: 1,
      width: 8,
      end: false,
    });
    appendChunk(d, {
      id: "x",
      seq: 0,
      points: [[1, 2, 0]],
      color: 1,
      width: 8,
      end: false,
    });
    expect(d.strokes[0].points.length).toBe(1);
    expect(() =>
      appendChunk(d, {
        id: "x",
        seq: 2,
        points: [[1, 2, 0]],
        color: 1,
        width: 8,
        end: false,
      }),
    ).toThrow();
    appendChunk(d, {
      id: "x",
      seq: 1,
      points: [[4, 5, 20]],
      color: 1,
      width: 8,
      end: true,
    });
    expect(() =>
      appendChunk(d, {
        id: "x",
        seq: 2,
        points: [[6, 7, 30]],
        color: 1,
        width: 8,
        end: false,
      }),
    ).toThrow();
  });
});

it("answer option order must be independent of the secret answer", () => {
  const a = startGame("fa", players(3), 1000, { fakeIndex: 1, wordIndex: 0 });
  const b = startGame("fa", players(3), 1000, { fakeIndex: 1, wordIndex: 1 });
  expect(a.options).toEqual(b.options);
  expect(a.options.indexOf(a.word)).not.toBe(b.options.indexOf(b.word));
});
it("negative point time is rejected", () => {
  expect(() => validateStroke({ ...line, points: [[1, 2, -0.5]] })).toThrow();
});
