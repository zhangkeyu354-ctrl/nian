import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WTRoomStore } from "../src/wt-rooms.ts";

const dirs: string[] = [];
const setup = (allow = true) => {
  const dir = mkdtempSync(join(tmpdir(), "wt-test-"));
  dirs.push(dir);
  return { dir, store: new WTRoomStore(dir, { allowCandidateCounts: allow }) };
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
describe("witch town server M1", () => {
  it("does not commit a mutation when the durable write fails", () => {
    const { store, dir } = setup();
    const code = store.create(4),
      seat = store.claim(code, "甲");
    const before = store.snapshot(code, seat.token),
      moved = dir + "-moved";
    renameSync(dir, moved);
    try {
      expect(() =>
        store.action(code, seat.token, {
          requestId: "r",
          version: 1,
          action: { type: "READY", ready: true },
        }),
      ).toThrow();
      expect(store.snapshot(code, seat.token)).toEqual(before);
    } finally {
      renameSync(moved, dir);
    }
    store.action(code, seat.token, {
      requestId: "r",
      version: 1,
      action: { type: "READY", ready: true },
    });
    expect(store.snapshot(code, seat.token).version).toBe(2);
  });
  it("records corrupt-save failures without overwriting evidence", () => {
    const { dir } = setup();
    writeFileSync(join(dir, "ABCDEF12.json"), "broken-json");
    const recovered = new WTRoomStore(dir);
    expect(recovered.size).toBe(0);
    expect(recovered.loadErrors).toEqual(["ABCDEF12.json"]);
    expect(readFileSync(join(dir, "ABCDEF12.json"), "utf8")).toBe(
      "broken-json",
    );
  });
  it("uses actual players rather than capacity and refuses fewer than four", () => {
    const { store } = setup();
    const code = store.create(12),
      a = store.claim(code, "甲");
    expect(() =>
      store.action(code, a.token, {
        requestId: "s",
        version: 1,
        action: { type: "START" },
      }),
    ).toThrow("NEED_FOUR_PLAYERS");
    expect(store.snapshot(code, a.token).stage).toBe("lobby");
  });
  for (let n = 4; n <= 12; n++)
    it(`${n} actual players: ready, start, credentials, retry and durable recovery`, () => {
      const { dir, store } = setup();
      const code = store.create(12);
      const seats = Array.from({ length: n }, (_, i) =>
        store.claim(code, `玩家${i}`),
      );
      let version = n;
      for (const [i, seat] of seats.entries())
        store.action(code, seat.token, {
          requestId: `ready${i}`,
          version: version++,
          action: { type: "READY", ready: true },
        });
      const request = {
        requestId: "start",
        version,
        action: { type: "START" } as const,
      };
      store.action(code, seats[0].token, request);
      const before = store.snapshot(code, seats[0].token);
      expect(before.view?.players).toHaveLength(n);
      expect(before.view?.private?.hand).toHaveLength(3);
      expect(before.view?.private?.tryals).toHaveLength(
        n <= 7 ? 5 : n <= 9 ? 4 : 3,
      );
      store.action(code, seats[0].token, request);
      expect(store.snapshot(code, seats[0].token)).toEqual(before);
      const restored = new WTRoomStore(dir, { allowCandidateCounts: true });
      expect(restored.snapshot(code, seats[0].token)).toEqual(before);
      expect(restored.snapshot(code, null).view?.private).toBeNull();
      expect(() => restored.snapshot(code, "stolen")).toThrow("BAD_CREDENTIAL");
      const wire = JSON.stringify(restored.snapshot(code, seats[0].token));
      for (const other of seats.slice(1)) {
        expect(wire).not.toContain(other.token);
        expect(wire).not.toContain('"tokenHash"');
      }
      const file = readFileSync(join(dir, readdirSync(dir)[0]), "utf8");
      expect(file).not.toContain(seats[0].token);
      expect(() =>
        restored.action(code, seats[1].token, {
          ...request,
          requestId: "again",
          version: before.version,
          action: { type: "START" },
        }),
      ).toThrow("HOST_ONLY");
    });
  it("rejects concurrent stale changes, reused request IDs and foreign credentials without mutation", () => {
    const { store } = setup();
    const code = store.create(4),
      a = store.claim(code, "甲"),
      b = store.claim(code, "乙");
    const req = {
      requestId: "r",
      version: 2,
      action: { type: "READY", ready: true } as const,
    };
    store.action(code, a.token, req);
    const before = store.snapshot(code, a.token);
    expect(() =>
      store.action(code, b.token, { ...req, requestId: "b" }),
    ).toThrow("STALE_VERSION");
    expect(() =>
      store.action(code, a.token, {
        ...req,
        action: { type: "READY", ready: false },
      }),
    ).toThrow("REQUEST_ID_REUSED");
    expect(() => store.action(code, "fake", req)).toThrow("BAD_CREDENTIAL");
    expect(store.snapshot(code, a.token)).toEqual(before);
  });
  it("requires readiness, actual minimum, host and explicit candidate opt-in", () => {
    const { store } = setup(false);
    const code = store.create(12),
      seats = Array.from({ length: 4 }, (_, i) => store.claim(code, `p${i}`));
    expect(() =>
      store.action(code, seats[0].token, {
        requestId: "bad",
        version: 4,
        action: { type: "START" },
      }),
    ).toThrow("NOT_READY");
    for (let i = 0; i < 4; i++)
      store.action(code, seats[i].token, {
        requestId: `r${i}`,
        version: 4 + i,
        action: { type: "READY", ready: true },
      });
    const before = store.snapshot(code, seats[0].token);
    expect(() =>
      store.action(code, seats[0].token, {
        requestId: "s",
        version: 8,
        action: { type: "START" },
      }),
    ).toThrow("CHECK_REQUIRED:X11");
    expect(store.snapshot(code, seats[0].token)).toEqual(before);
    expect(() => store.create(3)).toThrow("BAD_CAPACITY");
    expect(() => store.create(13)).toThrow("BAD_CAPACITY");
  });
  it("rejects joins after start, full capacity, invalid requests and never executes unimplemented actions", () => {
    const { store } = setup();
    const code = store.create(4),
      seats = Array.from({ length: 4 }, (_, i) => store.claim(code, `p${i}`));
    expect(() => store.claim(code, "extra")).toThrow("ROOM_FULL");
    const req = { requestId: "x", version: 4, action: { type: "DRAW" } as any };
    expect(() => store.action(code, seats[0].token, req)).toThrow(
      "M1_ACTION_NOT_IMPLEMENTED",
    );
    for (let i = 0; i < 4; i++)
      store.action(code, seats[i].token, {
        requestId: `r${i}`,
        version: 4 + i,
        action: { type: "READY", ready: true },
      });
    store.action(code, seats[0].token, {
      requestId: "s",
      version: 8,
      action: { type: "START" },
    });
    expect(() => store.claim(code, "extra")).toThrow("ALREADY_STARTED");
    expect(() =>
      store.action(code, seats[0].token, {
        requestId: "draw",
        version: 9,
        action: { type: "DRAW" } as any,
      }),
    ).toThrow("M1_ACTION_NOT_IMPLEMENTED");
  });
});
