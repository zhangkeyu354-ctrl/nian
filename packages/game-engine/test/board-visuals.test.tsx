import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Dice } from "../../../apps/web/src/Dice.tsx";
describe("Phase 2C physical dice presentation", () => {
  it("keeps skill dice black and danger dice red regardless of result", () => {
    for (const face of [0, 2, 5]) {
      const skill = renderToStaticMarkup(<Dice face={face} rollKey="a" />),
        danger = renderToStaticMarkup(<Dice face={face} danger rollKey="a" />);
      expect(skill).toContain("skill-die");
      expect(skill).not.toContain("danger-die");
      expect(danger).toContain("danger-die");
      expect(danger).toContain("危险骰");
    }
  });
  it("distinguishes three outcomes and preserves numbered successful faces", () => {
    expect(renderToStaticMarkup(<Dice face={0} rollKey="a" />)).toContain(
      "失败",
    );
    expect(renderToStaticMarkup(<Dice face={3} rollKey="a" />)).toContain(
      "成功",
    );
    expect(renderToStaticMarkup(<Dice face={5} rollKey="a" />)).toContain(
      "大成功",
    );
    expect(renderToStaticMarkup(<Dice face={4} spawn rollKey="a" />)).toContain(
      "出生骰面4",
    );
  });
});
