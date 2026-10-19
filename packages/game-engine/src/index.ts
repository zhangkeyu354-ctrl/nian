/** Public, deterministic engine API. Mutation helpers remain internal to engine.ts. */
export { createGame, reduce, RuleError, checkRule } from "./engine.ts";
export { connected, legalRoutes } from "./graph.ts";
export { resolveDice, resultClass } from "./dice.ts";
export type {
  GameState,
  Command,
  CreateOptions,
} from "../../shared/src/types.ts";
