import type { RRView } from "../../reflex-race/src/engine.ts";

/** 《眼疾手快》联机协议（同一服务器，事件名加 rr: 前缀） */
export const RR_EVENTS = {
  create: "rr:create",
  join: "rr:join",
  claim: "rr:claim",
  lobby: "rr:lobby",
  command: "rr:command",
  update: "rr:update",
  /** 校准时钟：返回服务器当前时间 */
  ping: "rr:ping",
} as const;

export interface RRRoomPlayer {
  playerId: string;
  name: string;
  connected: boolean;
  host: boolean;
}

export interface RRRoomSnapshot {
  code: string;
  stage: "lobby" | "game";
  players: RRRoomPlayer[];
  mySeat: string | null;
  /** 房主设定的目标分 */
  target: number;
  version: number;
  /** 服务器当前时间，客户端据此校准「图同时出现」的时刻 */
  serverNow: number;
  round: number;
  view: RRView | null;
}

export type RRLobbyAction =
  | { type: "SET_TARGET"; target: number }
  | { type: "KICK"; playerId: string }
  | { type: "START" }
  | { type: "NEXT" };

export type RRClientCommand = { type: "TAP"; obj: number };
