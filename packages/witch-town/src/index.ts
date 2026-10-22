import {
  CARDS,
  CHARACTERS,
  CANDIDATE_COUNTS,
  PLAYER_CONFIGS,
  RULE_DECISIONS,
  type CardKind,
  type CharacterId,
  type CountsProfile,
} from "./data.ts";
import {
  accusationValue,
  publicPending,
  privateChoice,
  privateLootChoices,
  type WTPending,
  type WTTask,
  type WTLog,
  type WTOutcome,
} from "./day.ts";
export { reduceWitchTown, accusationValue, trialThreshold } from "./day.ts";
export * from "./data.ts";

export type Random = () => number;
export type TryalKind = "not_witch" | "witch" | "constable";
export interface Tryal {
  id: string;
  kind: TryalKind;
  revealed: boolean;
}
export interface PlayingCard {
  id: string;
  kind: CardKind;
  asWitness?: true;
}
export interface WTPlayer {
  id: string;
  name: string;
  character: CharacterId;
  alive: boolean;
  tryals: Tryal[];
  hand: PlayingCard[];
  table: PlayingCard[];
  everWitch: boolean;
  abilityUses: Record<string, number>;
}
/** Server-only state. Never send this object over a socket. */
export interface WTState {
  schemaVersion: 1;
  game: "witch-town";
  rulesProfile: string;
  countsProfile: CountsProfile;
  evidenceWarnings: string[];
  phase: "dawn" | "day" | "choice" | "trial" | "black-event" | "over";
  players: WTPlayer[];
  deck: PlayingCard[];
  discard: PlayingCard[];
  dawnBlackCat: PlayingCard | null;
  blackCatOwnerId: string | null;
  turnPlayerId: string | null;
  unusedCharacters: CharacterId[];
  pending: WTPending;
  day: { played: number; deadline?: number };
  tasks: WTTask[];
  dawnVotes: Record<string, string>;
  log: WTLog[];
  outcome: WTOutcome | null;
  checkRequired?: string | null;
  frameCharacters: CharacterId[];
  gavelTargetId: string | null;
  timerDeadline: number | null;
}
export interface SetupOptions {
  players: { id: string; name: string }[];
  countsProfile?: CountsProfile;
  allowCandidateCounts?: boolean;
}
export class WTRuleError extends Error {}
function fail(message: string): never {
  throw new WTRuleError(message);
}

/** Deterministic test random; production injects node:crypto entropy, never client seeds. */
export function seededRandom(seed: number): Random {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomIndex(length: number, random: Random) {
  const x = random();
  if (!Number.isFinite(x) || x < 0 || x >= 1 || length < 1) fail("BAD_RANDOM");
  return Math.floor(x * length);
}
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function buildPlayingDeck(
  profile: CountsProfile = "official-standard",
  allowCandidateCounts = false,
): PlayingCard[] {
  if (profile === "official-standard")
    fail("CHECK_REQUIRED:X11:STANDARD_CARD_TYPE_COUNTS");
  if (profile !== "candidate-59") fail("BAD_COUNTS_PROFILE");
  if (!allowCandidateCounts) fail("CANDIDATE_COUNTS_DISABLED");
  return CARDS.flatMap((c) =>
    Array.from({ length: CANDIDATE_COUNTS[c.key] }, (_, i) => ({
      id: `playing:${c.key}:${i}`,
      kind: c.key,
    })),
  );
}
export function createWitchTown(
  options: SetupOptions,
  random: Random,
): WTState {
  const config = PLAYER_CONFIGS.find(
    (c) => c.players === options.players.length,
  );
  if (!config) fail("BAD_PLAYER_COUNT");
  if (
    new Set(options.players.map((p) => p.id)).size !== config.players ||
    options.players.some(
      (p) =>
        typeof p.id !== "string" ||
        !p.id ||
        typeof p.name !== "string" ||
        !p.name.trim() ||
        p.name.length > 24,
    )
  )
    fail("BAD_ROSTER");
  const countsProfile = options.countsProfile ?? "official-standard";
  const cards = buildPlayingDeck(countsProfile, options.allowCandidateCounts);
  const identities = shuffle(
    (
      [
        ["not_witch", config.notWitch],
        ["witch", config.witch],
        ["constable", config.constable],
      ] as const
    ).flatMap(([kind, count]) =>
      Array.from({ length: count }, (_, i) => ({
        id: `tryal:${kind}:${i}`,
        kind,
        revealed: false,
      })),
    ),
    random,
  );
  const characters = shuffle(
    CHARACTERS.map((c) => c.key),
    random,
  );
  const players: WTPlayer[] = options.players.map((p, i) => {
    const tryals = identities.slice(
      i * config.tryalsPerPlayer,
      (i + 1) * config.tryalsPerPlayer,
    );
    return {
      ...p,
      character: characters[i],
      alive: true,
      tryals,
      hand: [],
      table: [],
      everWitch: tryals.some((c) => c.kind === "witch"),
      abilityUses: {},
    };
  });
  const dawnBlackCat = cards.find((c) => c.kind === "black_cat")!;
  const night = cards.find((c) => c.kind === "night")!;
  let deck = shuffle(
    cards.filter((c) => c !== dawnBlackCat && c !== night),
    random,
  );
  // P4: a dealt Conspiracy is shuffled back and replaced. Draw sequentially;
  // a replacement can again be Conspiracy. No event resolves during setup.
  let retries = 0;
  for (const p of players)
    while (p.hand.length < 3) {
      const c = deck.shift() ?? fail("SETUP_DECK_EXHAUSTED");
      if (c.kind === "conspiracy") {
        if (++retries > 10000) fail("SETUP_RANDOM_STALLED");
        deck = shuffle([...deck, c], random);
      } else p.hand.push(c);
    }
  const split = Math.floor(deck.length / 2);
  deck = [
    ...deck.slice(0, split),
    ...shuffle([...deck.slice(split), night], random),
  ];
  return {
    schemaVersion: 1,
    game: "witch-town",
    rulesProfile: "salem1692-standard-15th-printing-4to12",
    countsProfile,
    evidenceWarnings: [
      "CHECK_REQUIRED:X11:CANDIDATE_TYPE_COUNTS",
      "ONLINE_ADAPTATION:ODD_SPLIT_FLOOR_TOP",
    ],
    phase: "dawn",
    players,
    deck,
    discard: [],
    dawnBlackCat,
    blackCatOwnerId: null,
    turnPlayerId: null,
    unusedCharacters: characters.slice(players.length),
    frameCharacters: players.map((p) => p.character),
    gavelTargetId: null,
    timerDeadline: null,
    pending: { kind: "dawn-black-cat" },
    day: { played: 0 },
    tasks: [],
    dawnVotes: {},
    log: [],
    outcome: null,
    checkRequired: null,
  };
}
/** Additive M1 save migration; no dealing or random regeneration on reconnect. */
export function upgradeWitchTown(state: WTState): WTState {
  return {
    ...state,
    day: state.day ?? { played: 0 },
    tasks: state.tasks ?? [],
    dawnVotes: state.dawnVotes ?? {},
    log: state.log ?? [],
    outcome: state.outcome ?? null,
    checkRequired: state.checkRequired ?? null,
  };
}
/** Explicit allow-list projection. Public hidden cards expose counts only. */
export function viewForWitchTown(state: WTState, playerId: string | null) {
  state = upgradeWitchTown(state);
  const me = state.players.find((p) => p.id === playerId);
  return structuredClone({
    game: state.game,
    rulesProfile: state.rulesProfile,
    countsProfile: state.countsProfile,
    evidenceWarnings: state.evidenceWarnings,
    notices: ["部分张数待官方核实"],
    ruleDecisions: RULE_DECISIONS,
    phase: state.phase,
    turnPlayerId: state.turnPlayerId,
    blackCatOwnerId: state.blackCatOwnerId,
    gavelTargetId: state.gavelTargetId,
    checkRequired: state.checkRequired ?? null,
    deckCount: state.deck.length,
    discard: state.discard,
    pending: publicPending(state),
    day: state.day,
    log: state.log,
    outcome: state.outcome,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      alive: p.alive,
      hiddenTryalCount: p.tryals.filter((c) => !c.revealed).length,
      revealedTryals: p.tryals.filter((c) => c.revealed).map((c) => c.kind),
      handCount: p.hand.length,
      table: p.table,
      accusations: accusationValue(state, p.id),
    })),
    private: me
      ? {
          playerId: me.id,
          tryals: me.tryals,
          hand: me.hand,
          everWitch: me.everWitch,
          abilityUses: me.abilityUses,
          choice: privateChoice(state, me.id),
          lootChoices: privateLootChoices(state, me.id),
          ...(state.phase === "dawn" && me.everWitch
            ? {
                witchAllies: state.players
                  .filter((p) => p.alive && p.everWitch)
                  .map((p) => p.id),
                dawnVotes: state.dawnVotes,
              }
            : {}),
        }
      : null,
  });
}
export type WTView = ReturnType<typeof viewForWitchTown>;
