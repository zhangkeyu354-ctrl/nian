
/** 用户 2026-11-21：这是盘逻辑的游戏，每人发言 120 秒；每人每轮可再延长一次 30 秒。 */
export const SPEECH_MS = 120_000;
export const EXTEND_MS = 30_000;
export type RoundPhase = "round1_search" | "round1_brief" | "round2_search" | "round2_brief" | "round3_search" | "round3_brief" | "result";

export interface RoundState {
  phase: RoundPhase;
  playerCount: number;
  forensicSeat: number;
  round: 1 | 2 | 3;
  tiles: string[];
  markers: Record<string, number>;
  replaced: boolean;
  speaker: number;
  speakerIndex: number;
  speechStartedAt: number | null;
  speechDurationMs: number;
  winner: "good" | "evil" | null;
}

export function beginRoundOne(playerCount: number, forensicSeat: number, location: string, scenes: string[]): RoundState {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 12 || !Number.isInteger(forensicSeat) || forensicSeat < 0 || forensicSeat >= playerCount) throw new RangeError("人数或专家座位无效");
  if (!/^location-[1-4]$/.test(location) || scenes.length !== 4 || new Set(scenes).size !== 4 || scenes.some((tile) => !/^scene-(0[1-9]|1[0-9]|2[01])$/.test(tile))) throw new Error("场景板配置无效");
  return { phase: "round1_search", playerCount, forensicSeat, round: 1, tiles: ["death", location, ...scenes], markers: {}, replaced: false, speaker: -1, speakerIndex: -1, speechStartedAt: null, speechDurationMs: SPEECH_MS, winner: null };
}

export function placeMarker(state: RoundState, seat: number, tile: string, option: number): RoundState {
  if (!state.phase.endsWith("_search") || seat !== state.forensicSeat || !state.tiles.includes(tile) || tile in state.markers || !Number.isInteger(option) || option < 0 || option > 5) throw new Error("现在不能放置该标记");
  return { ...state, markers: { ...state.markers, [tile]: option } };
}

export function replaceScene(state: RoundState, seat: number, oldTile: string, newTile: string): RoundState {
  if (state.phase !== `round${state.round}_search` || state.round === 1 || seat !== state.forensicSeat || state.replaced || !state.tiles.includes(oldTile) || !/^scene-(0[1-9]|1[0-9]|2[01])$/.test(oldTile) || !/^scene-(0[1-9]|1[0-9]|2[01])$/.test(newTile) || state.tiles.includes(newTile)) throw new Error("现在不能替换该场景板");
  const markers = { ...state.markers };
  delete markers[oldTile];
  return { ...state, tiles: state.tiles.map((tile) => tile === oldTile ? newTile : tile), markers, replaced: true };
}

export function beginBrief(state: RoundState, now: number): RoundState {
  if (state.phase !== `round${state.round}_search` || (state.round > 1 && !state.replaced) || state.tiles.some((tile) => !(tile in state.markers))) throw new Error("搜证尚未完成");
  return { ...state, phase: `round${state.round}_brief` as RoundPhase, speaker: (state.forensicSeat + 1) % state.playerCount, speakerIndex: 0, speechStartedAt: now, speechDurationMs: SPEECH_MS };
}

export function extendSpeaker(state: RoundState): RoundState {
  if (state.phase !== `round${state.round}_brief`) throw new Error("当前不是简报阶段");
  // 用户裁定 2026-11-21：每人每轮发言只能延长一次。
  if (state.speechDurationMs > SPEECH_MS) throw new Error("这位玩家本轮已经延长过一次");
  return { ...state, speechDurationMs: state.speechDurationMs + EXTEND_MS };
}

export function nextSpeaker(state: RoundState, now: number): RoundState {
  if (state.phase !== `round${state.round}_brief`) throw new Error("当前不是简报阶段");
  const nextIndex = state.speakerIndex + 1;
  if (nextIndex < state.playerCount - 1) return { ...state, speakerIndex: nextIndex, speaker: (state.forensicSeat + 1 + nextIndex) % state.playerCount, speechStartedAt: now, speechDurationMs: SPEECH_MS };
  if (state.round === 3) return { ...state, phase: "result", speaker: -1, winner: "evil", speechStartedAt: null };
  const round = (state.round + 1) as 2 | 3;
  return { ...state, phase: `round${round}_search`, round, replaced: false, speaker: -1, speakerIndex: -1, speechStartedAt: null, speechDurationMs: SPEECH_MS };
}
