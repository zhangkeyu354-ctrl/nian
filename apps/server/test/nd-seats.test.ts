import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NDRoom } from "../src/nd-rooms.ts";
import type { NDAction } from "../../../packages/shared/src/nd-protocol.ts";

function act(r: NDRoom, token: string, action: NDAction) {
  const me = r.me(token)!;
  return r.action(
    token,
    r.file.version,
    (r.file.seq[me.id] ?? 0) + 1,
    action,
    1000,
    r.file.state?.round,
  );
}
function setup() {
  const r = NDRoom.create("ABCD", mkdtempSync(join(tmpdir(), "nd-seat-")), {
    allowFixedSeed: true,
    clock: () => 1000,
  });
  const c = [0, 1, 2, 3].map((i) => r.claim("玩家" + i));
  return { r, c };
}
describe("ND 大厅选座", () => {
  it("和别人交换座位，队长顺序跟着座位走，房主身份不变", () => {
    const { r, c } = setup();
    act(r, c[0].token, { type: "READY" });
    act(r, c[3].token, { type: "SWAP_SEAT", target: 0 });
    expect(r.file.players.map((p) => p.name)).toEqual([
      "玩家3",
      "玩家1",
      "玩家2",
      "玩家0",
    ]);
    expect(r.file.players.every((p) => !p.ready)).toBe(true);
    expect(r.snapshot(c[0].token, 1000).hostId).toBe(r.me(c[0].token)!.id);
    // 房主坐到 4 号位后仍然可以改设置和开局
    act(r, c[0].token, { type: "SET_SETTINGS", seconds: 60 });
    for (const p of c) act(r, p.token, { type: "READY" });
    act(r, c[0].token, { type: "START", seed: 7 });
    expect(r.file.state!.players[0].name).toBe("玩家3");
    // 非房主不能开局 / 改设置
    expect(r.file.state!.phase).toBe("CHOOSE_TOPIC");
  });
  it("拒绝换到空位、自己的位置，对局中不能换座", () => {
    const { r, c } = setup();
    expect(() => act(r, c[1].token, { type: "SWAP_SEAT", target: 1 })).toThrow();
    expect(() => act(r, c[1].token, { type: "SWAP_SEAT", target: 7 })).toThrow();
    expect(() => act(r, c[1].token, { type: "SET_SETTINGS", seconds: 60 })).toThrow();
    for (const p of c) act(r, p.token, { type: "READY" });
    act(r, c[0].token, { type: "START", seed: 7 });
    expect(() => act(r, c[1].token, { type: "SWAP_SEAT", target: 0 })).toThrow();
  });
});
