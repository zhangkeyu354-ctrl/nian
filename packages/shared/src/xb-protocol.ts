import type { View, Command } from "../../xiabaiwang/src/engine.ts";
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
}
export type XBCommand =
  | Command
  | { type: "START" }
  | { type: "REMATCH" }
  | { type: "SET_TOPICS"; themes: string[] };
export interface XBEffect {
  from: string;
  target: string;
  count: number;
}
