import { CARDS, type CardKind, type CharacterId } from "./data.ts";
import {
  WTRuleError,
  upgradeWitchTown,
  type WTState,
  type WTPlayer,
  type PlayingCard,
  type Random,
} from "./index.ts";

import {
  beginBlackEvent,
  commandBlackEvent,
  eventPublic,
  eventPrivate,
  type WTEvent,
  type WTEventCommand,
} from "./events.ts";

export type WTCommand =
  | { type: "DAWN_TARGET"; targetId: string }
  | { type: "DRAW" }
  | { type: "PARRIS_DRAW"; cardIds: string[] }
  | { type: "TITUBA_START" }
  | { type: "TITUBA_REORDER"; cardIds: string[] }
  | { type: "TITUBA_FINISH" }
  | { type: "END_TURN" }
  | { type: "START_HOURGLASS" }
  | { type: "LOOT_PICK"; cardId: string }
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
  | { type: "ABILITY_DECISION"; use: boolean }
  | WTEventCommand;
export type Ability = "ann" | "abigail" | "rebecca" | "giles";
export interface WTLoot {
  kind: "loot";
  pool: PlayingCard[];
  recipients: string[];
  taken: number[];
  playerId: string;
  remainderId: string;
}
export type WTTask =
  | WTLoot
  | {
      kind: "draw";
      playerId: string;
      remaining: number;
      reason: "turn" | Ability;
      drawn: CardKind[];
    }
  | { kind: "finish-turn"; playerId: string }
  | { kind: "trial"; actorId: string; targetId: string }
  | { kind: "ability"; playerId: string; ability: Ability }
  | {
      kind: "resume-event";
      pending: Extract<WTPending, { kind: "black-event" }>;
    };
export type WTPending =
  | null
  | { kind: "dawn-black-cat" }
  | { kind: "tituba"; playerId: string; deadline: number }
  | WTLoot
  | Extract<WTTask, { kind: "trial" | "ability" }>
  | {
      kind: "black-event";
      card: PlayingCard;
      drawerId: string;
      event?: WTEvent;
    };
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
  reason:
    | "all-witch-tryals-revealed"
    | "no-living-townspeople"
    | "last-townsperson-infected";
  winners: string[];
  losers: string[];
}
export function fail(code: string): never {
  throw new WTRuleError(code);
}
export function player(s: WTState, id: string) {
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
export function log(s: WTState, item: Omit<WTLog, "seq">) {
  s.log.push({ seq: s.log.length + 1, ...item });
}
export function discard(s: WTState, cards: PlayingCard[]) {
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
export function victory(s: WTState, personalLoser?: string | string[]) {
  const personalLosers = Array.isArray(personalLoser)
    ? personalLoser
    : personalLoser
      ? [personalLoser]
      : [];
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
    reason: townWin
      ? "all-witch-tryals-revealed"
      : personalLosers.length
        ? "last-townsperson-infected"
        : "no-living-townspeople",
    winners: s.players
      .filter(
        (p) =>
          p.everWitch === (team === "witches") &&
          !personalLosers.includes(p.id),
      )
      .map((p) => p.id),
    losers: s.players
      .filter(
        (p) =>
          p.everWitch !== (team === "witches") || personalLosers.includes(p.id),
      )
      .map((p) => p.id),
  };
  s.phase = "over";
  s.timerDeadline = null;
  if (s.pending?.kind === "black-event") discard(s, [s.pending.card]);
  if (s.pending?.kind === "loot") settleLoot(s, s.pending);
  for (const t of s.tasks)
    if (t.kind === "resume-event") discard(s, [t.pending.card]);
    else if (t.kind === "loot") settleLoot(s, t);
  s.pending = null;
  s.tasks = [];
  s.turnPlayerId = null;
  log(s, { type: "GAME_OVER" });
}
export function fatalReveal(p: WTPlayer, index: number) {
  const hidden = p.tryals.filter((t) => !t.revealed),
    selected = hidden[index];
  if (!selected) fail("BAD_TRYAL_INDEX");
  return (
    hidden.length === 1 ||
    (selected.kind === "witch" &&
      !hidden.some((t) => t !== selected && t.kind === "witch"))
  );
}
function settleLoot(s: WTState, loot: WTLoot) {
  // DEFAULT_PENDING_CONFIRM P12: after three each, leftovers belong to John.
  // At terminal state no further private choices are required; complete alternation.
  while (
    loot.pool.length &&
    loot.recipients.some((id, i) => player(s, id).alive && loot.taken[i] < 3)
  ) {
    const i = loot.recipients.indexOf(loot.playerId);
    if (player(s, loot.playerId).alive && loot.taken[i] < 3) {
      player(s, loot.playerId).hand.push(loot.pool.shift()!);
      loot.taken[i]++;
    }
    loot.playerId = loot.recipients[(i + 1) % loot.recipients.length];
  }
  const recipient = s.players.find((p) => p.id === loot.remainderId && p.alive);
  if (recipient) recipient.hand.push(...loot.pool.splice(0));
  else discard(s, loot.pool.splice(0));
}
export function eliminate(s: WTState, root: WTPlayer) {
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
    !s.players.some(
      (p) =>
        p.alive && !p.everWitch && p.id !== root.id && p.id !== partner!.id,
    ) &&
    s.players.every((p) =>
      p.tryals
        .filter((t) => t.kind === "witch")
        .every((t) => t.revealed || p.id === root.id || p.id === partner!.id),
    )
  )
    partner = undefined;
  const dying = [root, ...(partner ? [partner] : [])];
  // DEFAULT_PENDING_CONFIRM P5/P12: finish prior shared pools before a recipient's
  // later death, so inherited cards participate in that subsequent death's loot.
  const completed = new Set<WTTask>();
  for (const task of s.tasks) {
    if (
      task.kind === "loot" &&
      task.recipients.some((id) => dying.some((p) => p.id === id))
    ) {
      log(s, {
        type: "LOOT_AUTO_SETTLED_BEFORE_DEATH",
        count: task.pool.length,
      });
      settleLoot(s, task);
      completed.add(task);
    }
  }
  s.tasks = s.tasks.filter((t) => !completed.has(t));
  const formerCottons = s.players
    .filter(
      (p) =>
        p.alive &&
        p.character === "martha_corey" &&
        effectiveCharacter(s, p.id) === "cotton_mather",
    )
    .map((p) => p.id);
  const farmers = s.players.filter(
    (p) =>
      p.alive &&
      !dying.some((q) => q.id === p.id) &&
      effectiveCharacter(s, p.id) === "john_proctor",
  );
  farmers.sort(
    (a, b) =>
      Number(b.character === "john_proctor") -
      Number(a.character === "john_proctor"),
  );
  const lootTasks: WTTask[] = [];
  for (const p of dying) {
    p.alive = false;
    for (const t of p.tryals) t.revealed = true;
    const hand = p.hand.splice(0);
    const blues = p.table.filter((c) => color(c) === "blue");
    p.table = p.table.filter((c) => color(c) !== "blue");
    if (farmers.length > 1 && hand.length + blues.length) {
      lootTasks.push({
        kind: "loot",
        pool: [...hand, ...blues],
        recipients: farmers.map((p) => p.id),
        taken: farmers.map(() => 0),
        playerId: farmers[0].id,
        remainderId: farmers[0].id,
      });
      log(s, { type: "SHARED_FARMER_LOOT", targetId: p.id });
    } else if (farmers[0]) farmers[0].hand.push(...hand, ...blues);
    else discard(s, [...hand, ...blues]);
    log(s, { type: "ELIMINATED", targetId: p.id });
  }
  s.frameCharacters = s.players.filter((p) => p.alive).map((p) => p.character);
  refreshCat(s);
  for (const id of formerCottons) {
    const q = player(s, id);
    const passiveThreshold =
      (effectiveCharacter(s, id) === "george_burroughs" ? 8 : 7) *
      (q.table.some((c) => c.kind === "piety") ? 2 : 1);
    if (
      q.alive &&
      effectiveCharacter(s, id) !== "cotton_mather" &&
      accusationValue(s, id) >= passiveThreshold
    ) {
      // DEFAULT_PENDING_CONFIRM P13: no public accuser exists; target chooses own card.
      // This avoids exposing a secret night attacker through the choice owner.
      lootTasks.push({ kind: "trial", actorId: id, targetId: id });
      log(s, { type: "COPY_RESCORING_TRIAL", targetId: id });
    }
  }
  const priorLootPrefix = s.tasks.findIndex((t) => t.kind !== "loot");
  s.tasks.splice(
    priorLootPrefix < 0 ? s.tasks.length : priorLootPrefix,
    0,
    ...lootTasks,
  );
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
export function drain(s: WTState, now = Date.now()) {
  while (s.tasks.length && s.phase !== "over") {
    const t = s.tasks.shift()!;
    if (t.kind === "loot") {
      const eligible = t.recipients.filter(
        (id, i) => player(s, id).alive && t.taken[i] < 3,
      );
      if (!t.pool.length || !eligible.length) {
        settleLoot(s, t);
        continue;
      }
      if (!eligible.includes(t.playerId)) t.playerId = eligible[0];
      s.phase = "choice";
      s.pending = t;
      return;
    }
    if (t.kind === "resume-event") {
      s.phase = "black-event";
      s.pending = t.pending;
      beginBlackEvent(s, now);
      return;
    }
    if (t.kind === "trial") {
      // DEFAULT_PENDING_CONFIRM P5/P12: skip an already dead target; otherwise
      // a dead chooser is replaced by the first living clockwise neighbour.
      if (!player(s, t.targetId).alive) continue;
      if (!player(s, t.actorId).alive) {
        const i = s.players.findIndex((p) => p.id === t.actorId);
        t.actorId = Array.from(
          { length: s.players.length },
          (_, j) => s.players[(i + j + 1) % s.players.length],
        ).find((p) => p.alive)!.id;
        log(s, {
          type: "TRIAL_CHOOSER_REPLACED",
          actorId: t.actorId,
          targetId: t.targetId,
        });
      }
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
      const card = s.deck.shift();
      if (!card) {
        // DEFAULT_PENDING_CONFIRM P12: draw available cards only; never invent cards.
        log(s, {
          type: "DRAW_DECK_EXHAUSTED",
          actorId: t.playerId,
          count: t.remaining,
        });
        break;
      }
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
        beginBlackEvent(s, now);
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
  now?: number,
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
        // DEFAULT_PENDING_CONFIRM X01: count accusations at their current value.
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
          const points = accusationValue(s, target.id);
          // P13 Piety is an explicit immediate >=7 trigger, independent of P14 attack thresholds.
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
          fail("ALREADY_MATCHED"); // P13: prohibited move is rejected atomically, not a game lock.
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
        // DEFAULT_PENDING_CONFIRM X06: immunity negates harm; persistent blue still attaches.
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
  drain(s, now);
}

/** Transactional pure reducer: any invalid or CHECK_REQUIRED command leaves input intact. */
export function finishTituba(s: WTState, now: number) {
  const p = s.pending;
  if (p?.kind !== "tituba") fail("NO_TITUBA_CHOICE");
  s.pending = null;
  s.phase = "day";
  s.timerDeadline = null;
  s.tasks.push(
    {
      kind: "draw",
      playerId: p.playerId,
      remaining: 2,
      reason: "turn",
      drawn: [],
    },
    { kind: "finish-turn", playerId: p.playerId },
  );
  log(s, { type: "TITUBA_COMPLETE", actorId: p.playerId });
  drain(s, now);
}
export function expireDay(s: WTState, now: number) {
  if (
    s.phase !== "day" ||
    s.pending ||
    !s.turnPlayerId ||
    s.day.deadline == null ||
    now < s.day.deadline
  )
    return false;
  const id = s.turnPlayerId;
  delete s.day.deadline;
  log(s, { type: "HOURGLASS_EXPIRED", actorId: id });
  if (s.day.played) advance(s, id);
  else {
    s.tasks.push(
      { kind: "draw", playerId: id, remaining: 2, reason: "turn", drawn: [] },
      { kind: "finish-turn", playerId: id },
    );
    drain(s, now);
  }
  return true;
}
export function reduceWitchTown(
  input: WTState,
  actorId: string,
  cmd: WTCommand,
  context: { now?: number; random?: Random } = {},
): WTState {
  const s = structuredClone(upgradeWitchTown(input));
  if (s.checkRequired) fail(s.checkRequired);
  alive(s, actorId);
  if (!cmd || typeof cmd !== "object" || typeof cmd.type !== "string")
    fail("BAD_GAME_COMMAND");
  if (s.phase === "over") fail("GAME_OVER");
  if (cmd.type === "LOOT_PICK") {
    const main = s.pending;
    const concurrent =
      main?.kind === "black-event" &&
      main.event?.type === "night" &&
      main.event.stage === "confession";
    const p =
      main?.kind === "loot"
        ? main
        : concurrent
          ? s.tasks.find((t) => t.kind === "loot")
          : undefined;
    if (p?.kind !== "loot") fail("NO_LOOT_CHOICE");
    if (p.playerId !== actorId) fail("NOT_YOUR_CHOICE");
    if (
      concurrent &&
      main.event?.type === "night" &&
      main.event.deadline != null &&
      (context.now ?? Date.now()) >= main.event.deadline
    )
      fail("NIGHT_SETTLEMENT_DUE");
    const i = p.pool.findIndex((c) => c.id === cmd.cardId);
    if (i < 0) fail("BAD_LOOT_CARD");
    player(s, actorId).hand.push(p.pool.splice(i, 1)[0]);
    const ri = p.recipients.indexOf(actorId);
    p.taken[ri]++;
    p.playerId = p.recipients[(ri + 1) % p.recipients.length];
    log(s, { type: "LOOT_PICK", actorId, count: 1 });
    if (concurrent) {
      if (!p.pool.length || p.taken.every((n) => n >= 3)) {
        settleLoot(s, p);
        s.tasks = s.tasks.filter((t) => t !== p);
      }
    } else {
      s.pending = null;
      s.tasks.unshift(p);
      drain(s, context.now);
    }
    return s;
  }
  if (s.pending?.kind === "tituba") {
    const p = s.pending,
      now = context.now ?? Date.now();
    if (p.playerId !== actorId) fail("NOT_YOUR_CHOICE");
    if (now >= p.deadline) fail("ABILITY_DEADLINE_PASSED");
    if (cmd.type === "TITUBA_REORDER") {
      if (
        !Array.isArray(cmd.cardIds) ||
        cmd.cardIds.length !== s.deck.length ||
        new Set(cmd.cardIds).size !== s.deck.length
      )
        fail("BAD_DECK_ORDER");
      const deck = new Map(s.deck.map((c) => [c.id, c]));
      s.deck = cmd.cardIds.map((id) => deck.get(id) ?? fail("BAD_DECK_ORDER"));
    } else if (cmd.type === "TITUBA_FINISH") finishTituba(s, now);
    else fail("TITUBA_PENDING");
    return s;
  }
  if (s.phase === "black-event") {
    beginBlackEvent(s, context.now ?? Date.now());
    return commandBlackEvent(
      s,
      actorId,
      cmd,
      context.now ?? Date.now(),
      context.random,
    );
  }
  if (cmd.type === "DAWN_TARGET") {
    if (s.phase !== "dawn") fail("WRONG_PHASE");
    if (!player(s, actorId).everWitch) fail("WITCH_ONLY");
    alive(s, cmd.targetId);
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
    drain(s, context.now);
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
    // DEFAULT_PENDING_CONFIRM X02: the causal trial reveal earns a reward;
    // subsequent death-display reveals do not, and terminal victory takes priority.
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
      drain(s, context.now);
    }
    return s;
  }
  if (s.phase !== "day" || s.pending) fail("WRONG_PHASE");
  if (cmd.type === "START_HOURGLASS") {
    // A P2/P9: 30 seconds; ONLINE_CONVENTION: any living player may flag delay.
    if (s.day.deadline != null) fail("HOURGLASS_ALREADY_RUNNING");
    s.day.deadline = (context.now ?? Date.now()) + 30000;
    log(s, { type: "HOURGLASS_STARTED", actorId });
    return s;
  }
  if (s.day.deadline != null && (context.now ?? Date.now()) >= s.day.deadline)
    fail("TURN_DEADLINE_PASSED");
  if (s.turnPlayerId !== actorId) fail("NOT_YOUR_TURN");
  if (cmd.type === "PLAY") playCard(s, actorId, cmd, context.now);
  else if (cmd.type === "TITUBA_START") {
    if (s.day.played) fail("DRAW_AFTER_PLAY");
    const actor = player(s, actorId);
    if (effectiveCharacter(s, actorId) !== "tituba") fail("NOT_TITUBA");
    // DEFAULT_PENDING_CONFIRM X10: personal per-ability budget, retained across neighbour changes.
    if (actor.abilityUses.tituba) fail("ABILITY_EXHAUSTED");
    actor.abilityUses.tituba = 1;
    const deadline = (context.now ?? Date.now()) + 60000;
    s.pending = { kind: "tituba", playerId: actorId, deadline };
    s.phase = "choice";
    s.timerDeadline = deadline;
    log(s, { type: "TITUBA_START", actorId });
  } else if (cmd.type === "PARRIS_DRAW") {
    if (s.day.played) fail("DRAW_AFTER_PLAY");
    const actor = player(s, actorId);
    if (effectiveCharacter(s, actorId) !== "samuel_parris") fail("NOT_PARRIS");
    if ((actor.abilityUses.samuel_parris ?? 0) >= 2) fail("ABILITY_EXHAUSTED");
    if (
      !Array.isArray(cmd.cardIds) ||
      cmd.cardIds.length > 2 ||
      cmd.cardIds.some((id) => typeof id !== "string") ||
      new Set(cmd.cardIds).size !== cmd.cardIds.length
    )
      fail("BAD_DISCARD_SELECTION");
    const selected = cmd.cardIds.map((id) => {
      const card = s.discard.find((c) => c.id === id);
      if (!card || color(card) === "black") fail("BAD_DISCARD_SELECTION");
      return card;
    });
    s.discard = s.discard.filter((c) => !cmd.cardIds.includes(c.id));
    actor.hand.push(...selected);
    actor.abilityUses.samuel_parris =
      (actor.abilityUses.samuel_parris ?? 0) + 1;
    log(s, { type: "PARRIS_DRAW", actorId, count: selected.length });
    advance(s, actorId);
  } else if (cmd.type === "DRAW") {
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
    drain(s, context.now);
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
  if (p.kind === "loot")
    return {
      kind: p.kind,
      playerId: p.playerId,
      recipients: p.recipients,
      remaining: p.pool.length,
    };
  if (p.kind === "tituba")
    return { kind: p.kind, playerId: p.playerId, deadline: p.deadline };
  if (p.kind === "black-event")
    return {
      kind: p.kind,
      cardKind: p.card.kind,
      drawerId: p.drawerId,
      ...eventPublic(s, p),
    };
  if (p.kind === "trial")
    return { kind: p.kind, actorId: p.actorId, targetId: p.targetId };
  return { kind: p.kind, playerId: p.playerId, ability: p.ability };
}
export function privateChoice(s: WTState, id: string) {
  const p = s.pending;
  if (p?.kind === "loot" && p.recipients.includes(id))
    return {
      kind: "loot" as const,
      playerId: p.playerId,
      pool: p.pool,
      taken: p.taken,
      recipients: p.recipients,
    };
  if (p?.kind === "tituba" && p.playerId === id)
    return { kind: "tituba" as const, deck: s.deck, deadline: p.deadline };
  if (p?.kind === "black-event") return eventPrivate(s, p, id);
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

export function privateLootChoices(s: WTState, id: string) {
  if (!player(s, id).alive) return [];
  const p = s.pending;
  const loot =
    p?.kind === "loot"
      ? p
      : p?.kind === "black-event" &&
          p.event?.type === "night" &&
          p.event.stage === "confession"
        ? s.tasks.find((t) => t.kind === "loot")
        : undefined;
  return loot?.kind === "loot" && loot.recipients.includes(id)
    ? [
        {
          playerId: loot.playerId,
          pool: loot.pool,
          taken: loot.taken,
          recipients: loot.recipients,
        },
      ]
    : [];
}
