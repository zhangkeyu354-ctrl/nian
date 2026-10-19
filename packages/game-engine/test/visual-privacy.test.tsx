import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Board } from "../../../apps/web/src/Board.tsx";
import { fixture } from "./fixtures.ts";
import { eventText } from "../../../apps/web/src/labels.ts";
describe("rendered locker privacy", () => {
  it("does not render hidden identity, portrait, tooltip or actor ID on public board", () => {
    const s = fixture();
    const p = s.props[0];
    p.kind = "locker";
    p.room = s.actors.dwight.room!;
    s.actors.dwight.lockerId = p.id;
    const html = renderToStaticMarkup(
      <Board
        state={s}
        highlight={[]}
        onRoom={() => {}}
        onProp={() => {}}
        selected={null}
      />,
    );
    expect(html).toContain("被占用");
    expect(html).not.toContain('data-actor="dwight"');
    expect(html).not.toContain("portrait_dwight");
    expect(html).not.toContain("德怀特");
  });
  it("anonymizes locker event and check identities in the shared log", () => {
    const s = fixture();
    for (const type of ["HIDDEN_IN_LOCKER", "DICE_ROLLED", "CHECK_RESOLVED"]) {
      const text = eventText(s, {
        seq: 1,
        round: 1,
        type,
        data: {
          actorId: "dwight",
          kind: "locker",
          faces: [0],
          result: "failure",
        },
        sourceRef: [],
      });
      expect(text).not.toContain("德怀特");
      expect(text).toContain("占用");
    }
  });
});
