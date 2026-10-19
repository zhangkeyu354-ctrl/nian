import { describe, it, expect } from "vitest";
import { fixture } from "./fixtures.ts";
import {
  boardVisuals,
  propVisual,
  feedbackEvents,
} from "../src/presentation.ts";
describe("engine-driven visual states and anonymous lockers", () => {
  it("hides unrevealed identities and anonymous occupied lockers including actor tokens", () => {
    const s = fixture();
    const p = s.props[0];
    p.revealed = false;
    expect(propVisual(s, p.id).kind).toBe("back");
    p.revealed = true;
    p.kind = "locker";
    s.actors.dwight.lockerId = p.id;
    const publicView = boardVisuals(s);
    expect(publicView.actors.some((a) => a.id === "dwight")).toBe(false);
    const locker = publicView.props.find((x) => x.id === p.id)!;
    expect(locker.state).toBe("occupied");
    expect(JSON.stringify(locker)).not.toMatch(/dwight|德怀特/);
  });
  it("moves completed generators to track, respects entity, exit power and cleared tiles", () => {
    const s = fixture();
    const p = s.props[0];
    p.kind = "generator";
    p.progress = 2;
    expect(propVisual(s, p.id).state).toBe("progress_2");
    s.entity = { kind: "prop", id: p.id };
    expect(propVisual(s, p.id).state).toBe("blocked");
    s.entity = null;
    p.progress = 3;
    p.removed = true;
    expect(propVisual(s, p.id).location).toBe("track");
    p.kind = "exit_gate";
    p.removed = false;
    p.progress = 0;
    expect(propVisual(s, p.id).state).toBe("unpowered");
    s.completedGenerators = 4;
    expect(propVisual(s, p.id).state).toBe("powered");
    p.progress = 3;
    expect(propVisual(s, p.id).state).toBe("open");
    p.kind = "hex_totem";
    p.removed = true;
    expect(propVisual(s, p.id).state).toBe("cleansed");
    expect(propVisual(s, p.id).location).toBe("removed");
  });
  it("reflects broken hook, wall, trap, phantasm, madness and carry choices without mutating state", () => {
    const s = fixture();
    const p = s.props[0];
    p.kind = "hook";
    s.entity = { kind: "prop", id: p.id };
    expect(propVisual(s, p.id).state).toBe("broken");
    s.choice = { kind: "CARRY", actorId: s.killerId, victimId: "jake" };
    s.actors.jake.madness = true;
    s.phantasms = [p.room];
    Object.values(s.paths)[0].bearTrap = true;
    const before = JSON.stringify(s),
      view = boardVisuals(s);
    expect(view.actors.find((a) => a.id === "jake")?.state).toBe("carried");
    expect(view.markers.some((m) => m.kind === "phantasm")).toBe(true);
    expect(view.markers.some((m) => m.kind === "madness")).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("feedback derives only actual engine deltas and reveals no locker identity", () => {
    const a = fixture(),
      b = structuredClone(a);
    b.events.push({
      seq: 1,
      round: 1,
      type: "HIDDEN_IN_LOCKER",
      data: { actorId: "dwight", propId: b.props[0].id },
      sourceRef: [],
    });
    expect(JSON.stringify(feedbackEvents(a, b))).not.toMatch(/dwight|德怀特/);
    expect(feedbackEvents(a, a)).toEqual([]);
  });
});
