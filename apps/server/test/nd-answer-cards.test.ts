import { it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NDRoom } from "../src/nd-rooms.ts";
import type { NDAction } from "../../../packages/shared/src/nd-protocol.ts";
function start(seconds: 0 | 60 = 0) {
  const r = NDRoom.create("ABCD", mkdtempSync(join(tmpdir(), "nd-cards-")), {
    allowFixedSeed: true,
    clock: () => 1000,
  });
  const p = Array.from({ length: 4 }, (_, i) => r.claim(`玩家${i}`));
  const act = (i: number, action: NDAction, version = r.file.version) =>
    r.action(
      p[i].token,
      version,
      r.file.seq[p[i].playerId] + 1,
      action,
      1000,
      r.file.state?.round,
    );
  act(0, { type: "SET_SETTINGS", seconds });
  for (let i = 0; i < 4; i++) act(i, { type: "READY" });
  act(0, { type: "START", seed: 7 });
  act(0, {
    type: "CHOOSE_TOPIC",
    topicId: r.file.state!.topicCards[0].questions[0].id,
  });
  return { r, p, act };
}
it("persisted submitted cards reconnect privately; stale concurrent submissions preserve both answers", () => {
  const { r, p, act } = start();
  const ver = r.file.version;
  act(1, { type: "SUBMIT_ANSWER", text: "一号私密" }, ver);
  act(2, { type: "SUBMIT_ANSWER", text: "二号私密" }, ver);
  expect(JSON.stringify(r.snapshot(p[0].token))).not.toContain("一号私密");
  const restored = new NDRoom(structuredClone(r.file), r.directory, r.options);
  expect(restored.snapshot(p[1].token).view!.answers[1]).toBe("一号私密");
  expect(restored.snapshot(p[2].token).view!.answers[1]).toBeNull();
  act(1, { type: "WITHDRAW_ANSWER" });
  expect(r.snapshot(p[1].token).view!.answers[1]).toBeNull();
});
it("server deadline fills missing cards and publishes them at sorting, preserving submitted text and numbers", () => {
  const { r, p, act } = start(60);
  act(1, { type: "SUBMIT_ANSWER", text: "已写好的" });
  const nums = [...r.file.state!.numbers];
  const deadline = r.file.deadline!;
  expect(r.tick(deadline - 1)).toBe(false);
  expect(r.tick(deadline)).toBe(true);
  expect(r.file.state!.phase).toBe("ORDER");
  expect(r.file.state!.numbers).toEqual(nums);
  expect(r.file.state!.answers).toEqual([
    null,
    "已写好的",
    "（没写）",
    "（没写）",
  ]);
  expect(r.snapshot(p[0].token).view!.answers[1]).toBe("已写好的");
  expect(() => act(1, { type: "WITHDRAW_ANSWER" })).toThrow();
  expect(r.tick(deadline + 1)).toBe(false);
});
