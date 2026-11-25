import { describe, expect, it } from "vitest";
import { raceOwners, raceStats } from "../src/ma/playback.ts";
import type { LogEntry } from "../../../packages/magical-athlete/src/types.ts";

describe("镜像与附加决赛数据榜", () => {
  it("镜像后按比赛方向统计前进与后退", () => {
    const log: LogEntry[] = [
      { race: 0, text: "", fx: { kind: "move", racers: ["banana"], from: 14, to: 18 } },
      { race: 0, text: "镜像", fx: { kind: "direction", reversed: true } },
      { race: 0, text: "", fx: { kind: "move", racers: ["banana"], from: 18, to: 15 } },
      { race: 0, text: "", fx: { kind: "warp", racer: "banana", from: 15, to: 20 } },
    ];
    expect(raceStats(log, 0, new Map([["banana", "p1"]]))).toMatchObject([{ racer: "banana", forward: 7, back: 5 }]);
  });

  it("附加决赛保留正常比赛中第三名的控制者", () => {
    const log: LogEntry[] = [
      { race: 0, text: "", fx: { kind: "start", race: 0, track: "twisty-twirl", owners: { twin: "p1", banana: "p2", hare: "p3" } } },
      { race: 0, text: "", fx: { kind: "start", race: 0, track: "twisty-twirl", owners: { banana: "p2", hare: "p3" }, finale: true } },
    ];
    expect(raceOwners(log, 0, [{ racer: "banana", owner: "p2" }], []).get("twin")).toBe("p1");
  });
});
