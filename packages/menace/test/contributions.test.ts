import { expect, it } from "vitest";
import { createGame, reduce, viewFor, type CardType, type State } from "../src/index.ts";

function resolving(cards: [number, CardType][]): State {
  const state = createGame(4, 11);
  state.phase = "resolve";
  state.oxygen = 12;
  state.energy = 10;
  state.resStart = 10;
  state.players.forEach((player, seat) => { player.agenda = seat === 3 ? "butcher" : "loyal"; });
  state.woundDeck.unshift("flesh");
  state.queue = cards.map(([seat, type], index) => ({ seat, card: { id: 900 + index, type } }));
  return state;
}

it("统计补充和消耗的实际数值，结算前不公开个人贡献", () => {
  let state = resolving([
    ...Array.from({ length: 4 }, (): [number, CardType] => [1, "raise_morale"]),
    ...Array.from({ length: 6 }, (): [number, CardType] => [1, "airlock"]),
    [-1, "raise_morale"],
  ]);
  while (state.phase === "resolve") state = reduce(state, { seat: 0, t: "reveal" });
  expect(state.oxygen).toBe(11);
  expect(state.contributions?.seats[1].oxygen).toEqual({ gained: 4, spent: 6 });
  expect(viewFor(state, 0).contributions).toBeUndefined();
  state.phase = "over";
  expect(viewFor(state, 2).contributions?.seats[1].oxygen).toEqual({ gained: 4, spent: 6 });
});

it("限额只记生效能量，复制的额外贡献归复制牌玩家", () => {
  let state = resolving([[0, "replicate"], [1, "advanced_repair"]]);
  state.energy = 14;
  state = reduce(state, { seat: 0, t: "reveal" });
  state = reduce(state, { seat: 0, t: "reveal" });
  expect(state.contributions?.seats[1]).toEqual({ damage: 0, damageTaken: 0, oxygen: { gained: 0, spent: 1 }, energy: { gained: 1, spent: 0 } });
  expect(state.contributions?.seats[0].energy.gained).toBe(0);
  state = resolving([[0, "replicate"], [1, "advanced_repair"]]);
  state = reduce(reduce(state, { seat: 0, t: "reveal" }), { seat: 0, t: "reveal" });
  expect(state.contributions?.seats[0].energy.gained).toBe(2);
});

it("斗殴由领袖选择目标，伤害归暗置玩家且选择时不公开来源", () => {
  let state = resolving([[2, "brawl"]]);
  state = reduce(state, { seat: 0, t: "reveal" });
  expect(viewFor(state, 0).question).toEqual({ q: "brawl", data: undefined });
  state = reduce(state, { seat: 0, t: "answer", value: 1 });
  expect(state.players[1].wounds).toEqual(["flesh"]);
  expect(state.contributions?.seats[1].damageTaken).toBe(1);
  expect(state.contributions?.seats.map(entry => entry.damage)).toEqual([0, 0, 1, 0]);
});

it("取消的牌不记贡献，旧存档标为部分统计", () => {
  let state = resolving([[1, "advanced_repair"]]);
  delete state.contributions;
  state.flags.veto = 0;
  state = reduce(state, { seat: 0, t: "reveal" });
  state = reduce(state, { seat: 0, t: "answer", value: true });
  expect(state.contributions?.partial).toBe(true);
  expect(state.contributions?.seats[1]).toEqual({ damage: 0, damageTaken: 0, oxygen: { gained: 0, spent: 0 }, energy: { gained: 0, spent: 0 } });
});
