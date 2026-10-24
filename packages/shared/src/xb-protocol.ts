import type { View, Command } from "../../xiabaiwang/src/engine.ts";
import type { Cycles } from "../../xiabaiwang/src/rules.ts";
export const XB_EVENTS = {
  create: "xb:create",
  join: "xb:join",
  command: "xb:command",
  update: "xb:update",
  poop: "xb:poop",
  effects: "xb:effects",
  fun: "xb:fun",
} as const;
export type XBAidCommand =
  | { type: "REQUEST_WORD"; round: number }
  | { type: "SET_SPEECH"; seconds: 0 | 30 | 60 }
  | { type: "CALL" | "CROWN"; round: number; target: string };
export interface XBCallout {
  id: string;
  round: number;
  target: string;
  at: number;
}
export interface XBSnapshot {
  code: string;
  me: string | null;
  host: string | null;
  version: number;
  players: { id: string; name: string; connected: boolean }[];
  view: View | null;
  discussionAt: number;
  funHits: Record<string, number>;
  topicThemes?: string[];
  topicRemaining?: number;
  cycles?: Cycles;
  serverNow?: number;
  gameId?: string;
  readUntil?: number;
  revealAt?: number;
  speechSeconds?: 0 | 30 | 60;
  speechUsed?: Record<string, number>;
  speakerAt?: number;
  callout?: XBCallout;
  wordRequests?: string[];
  crownCounts?: Record<string, number>;
  crownTotals?: Record<string, number>;
  myCrownVote?: string;
}
export type XBCommand =
  | Command
  | XBAidCommand
  | { type: "START" }
  | { type: "REMATCH" }
  | { type: "SET_TOPICS"; themes: string[] }
  | { type: "SET_CYCLES"; cycles: Cycles };
export interface XBEffect {
  from: string;
  target: string;
  count: number;
}
