import { describe, it, expect } from "vitest";
import {
  createDM,
  reduceDM,
  viewDM,
  actorsDM,
  defaultPool,
  validatePool,
  type DMState,
} from "../src/index.ts";
const cards = Array.from({ length: 153 }, (_, i) => "DM" + i),
  players = Array.from({ length: 10 }, (_, i) => ({
    id: "p" + i,
    name: "朋友" + i,
  }));
function setup(names: string[]) {
  const s = createDM(players, cards, 50);
  names.forEach((r, i) => (s.players[i].roleId = r));
  s.phase =
    names.includes("soulmate") || names.includes("wonder-dog")
      ? "NIGHT_PREPARATION"
      : "KILLER_SELECTION";
  return s;
}
const act = (s: DMState, id: string, type: string, data: object = {}) =>
  reduceDM(s, id, { type, ...data }, 1000);
function kill(s: DMState, targets: string[]) {
  for (const id of actorsDM(s)) s = act(s, id, "KILL", { targets });
  return s;
}
function truth(s: DMState) {
  const ids = s.pool.slice(0, viewDM(s, s.nightVictims[0]).required);
  for (const id of [...s.nightVictims]) s = act(s, id, "TRUE", { cards: ids });
  return s;
}
describe("special roles and roundtable timing", () => {
  it.each([4, 5, 6, 7, 8, 9, 10])("validates %i player allocation", (n) => {
    const pool = defaultPool(n);
    expect(() => validatePool(pool, n)).not.toThrow();
    expect(pool.filter((p) => p === "killer")).toHaveLength(n >= 8 ? 2 : 1);
  });
  it("rejects a client assigning a non-standard killing ratio", () =>
    expect(() =>
      validatePool(["killer", "killer", "civilian", "civilian"], 4),
    ).toThrow());
  it("private detective and mastermind see true evidence sequentially, no one else does", () => {
    let s = setup(["killer", "private-detective", "mastermind"]);
    s = kill(s, ["p3"]);
    s = truth(s);
    expect(actorsDM(s)).toEqual(["p1"]);
    expect(viewDM(s, "p1").trueCards).toHaveLength(1);
    expect(viewDM(s, "p2").trueCards).toEqual([]);
    s = act(s, "p1", "INFO_ACK");
    expect(actorsDM(s)).toEqual(["p2"]);
    s = act(s, "p2", "INFO_ACK");
    expect(s.phase).toBe("KILLER_FAKE_EVIDENCE");
  });
  it("professional bonus is global and two nobles stack; serial killer expands victims", () => {
    let s = setup([
      "killer",
      "professional-killer",
      "serial-killer",
      "noble",
      "noble",
    ]);
    s = kill(s, ["p3", "p4"]);
    expect(viewDM(s, "p3").required).toBe(3);
    s = truth(s);
    expect(viewDM(s, "p0").required).toBe(3);
  });
  it("two celebrity deaths reduce fake evidence to zero without a deadlock", () => {
    let s = setup(["killer", "serial-killer", "celebrity", "celebrity"]);
    s = truth(kill(s, ["p2", "p3"]));
    expect(s.phase).toBe("INVESTIGATION");
    expect(s.history[0].cards).toHaveLength(1);
  });
  it("dog rejects self or other dog protection and prevents direct murder, not chained death", () => {
    let s = setup(["killer", "wonder-dog", "wonder-dog"]);
    expect(() => act(s, "p1", "PREPARE", { target: "p1" })).toThrow();
    expect(() => act(s, "p1", "PREPARE", { target: "p2" })).toThrow();
    s = act(s, "p1", "PREPARE", { target: "p3" });
    s = act(s, "p2", "PREPARE", { target: "p4" });
    expect(() => kill(s, ["p3"])).toThrow();
    expect(viewDM(s, "p0").legalTargets).not.toContain("p3");
  });
  it("soulmate notifies target without exposing selector and links deaths once", () => {
    let s = setup(["killer", "soulmate", "civilian"]);
    s = act(s, "p1", "PREPARE", { target: "p2" });
    expect(viewDM(s, "p2").me.fated).toBe(true);
    expect(viewDM(s, "p2").players[1].roleId).toBeUndefined();
    s = kill(s, ["p2"]);
    expect(s.nightVictims.sort()).toEqual(["p1", "p2"]);
    expect(s.deaths).toHaveLength(2);
    expect(s.players[1].alive).toBe(false);
  });
  it("hostage kills nearest living neighbors and does not trigger directly-murdered noble effect", () => {
    let s = setup(["killer", "civilian", "noble", "hostage", "civilian"]);
    s.players[4].alive = false;
    s = kill(s, ["p3"]);
    expect(s.nightVictims.sort()).toEqual(["p2", "p3", "p5"]);
    expect(viewDM(s, "p3").required).toBe(1);
    expect(s.deaths).toHaveLength(3);
  });
  it("janitor can use discard evidence; everyone must agree to joint evidence", () => {
    let s = setup(["killer", "serial-killer", "janitor"]);
    s.discard = ["old"];
    s = kill(s, ["p2", "p3"]);
    expect(viewDM(s, "p2").pool).toContain("old");
    s = act(s, "p2", "TRUE", { cards: ["old"] });
    expect(s.phase).toBe("VICTIM_EVIDENCE");
    expect(viewDM(s, "p3").teamChoices[0].choices).toEqual(["old"]);
    s = act(s, "p3", "TRUE", { cards: ["old"] });
    expect(s.truth).toEqual(["old"]);
  });
  it("forensic reveals exactly one card from previous round and pauses speech until resolved", () => {
    let s = setup(["killer", "forensic-scientist"]);
    s.round = 2;
    s.history = [
      {
        round: 1,
        victims: ["p9"],
        cards: ["a", "b"],
        truth: ["a"],
        revealed: {},
      },
    ];
    s.players[9].alive = false;
    s = kill(s, ["p1"]);
    s = truth(s);
    s = act(s, "p0", "FAKE", {
      cards: s.pool.filter((x) => !s.truth.includes(x)).slice(0, 2),
    });
    expect(s.deadline).toBeNull();
    expect(() => act(s, "p1", "FORENSIC", { card: s.truth[0] })).toThrow();
    s = act(s, "p1", "FORENSIC", { card: "a" });
    expect(s.history[0].revealed).toEqual({ a: true });
    expect(s.deadline).toBe(301000);
  });
  it("two muay thai stack two skipped nights, and unused pool goes to discard", () => {
    let s = setup(["killer", "serial-killer", "muay-thai", "muay-thai"]);
    s = kill(s, ["p2", "p3"]);
    expect(s.skipNights).toBe(2);
    s = truth(s);
    for (const id of ["p0", "p1"])
      s = act(s, id, "FAKE", { cards: s.pool.slice(1, 3) });
    s.phase = "ROUND_END";
    const old = s.pool.slice();
    s = act(s, "p0", "NEXT");
    expect(s.phase).toBe("INVESTIGATION");
    expect(s.skipNights).toBe(1);
    expect(s.discard).toEqual(expect.arrayContaining(old));
    s.phase = "ROUND_END";
    s = act(s, "p0", "NEXT");
    expect(s.skipNights).toBe(0);
    expect(s.phase).toBe("INVESTIGATION");
  });
  it("only current living speaker can finish; 5min timeout advances and voting waits all speakers", () => {
    let s = setup(["killer"]);
    s = truth(kill(s, ["p1"]));
    s = act(s, "p0", "FAKE", { cards: s.pool.slice(1, 3) });
    expect(s.speaker).toBe("p0");
    expect(() => act(s, "p2", "SPEAK_END")).toThrow();
    expect(() => act(s, "p0", "VOTE_START")).toThrow();
    expect(() =>
      reduceDM(s, "p0", { type: "SPEAK_TIMEOUT" }, s.deadline! - 1),
    ).toThrow();
    s = reduceDM(s, "p0", { type: "SPEAK_TIMEOUT" }, s.deadline!);
    expect(s.speaker).toBe("p2");
    for (const p of s.players.filter((p) => p.alive && p.id !== "p0"))
      s = act(s, p.id, "SPEAK_END");
    expect(s.phase).toBe("FIRST_VOTE");
  });
  it("public snapshots never reveal murderer identities or true-card provenance during the night", () => {
    let s = setup(["killer"]);
    s = kill(s, ["p1"]);
    expect(viewDM(s, "p2").players[1].alive).toBe(true);
    expect(viewDM(s, "p2").killers).toEqual([]);
    expect(viewDM(s, "p1").killers[0].id).toBe("p0");
    s = truth(s);
    const plain = JSON.stringify(viewDM(s, "p2"));
    expect(plain).not.toContain('"truth"');
    expect(viewDM(s, "p2").players.filter((p) => p.roleId)).toHaveLength(1);
  });
});
