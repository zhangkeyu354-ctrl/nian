import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
import { answer, tok } from "./helpers.ts";
import { DRAFTABLE } from "../src/racers.ts";

function swapRace(deck = ["alchemist", "legs", "hare"]) {
  const s = testRace({
    racers: ["twin", "banana", "lovable_loser"],
    pos: [13, 20, 25],
    rolls: [1],
    track: "twisty-twirl",
    skipSetup: true,
  });
  const set = (q: typeof s) => {
    q.race!.twist!.remaining = [11];
    q.deck = [...deck];
  };
  set(s);
  const snapshot = JSON.parse(s.turn!.snapshot);
  set(snapshot);
  s.turn!.snapshot = JSON.stringify(snapshot);
  return s;
}

describe("交换大会", () => {
  it("抽牌与决定各自私密；收齐后才统一换角色", () => {
    let s = answer(swapRace(), "roll");
    expect(s.pending?.kind).toBe("twist_swap_meet");
    expect(s.pending?.player).toBe("p1");
    expect(s.pending?.prompt).toContain("炼金术士");
    expect(viewForMA(s, "p2").pending?.prompt).not.toContain("炼金术士");
    s = answer(s, "swap:twin");
    expect(s.pending?.player).toBe("p2");
    expect(tok(s, "twin").racer).toBe("twin");
    expect(s.log.map(x => x.text).join(" ")).not.toContain("炼金术士");
    expect(viewForMA(s, "p3").pending?.prompt).not.toContain("大长腿");
    s = answer(s, "keep");
    expect(s.pending?.player).toBe("p3");
    s = answer(s, "keep");
    expect(s.pending).not.toHaveProperty("kind", "twist_swap_meet");
    expect(s.race!.tokens[0].racer).toBe("alchemist");
    expect(s.race!.tokens[0].pos).toBe(14);
    expect(s.race!.tokens[0].owner).toBe("p1");
    expect(s.players[0].used).toContain("alchemist");
    expect(s.players[0].used).toContain("twin");
    expect(s.players[0].hand).toContain("alchemist");
    expect(s.deck).toEqual(["legs", "hare"]);
  });

  it("无人愿换时，抽到的牌归还未使用池", () => {
    let s = answer(swapRace(), "roll");
    for (let i = 0; i < 3; i++) s = answer(s, "keep");
    expect(s.race!.tokens.map(t => t.racer)).toEqual(["twin", "banana", "lovable_loser"]);
    expect(s.deck).toEqual(["alchemist", "legs", "hare"]);
  });

  it("角色池不足时不会凭空生成牌，也不要求无牌者作决定", () => {
    let s = answer(swapRace(["alchemist"]), "roll");
    expect(s.pending?.player).toBe("p1");
    s = answer(s, "keep");
    expect(s.pending?.kind).not.toBe("twist_swap_meet");
    expect(s.deck).toEqual(["alchemist"]);
  });

  it("只从合法且未被任何玩家持有的角色中抽牌", () => {
    let s = answer(swapRace(["twin", "alchemist", "banana", "legs", "hare"]), "roll");
    expect(s.pending?.prompt).toContain("炼金术士");
    s = answer(s, "keep");
    expect(s.pending?.prompt).toContain("大长腿");
    s = answer(s, "keep");
    expect(s.pending?.prompt).toContain("兔子");
    s = answer(s, "keep");
    expect(s.deck).toEqual(["twin", "banana", "alchemist", "legs", "hare"]);
  });

  it("替换返场跑者时清掉旧角色的下场返回权", () => {
    const s = testRace({
      racers: ["sw_re_runner", "banana", "lovable_loser"],
      pos: [13, 20, 25], rolls: [1], track: "twisty-twirl",
      skipSetup: true, secondWindPreview: true,
    });
    const set = (q: typeof s) => {
      q.race!.twist!.remaining = [11];
      q.deck = ["alchemist"];
      q.returningRacers = [{ racer: "sw_re_runner", owner: "p1", base: "sw_re_runner" }];
    };
    set(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    set(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    let after = answer(s, "roll");
    after = answer(after, "swap:sw_re_runner");
    expect(after.race!.tokens[0].racer).toBe("alchemist");
    expect(after.returningRacers).toEqual([]);
    expect(after.players[0].used).toContain("sw_re_runner");
    expect(after.players[0].used).toContain("alchemist");
  });

  it("观众渴求混乱抽到交换大会时，等全部选择后才结算下一张牌", () => {
    const s = swapRace();
    const set = (q: typeof s) => {
      q.rng = 0;
      q.race!.twist!.remaining = [10, 11, 7];
    };
    set(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    set(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    let after = answer(s, "roll");
    expect(after.race!.twist!.drawn).toEqual([10, 11]);
    expect(after.race!.twist!.chips).toBeUndefined();
    after = answer(after, "swap:twin");
    after = answer(after, "keep");
    after = answer(after, "keep");
    expect(after.race!.twist!.drawn).toEqual([10, 11, 7]);
    expect(after.race!.twist!.chips).not.toContain(14);
    expect(after.race!.tokens[0].racer).toBe("alchemist");
  });

  it("八人局依次收齐八份决定，不重复抽牌", () => {
    const racers = ["twin", "banana", "lovable_loser", "alchemist", "legs", "hare", "heckler", "inchworm"];
    const deck = DRAFTABLE.filter(id => !racers.includes(id)).slice(0, 8);
    const s = testRace({ racers, pos: [12, 0, 0, 0, 0, 0, 0, 0], rolls: [2], track: "twisty-twirl", skipSetup: true });
    const set = (q: typeof s) => { q.race!.twist!.remaining = [11]; q.deck = [...deck]; };
    set(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    set(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    let after = answer(s, "roll");
    const prompted: string[] = [];
    while (after.pending?.kind === "twist_swap_meet") {
      prompted.push(after.pending.player);
      after = answer(after, "keep");
    }
    expect(prompted).toEqual(Array.from({ length: 8 }, (_, i) => `p${i + 1}`));
    expect(after.deck).toEqual(deck);
    expect(after.race!.tokens.map(t => t.racer)).toEqual(racers);
  });
});
