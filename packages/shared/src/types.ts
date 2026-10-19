export type Side = "survivor" | "killer";
export type Card = "blue" | "green" | "red" | "yellow" | "wait";
export type Phase = "SETUP" | "PLANNING" | "ACTING" | "BONUS_OFFER" | "OVER";
export type Payload = Record<string, unknown>;
export interface Command extends Payload {
  type: string;
  actorId?: string;
}
export interface Actor {
  id: string;
  side: Side;
  ownerId: string;
  room: string | null;
  blood: number;
  health: "healthy" | "wounded";
  woundedRound: number | null;
  hookId: string | null;
  lockerId: string | null;
  personalSacrifice: number;
  madness: boolean;
  perks: string[];
  powerUsed: boolean;
  item: string | null;
}
export interface PathState {
  id: string;
  rooms: string[];
  color: Card;
  direction: "both" | "a_to_b";
  from: string;
  to: string;
  wall: boolean;
  pallet: boolean;
  bearTrap: boolean;
  temporaryWall: boolean;
  temporaryWallUntil?: number;
}
export interface Prop {
  id: string;
  room: string;
  kind: string;
  category: string;
  revealed: boolean;
  removed: boolean;
  progress: number;
}
export interface Event {
  seq: number;
  round: number;
  type: string;
  data: Payload;
  sourceRef: string[];
}
export interface Job extends Payload {
  kind: string;
}
export interface Window {
  event: string;
  context: Payload;
  actors: string[];
  index: number;
  eligible: Record<string, string[]>;
  /** 持有物品、可在此时机使用物品的逃生者（只依据公开信息：是否持有物品） */
  itemActors?: string[];
}
export interface Choice extends Payload {
  kind: string;
  actorId: string;
}
export interface Roll {
  actorId: string;
  kind: string;
  targetId: string;
  die: "skill_check" | "danger";
  count: number;
  faces: number[];
  classes: string[];
  failureCredit: boolean[];
  keep: number | null;
  data: Payload;
  /** 已被重掷过的骰子序号；重掷过的骰子不能再重掷（B01 p16） */
  rerolled?: number[];
}
export interface Turn {
  actorId: string;
  card: Card | null;
  index: number;
  bonus: boolean;
  stage: "SELECT_BONUS" | "MOVE" | "INTERACT" | "DONE";
  interactionSpent: boolean;
  interacted: boolean;
  token: number;
  /** 手电筒：本回合杀手不能交互（仍可使用杀手力量，B01 p14 力量是"代替交互"） */
  noInteract?: boolean;
}
export interface GameState {
  version: 1;
  mapId: string;
  rng: number;
  seed: number;
  round: number;
  phase: Phase;
  actors: Record<string, Actor>;
  survivors: string[];
  killerId: string;
  firstPlayer: number;
  hands: Record<string, Card[]>;
  plans: Record<string, Card[]>;
  publicPlans: string[];
  props: Prop[];
  paths: Record<string, PathState>;
  entity: { kind: "path" | "prop"; id: string } | null;
  phantasms: string[];
  sacrifice: number;
  completedGenerators: number;
  generatorsThisRound: number;
  setupIndex: number;
  turnOrder: string[];
  cursor: number;
  turn: Turn | null;
  savedTurns: Array<{ turn: Turn | null; jobs: Job[]; phase: Phase }>;
  killerBonusUsed: boolean;
  killerBonusForbidden: boolean;
  usedPerks: string[];
  jobs: Job[];
  window: Window | null;
  choice: Choice | null;
  roll: Roll | null;
  pendingAction: Payload | null;
  winner: Side | null;
  events: Event[];
  unresolvedAbilities: string[];
  itemDeck: string[];
  itemDiscard: string[];
  /** 鞭炮：阻止杀手进入该空间（仅在紧接着的那一次移动中生效） */
  blockedEntry?: { room: string; by: string } | null;
}
export interface CreateOptions {
  mode?: "ADEPT" | "BLOODWEB" | "DEVOUT";
  seed: number;
  mapId: string;
  survivors: string[];
  killer: string;
  owners?: Record<string, string>;
}
