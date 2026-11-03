import type { KBView, Mode } from "../../kariba/src/index.ts";

/** 卡里巴湖联机协议（事件名加 kb: 前缀） */
export const KB_EVENTS = {
  create: "kb:create",
  join: "kb:join",
  claim: "kb:claim",
  lobby: "kb:lobby",
  command: "kb:command",
  update: "kb:update",
} as const;

export interface KBRoomPlayer {
  playerId: string;
  name: string;
  connected: boolean;
  host: boolean;
}

export interface KBRoomSnapshot {
  code: string;
  stage: "lobby" | "game";
  players: KBRoomPlayer[];
  mySeat: string | null;
  /** 开局后：playerId → 座位号 */
  seats: string[];
  /** 大厅选座：playerId → 座位号（0 起） */
  chosen: Record<string, number>;
  mode: Mode;
  seconds: 0 | 30 | 60;
  version: number;
  serverNow: number;
  round: number;
  view: KBView | null;
}

export type KBLobbyAction =
  | { type: "SET_MODE"; mode: Mode }
  | { type: "SET_SECONDS"; seconds: 0 | 30 | 60 }
  | { type: "KICK"; playerId: string }
  | { type: "SIT"; seat: number }
  | { type: "STAND" }
  | { type: "SHUFFLE" }
  | { type: "START" };

/** version = 客户端看到的 snapshot.version，防止重复点击/旧画面出牌 */
export type KBClientCommand = { type: "PLAY"; cardIds: string[]; version: number };
