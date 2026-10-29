import { strict as assert } from "node:assert";
import { total } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";

/** Test-only: archive checked, committed log entries; retain the live chain. */
export function compactChainHistory(s: MAState) {
  const snapshot = s.turn ? JSON.parse(s.turn.snapshot) as MAState : null;
  const length = snapshot ? snapshot.log.length : s.log.length;
  if (!length) return [];
  const archived = s.log.splice(0, length);
  if (snapshot) {
    snapshot.log = [];
    s.turn!.snapshot = JSON.stringify(snapshot);
  }
  return archived;
}

/** Called after every authoritative command, including partially answered chains. */
export function checkChainInvariants(s: MAState) {
  const hands = s.players.flatMap((p) => p.hand);
  assert.equal(new Set(hands).size, hands.length, "physical cards must have one owner");
  for (const p of s.players) {
    assert.equal(
      total(p.chips),
      p.chips.reduce((n, c) => n + c.value, 0),
    );
    assert(p.chips.every((c) => Number.isInteger(c.value) && c.value >= 0));
    for (const kind of ["gold", "silver"] as const) {
      for (let race = 0; race < s.settings.races; race++)
        assert(
          s.players.flatMap((p) => p.chips).filter((c) => c.race === race && c.kind === kind).length <= 1,
          `duplicate ${kind}`,
        );
    }
  }
  const r = s.race;
  if (!r) return;
  assert.equal(new Set(r.tokens.map((t) => t.racer)).size, r.tokens.length, "duplicate physical racer");
  assert.equal(new Set(s.returningRacers?.map((t) => t.racer)).size, s.returningRacers?.length ?? 0);
  for (const t of r.tokens) {
    assert(
      s.players.some((p) => p.id === t.owner && p.hand.includes(t.racer)),
      "control/card ownership diverged",
    );
    if (t.out) {
      assert.equal(t.place, null, "eliminated racer has a place");
      assert(!r.finishers.includes(t.racer), "eliminated racer in finishers");
    }
    if (t.place === null) assert(t.pos >= 0 && t.pos <= 29, "unfinished position out of bounds");
  }
  if (new Set(r.finishers).size !== r.finishers.length)
    assert(
      r.finishers.length === 2 && r.finishers[0] === r.finishers[1] && r.mastermindPick === r.finishers[0],
      "unexpected duplicate finish",
    );
  const stopped = new Set<string>();
  const eliminated = new Set<string>();
  const dadAwards = new Set<string>();
  let ended = false;
  for (const l of s.log.filter((l) => l.race === r.index)) {
    const f = l.fx;
    if (!f) continue;
    if (ended)
      assert(!["power", "chip", "move", "warp", "trip", "finish"].includes(f.kind), "activity after podium");
    if (f.kind === "move") for (const id of f.racers) assert(!stopped.has(id), `stopped racer moved: ${id}`);
    if (["warp", "trip"].includes(f.kind) && "racer" in f)
      assert(!stopped.has(f.racer), `stopped racer acted: ${f.racer} ${f.kind}`);
    if (f.kind === "power") assert(!eliminated.has(f.racer), `eliminated racer acted: ${f.racer}`);
    if (f.kind === "finish" || f.kind === "out") stopped.add(f.racer);
    if (f.kind === "out") eliminated.add(f.racer);
    if (f.kind === "power" && f.power === "sw_stepdad" && l.text.includes("获得 3 分")) {
      assert(!dadAwards.has(f.racer), "stepdad awarded twice");
      dadAwards.add(f.racer);
    }
    if (f.kind === "podium") {
      ended = true;
      for (const place of f.places.filter((p) => p.place <= 2)) {
        assert(r.finishers.includes(place.racer));
        assert(!r.tokens.find((t) => t.racer === place.racer)!.out);
      }
    }
    if (f.kind === "champion")
      for (const p of f.totals)
        assert.equal(
          p.total,
          total(s.players.find((x) => x.id === p.player)!.chips),
          "final score differs from chips",
        );
  }
}
