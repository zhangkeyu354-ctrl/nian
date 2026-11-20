import type { CrimeSceneRole } from "./roles.ts";
import type { EvidencePair } from "./solve.ts";

export interface EventState {
  phase: string;
  round: 2 | 3;
  forensicSeat: number;
  roles: CrimeSceneRole[];
  tiles: string[];
  orangeDeck: string[];
  markers: Record<string, number>;
  badges: boolean[];
  bonusAttempts: number[];
  lastFailed: number | null;
  players: { seat: number; clues: string[]; excludedClues: string[] }[];
  answer: EvidencePair;
  countdownActive: boolean;
  winner: "good" | "evil" | null;
  exclusionNext?: number | null;
  extraDrawn?: string[];
}

const isOrange = (tile: string) => /^scene-(0[1-9]|1[0-9]|2[01])$/.test(tile);
const search = (state: EventState) => {
  if (state.phase !== `round${state.round}_search`) throw new Error("当前不是换板阶段");
};
const forensic = (state: EventState, seat: number) => {
  if (seat !== state.forensicSeat) throw new Error("只有鉴证专家可以操作场景板");
};
const takeOrange = (state: EventState, tile: string) => {
  if (!isOrange(tile) || !state.orangeDeck.includes(tile)) throw new Error("替补必须来自橙色牌堆");
  return state.orangeDeck.filter((item) => item !== tile);
};
const swap = (state: EventState, oldTile: string, newTile: string, orangeDeck: string[]): EventState => {
  if (!isOrange(oldTile) || !state.tiles.includes(oldTile) || state.tiles.includes(newTile)) throw new Error("只能替换场上的橙色板");
  const markers = { ...state.markers };
  delete markers[oldTile];
  return { ...state, tiles: state.tiles.map((tile) => tile === oldTile ? newTile : tile), markers, orangeDeck };
};

export function secretTestimony(state: EventState, witnessSeat: number | null, oldTile: string | null, newTile: string | null): EventState {
  search(state);
  const witness = state.roles.indexOf("witness");
  if (witness < 0) return state;
  if (witnessSeat !== witness || !oldTile || !newTile) throw new Error("目击者必须秘密指定一块橙色板");
  return swap(state, oldTile, newTile, takeOrange(state, newTile));
}

export function traceable(state: EventState, seat: number, drawn: string[], chosen: string, oldTile: string): EventState {
  search(state); forensic(state, seat);
  if (drawn.length !== 5 || new Set(drawn).size !== 5 || drawn.some((tile) => !state.orangeDeck.includes(tile)) || !drawn.includes(chosen)) throw new Error("必须从橙色牌堆抽五块并选一块");
  return swap(state, oldTile, chosen, takeOrange(state, chosen));
}

export function reversal(state: EventState, fallbackTile: string): EventState {
  search(state);
  const target = state.lastFailed;
  if (target !== null && Number.isInteger(target) && target >= 0 && target < state.roles.length) {
    const bonusAttempts = [...state.bonusAttempts];
    bonusAttempts[target]++;
    return { ...state, bonusAttempts };
  }
  return { ...state, orangeDeck: takeOrange(state, fallbackTile), extraDrawn: [...(state.extraDrawn ?? []), fallbackTile] };
}

export function misinformation(state: EventState, seat: number, tile: string, option: number): EventState {
  search(state); forensic(state, seat);
  if (!state.tiles.includes(tile) || !(tile in state.markers) || !Number.isInteger(option) || option < 0 || option > 5 || option === state.markers[tile]) throw new Error("必须把已有标记移到同板另一选项");
  return { ...state, markers: { ...state.markers, [tile]: option } };
}

export function evidenceExclusion(state: EventState, seat: number, clue: string): EventState {
  search(state);
  const start = (state.forensicSeat - 1 + state.roles.length) % state.roles.length;
  const expected = state.exclusionNext === undefined ? start : state.exclusionNext;
  if (expected === null || seat !== expected || seat === state.forensicSeat) throw new Error("未轮到该玩家排除证据");
  const player = state.players[seat];
  if (!player?.clues.includes(clue) || player.excludedClues.includes(clue) || (state.roles[seat] === "killer" && state.answer.owner === seat && state.answer.clue === clue)) throw new Error("该线索不能排除");
  const players = state.players.map((p) => p.seat === seat ? { ...p, excludedClues: [...p.excludedClues, clue] } : p);
  const next = (seat - 1 + state.roles.length) % state.roles.length;
  return { ...state, players, exclusionNext: next === state.forensicSeat ? null : next };
}

export function countdown(state: EventState, seat: number, oldTiles: [string, string], newTiles: [string, string]): EventState {
  search(state); forensic(state, seat);
  if (new Set(oldTiles).size !== 2 || new Set(newTiles).size !== 2) throw new Error("必须替换两块不同的橙色板");
  const first = swap(state, oldTiles[0], newTiles[0], takeOrange(state, newTiles[0]));
  const second = swap(first, oldTiles[1], newTiles[1], takeOrange(first, newTiles[1]));
  return { ...second, countdownActive: true };
}

export function finishEventBrief(state: EventState): EventState {
  if (!state.countdownActive || state.phase !== `round${state.round}_brief`) throw new Error("当前不能提前结算");
  return { ...state, phase: "result", winner: state.winner ?? "evil" };
}
