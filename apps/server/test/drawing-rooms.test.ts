import { it, expect } from "vitest";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DrawingRoom } from "../src/drawing-rooms.ts";
import { taskFor } from "../../../packages/drawing-party/src/index.ts";
it("private ink journal recovery, idempotency, edit revision and host authority", () => {
  const dir = mkdtempSync(join(tmpdir(), "dp-test-"));
  try {
    const r = DrawingRoom.create(dir, "tp", 3, "ABCDEF"),
      ps = [r.claim("甲"), r.claim("乙"), r.claim("丙")];
    let op = 0;
    const action = (i: number, a: object) =>
      r.apply(ps[i], { scope: r.scope(), op: String(++op), action: a });
    for (let i = 0; i < 3; i++) action(i, { type: "READY" });
    action(0, { type: "START" });
    for (let i = 0; i < 3; i++)
      action(i, { type: "TEXT", text: "秘密题目" + i });
    const req = {
      scope: r.scope(),
      chunk: {
        id: "ink-a",
        seq: 0,
        color: 0,
        width: 8,
        points: [
          [100, 100, 0],
          [400, 400, 40],
        ],
        end: true,
      },
    };
    r.ink(ps[0], req);
    r.ink(ps[0], req);
    const doc = taskFor(r.file.game!, ps[0].id)!.id;
    expect(r.file.game!.drawings[doc].revision).toBe(1);
    expect(JSON.stringify(r.snapshot(ps[1].token))).not.toContain("ink-a");
    expect(JSON.stringify(r.snapshot())).not.toContain("秘密题目");
    expect(
      DrawingRoom.load(dir, "ABCDEF").file.game!.drawings[doc].strokes[0]
        .points,
    ).toHaveLength(2);
    expect(() =>
      r.edit(ps[0], { scope: r.scope(), revision: 0, kind: "clear" }),
    ).toThrow();
    r.edit(ps[0], { scope: r.scope(), revision: 1, kind: "undo" });
    expect(
      DrawingRoom.load(dir, "ABCDEF").file.game!.drawings[doc].strokes,
    ).toHaveLength(0);
    expect(() => action(1, { type: "ABORT" })).toThrow();
    const scope = r.scope();
    action(0, { type: "SUBMIT" });
    expect(() => r.ink(ps[0], req)).toThrow();
    for (let i = 1; i < 3; i++) action(i, { type: "SUBMIT" });
    expect(() =>
      r.apply(ps[0], {
        op: "stale",
        scope,
        action: { type: "TEXT", text: "迟到" },
      }),
    ).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("shared canvas turn authorization, canonical color and partial journal recovery", () => {
  const dir = mkdtempSync(join(tmpdir(), "dp-test-"));
  try {
    const r = DrawingRoom.create(dir, "fa", 3, "ABCDEF"),
      ps = [r.claim("甲"), r.claim("乙"), r.claim("丙")];
    ps.forEach((p) =>
      r.apply(p, { scope: r.scope(), op: "ready", action: { type: "READY" } }),
    );
    r.apply(ps[0], {
      scope: r.scope(),
      op: "start",
      action: { type: "START" },
    });
    const req = {
      scope: r.scope(),
      chunk: {
        id: "forged",
        seq: 0,
        color: 7,
        width: 28,
        points: [[1, 2, 0]],
        end: true,
      },
    };
    expect(() => r.ink(ps[1], req)).toThrow();
    const e = r.ink(ps[0], req);
    expect(e.chunk.color).toBe(0);
    expect(e.chunk.width).toBe(8);
    expect(e.chunk.id).not.toBe("forged");
    appendFileSync(join(dir, "ABCDEF.json.ink"), '{"broken":');
    expect(
      DrawingRoom.load(dir, "ABCDEF").file.game!.drawings.shared.strokes,
    ).toHaveLength(1);
    r.connections.set(ps[0].id, new Set(["online"]));
    expect(() =>
      r.apply(ps[1], {
        scope: r.scope(),
        op: "take",
        action: { type: "TAKE_HOST" },
      }),
    ).toThrow();
    r.connections.clear();
    r.apply(ps[1], {
      scope: r.scope(),
      op: "take",
      action: { type: "TAKE_HOST" },
    });
    expect(r.file.host).toBe(ps[1].id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("a non-host leaving must not revoke an elected host", () => {
  const dir = mkdtempSync(join(tmpdir(), "dp-test-"));
  try {
    const r = DrawingRoom.create(dir, "tp", 3, "ABCDEF");
    const ps = [r.claim("甲"), r.claim("乙"), r.claim("丙")];
    r.apply(ps[1], {
      scope: r.scope(),
      op: "take",
      action: { type: "TAKE_HOST" },
    });
    r.apply(ps[2], {
      scope: r.scope(),
      op: "leave",
      action: { type: "LEAVE" },
    });
    expect(r.file.host).toBe(ps[1].id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
