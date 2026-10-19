import type { Command, GameState } from "./types.ts";

/** 联机协议：浏览器 ⇄ 局域网/云端服务器。两种部署使用同一套。 */

export interface CreateRoomRequest {
  mapId: string;
  survivors: string[];
  killer: string;
  playerCount: 3 | 4 | 5;
  /** 仅在服务器以 DBD_ALLOW_FIXED_SEED=1 启动时生效（测试用）；正式对局由服务器随机生成 */
  seed?: number;
}

export interface SeatInfo {
  seatId: string;
  actors: string[];
  side: "survivor" | "killer";
  claimed: boolean;
  name: string | null;
  connected: boolean;
}

export interface RoomSnapshot {
  code: string;
  seats: SeatInfo[];
  /** 当前连接所占的座位；旁观或尚未选座为 null */
  mySeat: string | null;
  /** 已执行的命令数，用作版本号；提交命令时必须带上，防止重复提交和过期操作。
   *  不能用事件数：「继续」等命令不产生事件，重复点击会被误执行两次。 */
  version: number;
  /** 已按 mySeat 隐藏秘密信息的状态 */
  view: GameState;
}

export interface CommandRequest {
  code: string;
  token: string;
  version: number;
  command: Command;
}

export type Ack<T = {}> =
  ({ ok: true } & T) | { ok: false; error: string; code?: string };

export const EVENTS = {
  create: "room:create",
  join: "room:join",
  claim: "seat:claim",
  command: "game:command",
  update: "room:update",
} as const;
