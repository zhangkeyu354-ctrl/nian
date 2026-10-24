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
}
export type XBCommand =
  | Command
  | { type: "START" }
  | { type: "REMATCH" }
  | { type: "SET_TOPICS"; themes: string[] }
  | { type: "SET_CYCLES"; cycles: Cycles };
export interface XBEffect {
  from: string;
  target: string;
  count: number;
}
