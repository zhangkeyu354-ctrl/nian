import type { Command, viewForSS } from "../../soda-smugglers/src/index.ts";
export const SS_EVENTS = {
  create: "ss:create",
  join: "ss:join",
  claim: "ss:claim",
  action: "ss:action",
  update: "ss:update",
} as const;
type PlayerCommand = Exclude<Command, { type: "TIMEOUT" }>;
type Payload<T> = T extends unknown ? Omit<T, "actor" | "seq" | "now"> : never;
export type SSAction =
  | Payload<PlayerCommand>
  | {
      type: "SET_SETTINGS";
      count?: number;
      events?: boolean;
      seconds?: 0 | 60 | 120;
      firstGuard?: number | "random";
    }
  | { type: "RANDOM_GUARD" }
  | { type: "READY" }
  | { type: "START"; seed?: number }
  | { type: "LEAVE" }
  | { type: "REMATCH" };
export interface SSSnapshot {
  code: string;
  version: number;
  mySeat: string | null;
  hostId: string | null;
  count: number;
  events: boolean;
  seconds: 0 | 60 | 120;
  firstGuard: number | "random";
  players: {
    id: string;
    name: string;
    seat: number;
    ready: boolean;
    connected: boolean;
  }[];
  view: ReturnType<typeof viewForSS> | null;
  serverNow: number;
  nextSeq?: number;
}
export interface SSActionRequest {
  code: string;
  token: string;
  version: number;
  seq: number;
  round?: number;
  action: SSAction;
}
export interface SSAck {
  ok: boolean;
  error?: string;
  consumed?: boolean;
  snapshot?: SSSnapshot;
  code?: string;
  token?: string;
  playerId?: string;
}
