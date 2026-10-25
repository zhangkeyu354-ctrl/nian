import { it, expect } from "vitest";
import {
  sortRack,
  selectionAfterClick,
  newTableTiles,
} from "../src/rk/ui-model.ts";
it("rack sorting groups colors or numbers without losing unique copies or jokers", () => {
  const rack = ["J1", "R10a", "B02b", "R02a", "K02a"];
  expect(sortRack(rack, "color")).toEqual([
    "R02a",
    "R10a",
    "B02b",
    "K02a",
    "J1",
  ]);
  expect(sortRack(rack, "number")).toEqual([
    "R02a",
    "B02b",
    "K02a",
    "R10a",
    "J1",
  ]);
  expect(rack[0]).toBe("J1");
});
it("tile clicks toggle multiple selection and newly committed ids exclude existing table", () => {
  expect(selectionAfterClick(["R01a"], "B01a")).toEqual(["R01a", "B01a"]);
  expect(selectionAfterClick(["R01a", "B01a"], "R01a")).toEqual(["B01a"]);
  expect(
    newTableTiles(
      [{ id: "m0", tiles: ["R01a", "R02a", "R03a"] }],
      [{ id: "m0", tiles: ["R01a", "R02a", "R03a", "R04a"] }],
    ),
  ).toEqual(["R04a"]);
});
