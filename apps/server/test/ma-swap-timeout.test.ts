import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARoomStore } from "../src/ma-rooms.ts";
import { testRace, reduceMA } from "../../../packages/magical-athlete/src/engine.ts";

describe("交换大会超时", () => {
  it("截止前不代答；截止时由服务器提交保留原选手并推进下一人", () => {
    const room = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-swap-timeout-"))).create();
    const s = testRace({
      racers: ["twin", "banana", "lovable_loser"],
      pos: [13, 20, 25], rolls: [1], track: "twisty-twirl", skipSetup: true,
    });
    const set = (q: typeof s) => { q.race!.twist!.remaining = [11]; q.deck = ["alchemist", "legs", "hare"]; };
    set(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    set(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    room.state = reduceMA(s, { type: "ANSWER", player: s.pending!.player, value: "roll" });
    room.file.swapMeetDeadline = 100;
    expect(room.expireSwapMeet(99)).toBe(false);
    expect(room.state.pending?.player).toBe("p1");
    expect(room.expireSwapMeet(100)).toBe(true);
    expect(room.file.commands.at(-1)).toEqual({ type: "ANSWER", player: "p1", value: "keep" });
    expect(room.state.pending?.player).toBe("p2");
    expect(room.file.swapMeetDeadline).toBe(60_100);
  });
});
