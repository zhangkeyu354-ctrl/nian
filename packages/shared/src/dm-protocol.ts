import type { DMCommand, DMView } from "../../dying-message/src/index.ts";
export const DM_EVENTS = {
  create: "dm:create",
  join: "dm:join",
  claim: "dm:claim",
  action: "dm:action",
  update: "dm:update",
} as const;
export type DMLobbyAction =
  | { type: "SET_COUNT"; count: number }
  | { type: "SET_POOL"; pool: string[] }
  | { type: "READY" }
  | { type: "START" }
  | { type: "RESTART" }
  | { type: "LEAVE" };
export type DMAction = DMLobbyAction | DMCommand;
export interface DMSnapshot {
  code: string;
  version: number;
  mySeat: string | null;
  hostId: string | null;
  count: number;
  pool: string[];
  players: {
    id: string;
    name: string;
    seat: number;
    ready: boolean;
    connected: boolean;
  }[];
  view: DMView | null;
  serverNow: number;
}
