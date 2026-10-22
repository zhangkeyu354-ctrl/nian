import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { WTRoomStore } from "../src/wt-rooms.ts";
import type { WTState } from "../../../packages/witch-town/src/index.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fixture(n: number) {
  const dir = mkdtempSync(join(tmpdir(), "wt-active-roles-"));
  dirs.push(dir);
  let store = new WTRoomStore(dir, { allowCandidateCounts: true });
  const code = store.create(n),
    seats = Array.from({ length: n }, (_, i) => store.claim(code, `P${i}`));
  for (const [i, seat] of seats.entries())
    store.action(code, seat.token, {
      requestId: `ready${i}`,
      version: store.snapshot(code, null).version,
      action: { type: "READY", ready: true },
    });
  store.action(code, seats[0].token, {
    requestId: "start",
    version: store.snapshot(code, null).version,
    action: { type: "START" },
  });
  const file = join(dir, `${code}.json`),
    saved = JSON.parse(readFileSync(file, "utf8")),
    s: WTState = saved.state;
  s.players.forEach((p) => (p.character = "william_phips"));
  s.players[0].character = "tituba";
  s.phase = "day";
  s.pending = null;
  s.turnPlayerId = seats[0].playerId;
  s.players[0].table.push(s.dawnBlackCat!);
  s.dawnBlackCat = null;
  s.blackCatOwnerId = seats[0].playerId;
  s.deck.sort(
    (a, b) =>
      Number(["night", "conspiracy"].includes(a.kind)) -
      Number(["night", "conspiracy"].includes(b.kind)),
  );
  writeFileSync(file, JSON.stringify(saved));
  const restore = () => {
    store = new WTRoomStore(dir, { allowCandidateCounts: true });
  };
  restore();
  return {
    code,
    seats,
    restore,
    get store() {
      return store;
    },
  };
}

for (let n = 4; n <= 12; n++)
  it(`${n} players: Tituba's secret order and deadline survive restart; duplicate finish cannot draw twice`, () => {
    const f = fixture(n),
      token = f.seats[0].token;
    f.store.action(
      f.code,
      token,
      {
        requestId: "tituba",
        version: f.store.snapshot(f.code, null).version,
        action: { type: "TITUBA_START" },
      },
      1000,
    );
    const own = f.store.snapshot(f.code, token),
      publicBefore = f.store.snapshot(f.code, null);
    const choice = own.view!.private!.choice;
    if (choice?.kind !== "tituba") throw Error("missing private deck");
    const order = [
      choice.deck[1].id,
      choice.deck[0].id,
      ...choice.deck.slice(2).map((c) => c.id),
    ];
    const request = {
      requestId: "reorder",
      version: own.version,
      action: { type: "TITUBA_REORDER" as const, cardIds: order },
    };
    f.store.action(f.code, token, request, 2000);
    expect(f.store.snapshot(f.code, null)).toEqual(publicBefore);
    const expected = f.store.snapshot(f.code, token);
    f.restore();
    expect(f.store.snapshot(f.code, token)).toEqual(expected);
    f.store.action(f.code, token, request, 3000);
    expect(f.store.snapshot(f.code, token)).toEqual(expected);
    const other = JSON.stringify(f.store.snapshot(f.code, f.seats[1].token));
    for (const id of order) expect(other).not.toContain(JSON.stringify(id));
    expect(f.store.tick(60999)).toEqual([]);
    const finish = {
      requestId: "finish",
      version: expected.version,
      action: { type: "TITUBA_FINISH" as const },
    };
    f.store.action(f.code, token, finish, 60000);
    const done = f.store.snapshot(f.code, token);
    expect(done.view!.private!.hand.slice(-2).map((c) => c.id)).toEqual(
      order.slice(0, 2),
    );
    f.restore();
    f.store.action(f.code, token, finish, 62000);
    expect(f.store.snapshot(f.code, token)).toEqual(done);
    expect(f.store.tick(62000)).toEqual([]);
  });

it("Tituba automatically draws at the persisted deadline after server restart", () => {
  const f = fixture(4),
    token = f.seats[0].token;
  f.store.action(
    f.code,
    token,
    {
      requestId: "tituba",
      version: f.store.snapshot(f.code, null).version,
      action: { type: "TITUBA_START" },
    },
    1000,
  );
  f.restore();
  expect(f.store.tick(61000)).toEqual([f.code]);
  expect(f.store.snapshot(f.code, token).view!.private!.hand.length).toBe(5);
  expect(f.store.tick(61001)).toEqual([]);
});
