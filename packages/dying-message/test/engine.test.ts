import { describe, it, expect } from "vitest";
import { createDM, reduceDM, viewDM, roles, instances } from "../src/index.ts";
const cards = Array.from(
  { length: 30 },
  (_, i) => "DM" + String(i + 1).padStart(3, "0"),
);
const players = Array.from({ length: 4 }, (_, i) => ({
  id: "p" + i,
  name: "朋友" + i,
}));
function game() {
  return createDM(players, cards, 42, [
    "killer",
    "civilian",
    "civilian",
    "civilian",
  ]);
}
function act(s: any, id: string, type: string, data: any = {}) {
  return reduceDM(s, id, { type, ...data });
}
describe("Dying Message basic loop", () => {
  it("has 15 role types and 36 unique card instances", () => {
    expect(roles).toHaveLength(15);
    expect(instances).toHaveLength(36);
    expect(new Set(instances.map((x) => x.roleCardId)).size).toBe(36);
  });
  it("does not send roles, seed, deck or provenance to others", () => {
    const s = game(),
      v = viewDM(s, "p1");
    expect(v.me.roleId).toBe("civilian");
    expect(v.players[0].roleId).toBeUndefined();
    expect(v).not.toHaveProperty("seed");
    expect(v).not.toHaveProperty("deck");
    expect(v).not.toHaveProperty("truth");
  });
  it("rejects illegal targets without changing original state", () => {
    const s = game();
    expect(() => act(s, "p1", "KILL", { targets: ["p2"] })).toThrow();
    expect(s.players.every((p) => p.alive)).toBe(true);
  });
  it("runs murder, 1 true + 2 fake, both votes, execution and innocent win", () => {
    let s = game();
    s = act(s, "p0", "KILL", { targets: ["p1"] });
    expect(s.phase).toBe("VICTIM_EVIDENCE");
    const truth = s.pool[0];
    s = act(s, "p1", "TRUE", { cards: [truth] });
    s = act(s, "p0", "FAKE", {
      cards: s.pool.filter((x) => x !== truth).slice(0, 2),
    });
    expect(s.phase).toBe("INVESTIGATION");
    expect(s.history[0].cards).toHaveLength(3);
    expect(viewDM(s, "p2").history[0]).not.toHaveProperty("truth");
    for (const id of ["p0", "p2", "p3"]) s = act(s, id, "SPEAK_END");
    for (const id of ["p0", "p2", "p3"])
      s = act(s, id, "VOTE", { target: "p0" });
    expect(s.phase).toBe("DEFENSE");
    s = act(s, "p0", "DEFENSE_END");
    for (const id of ["p0", "p2", "p3"])
      s = act(s, id, "VOTE", { target: "p0" });
    expect(s.winner).toBe("INNOCENT");
  });
  it("requires same suspect twice; a different second majority does not execute", () => {
    let s = game();
    s = act(s, "p0", "KILL", { targets: ["p1"] });
    s = act(s, "p1", "TRUE", { cards: [s.pool[0]] });
    s = act(s, "p0", "FAKE", { cards: s.pool.slice(1, 3) });
    for (const id of ["p0", "p2", "p3"]) s = act(s, id, "SPEAK_END");
    for (const id of ["p0", "p2", "p3"])
      s = act(s, id, "VOTE", { target: "p0" });
    s = act(s, "p0", "DEFENSE_END");
    for (const id of ["p0", "p2", "p3"])
      s = act(s, id, "VOTE", { target: "p2" });
    expect(s.phase).toBe("ROUND_END");
    expect(s.players.filter((p) => p.alive)).toHaveLength(3);
  });
});
