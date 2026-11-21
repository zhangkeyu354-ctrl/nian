import { dealGame } from "./setup.ts";
import { beginNight, chooseEvidence, advanceNight, type NightState } from "./night.ts";
import { beginRoundOne, placeMarker, beginBrief, nextSpeaker, extendSpeaker, replaceScene, type RoundState } from "./rounds.ts";
import { accuse, type OutcomeState } from "./outcome.ts";
import { beginHunt, suggestTarget, submitHunt, expireHunt, type HuntState } from "./hunt.ts";
import { viewFor } from "./privacy.ts";
import type { CrimeSceneRole } from "./roles.ts";
import type { EvidencePair } from "./solve.ts";
import { secretTestimony, traceable, reversal, misinformation, evidenceExclusion, countdown, type EventState } from "./events.ts";

type PendingEvent = { id: string; drawn?: string[]; exclusionNext?: number | null };

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
  log: { type: string; at: number; detail: string; seat?: number; guess?: { owner: number; clue: string; means: string } }[];
  records: { round: number; tiles: string[]; markers: Record<string, number>; at: number }[];
  pendingEvent: PendingEvent | null;
  lastFailed: number | null;
  /** 上一局正确破案的座位（「扭转局势」按原版卡面给他一次额外机会）；第一局或上局无人破案为 null。 */
  previousSolver: number | null;
  /** 第 2、3 轮专家先抽到、尚未放上桌的线索板（原版顺序：先抽新板，再选要换掉的旧板）。只有专家看得到。 */
  pendingDraw: string | null;
  countdownActive: boolean;
  bonusSeat: number | null;
  resultReason: "all_good_badges" | "three_rounds" | "countdown" | null;
}

export type GameCommand =
  | { type: "start"; seat: number; location: string }
  | { type: "choose"; seat: number; clue: string; means: string }
  | { type: "tick" }
  | { type: "mark"; seat: number; tile: string; option: number }
  | { type: "brief"; seat: number }
  | { type: "next_speaker"; seat: number }
  | { type: "extend_speaker"; seat: number }
  | { type: "draw"; seat: number }
  | { type: "replace"; seat: number; oldTile: string }
  | { type: "event_secret"; seat: number; oldTile: string }
  | { type: "event_traceable"; seat: number; oldTile: string; newTile: string }
  | { type: "event_misinformation"; seat: number; tile: string; option: number }
  | { type: "event_exclude"; seat: number; clue: string }
  | { type: "event_countdown"; seat: number; oldTiles: [string, string] }
  | { type: "skip_bonus"; seat: number }
  | { type: "solve"; seat: number; guess: EvidencePair }
  | { type: "suggest"; seat: number; target: number }
  | { type: "submit_hunt"; seat: number };

export function createGame(playerCount: number, forensicSeat: number, cardsPerKind: 3 | 4 | 5, eventsEnabled: boolean, now: number, random: () => number = Math.random, previousSolver: number | null = null): GameState {
  const dealt = dealGame(playerCount, forensicSeat, cardsPerKind, random);
  return { ...dealt, eventsEnabled, bonusAttempts: Array(playerCount).fill(0), night: null, board: null, hunt: null, winner: null, log: [{ type: "setup", at: now, detail: "开局发牌" }], records: [], pendingEvent: null, pendingDraw: null, lastFailed: null, previousSolver: previousSolver !== null && Number.isInteger(previousSolver) && previousSolver >= 0 && previousSolver < playerCount ? previousSolver : null, countdownActive: false, bonusSeat: null, resultReason: null };
}

const logged = (state: GameState, type: string, at: number, detail: string): GameState => ({ ...state, log: [...state.log, { type, at, detail }] });
const recordBoard = (state: GameState, at: number) => state.board && !state.records.some((entry) => entry.round === state.board!.round)
  ? [...state.records, { round: state.board.round, tiles: [...state.board.tiles], markers: { ...state.board.markers }, at }]
  : state.records;

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("随机源须返回 [0, 1) 内的数字");
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function eventState(state: GameState): EventState {
  if (!state.board || !state.answer) throw new Error("事件状态不完整");
  return { phase: state.board.phase, round: state.board.round as 2 | 3, forensicSeat: state.forensicSeat, roles: state.roles, tiles: state.board.tiles, orangeDeck: state.orangeDeck, markers: state.board.markers, badges: state.badges, bonusAttempts: state.bonusAttempts, lastFailed: state.lastFailed, previousSolver: state.previousSolver, players: state.players, answer: state.answer, countdownActive: state.countdownActive, winner: state.winner, exclusionNext: state.pendingEvent?.exclusionNext };
}

/** 「扭转局势」的受益者：上一局正确破案、且本局不是鉴证专家的玩家。 */
function twistSeat(state: GameState): number | null {
  const seat = state.previousSolver;
  return seat !== null && seat >= 0 && seat < state.roles.length && seat !== state.forensicSeat ? seat : null;
}

/**
 * 原版第 2、3 轮：专家先抽一块新板。
 * 抽到线索板：先给专家看，再由专家选一块橙色板替换（replace）。
 * 抽到事件板（出版方裁定）：事件代替这次抽板，场上六块板与标记全部保留，立即执行事件。
 */
function drawNext(state: GameState, now: number, random: () => number): GameState {
  const [top, ...rest] = state.orangeDeck;
  if (!top) throw new Error("橙色牌堆已空");
  if (!top.startsWith("event-")) return logged({ ...state, orangeDeck: rest, pendingDraw: top }, "draw", now, "抽到新线索板");
  return startEvent({ ...state, orangeDeck: rest, board: { ...state.board!, replaced: true } }, top, now, random);
}

function startEvent(state: GameState, id: string, now: number, random: () => number): GameState {
  const board = state.board!;
  if (id === "event-01" && !state.roles.includes("witness")) return logged({ ...state, phase: board.phase, pendingEvent: null }, "event", now, "秘密证供：无目击者，跳过");
  if (id === "event-02") {
    // 有据可寻：抽五块候选（可能含事件板，事件板不能选也不触发）。五块全是事件时洗混重抽，避免卡死。
    let deck = state.orangeDeck;
    for (let attempt = 0; attempt < 20 && deck.slice(0, 5).every((tile) => tile.startsWith("event-")); attempt++) deck = shuffle(deck, random);
    if (!deck.slice(0, 5).some((tile) => tile.startsWith("scene-"))) return logged({ ...state, phase: board.phase, pendingEvent: null }, "event", now, "有据可寻：牌堆没有可选线索板，跳过");
    return logged({ ...state, orangeDeck: deck.slice(5), pendingEvent: { id, drawn: deck.slice(0, 5) }, phase: "event" }, "event", now, id);
  }
  if (id === "event-03") {
    const twist = twistSeat(state);
    if (twist !== null) {
      const bonusAttempts = [...state.bonusAttempts];
      bonusAttempts[twist]++;
      return logged({ ...state, bonusAttempts, pendingEvent: { id }, phase: "event_bonus", bonusSeat: twist }, "event", now, id);
    }
    // 原版卡面：无人适用则弃掉此板，再抽下一块；下一块是线索板就正常换一次，是事件就执行该事件。
    return drawNext(logged({ ...state, pendingEvent: null, phase: board.phase, board: { ...board, replaced: false } }, "event", now, "扭转局势：无人适用，再抽一块"), now, random);
  }
  return logged({ ...state, pendingEvent: { id }, phase: "event" }, "event", now, id);
}

function finishEvent(state: GameState, result: EventState, now: number, done = true): GameState {
  const board = { ...state.board!, tiles: result.tiles, markers: result.markers };
  const pendingEvent = done ? null : { ...state.pendingEvent!, exclusionNext: result.exclusionNext };
  return logged({ ...state, phase: done ? board.phase : "event", board, orangeDeck: result.orangeDeck, players: state.players.map((player, seat) => ({ ...player, excludedClues: result.players[seat].excludedClues })), bonusAttempts: result.bonusAttempts, countdownActive: result.countdownActive, pendingEvent }, "event", now, state.pendingEvent!.id);
}

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
    if (state.phase === "event_bonus" && command.seat !== state.bonusSeat) throw new Error("仅上一位破案失败者可使用额外机会");
    const outcome: OutcomeState = { phase: state.phase === "event_bonus" ? state.board!.phase : state.phase, roles: state.roles, badges: state.badges, bonusAttempts: state.bonusAttempts, answer: state.answer, players: state.players, winner: state.winner, hunt: null };
    const result = accuse(outcome, command.seat, command.guess);
    if (result === outcome) return state;
    const hunt = result.phase === "witness_hunt" ? beginHunt(state.roles, now) : null;
    const correct = command.guess.owner === state.answer.owner && command.guess.clue === state.answer.clue && command.guess.means === state.answer.means;
    const detail = !correct ? "错！" : result.winner ? "破案" : "破案成功，进入反杀";
    const next = logged({ ...state, phase: result.phase, badges: result.badges, bonusAttempts: result.bonusAttempts ?? state.bonusAttempts, winner: result.winner, hunt, bonusSeat: null, pendingEvent: state.phase === "event_bonus" ? null : state.pendingEvent, resultReason: result.phase === "result" && result.winner === "evil" ? "all_good_badges" : null, lastFailed: correct ? state.lastFailed : command.seat, records: result.phase !== state.phase && result.phase !== state.board?.phase ? recordBoard(state, now) : state.records }, result.phase === "result" ? "result" : "solve", now, detail);
    // 指认在桌上是公开的：记录谁指认了哪一组，界面据此播报与标记。
    next.log[next.log.length - 1] = { ...next.log[next.log.length - 1], seat: command.seat, guess: { ...command.guess } };
    return next;
  }
  if (command.type === "skip_bonus") {
    if (state.phase !== "event_bonus" || command.seat !== state.bonusSeat || !state.board) throw new Error("现在不能放弃额外破案机会");
    const bonusAttempts = [...state.bonusAttempts];
    bonusAttempts[command.seat] = Math.max(0, bonusAttempts[command.seat] - 1);
    return logged({ ...state, phase: state.board.phase, bonusSeat: null, bonusAttempts, pendingEvent: null }, "event", now, "放弃额外破案机会");
  }
  if (command.type === "draw") {
    const b = state.board;
    if (!b || state.phase !== b.phase || b.phase !== `round${b.round}_search` || b.round === 1 || command.seat !== state.forensicSeat || b.replaced || state.pendingDraw) throw new Error("现在不能抽新板");
    return drawNext(state, now, random);
  }
  if (state.phase === "event" && state.pendingEvent && state.board) {
    const event = state.pendingEvent;
    const current = eventState(state);
    if (event.id === "event-01" && command.type === "event_secret") {
      const witness = state.roles.indexOf("witness");
      if (command.seat !== witness) throw new Error("只有目击者可以秘密指定场景板");
      const newTile = state.orangeDeck.find((tile) => tile.startsWith("scene-"));
      if (!newTile) throw new Error("橙色牌堆已空");
      return finishEvent(state, secretTestimony(current, witness, command.oldTile, newTile), now);
    }
    if (event.id === "event-02" && command.type === "event_traceable") {
      const result = traceable(current, command.seat, event.drawn ?? [], command.newTile, command.oldTile);
      // 本站房规：未选中的候选板洗回剩余牌堆，专家不能借此得知后面的抽牌顺序。
      return finishEvent(state, { ...result, orangeDeck: shuffle(result.orangeDeck, random) }, now);
    }
    if (event.id === "event-04" && command.type === "event_misinformation") return finishEvent(state, misinformation(current, command.seat, command.tile, command.option), now);
    if (event.id === "event-05" && command.type === "event_exclude") {
      const result = evidenceExclusion(current, command.seat, command.clue);
      return finishEvent(state, result, now, result.exclusionNext === null);
    }
    if (event.id === "event-06" && command.type === "event_countdown") {
      const choices = state.orangeDeck.filter((tile) => tile.startsWith("scene-")).slice(0, 2);
      if (choices.length !== 2) throw new Error("橙色牌堆不足");
      return finishEvent(state, countdown(current, command.seat, command.oldTiles, choices as [string, string]), now);
    }
    throw new Error("当前事件不能执行此操作");
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
    if (!state.pendingDraw) throw new Error("请先抽一块新板");
    board = replaceScene(state.board, command.seat, command.oldTile, state.pendingDraw);
  } else throw new Error("未知操作");
  let orangeDeck = state.orangeDeck;
  if (command.type === "next_speaker" && board.round === 2 && state.board.round === 1 && state.eventsEnabled) orangeDeck = shuffle([...state.orangeDeck, ...Array.from({ length: 6 }, (_, index) => `event-0${index + 1}`)], random);
  const pendingDraw = command.type === "replace" ? null : state.pendingDraw;
  if (command.type === "next_speaker" && state.countdownActive && board.phase !== state.board.phase) board = { ...board, phase: "result", winner: "evil" };
  const records = command.type === "next_speaker" && board.phase !== state.board.phase ? recordBoard(state, now) : state.records;
  return logged({ ...state, phase: board.phase, board, orangeDeck, pendingDraw, winner: board.winner, resultReason: board.phase === "result" ? (state.countdownActive ? "countdown" : "three_rounds") : state.resultReason, records }, command.type, now, command.type);
}

export function gameView(state: GameState, seat: number) {
  const base = viewFor(state, seat);
  return { ...base,
    log: state.log.map((entry) => ({ ...entry })),
    ...(state.phase === "result" ? { records: state.records.map((entry) => ({ round: entry.round, tiles: [...entry.tiles], markers: { ...entry.markers }, at: entry.at })) } : {}),
    ...(state.phase === "setup" ? { locationOptions: [...state.locationOptions] } : {}),
    ...(state.phase === "night_killer" && state.roles[seat] === "killer" && state.night ? { nightDeadline: state.night.choiceDeadline } : {}),
    board: state.board ? { phase: state.board.phase, round: state.board.round, tiles: [...state.board.tiles], markers: { ...state.board.markers }, replaced: state.board.replaced, speaker: state.board.speaker, speechStartedAt: state.board.speechStartedAt, speechDurationMs: state.board.speechDurationMs } : null,
    badges: [...state.badges], bonusAttempts: state.bonusAttempts[seat], bonusSeat: state.phase === "event_bonus" ? state.bonusSeat : undefined, winner: state.winner, resultReason: state.phase === "result" ? state.resultReason : undefined,
    ...(seat === state.forensicSeat && state.pendingDraw ? { pendingDraw: state.pendingDraw } : {}),
    ...(state.pendingEvent ? { event: { id: state.pendingEvent.id, exclusionNext: state.pendingEvent.exclusionNext, ...(seat === state.forensicSeat && state.pendingEvent.drawn ? { drawn: [...state.pendingEvent.drawn] } : {}) } } : {}),
    ...(state.phase === "witness_hunt" && state.hunt && ["killer", "accomplice"].includes(state.roles[seat]) ? { hunt: { deadline: state.hunt.deadline, suggestions: { ...state.hunt.suggestions }, candidates: state.roles.flatMap((role, index) => role === "investigator" || role === "witness" ? [index] : []) } } : {}),
  };
}
