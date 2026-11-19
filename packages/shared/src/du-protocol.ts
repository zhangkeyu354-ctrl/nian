import type { DUView } from "../../dnup/src/index.ts";
export const DU_EVENTS = {
  create: "du:create",
  join: "du:join",
  claim: "du:claim",
  action: "du:action",
  update: "du:update",
} as const;
export type DUAction =
  | { type: "PLAY"; cards: number[] }
  | { type: "ADD"; card: number; target: number; zone?: number }
  | { type: "TAKE"; target: number; zone?: number }
  | { type: "ROTATE" }
  | { type: "NEXT_ROUND" }
  | { type: "SET_SETTINGS"; count?: number; target?: 3 | 4 }
  | { type: "ADD_BOT" }
  | { type: "REMOVE_BOT"; seat: number }
  | { type: "READY" }
  | { type: "START"; seed?: number }
  | { type: "LEAVE" }
  | { type: "REMATCH" };
export interface DUSnapshot {
  code: string;
  version: number;
  mySeat: string | null;
  hostId: string | null;
  count: number;
  target: 3 | 4;
  players: { id: string; name: string; seat: number; ready: boolean; connected: boolean; bot?: boolean }[];
  view: DUView | null;
  serverNow: number;
  nextSeq?: number;
}
export interface DUAck {
  ok: boolean;
  error?: string;
  consumed?: boolean;
  snapshot?: DUSnapshot;
  code?: string;
  token?: string;
  playerId?: string;
}
