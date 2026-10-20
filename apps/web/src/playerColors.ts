import type { GameState } from "../../../packages/shared/src/types.ts";
/** 每个角色固定的辨识色：四位逃生者各一种亮色，杀手为危险红（2026-10-21） */
export const SURVIVOR_COLORS = ["#3fc8ff", "#7dea5a", "#ffb02e", "#e58cff"];
export const KILLER_COLOR = "#ff3b30";
export function actorColor(s: GameState, id: string): string {
  if (id === s.killerId) return KILLER_COLOR;
  const i = s.survivors.indexOf(id);
  return SURVIVOR_COLORS[i >= 0 ? i % 4 : 0];
}
/** 11 个房间也各给一种标识色，用在房间名牌和边框上，方便一眼区分 */
export const ROOM_ACCENTS = [
  "#e8b04a", "#5fb7e8", "#d97a5c", "#7ccf8a", "#b48ae6", "#e6d35c",
  "#5cd6c4", "#e87aa8", "#9fb7ff", "#c9a36b", "#8fe05c",
];
