export const TA_EVENTS = { create: "ta:create", join: "ta:join", claim: "ta:claim", lobby: "ta:lobby", command: "ta:command", update: "ta:update", sceneDone: "ta:scene-done" } as const;
export interface TARoomSnapshot { code: string; stage: "lobby" | "game"; hostId: string | null; mySeat: string | null; mode: "basic" | "advanced"; round: number; version: number; players: { playerId: string; name: string; connected: boolean; host: boolean }[]; seats: string[]; view: any }
export type TALobbyAction = { type: "SET_MODE"; mode: "basic" | "advanced" } | { type: "KICK"; playerId: string } | { type: "START" } | { type: "ADD_BOT" };
export type TAClientCommand = { t: string; [k: string]: unknown };
