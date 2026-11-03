import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NDRoom } from "../src/nd-rooms.ts";
import { createND } from "../../../packages/naodong-scale/src/index.ts";
import type { NDAction } from "../../../packages/shared/src/nd-protocol.ts";

function act(r: NDRoom, token: string, action: NDAction) {
  const me = r.me(token)!;
  return r.action(token, r.file.version, (r.file.seq[me.id] ?? 0) + 1, action, 1000, r.file.state?.round);
}
const ids = (r: NDRoom) =>
  r.file.state!.topicCards.flatMap((c) => c.questions.map((q) => q.id));

describe("ND 同房间不重复出题", () => {
  it("引擎优先抽没出过的题", () => {
    const first = createND(["a", "b", "c", "d"], { seed: 5 });
    const used = first.topicCards.flatMap((c) => c.questions.map((q) => q.id));
    const second = createND(["a", "b", "c", "d"], { seed: 5, avoid: used });
    const again = second.topicCards.flatMap((c) => c.questions.map((q) => q.id));
    expect(again.filter((id) => used.includes(id))).toEqual([]);
  });
  it("连开多局：题库轮完一遍之前不重复，轮完后重新开始", () => {
    const r = NDRoom.create("ABCD", mkdtempSync(join(tmpdir(), "nd-topic-")), {
      allowFixedSeed: true,
      clock: () => 1000,
    });
    const c = [0, 1, 2, 3].map((i) => r.claim("玩家" + i));
    const seen = new Set<string>();
    let cycleReset = false;
    for (let game = 0; game < 12; game++) {
      for (const p of c) act(r, p.token, { type: "READY" });
      act(r, c[0].token, { type: "START", seed: 100 + game });
      const now = ids(r);
      const repeats = now.filter((id) => seen.has(id));
      if (repeats.length) {
        // 只有在没出过的题已经不够一局时才允许重复
        expect(seen.size + 10).toBeGreaterThan(102);
        cycleReset = true;
        seen.clear();
      }
      now.forEach((id) => seen.add(id));
      expect(r.file.usedTopics!.length).toBe(seen.size);
      r.file.state = { ...r.file.state!, phase: "FINISHED" } as never;
      act(r, c[0].token, { type: "REMATCH" });
    }
    expect(cycleReset).toBe(true);
  });
});
