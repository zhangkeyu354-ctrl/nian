import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SSRoom } from "../src/ss-rooms.ts";
import type { SSAction } from "../../../packages/shared/src/ss-protocol.ts";
it("SS room host settings, seeded start, concurrent submissions, private projection and atomic persistence", () => {
  const dir = mkdtempSync(join(tmpdir(), "ss-room-"));
  try {
    const r = SSRoom.create("SSAB", dir, { allowFixedSeed: true });
    const claims = Array.from({ length: 3 }, (_, i) => r.claim(`旅客${i}`));
    const act = (i: number, a: SSAction) =>
      r.action(
        claims[i].token,
        r.file.version,
        (r.file.seq[claims[i].playerId] ?? 0) + 1,
        a,
        1000,
        r.file.state?.round,
      );
    expect(r.file.events).toBe(false);
    expect(r.file.seconds).toBe(0);
    expect(() => act(1, { type: "SET_SETTINGS", events: true })).toThrow(
      "房主",
    );
    act(0, { type: "SET_SETTINGS", events: true, seconds: 60, firstGuard: 1 });
    claims.forEach((_, i) => act(i, { type: "READY" }));
    act(0, { type: "START", seed: 20 });
    expect(r.file.state?.guard).toBe(1);
    expect(r.file.state?.deadline).toBe(61000);
    const version = r.file.version;
    for (const i of [0, 2]) {
      const h = r.file.state!.players[i].hand;
      const n = r.file.state!.event === "holiday" ? 3 : 2;
      r.action(
        claims[i].token,
        version,
        (r.file.seq[claims[i].playerId] ?? 0) + 1,
        { type: "SUBMIT", luggage: h.slice(0, n), bribe: h[n] },
        1000,
        1,
      );
    }
    expect(r.file.state?.phase).toBe("BRIBE");
    expect(
      r
        .snapshot(claims[1].token, 1000)
        .view?.players[0].luggage.every((v) => v === null),
    ).toBe(true);
    const snap = r.snapshot(claims[1].token, 1000);
    expect(JSON.stringify(snap)).not.toMatch(/"token"|"seed"|"eventDeck"/);
    const saved = JSON.parse(readFileSync(join(dir, "SSAB.json"), "utf8"));
    expect(saved.state).toEqual(r.file.state);
    const previous = structuredClone(r.file);
    expect(() => act(0, { type: "ADVANCE" })).toThrow("警长");
    expect(r.file).toEqual(previous);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
