import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { WTRoomStore } from "../src/wt-rooms.ts";
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function fixture(kind: "night" | "conspiracy") {
  const dir = mkdtempSync(join(tmpdir(), "wt-events-"));
  dirs.push(dir);
  let store = new WTRoomStore(dir, { allowCandidateCounts: true });
  const code = store.create(6),
    seats = Array.from({ length: 6 }, (_, i) => store.claim(code, `P${i}`));
  for (let i = 0; i < 6; i++)
    store.action(code, seats[i].token, {
      requestId: `r${i}`,
      version: 6 + i,
      action: { type: "READY", ready: true },
    });
  store.action(code, seats[0].token, {
    requestId: "s",
    version: 12,
    action: { type: "START" },
  });
  const path = join(dir, `${code}.json`),
    r = JSON.parse(readFileSync(path, "utf8")),
    s = r.state;
  // Move existing Witch cards by swaps to produce two known holders, keeping all IDs/counts.
  const wanted = kind === "night" ? [0, 1] : [0, 2];
  const witches = s.players.flatMap((p: any) =>
    p.tryals.filter((t: any) => t.kind === "witch"),
  );
  for (let i = 0; i < 2; i++) {
    const owner = s.players.find((p: any) => p.tryals.includes(witches[i])),
      target = s.players[wanted[i]];
    if (owner !== target) {
      const wi = owner.tryals.indexOf(witches[i]),
        ni = target.tryals.findIndex((t: any) => t.kind === "not_witch");
      [owner.tryals[wi], target.tryals[ni]] = [
        target.tryals[ni],
        owner.tryals[wi],
      ];
    }
  }
  s.players.forEach((p: any) => {
    p.character = "william_phips";
    p.everWitch = p.tryals.some((t: any) => t.kind === "witch");
  });
  const eventIndex = s.deck.findIndex((c: any) => c.kind === kind);
  s.deck.unshift(s.deck.splice(eventIndex, 1)[0]);
  writeFileSync(path, JSON.stringify(r));
  store = new WTRoomStore(dir, { allowCandidateCounts: true });
  let serial = 0;
  const action = (i: number, a: any, now = 1000) =>
    store.action(
      code,
      seats[i].token,
      {
        requestId: `op${serial++}`,
        version: store.snapshot(code, seats[i].token).version,
        action: a,
      },
      now,
    );
  for (const i of wanted)
    action(i, { type: "DAWN_TARGET", targetId: seats[2].playerId });
  if (kind === "conspiracy") {
    const saved = JSON.parse(readFileSync(path, "utf8"));
    saved.state.discard.push(...saved.state.players[2].table.splice(0));
    saved.state.blackCatOwnerId = null;
    saved.state.players.forEach(
      (p: any, i: number) => (p.everWitch = ![1, 5].includes(i)),
    );
    writeFileSync(path, JSON.stringify(saved));
    store = new WTRoomStore(dir, { allowCandidateCounts: true });
  }
  action(2, { type: "DRAW" });
  return {
    dir,
    path,
    code,
    seats,
    action,
    get store() {
      return store;
    },
    restore() {
      store = new WTRoomStore(dir, { allowCandidateCounts: true });
    },
  };
}
it("secret night ballots do not change public versions; real deadline state survives restore and settles once", () => {
  const f = fixture("night"),
    before = f.store.snapshot(f.code, null);
  f.action(0, { type: "NIGHT_TARGET", targetId: f.seats[5].playerId });
  expect(f.store.snapshot(f.code, null)).toEqual(before);
  f.action(1, { type: "NIGHT_TARGET", targetId: f.seats[5].playerId });
  const publicView = JSON.stringify(f.store.snapshot(f.code, null));
  expect(publicView).not.toContain("attackTargetId");
  expect(publicView).not.toContain("votes");
  const c = f.seats.findIndex((seat) =>
    f.store
      .snapshot(f.code, seat.token)
      .view!.private!.tryals.some((t) => t.kind === "constable"),
  );
  const protect = f.seats.findIndex((_, i) => i !== c && i !== 5);
  f.action(c, { type: "NIGHT_PROTECT", targetId: f.seats[protect].playerId });
  const checkpoint = f.store.snapshot(f.code, f.seats[0].token);
  expect(checkpoint.view!.pending).toMatchObject({
    stage: "confession",
    deadline: 31000,
  });
  expect(checkpoint.view?.gavelTargetId).toBe(f.seats[protect].playerId);
  f.restore();
  expect(f.store.snapshot(f.code, f.seats[0].token)).toEqual(checkpoint);
  expect(f.store.tick(30999)).toEqual([]);
  expect(f.store.tick(31000)).toEqual([f.code]);
  const done = f.store.snapshot(f.code, f.seats[0].token);
  expect(
    done.view?.players.find((p) => p.id === f.seats[5].playerId)?.alive,
  ).toBe(false);
  expect(f.store.tick(32000)).toEqual([]);
  f.restore();
  expect(f.store.snapshot(f.code, f.seats[0].token)).toEqual(done);
});
it("unresolved secret exchange locks generically, with concrete diagnosis only in the server save", () => {
  const f = fixture("conspiracy"),
    before = f.store.snapshot(f.code, null);
  for (let i = 0; i < 5; i++)
    f.action(i, { type: "CONSPIRACY_PICK", index: 0 });
  // Use the known existing Witch instance on each left source; never expose it via protocol.
  const saved = JSON.parse(readFileSync(f.path, "utf8")),
    e = saved.state.pending.event;
  for (const id of e.members) {
    const source = saved.state.players.find((p: any) => p.id === e.leftOf[id]);
    if (e.picks[id])
      e.picks[id] = (
        source.tryals.find((t: any) => t.kind === "witch") ?? source.tryals[0]
      ).id;
  }
  writeFileSync(f.path, JSON.stringify(saved));
  f.restore();
  expect(f.store.snapshot(f.code, null)).toEqual(before);
  const left = f.store.snapshot(f.code, f.seats[0].token).view!.private!.tryals;
  const witchIndex = left.findIndex((t) => t.kind === "witch");
  expect(() =>
    f.action(5, { type: "CONSPIRACY_PICK", index: witchIndex }),
  ).toThrow("CHECK_REQUIRED:EVENT_RULE_REVIEW");
  const publicJson = JSON.stringify(f.store.snapshot(f.code, null));
  expect(publicJson).not.toContain("X04");
  expect(publicJson).not.toContain("picks");
  expect(JSON.parse(readFileSync(f.path, "utf8")).ruleAuditCode).toContain(
    "X04",
  );
  expect(() => f.action(5, { type: "CONSPIRACY_PICK", index: 0 })).toThrow(
    "CHECK_REQUIRED:EVENT_RULE_REVIEW",
  );
});
