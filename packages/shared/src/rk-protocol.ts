import type { Command, viewForRK } from "../../rummikub/src/index.ts";
export const RK_EVENTS = {
  create: "rk:create",
  join: "rk:join",
  claim: "rk:claim",
  action: "rk:action",
  update: "rk:update",
} as const;
type Payload<T extends { type: string }> = T extends unknown
  ? Omit<T, "actor" | "seq" | "now" | "type"> & {
      type: Exclude<T["type"], "TIMEOUT">;
    }
  : never;
export type RKAction =
  | Exclude<Payload<Command>, { type: "TIMEOUT" }>
  | {
      type: "SET_SETTINGS";
      count?: number;
      minutes?: 0 | 1 | 2;
      games?: number;
    }
  | { type: "READY" }
  | { type: "START"; seed?: number }
  | { type: "LEAVE" };
export interface RKSnapshot {
  code: string;
  version: number;
  mySeat: string | null;
  hostId: string | null;
  count: number;
  minutes: 0 | 1 | 2;
  games: number;
  players: {
    id: string;
    name: string;
    seat: number;
    ready: boolean;
    connected: boolean;
  }[];
  view: ReturnType<typeof viewForRK> | null;
  serverNow: number;
  nextSeq?: number;
  privateRevision?: number;
}
export interface RKActionRequest {
  code: string;
  token: string;
  version: number;
  seq: number;
  action: RKAction;
}
export type RKAck = {
  ok: boolean;
  error?: string;
  consumed?: boolean;
  snapshot?: RKSnapshot;
  code?: string;
  token?: string;
  playerId?: string;
};
