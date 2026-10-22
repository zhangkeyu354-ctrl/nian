import { CARDS, type CardKind, type CharacterId } from "./data.ts";
import {
  WTRuleError,
  upgradeWitchTown,
  type WTState,
  type WTPlayer,
  type PlayingCard,
} from "./index.ts";

export type WTCommand =
  | { type: "DAWN_TARGET"; targetId: string }
  | { type: "DRAW" }
  | { type: "END_TURN" }
  | {
      type: "PLAY";
      cardId: string;
      targetId: string;
      recipientId?: string;
      blueId?: string;
      removeIds?: string[];
      asWitness?: boolean;
    }
  | { type: "REVEAL_TRYAL"; index: number }
  | { type: "ABILITY_DECISION"; use: boolean };
export type Ability = "ann" | "abigail" | "rebecca" | "giles";
export type WTTask =
  | {
      kind: "draw";
      playerId: string;
      remaining: number;
      reason: "turn" | Ability;
      drawn: CardKind[];
    }
  | { kind: "finish-turn"; playerId: string }
  | { kind: "trial"; actorId: string; targetId: string }
  | { kind: "ability"; playerId: string; ability: Ability };
export type WTPending =
  | null
  | { kind: "dawn-black-cat" }
  | Extract<WTTask, { kind: "trial" | "ability" }>
  | { kind: "black-event"; card: PlayingCard; drawerId: string };
export interface WTLog {
  seq: number;
  type: string;
  actorId?: string;
  targetId?: string;
  cardKind?: CardKind;
  tryalKind?: string;
  count?: number;
}
export interface WTOutcome {
  team: "townspeople" | "witches";
  reason: "all-witch-tryals-revealed" | "no-living-townspeople";
  winners: string[];
  losers: string[];
}
function fail(code: string): never {
  throw new WTRuleError(code);
}
function player(s: WTState, id: string) {
  return s.players.find((p) => p.id === id) ?? fail("BAD_PLAYER");
}
const alive = (s: WTState, id: string) => {
  const p = player(s, id);
  if (!p.alive) fail("PLAYER_DEAD");
  return p;
};
export function effectiveCharacter(s: WTState, id: string): CharacterId {
  const p = player(s, id);
  if (p.character !== "martha_corey") return p.character;
  const i = s.players.indexOf(p);
  for (let step = 1; step < s.players.length; step++) {
    const next = s.players[(i - step + s.players.length) % s.players.length];
    if (next.alive) return next.character;
  }
  return "martha_corey";
}
function color(c: PlayingCard) {
  return c.asWitness ? "red" : CARDS.find((d) => d.key === c.kind)!.color;
}
function value(s: WTState, targetId: string, c: PlayingCard) {
  if (c.asWitness || c.kind === "witness") return 7;
  if (c.kind === "accusation") return 1;
  if (c.kind === "evidence")
    return effectiveCharacter(s, targetId) === "cotton_mather" ? 1 : 3;
  return 0;
}
export function accusationValue(s: WTState, id: string) {
  return player(s, id).table.reduce((n, c) => n + value(s, id, c), 0);
}
export function trialThreshold(s: WTState, actorId: string, targetId: string) {
  const judge = effectiveCharacter(s, actorId) === "thomas_danforth",
    strong = effectiveCharacter(s, targetId) === "george_burroughs";
  return (
    (7 + (strong ? 1 : 0) - (judge ? 1 : 0)) *
    (player(s, targetId).table.some((c) => c.kind === "piety") ? 2 : 1)
  );
}
function log(s: WTState, item: Omit<WTLog, "seq">) {
  s.log.push({ seq: s.log.length + 1, ...item });
}
function discard(s: WTState, cards: PlayingCard[]) {
  for (const c of cards) {
    delete c.asWitness;
    s.discard.push(c);
  }
}
function clearRed(s: WTState, p: WTPlayer) {
  const reds = p.table.filter((c) => color(c) === "red");
  p.table = p.table.filter((c) => color(c) !== "red");
  discard(s, reds);
}
function refreshCat(s: WTState) {
  s.blackCatOwnerId =
    s.players.find(
      (p) => p.alive && p.table.some((c) => c.kind === "black_cat"),
    )?.id ?? null;
}
function advance(s: WTState, from: string) {
  const i = s.players.findIndex((p) => p.id === from);
  s.day = { played: 0 };
  for (let step = 1; step <= 100; step++) {
    const p = s.players[(i + step) % s.players.length];
    if (!p.alive) continue;
    const stocks = p.table.findIndex((c) => c.kind === "stocks");
    if (stocks >= 0) {
      discard(s, p.table.splice(stocks, 1));
      log(s, { type: "TURN_SKIPPED", targetId: p.id });
      continue;
    }
    s.turnPlayerId = p.id;
    return;
  }
  fail("NO_PLAYABLE_TURN");
}
function victory(s: WTState) {
  const witchTryals = s.players
    .flatMap((p) => p.tryals)
    .filter((t) => t.kind === "witch");
  const townWin =
      witchTryals.length > 0 && witchTryals.every((t) => t.revealed),
    witchWin = !s.players.some((p) => p.alive && !p.everWitch);
  if (!townWin && !witchWin) return;
  const team = townWin ? "townspeople" : "witches";
  s.outcome = {
    team,
    reason: townWin ? "all-witch-tryals-revealed" : "no-living-townspeople",
    winners: s.players
      .filter((p) => p.everWitch === (team === "witches"))
      .map((p) => p.id),
    losers: s.players
      .filter((p) => p.everWitch !== (team === "witches"))
      .map((p) => p.id),
  };
  s.phase = "over";
  s.pending = null;
  s.tasks = [];
  s.turnPlayerId = null;
  log(s, { type: "GAME_OVER" });
}
function fatalReveal(p: WTPlayer, index: number) {
  const hidden = p.tryals.filter((t) => !t.revealed),
    selected = hidden[index];
  if (!selected) fail("BAD_TRYAL_INDEX");
  return (
    hidden.length === 1 ||
    (selected.kind === "witch" &&
      !hidden.some((t) => t !== selected && t.kind === "witch"))
  );
}
function checkDeathBoundary(s: WTState, dyingIds: string[]) {
  for (const p of s.players.filter(
    (p) => p.alive && !dyingIds.includes(p.id),
  )) {
    if (effectiveCharacter(s, p.id) === "john_proctor")
      fail("CHECK_REQUIRED:X09:FARMER_LOOT");
    if (
      p.character === "martha_corey" &&
      effectiveCharacter(s, p.id) === "cotton_mather"
    ) {
      const later = structuredClone(s);
      for (const id of dyingIds) player(later, id).alive = false;
      if (
        effectiveCharacter(later, p.id) !== "cotton_mather" &&
        accusationValue(later, p.id) >= 6
      )
        fail("CHECK_REQUIRED:X03:COPY_RESCORING");
    }
  }
}
function eliminate(s: WTState, root: WTPlayer) {
  let partner = root.table.some((c) => c.kind === "matchmaker")
    ? s.players.find(
        (p) =>
          p.alive &&
          p.id !== root.id &&
          p.table.some((c) => c.kind === "matchmaker"),
      )
    : undefined;
  if (partner && effectiveCharacter(s, partner.id) === "mary_warren")
    partner = undefined;
  // P13: if a pair would eliminate both teams, only the original target dies.
  if (
    partner &&
    !s.players.some((p) => p.alive && p.id !== root.id && p.id !== partner!.id)
  )
    partner = undefined;
  const dying = [root, ...(partner ? [partner] : [])];
  checkDeathBoundary(
    s,
    dying.map((p) => p.id),
  );
  for (const p of dying) {
    p.alive = false;
    for (const t of p.tryals) t.revealed = true;
    discard(s, p.hand.splice(0));
    const blues = p.table.filter((c) => color(c) === "blue");
    p.table = p.table.filter((c) => color(c) !== "blue");
    discard(s, blues);
    log(s, { type: "ELIMINATED", targetId: p.id });
  }
  s.frameCharacters = s.players.filter((p) => p.alive).map((p) => p.character);
  refreshCat(s);
}
function beginTrial(
  s: WTState,
  actorId: string,
  targetId: string,
  finalAccusation = true,
) {
  const actor = effectiveCharacter(s, actorId);
  if (finalAccusation && actor === "ann_putnam")
    s.tasks.push({ kind: "ability", playerId: actorId, ability: "ann" });
  if (finalAccusation && actor === "abigail_williams")
    s.tasks.push({ kind: "ability", playerId: actorId, ability: "abigail" });
  s.tasks.push({ kind: "trial", actorId, targetId });
}
function drain(s: WTState) {
  while (s.tasks.length && s.phase !== "over") {
    const t = s.tasks.shift()!;
    if (t.kind === "trial") {
      if (!player(s, t.targetId).alive)
        fail("CHECK_REQUIRED:X02:TRIAL_TARGET_ELIMINATED");
      s.phase = "trial";
      s.pending = t;
      return;
    }
    if (t.kind === "ability") {
      if (!player(s, t.playerId).alive) continue;
      s.phase = "choice";
      s.pending = t;
      return;
    }
    if (t.kind === "finish-turn") {
      advance(s, t.playerId);
      continue;
    }
    if (!player(s, t.playerId).alive) continue;
    while (t.remaining > 0) {
      const card = s.deck.shift() ?? fail("CHECK_REQUIRED:X08:EMPTY_DRAW_DECK");
      t.remaining--;
      t.drawn.push(card.kind);
      log(s, { type: "DRAW", actorId: t.playerId, count: 1 });
      if (color(card) === "black") {
        if (t.remaining > 0) s.tasks.unshift(t);
        s.phase = "black-event";
        s.pending = { kind: "black-event", card, drawerId: t.playerId };
        log(s, {
          type: "BLACK_EVENT",
          actorId: t.playerId,
          cardKind: card.kind,
        });
        return;
      }
      player(s, t.playerId).hand.push(card);
    }
    if (
      t.reason === "turn" &&
      t.drawn.length === 2 &&
      t.drawn.every((k) => k === "accusation") &&
      effectiveCharacter(s, t.playerId) === "giles_corey"
    )
      s.tasks.unshift({
        kind: "ability",
        playerId: t.playerId,
        ability: "giles",
      });
  }
  if (s.phase !== "over") {
    s.phase = "day";
    s.pending = null;
    if (s.turnPlayerId && !player(s, s.turnPlayerId).alive)
      advance(s, s.turnPlayerId);
  }
}
function other(s: WTState, actorId: string, id: string) {
  const p = alive(s, id);
  if (actorId === id) fail("NO_SELF_TARGET");
  return p;
}
function playCard(
  s: WTState,
  actorId: string,
  cmd: Extract<WTCommand, { type: "PLAY" }>,
) {
  const actor = alive(s, actorId),
    target = other(s, actorId, cmd.targetId),
    i = actor.hand.findIndex((c) => c.id === cmd.cardId);
  if (i < 0) fail("CARD_NOT_HELD");
  const card = actor.hand[i];
  if (color(card) === "black") fail("BLACK_CARD_NOT_PLAYABLE");
  if (
    cmd.asWitness &&
    (card.kind !== "alibi" || effectiveCharacter(s, actorId) !== "will_griggs")
  )
    fail("BAD_AS_WITNESS");
  if (card.kind === "robbery" || card.kind === "scapegoat") {
    if (s.players.filter((p) => p.alive).length < 3)
      fail("NEED_THREE_LIVING_PLAYERS");
    const recipient = other(s, actorId, cmd.recipientId ?? "");
    if (recipient.id === target.id) fail("DISTINCT_TARGETS_REQUIRED");
  }
  actor.hand.splice(i, 1);
  s.day.played++;
  log(s, { type: "PLAY", actorId, targetId: target.id, cardKind: card.kind });
  if (color(card) === "red" || cmd.asWitness) {
    if (cmd.asWitness) card.asWitness = true;
    target.table.push(card);
    if (accusationValue(s, target.id) >= trialThreshold(s, actorId, target.id))
      beginTrial(s, actorId, target.id);
  } else
    switch (card.kind) {
      case "alibi": {
        const ids = cmd.removeIds ?? [];
        if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
          fail("BAD_ALIBI_SELECTION");
        const selected = ids.map(
          (id) =>
            target.table.find((c) => c.id === id) ??
            fail("BAD_ALIBI_SELECTION"),
        );
        if (selected.some((c) => color(c) !== "red"))
          fail("BAD_ALIBI_SELECTION");
        if (
          selected.some((c) => c.kind === "evidence") &&
          effectiveCharacter(s, target.id) === "cotton_mather"
        )
          fail("CHECK_REQUIRED:X01:ALIBI_COTTON");
        if (selected.reduce((n, c) => n + value(s, target.id, c), 0) > 3)
          fail("ALIBI_LIMIT");
        target.table = target.table.filter((c) => !ids.includes(c.id));
        discard(s, selected);
        discard(s, [card]);
        break;
      }
      case "curse": {
        const index = target.table.findIndex(
          (c) => c.id === cmd.blueId && color(c) === "blue",
        );
        if (index < 0) fail("SELECT_ONE_BLUE_CARD");
        const removed = target.table.splice(index, 1)[0];
        discard(s, [removed, card]);
        if (removed.kind === "piety") {
          const points = accusationValue(s, target.id),
            threshold = trialThreshold(s, actorId, target.id);
          if (threshold !== 7 && points >= Math.min(7, threshold))
            fail("CHECK_REQUIRED:X07:PIETY_SPECIAL_THRESHOLD");
          if (points >= 7) beginTrial(s, actorId, target.id, false);
        }
        break;
      }
      case "robbery": {
        const recipient = player(s, cmd.recipientId!);
        if (effectiveCharacter(s, target.id) !== "sarah_good")
          recipient.hand.push(...target.hand.splice(0));
        discard(s, [card]);
        break;
      }
      case "arson":
        if (effectiveCharacter(s, target.id) !== "sarah_good")
          discard(s, target.hand.splice(0));
        discard(s, [card]);
        break;
      case "scapegoat": {
        const recipient = player(s, cmd.recipientId!);
        if (
          target.table.some((c) => c.kind === "matchmaker") &&
          recipient.table.some((c) => c.kind === "matchmaker")
        )
          fail("CHECK_REQUIRED:X06:MOVED_SECOND_MATCHMAKER");
        if (
          [target, recipient].some(
            (p) => effectiveCharacter(s, p.id) === "mary_warren",
          ) &&
          target.table.some(
            (c) => c.kind === "matchmaker" || c.kind === "black_cat",
          )
        )
          fail("CHECK_REQUIRED:X06:MARY_MOVED_BLUE");
        recipient.table.push(...target.table.splice(0));
        discard(s, [card]);
        if (
          accusationValue(s, recipient.id) >=
          trialThreshold(s, actorId, recipient.id)
        )
          beginTrial(s, actorId, recipient.id, false);
        break;
      }
      case "black_cat":
      case "matchmaker":
        if (
          card.kind === "matchmaker" &&
          target.table.some((c) => c.kind === "matchmaker")
        )
          fail("ALREADY_MATCHED");
        if (effectiveCharacter(s, target.id) === "mary_warren")
          fail("CHECK_REQUIRED:X06:MARY_BLUE_PLACEMENT");
        target.table.push(card);
        break;
      case "stocks":
      case "asylum":
      case "piety":
        target.table.push(card);
        break;
      default:
        fail("CARD_EFFECT_NOT_IMPLEMENTED");
    }
  refreshCat(s);
  drain(s);
}

/** Transactional pure reducer: any invalid or CHECK_REQUIRED command leaves input intact. */
export function reduceWitchTown(
  input: WTState,
  actorId: string,
  cmd: WTCommand,
): WTState {
  const s = structuredClone(upgradeWitchTown(input));
  alive(s, actorId);
  if (!cmd || typeof cmd !== "object" || typeof cmd.type !== "string")
    fail("BAD_GAME_COMMAND");
  if (s.phase === "over") fail("GAME_OVER");
  if (s.phase === "black-event") fail("BLACK_EVENT_PENDING:M3_REQUIRED");
  if (cmd.type === "DAWN_TARGET") {
    if (s.phase !== "dawn") fail("WRONG_PHASE");
    if (!player(s, actorId).everWitch) fail("WITCH_ONLY");
    alive(s, cmd.targetId);
    if (effectiveCharacter(s, cmd.targetId) === "mary_warren")
      fail("CHECK_REQUIRED:X06:MARY_DAWN_CAT");
    s.dawnVotes[actorId] = cmd.targetId;
    const witches = s.players.filter((p) => p.alive && p.everWitch);
    if (witches.every((p) => s.dawnVotes[p.id] === cmd.targetId)) {
      if (!s.dawnBlackCat) fail("NO_DAWN_CAT");
      player(s, cmd.targetId).table.push(s.dawnBlackCat);
      s.dawnBlackCat = null;
      s.dawnVotes = {};
      s.pending = null;
      s.phase = "day";
      s.blackCatOwnerId = cmd.targetId;
      s.turnPlayerId = cmd.targetId;
      log(s, { type: "DAWN_COMPLETE", targetId: cmd.targetId });
    }
    return s;
  }
  if (cmd.type === "ABILITY_DECISION") {
    const p = s.pending;
    if (p?.kind !== "ability") fail("NO_ABILITY_CHOICE");
    if (p.playerId !== actorId) fail("NOT_YOUR_CHOICE");
    if (typeof cmd.use !== "boolean") fail("BAD_GAME_COMMAND");
    s.pending = null;
    if (cmd.use) {
      if (p.ability === "abigail") clearRed(s, player(s, actorId));
      else
        s.tasks.unshift({
          kind: "draw",
          playerId: actorId,
          remaining: p.ability === "ann" ? 2 : 1,
          reason: p.ability,
          drawn: [],
        });
      if (p.ability === "giles")
        log(s, { type: "GILES_SHOWS_TWO_ACCUSATIONS", actorId });
    }
    drain(s);
    return s;
  }
  if (cmd.type === "REVEAL_TRYAL") {
    const p = s.pending;
    if (p?.kind !== "trial") fail("NO_TRIAL");
    if (p.actorId !== actorId) fail("NOT_YOUR_CHOICE");
    if (!Number.isInteger(cmd.index) || cmd.index < 0) fail("BAD_TRYAL_INDEX");
    const target = alive(s, p.targetId),
      hidden = target.tryals.filter((c) => !c.revealed),
      t = hidden[cmd.index];
    if (!t) fail("BAD_TRYAL_INDEX");
    const fatal = fatalReveal(target, cmd.index),
      rebeccas = s.players.filter(
        (q) =>
          q.alive &&
          q.id !== target.id &&
          effectiveCharacter(s, q.id) === "rebecca_nurse",
      );
    if (fatal && rebeccas.length)
      fail("CHECK_REQUIRED:X02:FATAL_REBECCA_REWARD");
    t.revealed = true;
    clearRed(s, target);
    s.pending = null;
    log(s, {
      type: "TRYAL_REVEALED",
      actorId,
      targetId: target.id,
      tryalKind: t.kind,
    });
    if (fatal) eliminate(s, target);
    victory(s);
    if (!s.outcome) {
      s.tasks.unshift(
        ...rebeccas.map((q) => ({
          kind: "ability" as const,
          playerId: q.id,
          ability: "rebecca" as const,
        })),
      );
      drain(s);
    }
    return s;
  }
  if (s.phase !== "day" || s.pending) fail("WRONG_PHASE");
  if (s.turnPlayerId !== actorId) fail("NOT_YOUR_TURN");
  if (cmd.type === "PLAY") playCard(s, actorId, cmd);
  else if (cmd.type === "DRAW") {
    if (s.day.played) fail("DRAW_AFTER_PLAY");
    s.tasks.push(
      {
        kind: "draw",
        playerId: actorId,
        remaining: 2,
        reason: "turn",
        drawn: [],
      },
      { kind: "finish-turn", playerId: actorId },
    );
    drain(s);
  } else if (cmd.type === "END_TURN") {
    if (!s.day.played) fail("MUST_DRAW_OR_PLAY");
    advance(s, actorId);
  } else fail("M2_ACTION_NOT_IMPLEMENTED");
  return s;
}
export function publicPending(s: WTState) {
  const p = s.pending;
  if (!p) return null;
  if (p.kind === "dawn-black-cat") return { kind: p.kind };
  if (p.kind === "black-event")
    return { kind: p.kind, cardKind: p.card.kind, drawerId: p.drawerId };
  if (p.kind === "trial")
    return { kind: p.kind, actorId: p.actorId, targetId: p.targetId };
  return { kind: p.kind, playerId: p.playerId, ability: p.ability };
}
export function privateChoice(s: WTState, id: string) {
  const p = s.pending;
  if (p?.kind === "trial" && p.actorId === id)
    return {
      kind: "trial" as const,
      targetId: p.targetId,
      concealedCount: player(s, p.targetId).tryals.filter((c) => !c.revealed)
        .length,
    };
  if (p?.kind === "ability" && p.playerId === id)
    return { kind: "ability" as const, ability: p.ability };
  return null;
}
