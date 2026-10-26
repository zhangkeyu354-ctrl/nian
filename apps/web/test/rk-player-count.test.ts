import { it, expect } from "vitest";
import { settingsForPlayerCount } from "../src/rk/ui-model.ts";
it("direct player-count selection switches only five/six seats to the XP deck", () => {
  for (const count of [2, 3, 4, 5, 6])
    expect(settingsForPlayerCount(count)).toEqual({
      type: "SET_SETTINGS",
      count,
      variant: count >= 5 ? "xp" : "classic",
    });
  for (const count of [0, 1, 7, 2.5, NaN])
    expect(() => settingsForPlayerCount(count)).toThrow();
});
