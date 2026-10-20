import type { Command, GameState } from "./types.ts";

/** 联机协议：浏览器 ⇄ 局域网/云端服务器。两种部署使用同一套。 */

/** 测试与回放用：直接指定地图、角色和种子，跳过房间内选阵营与选角色。
 * 仅在服务器以 DBD_ALLOW_FIXED_SEED=1 启动时可用。 */
export interface PresetGame {
  mapId: string;
  survivors: string[];
  killer: string;
  seed: number;
}

export interface CreateRoomRequest {
  /** 房间人数，创建后房主还可以修改（不少于已在房间的人数） */
  playerCount: 3 | 4 | 5;
  /** 只在测试服务器生效 */
  preset?: PresetGame;
}

/** 游戏中的座位（每位玩家一个） */
export interface SeatInfo {
  seatId: string;
  actors: string[];
  side: "survivor" | "killer";
  claimed: boolean;
  name: string | null;
  connected: boolean;
}

export type Side = "survivor" | "killer";

/** 房间阶段：lobby 选阵营 → draft 选角色 → game 对局 */
export interface LobbyInfo {
  stage: "lobby" | "draft" | "game";
  /** preset：测试房间，座位预先固定，用旧的选座流程 */
  mode: "lobby" | "preset";
  playerCount: 3 | 4 | 5;
  players: Array<{
    playerId: string;
    name: string | null;
    side: Side | null;
    /** 3–4 人时愿意一人操控两名逃生者 */
    volunteer: boolean;
    connected: boolean;
    host: boolean;
  }>;
  /** 进入 draft 之后才有 */
  draft: {
    mapId: string;
    killerPlayer: string;
    /** 每个角色名额；options 只发给名额的主人，别人看到 null */
    slots: Array<{
      slotId: string;
      playerId: string;
      side: Side;
      options: string[] | null;
      pick: string | null;
    }>;
  } | null;
}

export interface RoomSnapshot {
  code: string;
  lobby: LobbyInfo;
  seats: SeatInfo[];
  /** 当前连接所占的座位（= 玩家 id）；尚未加入为 null */
  mySeat: string | null;
  /** 已执行的游戏命令数，用作版本号；提交命令时必须带上，防止重复提交和过期操作。
   *  不能用事件数：「继续」等命令不产生事件，重复点击会被误执行两次。 */
  version: number;
  /** 已按 mySeat 隐藏秘密信息的状态；对局开始前为 null */
  view: GameState | null;
}

export interface CommandRequest {
  code: string;
  token: string;
  version: number;
  command: Command;
}

/** 房间内（对局开始前）的操作 */
export type LobbyAction =
  | { type: "SET_SIDE"; side: Side }
  | { type: "SET_VOLUNTEER"; volunteer: boolean }
  | { type: "SET_PLAYER_COUNT"; playerCount: 3 | 4 | 5 }
  | { type: "START" }
  | { type: "PICK"; slotId: string; characterId: string };

export interface LobbyRequest {
  code: string;
  token: string;
  action: LobbyAction;
}

export type Ack<T = {}> =
  ({ ok: true } & T) | { ok: false; error: string; code?: string };

export const EVENTS = {
  create: "room:create",
  join: "room:join",
  /** lobby 房间：以昵称加入成为玩家；preset 房间：认领预设座位 */
  claim: "seat:claim",
  lobby: "room:lobby",
  command: "game:command",
  update: "room:update",
} as const;
