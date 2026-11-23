import type { SKView, SKSettings, ScheduleKey } from "../../skull-king/src/index.ts";
export const SK_EVENTS = {
  create: "sk:create",
  join: "sk:join",
  claim: "sk:claim",
  action: "sk:action",
  update: "sk:update",
  emote: "sk:emote",
  emoted: "sk:emoted",
} as const;
export type SKAction =
  | { type: "BID"; bid: number }
  | { type: "SHOT"; shot: "grape" | "cannon" }
  | { type: "PLAY"; id: number; as?: "pirate" | "escape" }
  | { type: "ROSIE"; target: number }
  | { type: "BENDT"; discard: number[] }
  | { type: "RASCAL"; bet: 0 | 10 | 20 }
  | { type: "JUANITA" }
  | { type: "HARRY"; delta: -1 | 0 | 1 }
  | { type: "NEXT_ROUND" }
  | { type: "SET_SETTINGS"; count?: number; scoring?: "skull" | "rascal"; cannon?: boolean; kraken?: boolean; whale?: boolean; loot?: boolean; abilities?: boolean; schedule?: ScheduleKey }
  | { type: "ADD_BOT" }
  | { type: "REMOVE_BOT"; seat: number }
  | { type: "READY" }
  | { type: "START"; seed?: number }
  | { type: "LEAVE" }
  | { type: "KICK"; seat: number }
  | { type: "REMATCH" };
export interface SKSnapshot {
  code: string;
  version: number;
  mySeat: string | null;
  hostId: string | null;
  count: number;
  settings: SKSettings;
  players: { id: string; name: string; seat: number; ready: boolean; connected: boolean; bot?: boolean }[];
  view: SKView | null;
  serverNow: number;
  nextSeq?: number;
}
export interface SKAck {
  ok: boolean;
  error?: string;
  consumed?: boolean;
  snapshot?: SKSnapshot;
  code?: string;
  token?: string;
  playerId?: string;
}
export const SK_EMOTES = ["👍", "😂", "😱", "😭", "😤", "🏴‍☠️"] as const;
