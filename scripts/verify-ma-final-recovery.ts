/** Real room store recovery at secret choices and ownership changes. */
import { MARoom, MARoomStore } from "../apps/server/src/ma-rooms.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import type { MAClientCommand } from "../packages/shared/src/ma-protocol.ts";
const preferred = [
  "sw_cheatah",
  "sw_doppelgangster",
  "sw_hog_knight",
  "sw_magical_athlete",
  "sw_mush",
  "sw_null",
  "sw_re_runner",
  "sw_switcharoo",
];
const results = [];
for (const seed of [390, 17]) {
  const dir = mkdtempSync(join(tmpdir(), "ma-final-recovery-"));
  let store = new MARoomStore(dir);
  let room = new MARoom({
    game: "magical-athlete",
    code: "TEST",
    createdAt: "2026-10-26",
    stage: "game",
    hostId: "a",
    players: [
      { playerId: "a", token: "test-a", name: "A" },
      { playerId: "b", token: "test-b", name: "B" },
    ],
    points: Array.from({ length: 4 }, () => ({ gold: 3, silver: 1 })),
    secondWind: true,
    bananaBackwardPass: true,
    seed,
    commands: [],
  });
  let steps = 0,
    recoveries = 0,
    secrets = 0,
    swapped = false,
    transfers = 0;
  const recover = () => {
    const expected = JSON.stringify(room.state);
    store.save(room);
    store = new MARoomStore(dir);
    room = store.rooms.get("TEST")!;
    assert(room, "saved room");
    assert.equal(JSON.stringify(room.state), expected);
    recoveries++;
  };
  while (room.state!.phase !== "over") {
    assert(++steps < 4000);
    const s = room.state!;
    let player: string, cmd: MAClientCommand;
    if (s.phase === "draft") {
      const d = s.draft!;
      player = d.order[d.step];
      cmd = {
        type: "DRAFT",
        racer: d.pool.find((id) => preferred.includes(id)) ?? d.pool.find((id) => id.startsWith("sw_")) ?? d.pool[0],
      };
    } else if (s.phase === "choose") {
      const p = s.players.find((p) => !p.choices.length)!;
      player = p.id;
      const left = p.hand.filter((id) => !p.used.includes(id));
      cmd = { type: "CHOOSE", racer: left.find((id) => preferred.includes(id)) ?? left[0] };
    } else {
      const p = s.pending!;
      player = p.player;
      if (p.kind === "cheatah_guess") {
        const v = room.snapshot(player).view!;
        assert(!("turn" in v) && !("rng" in v));
        assert(!v.pending!.prompt.includes("4"));
        secrets++;
        recover();
      }
      if (p.kind === "switcharoo") recover();
      let value =
        p.kind === "cheatah_set"
          ? "4"
          : (p.options.find((o) => o.value === "no")?.value ??
            p.options.find((o) => o.value === "keep")?.value ??
            p.options[0].value);
      if (p.kind === "switcharoo" && !swapped) {
        value = p.options.find((o) => o.value !== "no")!.value;
        swapped = true;
      }
      cmd = { type: "ANSWER", value };
      const other = player === "a" ? "b" : "a";
      assert.throws(() => room.apply("test-" + other, room.file.commands.length, cmd));
    }
    const version = room.file.commands.length;
    const before = room.state!.log.filter((l) => l.fx?.kind === "control").length;
    room.apply("test-" + player, version, cmd);
    assert.throws(() => room.apply("test-" + player, version, cmd), /STALE/);
    const after = room.state!.log.filter((l) => l.fx?.kind === "control").length;
    if (after > before) {
      transfers += after - before;
      recover();
    }
    if (room.state!.phase === "choose" && room.state!.returningRacers?.length) recover();
  }
  recover();
  assert.equal(room.state!.log.filter((l) => l.fx?.kind === "podium").length, 4);
  results.push({
    seed,
    commands: steps,
    races: 4,
    recoveries,
    secretDecisionRecoveries: secrets,
    controlTransfers: transfers,
    returningRacers: room.state!.returningRacers?.length ?? 0,
  });
}
assert(results.some((r) => r.secretDecisionRecoveries > 0));
assert(results.some((r) => r.controlTransfers > 0));
assert(results.some((r) => r.returningRacers > 0));
writeFileSync(
  "docs/magical-athlete/second-wind/final-recovery-report.json",
  JSON.stringify({ realRoomStore: true, results }, null, 2) + "\n",
);
console.log("MA_FINAL_RECOVERY_PASS", JSON.stringify(results));
