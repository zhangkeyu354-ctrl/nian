import type { Meld } from "../../../../packages/rummikub/src/index.ts";
import type { RKAction } from "../../../../packages/shared/src/rk-protocol.ts";
export function settingsForPlayerCount(count: number): RKAction {
  if (!Number.isInteger(count) || count < 2 || count > 6)
    throw new RangeError("拉密人数必须为 2–6 人");
  return {
    type: "SET_SETTINGS",
    count,
    variant: count >= 5 ? "xp" : "classic",
  };
}
export type SortMode = "color" | "number";
const colors = ["R", "B", "O", "K", "J"];
export function sortRack(ids: string[], mode: SortMode) {
  return [...ids].sort((a, b) => {
    if (a[0] === "J" || b[0] === "J")
      return a[0] === b[0] ? a.localeCompare(b) : a[0] === "J" ? 1 : -1;
    const color = colors.indexOf(a[0]) - colors.indexOf(b[0]),
      value = Number(a.slice(1, 3)) - Number(b.slice(1, 3));
    return (
      (mode === "color" ? color || value : value || color) || a.localeCompare(b)
    );
  });
}
export const selectionAfterClick = (selected: string[], id: string) =>
  selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
export function newTableTiles(before: Meld[], after: Meld[]) {
  const old = new Set(before.flatMap((m) => m.tiles));
  return after.flatMap((m) => m.tiles).filter((id) => !old.has(id));
}
