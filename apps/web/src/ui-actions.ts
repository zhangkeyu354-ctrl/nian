import {
  canCommand,
  commandFields,
  getControls,
  itemActions,
} from "../../../packages/game-engine/src/index.ts";
import type { Command, GameState } from "../../../packages/shared/src/types.ts";

// Only adapts engine queries to display targets; no movement or effect rules here.
export function skillRouteActions(state: GameState, kind: string, id: string) {
  if (kind !== "PERK") return [];
  const fields = commandFields(state, kind, id);
  if (
    fields.length !== 2 ||
    fields[0].key !== "pathId" ||
    fields[1].key !== "to"
  )
    return [];
  const actorId = getControls(state).actorId!;
  return fields[0].options
    .flatMap((path) =>
      fields[1].options.map((room) => ({
        command: {
          type: "USE_PERK",
          actorId,
          perkId: id,
          pathId: path.value,
          to: room.value,
        } as Command,
        pathId: path.value,
        to: room.value,
        label: room.label,
      })),
    )
    .filter((a) => canCommand(state, a.command));
}
export function ownItemActions(state: GameState, ownerId: string) {
  return Object.values(state.actors)
    .filter((a) => a.ownerId === ownerId)
    .flatMap((a) => itemActions(state, a.id));
}
