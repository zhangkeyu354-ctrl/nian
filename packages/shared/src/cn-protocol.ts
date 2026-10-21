import type { CNView } from "../../codenames/src/privacy.ts";
import type { ClueNumber, Team } from "../../codenames/src/types.ts";

/** 《行动代号》联机协议（同一服务器，事件名加 cn: 前缀） */
export const CN_EVENTS = {
  create: "cn:create",
  join: "cn:join",
  claim: "cn:claim",
  lobby: "cn:lobby",
  command: "cn:command",
  update: "cn:update",
} as const;

export type CaptainMode = "random" | "pick";

export interface CNRoomPlayer {
  playerId: string;
  name: string;
  team: Team | null;
  /** 自选模式下报名的队长；游戏中为本局队长 */
  captain: boolean;
  connected: boolean;
  host: boolean;
}

export interface CNRoomSnapshot {
  code: string;
  stage: "lobby" | "game";
  players: CNRoomPlayer[];
  mySeat: string | null;
  captainMode: CaptainMode;
  /** 已执行命令数，提交时带上 */
  version: number;
  /** 服务器当前时间，客户端据此校准倒计时 */
  serverNow: number;
  /** 第几局（从 1 开始） */
  round: number;
  view: CNView | null;
}

export type CNLobbyAction =
  | { type: "JOIN_TEAM"; team: Team | null }
  | { type: "CLAIM_CAPTAIN" }
  | { type: "RELEASE_CAPTAIN" }
  | { type: "SET_MODE"; mode: CaptainMode }
  | { type: "SHUFFLE" }
  | { type: "MOVE"; playerId: string; team: Team | null }
  | { type: "START" }
  | { type: "NEXT" };

/** 浏览器提交的命令：player、at 由服务器填写 */
export type CNClientCommand =
  | { type: "GIVE_CLUE"; word: string; number: ClueNumber }
  | { type: "MARK"; index: number }
  | { type: "REVEAL"; index: number }
  | { type: "END_GUESSING" }
  | { type: "EXTRA_TIME" }
  | { type: "TAKE_OPERATOR" };
