import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { reduce, itemActions } from "../packages/game-engine/src/index.ts";
const samples = new Map<string, any>();
for (const name of readdirSync("work/mobile-implementation")
  .filter((n) => n.startsWith("capture-"))
  .sort()) {
  for (const sample of JSON.parse(
    readFileSync("work/mobile-implementation/" + name, "utf8"),
  ))
    if (!samples.has(sample.id)) samples.set(sample.id, sample);
}
assert.equal(
  [...samples.keys()].filter((id) => id.startsWith("board_")).length,
  39,
);
assert.equal(
  [...samples.keys()].filter((id) => id.startsWith("item_")).length,
  10,
);
assert.equal(
  [...samples.keys()].filter((id) => id.startsWith("power_")).length,
  6,
);
assert.equal(
  [...samples.keys()].filter((id) => id.startsWith("choice_")).length,
  4,
);
for (const item of [
  "commodious_toolbox",
  "first_aid_kit",
  "map",
  "rainbow_map",
]) {
  const sample = structuredClone(samples.get("item_" + item));
  const holder = sample.command.actorId;
  sample.before.turn.actorId = sample.before.survivors.find(
    (id: string) => id !== holder,
  );
  sample.id = "out_of_turn_" + item;
  const legal = itemActions(sample.before, holder).find((a) =>
    Object.entries(sample.command).every(
      ([k, v]) => JSON.stringify((a.command as any)[k]) === JSON.stringify(v),
    ),
  );
  assert(legal, "out of turn fixture is legal " + item);
  sample.command = legal.command;
  sample.afterEvents = reduce(sample.before, sample.command).events.length;
  samples.set(sample.id, sample);
}
{
  const sample = structuredClone(samples.get("out_of_turn_first_aid_kit"));
  const old = sample.command.actorId,
    other = sample.before.survivors.find(
      (id: string) => id !== old && id !== sample.before.turn.actorId,
    );
  sample.before.actors[other].ownerId = sample.before.actors[old].ownerId;
  sample.before.actors[other].item = sample.before.actors[old].item;
  sample.before.actors[old].item = null;
  sample.command = { ...sample.command, actorId: other };
  sample.id = "shared_seat_inventory";
  assert(itemActions(sample.before, other).length);
  sample.afterEvents = reduce(sample.before, sample.command).events.length;
  samples.set(sample.id, sample);
}
writeFileSync(
  "apps/web/test/scenarios.generated.json",
  JSON.stringify([...samples.values()]),
);
console.log(
  "UI_SCENARIOS_COLLECTED",
  samples.size,
  "(successful engine test inputs; generated, not shipped)",
);
