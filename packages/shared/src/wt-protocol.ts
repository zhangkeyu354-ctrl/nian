import type { WTView } from "../../witch-town/src/index.ts";
export const WT_EVENTS = {
  create: "wt:create",
  join: "wt:join",
  claim: "wt:claim",
  action: "wt:action",
  update: "wt:update",
} as const;
export type WTLobbyAction =
  { type: "READY"; ready: boolean } | { type: "START" };
export interface WTActionRequest {
  requestId: string;
  version: number;
  action: WTLobbyAction;
}
export interface WTRoomSnapshot {
  game: "witch-town";
  code: string;
  capacity: number;
  stage: "lobby" | "game";
  version: number;
  mySeat: string | null;
  players: {
    id: string;
    name: string;
    ready: boolean;
    host: boolean;
    connected: boolean;
  }[];
  view: WTView | null;
  milestone: "M1_SETUP_ONLY";
}
