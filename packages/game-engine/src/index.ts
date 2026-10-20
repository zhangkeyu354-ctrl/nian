/** Public, deterministic engine API. Mutation helpers remain internal to engine.ts. */
export { createGame, reduce, RuleError, checkRule } from "./engine.ts";
export { connected, legalRoutes } from "./graph.ts";
export { resolveDice, resultClass } from "./dice.ts";
export { viewFor, HIDDEN } from "./privacy.ts";
export {
  boardVisuals,
  propVisual,
  feedbackEvents,
  visualCatalog,
  visualKindNames,
  sampleVisual,
  backCategories,
} from "./presentation.ts";
export {
  getControls,
  currentActor,
  previewRoutes,
  publicProps,
  carrySteps,
  commandFields,
  availableSkills,
  canCommand,
  cardNames,
  propNames,
  categoryNames,
  actionNames,
  actorName,
  roomName,
  propLabel,
  pathLabel,
  itemActions,
  itemLabel,
  paramActions,
  itemNames,
} from "./controls.ts";
export { itemCommands, ITEM_IDS } from "./items.ts";
export type {
  GameState,
  Command,
  CreateOptions,
} from "../../shared/src/types.ts";
