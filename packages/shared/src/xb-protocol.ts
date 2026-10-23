import type { View, Command } from "../../xiabaiwang/src/engine.ts";
export const XB_EVENTS = {
  create: "xb:create",
  join: "xb:join",
  command: "xb:command",
  update: "xb:update",
  poop: "xb:poop",
  effects: "xb:effects",
} as const;
export interface XBSnapshot {
  code: string;
  me: string | null;
  host: string | null;
  version: number;
  players: { id: string; name: string; connected: boolean }[];
  view: View | null;
}
export type XBCommand = Command | { type: "START" };
export interface XBEffect {
  from: string;
  target: string;
  count: number;
}
