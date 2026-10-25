import type { Meld } from "../../../../packages/rummikub/src/index.ts";
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
