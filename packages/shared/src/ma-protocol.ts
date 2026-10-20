import type { MAView } from "../../magical-athlete/src/privacy.ts";
import type { MACommand } from "../../magical-athlete/src/types.ts";

/** 魔法运动员联机协议（与黎明杀机共用同一个服务器，事件名加 ma: 前缀，互不干扰） */
export const MA_EVENTS = {
  create: "ma:create",
  join: "ma:join",
  claim: "ma:claim",
  lobby: "ma:lobby",
  command: "ma:command",
  update: "ma:update",
} as const;

export interface MAPointsSetting {
  gold: number;
  silver: number;
}

export interface MARoomSnapshot {
  code: string;
  stage: "lobby" | "game";
  players: Array<{ playerId: string; name: string; connected: boolean; host: boolean }>;
  mySeat: string | null;
  points: MAPointsSetting[];
  /** 3 人房可选双选手变体；2 人房固定双选手 */
  variant: "standard" | "double";
  /** 已执行命令数，提交时带上防止重复/过期 */
  version: number;
  view: MAView | null;
}

export type MALobbyAction =
  | { type: "START" }
  | { type: "SET_POINTS"; points: MAPointsSetting[] }
  | { type: "SET_VARIANT"; variant: "standard" | "double" };

/** 浏览器提交的命令：player 由服务器按凭证填写 */
export type MAClientCommand =
  | { type: "DRAFT"; racer: string }
  | { type: "CHOOSE"; racer?: string; racers?: string[] }
  | { type: "ANSWER"; value: string };

export type { MACommand };
