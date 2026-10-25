import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DrawingRoom } from "../src/drawing-rooms.ts";
it("theme/award snapshots retain deadlines, votes, seeds, receipts and chain scope through host takeover", () => {
  const dir = mkdtempSync(join(tmpdir(), "tp-award-"));
  try {
    let r = DrawingRoom.create(dir, "tp", 3, "THEMES");
    const ps = [r.claim("甲"), r.claim("乙"), r.claim("丙")];
    let op = 0;
    const action = (i: number, a: any) =>
      r.apply(
        ps[i],
        { scope: r.scope(), op: String(++op), action: a },
        r.file.game?.deadline ? r.file.game.deadline - 1 : 1000,
      );
    ps.forEach((_, i) => action(i, { type: "READY" }));
    action(0, { type: "START" });
    action(0, { type: "THEME_VOTE", theme: 4 });
    let old = r.file.game;
    r = DrawingRoom.load(dir, "THEMES");
    expect(r.file.game).toEqual(old);
    action(1, { type: "THEME_VOTE", theme: 4 });
    action(2, { type: "THEME_VOTE", theme: 6 });
    r.expire(r.file.game!.deadline);
    while (r.file.game!.phase !== "REVEAL") r.expire(r.file.game!.deadline);
    action(0, { type: "NEXT" });
    action(0, { type: "NEXT" });
    expect(r.file.game!.phase).toBe("AWARD");
    const stale = r.scope(),
      ballot = {
        scope: stale,
        op: "same-award",
        action: { type: "AWARD_VOTE", chain: 0, mvp: ps[1].id, dud: ps[1].id },
      };
    r.apply(ps[0], ballot, r.file.game!.deadline - 1);
    r.apply(ps[0], ballot, r.file.game!.deadline - 1);
    expect(r.snapshot(ps[1].token).view?.completed).toBe(1);
    old = r.file.game;
    r = DrawingRoom.load(dir, "THEMES");
    expect(r.file.game).toEqual(old);
    expect(r.snapshot(ps[0].token).view?.myAwardVote?.mvp).toBe(ps[1].id);
    expect(r.snapshot(ps[1].token).view?.myAwardVote).toBeUndefined();
    action(1, { type: "TAKE_HOST" });
    r.expire(r.file.game!.deadline);
    expect(r.file.game!.phase).toBe("AWARD_RESULT");
    expect(() => action(0, { type: "NEXT" })).toThrow("仅房主");
    action(1, { type: "NEXT" });
    expect(r.scope()).not.toBe(stale);
    expect(() =>
      r.apply(
        ps[2],
        { scope: stale, op: "late", action: { type: "AWARD_VOTE", chain: 0 } },
        1000,
      ),
    ).toThrow("阶段已变化");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
