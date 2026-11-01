import type { NDCommand, NDView } from "../../naodong-scale/src/index.ts";
export const ND_EVENTS = {
  create: "nd:create",
  join: "nd:join",
  claim: "nd:claim",
  action: "nd:action",
  update: "nd:update",
} as const;
export interface NDSettings {
  count: number;
  seconds: 0 | 60 | 120;
  scale: "open" | "normal";
  expert: boolean;
  firstCaptain: number;
}
type Payload<T> = T extends unknown ? Omit<T, "seat" | "seq"> : never;
export type NDAction =
  | Payload<NDCommand>
  | {
      type: "SET_SETTINGS";
      count?: number;
      seconds?: 0 | 60 | 120;
      scale?: "open" | "normal";
      expert?: boolean;
      firstCaptain?: number;
    }
  | { type: "START"; seed?: number }
  | { type: "LEAVE" }
  | { type: "REMATCH" };
export interface NDSnapshot {
  code: string;
  version: number;
  mySeat: number | null;
  hostId: string | null;
  settings: NDSettings;
  players: {
    id: string;
    name: string;
    seat: number;
    ready: boolean;
    connected: boolean;
  }[];
  view: NDView | null;
  nextSeq?: number;
  serverNow: number;
  deadline: number | null;
  expired: boolean;
  timeoutCount: number;
}
export interface NDActionRequest {
  code: string;
  token: string;
  version: number;
  seq: number;
  round?: number;
  action: NDAction;
}
export interface NDAck {
  ok: boolean;
  error?: string;
  changed?: boolean;
  snapshot?: NDSnapshot;
  code?: string;
  token?: string;
  playerId?: string;
}
