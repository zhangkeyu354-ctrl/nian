import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { fixture } from "../../../packages/game-engine/test/fixtures.ts";
import { createGame, reduce } from "../../../packages/game-engine/src/index.ts";
import { legalRoutes } from "../../../packages/game-engine/src/graph.ts";
import { getControls } from "../../../packages/game-engine/src/controls.ts";
import {
  items,
  boardPerks,
  roster,
} from "../../../packages/game-engine/src/data.ts";
const findings: any[] = [];
// Isolated valid-state fixtures, not a full game or browser test.
{
  let s = fixture("trapper");
  const from = s.actors.dwight.room!;
  const r = legalRoutes(s, from, "survivor").find(
    (r) => !s.paths[r.pathId].wall,
  )!;
  for (const a of Object.values(s.actors)) a.perks = [];
  s.actors.dwight.perks = ["board_dwight_2"];
  s.actors.claudette.perks = ["board_claudette_1"];
  s.actors.dwight.room = r.to;
  s.actors.dwight.health = "wounded";
  s.window = {
    event: "AFTER_MOVE",
    context: { actorId: "dwight", from, to: r.to, pathId: r.pathId },
    actors: ["dwight"],
    index: 0,
    eligible: { dwight: ["board_dwight_2"] },
  };
  s = reduce(s, {
    type: "USE_PERK",
    actorId: "dwight",
    perkId: "board_dwight_2",
    targetId: "claudette",
  });
  for (let i = 0; i < 10 && s.window; i++) {
    if (
      s.window.event === "AFTER_MOVE" &&
      s.window.context.actorId === "claudette"
    )
      break;
    s = reduce(s, { type: "PASS", actorId: s.window.actors[s.window.index] });
  }
  const offered =
    s.window?.eligible.claudette?.includes("board_claudette_1") ?? false;
  assert.equal(s.turn?.actorId, "dwight");
  assert.equal(offered, true);
  const badUse = reduce(s, {
    type: "USE_PERK",
    actorId: "claudette",
    perkId: "board_claudette_1",
    targetId: "dwight",
  });
  assert(
    badUse.events.some(
      (e) => e.type === "PERK_USED" && e.data.perkId === "board_claudette_1",
    ),
  );
  findings.push({
    illegalUseAccepted: true,
    id: "AUDIT-B01",
    reproduced: true,
    description:
      "Claudette botany offered after following Dwight outside her own turn",
    turnActor: s.turn?.actorId,
    window: s.window,
  });
}
{
  let s = fixture("hag", ["meg", "claudette", "jake", "ace"]);
  const from = s.actors.hag.room!;
  const r = legalRoutes(s, from, "killer").find(
    (r) => !s.paths[r.pathId].wall,
  )!;
  for (const a of Object.values(s.actors)) a.perks = [];
  s.actors.meg.perks = ["board_meg_3"];
  s.actors.meg.room = r.to;
  const locker = s.props.find((p) => p.kind === "locker")!;
  locker.room = r.to;
  locker.revealed = true;
  s.choice = { kind: "PHANTASM", actorId: "hag", room: r.to, price: 0 };
  const p = s.props.find((p) => p.room === r.to && p.id !== locker.id)!;
  p.revealed = false;
  s = reduce(s, {
    type: "SELECT",
    actorId: "hag",
    option: "teleport",
    targetId: "meg",
    action: "attack",
  });
  assert.equal(s.actors.meg.health, "healthy");
  assert.equal(s.choice?.kind, "REVEAL");
  s = reduce(s, { type: "SELECT", actorId: "hag", propId: p.id });
  assert.equal(s.window?.eligible.meg?.includes("board_meg_3"), true);
  s = reduce(s, {
    type: "USE_PERK",
    actorId: "meg",
    perkId: "board_meg_3",
    propId: locker.id,
  });
  let passError = "";
  try {
    reduce(s, { type: "PASS", actorId: "meg" });
  } catch (e) {
    passError = String(e);
  }
  assert(passError.includes("invalid survivor target"));
  assert.equal(s.actors.meg.lockerId, locker.id);
  const actions = getControls(s).actions;
  assert.equal(actions.length, 0);
  findings.push({
    id: "AUDIT-B02",
    legalActionsAfterHide: actions.length,
    reproduced: true,
    description:
      "Meg hides legally before Hag phantom interaction; PASS then rejects invalidated attack target, leaving response window unresolved",
    control:
      "Hag reveals before attack and offers Meg response correctly; ordering hypothesis disproved",
    passError,
    window: s.window,
    pendingAction: s.pendingAction,
    jobs: s.jobs,
    megHealth: s.actors.meg.health,
    lockerId: s.actors.meg.lockerId,
  });
}
{
  const errors: any[] = [];
  for (const mode of ["BLOODWEB", "DEVOUT"]) {
    try {
      createGame({
        seed: 1,
        mapId: "macmillan_estate",
        killer: "trapper",
        survivors: ["dwight", "meg", "claudette", "jake"],
        mode,
      } as any);
    } catch (e) {
      errors.push({ mode, error: String(e) });
    }
  }
  for (const item of items.definitions) {
    const state = fixture();
    state.actors.dwight.item = item.id;
    try {
      reduce(state, { type: "USE_ITEM", actorId: "dwight", itemId: item.id });
    } catch (e) {
      errors.push({ command: "USE_ITEM", itemId: item.id, error: String(e) });
    }
  }
  for (const perkId of [
    "board_meg_1",
    "board_feng_min_1",
    "board_wraith_3",
    "board_hag_1",
    "board_doctor_3",
  ]) {
    const owner = boardPerks.get(perkId)!.owner_id!;
    const survivor = roster.get(owner)?.side === "survivor";
    const people = survivor
      ? [
          owner,
          ...["dwight", "meg", "claudette", "jake", "ace"].filter(
            (x) => x !== owner,
          ),
        ].slice(0, 4)
      : ["dwight", "claudette", "jake", "ace"];
    const state = fixture(survivor ? "trapper" : owner, people);
    try {
      reduce(state, { type: "USE_PERK", actorId: owner, perkId });
    } catch (e) {
      errors.push({ perkId, owner, error: String(e) });
    }
  }
  assert.equal(errors.length, 17);
  assert(errors.every((e) => e.error.includes("CHECK_REQUIRED")));
  findings.push({ id: "DECLARED_GAPS", errors });
}
writeFileSync(
  "docs/audits/completeness-2026-10-19/运行探针.json",
  JSON.stringify(
    {
      kind: "Audit evidence; reproduced defects are NOT rules acceptance passes",
      fixtureScope:
        "isolated engine state and existing fixture helper; no product code changed",
      findings,
    },
    null,
    2,
  ),
);
console.log(
  "AUDIT: 2 defects reproduced; 5 deferred perks, all 10 item uses and 2 modes reject as declared. No fixes applied.",
);
