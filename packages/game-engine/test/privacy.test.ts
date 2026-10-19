import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createGame, reduce, viewFor, HIDDEN } from "../src/index.ts";
import type { GameState } from "../../shared/src/types.ts";

const replay = (seed: number) =>
  JSON.parse(readFileSync(`docs/phase1/games/${seed}.replay.json`, "utf8"));

function* states(seed: number) {
  const r = replay(seed);
  let s = createGame(r.options);
  yield s;
  for (const c of r.commands) {
    s = reduce(s, c);
    yield s;
  }
}

/** 对一个玩家视图检查：不能包含他无权知道的信息 */
function assertNoLeak(full: GameState, seat: string) {
  const v: any = viewFor(full, seat);
  const json = JSON.stringify(v);
  expect(v.seed).toBe(0);
  expect(v.rng).toBe(0);
  expect(json.includes(`"seed":${full.seed}`)).toBe(false);
  full.props.forEach((p, i) => {
    if (!p.revealed) expect(v.props[i].kind).toBe(HIDDEN);
    else expect(v.props[i].kind).toBe(p.kind);
  });
  expect(v.itemDeck.every((x: string) => x === HIDDEN)).toBe(true);
  for (const [owner, hand] of Object.entries(full.hands))
    if (owner !== seat) {
      expect(v.hands[owner].length).toBe(hand.length);
      expect(v.hands[owner].every((c: string) => c === HIDDEN)).toBe(true);
    } else expect(v.hands[owner]).toEqual(hand);
  for (const [id, cards] of Object.entries(full.plans)) {
    const a = full.actors[id];
    if (a.ownerId === seat || full.publicPlans.includes(id))
      expect(v.plans[id]).toEqual(cards);
    else
      v.plans[id].forEach((c: string, i: number) => {
        // 只有回合已经开始（牌已翻开）才能看到
        if (c !== HIDDEN) {
          expect(c).toBe(cards[i]);
          expect(
            full.events.some(
              (e) =>
                (e.type === "TURN_START" ||
                  e.type === "PLANNED_CARD_REVEALED") &&
                e.data.actorId === id &&
                e.data.index === i,
            ),
          ).toBe(true);
        }
      });
  }
  for (const a of Object.values(full.actors))
    if (a.item && a.ownerId !== seat) expect(v.actors[a.id].item).toBe(HIDDEN);
}

describe("联机隐藏信息", () => {
  for (const seed of [1701, 2903, 4111])
    it(`回放 ${seed} 的每一步，每个座位都看不到别人的秘密`, () => {
      let checked = 0;
      for (const s of states(seed)) {
        const seats = [
          ...new Set(Object.values(s.actors).map((a) => a.ownerId)),
        ];
        for (const seat of seats) assertNoLeak(s, seat);
        checked++;
      }
      expect(checked).toBeGreaterThan(50);
    });

  it("计划阶段：杀手看不到逃生者已经提交的计划牌", () => {
    const r = replay(1701);
    let s = createGame(r.options);
    for (const c of r.commands) {
      s = reduce(s, c);
      if (s.phase === "PLANNING" && Object.keys(s.plans).length >= 2) break;
    }
    const killerSeat = s.actors[s.killerId].ownerId;
    const v = viewFor(s, killerSeat);
    const planned = Object.keys(s.plans).filter((id) => id !== s.killerId);
    expect(planned.length).toBeGreaterThan(0);
    for (const id of planned)
      expect((v.plans[id] as string[]).every((c) => c === HIDDEN)).toBe(true);
  });

  it("视图不会修改原始状态", () => {
    const s = createGame(replay(2903).options);
    const before = JSON.stringify(s);
    viewFor(s, "trapper");
    expect(JSON.stringify(s)).toBe(before);
  });
});
