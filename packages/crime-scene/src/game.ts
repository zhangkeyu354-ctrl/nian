import { dealGame } from "./setup.ts";
import { beginNight, chooseEvidence, advanceNight, type NightState } from "./night.ts";
import { beginRoundOne, placeMarker, beginBrief, nextSpeaker, extendSpeaker, replaceScene, type RoundState } from "./rounds.ts";
import { accuse, type OutcomeState } from "./outcome.ts";
import { beginHunt, suggestTarget, submitHunt, expireHunt, type HuntState } from "./hunt.ts";
import { viewFor } from "./privacy.ts";
import type { CrimeSceneRole } from "./roles.ts";
import type { EvidencePair } from "./solve.ts";

export interface GameState {
  phase: string;
  roles: CrimeSceneRole[];
  forensicSeat: number;
  players: { seat: number; clues: string[]; means: string[]; excludedClues: string[] }[];
  badges: boolean[];
  bonusAttempts: number[];
  locationOptions: string[];
  orangeDeck: string[];
  eventsEnabled: boolean;
  night: NightState | null;
  board: RoundState | null;
  hunt: HuntState | null;
  answer?: EvidencePair;
  winner: "good" | "evil" | null;
  log: { type: string; at: number; detail: string }[];
  records: { round: number; tiles: string[]; markers: Record<string, number>; at: number }[];
}

export type GameCommand =
  | { type: "start"; seat: number; location: string }
  | { type: "choose"; seat: number; clue: string; means: string }
  | { type: "tick" }
  | { type: "mark"; seat: number; tile: string; option: number }
  | { type: "brief"; seat: number }
  | { type: "next_speaker"; seat: number }
  | { type: "extend_speaker"; seat: number }
  | { type: "replace"; seat: number; oldTile: string }
  | { type: "solve"; seat: number; guess: EvidencePair }
  | { type: "suggest"; seat: number; target: number }
  | { type: "submit_hunt"; seat: number };

export function createGame(playerCount: number, forensicSeat: number, cardsPerKind: 3 | 4 | 5, eventsEnabled: boolean, now: number, random: () => number = Math.random): GameState {
  if (eventsEnabled) throw new Error("特殊事件流程尚未接入完整对局");
  const dealt = dealGame(playerCount, forensicSeat, cardsPerKind, random);
  return { ...dealt, eventsEnabled, bonusAttempts: Array(playerCount).fill(0), night: null, board: null, hunt: null, winner: null, log: [{ type: "setup", at: now, detail: "开局发牌" }], records: [] };
}

const logged = (state: GameState, type: string, at: number, detail: string): GameState => ({ ...state, log: [...state.log, { type, at, detail }] });
const recordBoard = (state: GameState, at: number) => state.board && !state.records.some((entry) => entry.round === state.board!.round)
  ? [...state.records, { round: state.board.round, tiles: [...state.board.tiles], markers: { ...state.board.markers }, at }]
  : state.records;

export function reduceGame(state: GameState, command: GameCommand, now: number, random: () => number = Math.random): GameState {
  if (command.type === "start") {
    if (state.phase !== "setup" || command.seat !== state.forensicSeat || !state.locationOptions.includes(command.location)) throw new Error("现在不能开始案发阶段");
    const night = beginNight(state.players, state.roles.indexOf("killer"), now, random);
    return logged({ ...state, phase: night.phase, night, locationOptions: [command.location] }, "night", now, "夜晚开始");
  }
  if (command.type === "choose") {
    if (!state.night) throw new Error("当前不是案发阶段");
    const night = chooseEvidence(state.night, command.seat, command.clue, command.means, now);
    return { ...state, night, answer: night.answer };
  }
  if (command.type === "tick") {
    if (state.phase === "night_killer" && state.night) {
      const night = advanceNight(state.night, now, random);
      if (night.phase === "night_killer") return state;
      const scenes = state.orangeDeck.slice(0, 4);
      const board = beginRoundOne(state.roles.length, state.forensicSeat, state.locationOptions[0], scenes);
      return logged({ ...state, phase: board.phase, night, answer: night.answer, board, orangeDeck: state.orangeDeck.slice(4) }, "search", now, "第一轮搜证");
    }
    if (state.phase === "witness_hunt" && state.hunt) {
      const hunt = expireHunt(state.hunt, now);
      return hunt === state.hunt ? state : logged({ ...state, phase: hunt.phase, hunt, winner: hunt.winner }, "result", now, "反杀结束");
    }
    return state;
  }
  if (command.type === "solve") {
    if (!state.answer) throw new Error("尚未选定关键证物");
    const outcome: OutcomeState = { phase: state.phase, roles: state.roles, badges: state.badges, bonusAttempts: state.bonusAttempts, answer: state.answer, players: state.players, winner: state.winner, hunt: null };
    const result = accuse(outcome, command.seat, command.guess);
    if (result === outcome) return state;
    const hunt = result.phase === "witness_hunt" ? beginHunt(state.roles, now) : null;
    const correct = command.guess.owner === state.answer.owner && command.guess.clue === state.answer.clue && command.guess.means === state.answer.means;
    const detail = !correct ? "错！" : result.winner ? "破案" : "破案成功，进入反杀";
    return logged({ ...state, phase: result.phase, badges: result.badges, bonusAttempts: result.bonusAttempts ?? state.bonusAttempts, winner: result.winner, hunt, records: result.phase !== state.phase ? recordBoard(state, now) : state.records }, result.phase === "result" ? "result" : "solve", now, detail);
  }
  if (command.type === "suggest") {
    if (!state.hunt) throw new Error("当前不能建议反杀目标");
    return { ...state, hunt: suggestTarget(state.hunt, command.seat, command.target, now) };
  }
  if (command.type === "submit_hunt") {
    if (!state.hunt) throw new Error("当前不能提交反杀");
    const hunt = submitHunt(state.hunt, command.seat, now);
    return logged({ ...state, phase: hunt.phase, hunt, winner: hunt.winner }, "result", now, "反杀结束");
  }
  if (!state.board || state.phase !== state.board.phase) throw new Error("当前没有可操作的案件板");
  let board: RoundState;
  if (command.type === "mark") board = placeMarker(state.board, command.seat, command.tile, command.option);
  else if (command.type === "brief") {
    if (command.seat !== state.forensicSeat) throw new Error("只有鉴证专家可开始简报");
    board = beginBrief(state.board, now);
  } else if (command.type === "next_speaker") {
    if (command.seat !== state.board.speaker && command.seat !== state.forensicSeat) throw new Error("只有当前发言人或鉴证专家可结束发言");
    board = nextSpeaker(state.board, now);
  } else if (command.type === "extend_speaker") {
    if (command.seat !== state.board.speaker && command.seat !== state.forensicSeat) throw new Error("只有当前发言人或鉴证专家可延长发言");
    board = extendSpeaker(state.board);
  } else if (command.type === "replace") {
    const newTile = state.orangeDeck[0];
    if (!newTile) throw new Error("橙色牌堆已空");
    board = replaceScene(state.board, command.seat, command.oldTile, newTile);
  } else throw new Error("未知操作");
  const orangeDeck = command.type === "replace" ? state.orangeDeck.slice(1) : state.orangeDeck;
  const records = command.type === "next_speaker" && board.phase !== state.board.phase ? recordBoard(state, now) : state.records;
  return logged({ ...state, phase: board.phase, board, orangeDeck, winner: board.winner, records }, command.type, now, command.type);
}

export function gameView(state: GameState, seat: number) {
  const base = viewFor(state, seat);
  return { ...base,
    log: state.log.map((entry) => ({ ...entry })),
    ...(state.phase === "result" ? { records: state.records.map((entry) => ({ round: entry.round, tiles: [...entry.tiles], markers: { ...entry.markers }, at: entry.at })) } : {}),
    ...(state.phase === "setup" ? { locationOptions: [...state.locationOptions] } : {}),
    ...(state.phase === "night_killer" && state.roles[seat] === "killer" && state.night ? { nightDeadline: state.night.choiceDeadline } : {}),
    board: state.board ? { phase: state.board.phase, round: state.board.round, tiles: [...state.board.tiles], markers: { ...state.board.markers }, speaker: state.board.speaker, speechStartedAt: state.board.speechStartedAt, speechDurationMs: state.board.speechDurationMs } : null,
    badges: [...state.badges], winner: state.winner,
    ...(state.phase === "witness_hunt" && state.hunt && ["killer", "accomplice"].includes(state.roles[seat]) ? { hunt: { deadline: state.hunt.deadline, suggestions: { ...state.hunt.suggestions }, candidates: state.roles.flatMap((role, index) => role === "investigator" || role === "witness" ? [index] : []) } } : {}),
  };
}
