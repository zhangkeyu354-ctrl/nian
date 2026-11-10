import type { Campaign, Command, Difficulty, ItemId, viewFor } from "../../boss-fighters/src/index.ts";

/** 魔王试炼联机协议（事件名加 bf: 前缀） */
export const BF_EVENTS = {
  create: "bf:create",
  join: "bf:join",
  claim: "bf:claim",
  lobby: "bf:lobby",
  command: "bf:command",
  update: "bf:update",
} as const;

export type BFView = ReturnType<typeof viewFor>;
export type BFMode = "single" | "campaign";

export interface BFSeat {
  /** 真人 playerId，或机器人 "bot:N" */
  id: string;
  name: string;
  race: string | null;
  cls: string | null;
  bot: boolean;
  connected: boolean;
  host: boolean;
}

export interface BFRoomSnapshot {
  code: string;
  /** lobby=组队/选关；game=战斗中或刚结束 */
  stage: "lobby" | "game";
  seats: BFSeat[];
  me: string | null;
  /** 战斗中我的座位号（引擎 seat），观战/大厅为 -1 */
  mySeat: number;
  mode: BFMode;
  bossId: string;
  difficulty: Difficulty;
  campaign: Campaign | null;
  version: number;
  round: number;
  view: BFView | null;
}

export type BFLobbyAction =
  | { type: "PICK"; race: string | null; cls: string | null }
  | { type: "ADD_BOT" }
  | { type: "REMOVE"; id: string }
  | { type: "SET_MODE"; mode: BFMode }
  | { type: "SET_BOSS"; bossId: string }
  | { type: "SET_DIFFICULTY"; difficulty: Difficulty }
  | { type: "START" }
  | { type: "BACK_TO_LOBBY" }
  | { type: "PICK_LOOT"; card: string }
  | { type: "SWAP_LOOT"; card: string }
  | { type: "SET_REMOVED"; removed: string[] }
  | { type: "RESET_CAMPAIGN" };

/** 客户端只发"我想做什么"，座位由服务器填。version 防止旧画面重复点击。 */
export type BFClientCommand =
  | { type: "CHOOSE_STARTER"; starter: number; version: number }
  | { type: "PLAY_CARD"; card: string; target?: number; version: number }
  | { type: "USE_ITEM"; item: ItemId; target?: number; version: number }
  | { type: "END_ACTIONS"; version: number }
  | { type: "DISCARD"; cards: string[]; version: number }
  | { type: "DECIDE"; choice: "exile" | "burn"; version: number }
  | { type: "GIVE_UP"; version: number };

export type { Command };
