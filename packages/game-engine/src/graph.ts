import type { GameState, Card, Side } from "../../shared/src/types.ts";
export function connected(s: GameState, a: string, b: string): boolean {
  return (
    a !== b &&
    Object.values(s.paths).some(
      (p) => p.rooms.includes(a) && p.rooms.includes(b),
    )
  );
}
export function legalRoutes(
  s: GameState,
  from: string,
  side: Side,
  color?: Card,
  carrying = false,
  ignore = false,
  reverse = false,
) {
  return Object.values(s.paths).flatMap((p) => {
    if (
      !p.rooms.includes(from) ||
      (color && p.color !== color) ||
      (s.entity?.kind === "path" && s.entity.id === p.id)
    )
      return [];
    if (
      !ignore &&
      ((p.wall && !p.temporaryWall && (side === "survivor" || carrying)) ||
        (p.pallet && carrying))
    )
      return [];
    return p.rooms
      .filter(
        (to) =>
          to !== from &&
          (p.direction === "both" ||
            reverse ||
            (p.from === from && p.to === to)),
      )
      .map((to) => ({ pathId: p.id, to, color: p.color }));
  });
}
