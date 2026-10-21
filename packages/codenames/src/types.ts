/** 《行动代号》规则引擎类型。规则依据见 docs/codenames/CODENAMES_RULE_MATRIX.md */

export type Team = "red" | "blue";
export type Role = Team | "neutral" | "assassin";
export const TEAMS: readonly Team[] = ["red", "blue"];
export const other = (t: Team): Team => (t === "red" ? "blue" : "red");

/** 线索数字：0–9，或 "inf"（无限） */
export type ClueNumber = number | "inf";

export interface CNCard {
  word: string;
  role: Role;
  revealed: boolean;
}

export interface CNPlayer {
  id: string;
  name: string;
  team: Team;
}

export interface CNTiming {
  /** 队长出线索时限（毫秒），HR 2.2 = 60 秒 */
  clueMs: number;
  /** 猜词时限（毫秒），HR 2.3 = 120 秒 */
  guessMs: number;
  /** 每队一次加时（毫秒），HR 2.5 = 30 秒 */
  extraMs: number;
}
export const DEFAULT_TIMING: CNTiming = { clueMs: 60_000, guessMs: 120_000, extraMs: 30_000 };

export type TurnEnd =
  | "wrong" // 翻到中立或对方
  | "limit" // 达到 N+1 上限
  | "stop" // 主动结束
  | "clue-timeout" // 60 秒没出线索
  | "guess-timeout" // 猜词时间到
  | "assassin"
  | "win";

export interface CNReveal {
  index: number;
  word: string;
  role: Role;
  by: string;
}

/** 一个回合的记录 */
export interface CNTurnLog {
  team: Team;
  clue: { word: string; number: ClueNumber } | null;
  reveals: CNReveal[];
  extra: boolean;
  end: TurnEnd | null;
}

export interface CNState {
  players: CNPlayer[];
  captains: Record<Team, string>;
  /** 每队负责确认翻牌的人（HR 2.3） */
  operators: Record<Team, string>;
  cards: CNCard[];
  first: Team;
  turn: Team;
  phase: "clue" | "guess" | "over";
  /** 当前阶段截止时刻（毫秒时间戳）；结束后为 0 */
  deadline: number;
  timing: CNTiming;
  /** 当前线索允许的最大翻牌数；null = 不限（0 / ∞ 线索，或还没出线索） */
  limit: number | null;
  guessesMade: number;
  /** 讨论标记：牌序号 → 标记的玩家 id */
  marks: Record<number, string[]>;
  extraUsed: Record<Team, boolean>;
  log: CNTurnLog[];
  winner: Team | null;
  endReason: "all" | "assassin" | null;
}

export type CNCommand =
  | { type: "GIVE_CLUE"; player: string; at: number; word: string; number: ClueNumber }
  | { type: "MARK"; player: string; at: number; index: number }
  | { type: "REVEAL"; player: string; at: number; index: number }
  | { type: "END_GUESSING"; player: string; at: number }
  | { type: "EXTRA_TIME"; player: string; at: number }
  | { type: "TAKE_OPERATOR"; player: string; at: number }
  | { type: "TIMEOUT"; at: number };

export interface CNSetup {
  players: CNPlayer[];
  /** 自选队长：两队都给出；随机队长：不给，由引擎用种子从队员中抽 */
  captains?: Partial<Record<Team, string>>;
  /** 词库（至少 25 个不重复词） */
  words: readonly string[];
  seed: number;
  now: number;
  timing?: CNTiming;
}
