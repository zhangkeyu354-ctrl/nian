import {
  shuffle,
  upgradeWitchTown,
  type WTState,
  type Random,
  type Tryal,
} from "./index.ts";
import {
  fail,
  player,
  log,
  discard,
  drain,
  effectiveCharacter,
  eliminate,
  fatalReveal,
  victory,
  finishTituba,
  expireDay,
  type WTPending,
  type WTCommand,
  type WTTask,
} from "./day.ts";
type Pending = Extract<WTPending, { kind: "black-event" }>;
export type WTEventCommand =
  | { type: "CONSPIRACY_REVEAL"; index: number }
  | { type: "CONSPIRACY_PICK"; index: number }
  | { type: "NIGHT_TARGET"; targetId: string }
  | { type: "NIGHT_PROTECT"; targetId: string | null }
  | { type: "CONFESS"; index?: number; useGovernor?: boolean };
export type WTEvent =
  | {
      type: "conspiracy";
      stage: "cat" | "prepare-picking" | "picking";
      members: string[];
      leftOf: Record<string, string>;
      picks: Record<string, string>;
    }
  | {
      type: "night";
      stage: "witches" | "constable" | "confession";
      votes: Record<string, string>;
      attackTargetId: string | null;
      protectedId: string | null;
      confessed: string[];
      deadline: number | null;
    };
function pending(s: WTState): Pending {
  if (s.pending?.kind !== "black-event") fail("NO_BLACK_EVENT");
  return s.pending;
}
function randomRequired(r?: Random) {
  return r ?? fail("RANDOM_REQUIRED");
}
function living(s: WTState, id: string) {
  const p = player(s, id);
  if (!p.alive) fail("PLAYER_DEAD");
  return p;
}
function constable(s: WTState) {
  return s.players.find(
    (p) =>
      p.alive && p.tryals.some((t) => t.kind === "constable" && !t.revealed),
  );
}
function conceal(p: ReturnType<typeof player>, index: unknown) {
  if (!Number.isInteger(index) || Number(index) < 0) fail("BAD_TRYAL_INDEX");
  return (
    p.tryals.filter((t) => !t.revealed)[Number(index)] ??
    fail("BAD_TRYAL_INDEX")
  );
}
function confessStage(
  s: WTState,
  e: Extract<WTEvent, { type: "night" }>,
  now: number,
) {
  e.stage = "confession";
  e.deadline = now + 30000;
  s.timerDeadline = e.deadline;
  s.gavelTargetId = e.protectedId;
}
export function beginBlackEvent(s: WTState, now: number) {
  const p = pending(s);
  if (!p.event) {
    if (p.card.kind === "conspiracy")
      p.event = {
        type: "conspiracy",
        stage:
          s.blackCatOwnerId &&
          effectiveCharacter(s, s.blackCatOwnerId) !== "mary_warren"
            ? "cat"
            : "prepare-picking",
        members: [],
        leftOf: {},
        picks: {},
      };
    else if (p.card.kind === "night") {
      p.event = {
        type: "night",
        stage: "witches",
        votes: {},
        attackTargetId: null,
        protectedId: null,
        confessed: [],
        deadline: null,
      };
      s.gavelTargetId = null;
      s.timerDeadline = null;
    } else fail("BAD_BLACK_EVENT");
  }
  const e = p.event;
  if (e.type === "conspiracy" && e.stage === "prepare-picking") {
    e.members = s.players.filter((q) => q.alive).map((q) => q.id);
    if (e.members.length < 2) {
      victory(s);
      return;
    }
    e.leftOf = Object.fromEntries(
      e.members.map((id, i) => [id, e.members[(i + 1) % e.members.length]]),
    );
    e.stage = "picking";
  }
}
function finishEvent(s: WTState, now: number) {
  const p = pending(s);
  discard(s, [p.card]);
  s.pending = null;
  drain(s, now);
}
function resumeAfterResolution(
  s: WTState,
  p: Pending,
  oldTasks: ReadonlySet<WTTask>,
  now: number,
) {
  const added = s.tasks.filter((t) => !oldTasks.has(t)),
    continued = s.tasks.filter((t) => oldTasks.has(t));
  if (added.length > 0) {
    s.tasks = [...added, { kind: "resume-event", pending: p }, ...continued];
    s.pending = null;
    drain(s, now);
  } else beginBlackEvent(s, now);
}
export function commandBlackEvent(
  s: WTState,
  actorId: string,
  cmd: WTCommand,
  now: number,
  random?: Random,
): WTState {
  const p = pending(s),
    e = p.event!;
  if (e.type === "conspiracy") {
    if (cmd.type === "CONSPIRACY_REVEAL") {
      if (e.stage !== "cat") fail("WRONG_EVENT_STAGE");
      if (p.drawerId !== actorId) fail("NOT_YOUR_CHOICE");
      const target = living(s, s.blackCatOwnerId!),
        card = conceal(target, cmd.index),
        fatal = fatalReveal(target, cmd.index);
      const oldTasks = new Set(s.tasks);
      const rewards = s.players.filter(
        (q) =>
          q.alive &&
          q.id !== target.id &&
          effectiveCharacter(s, q.id) === "rebecca_nurse",
      );
      card.revealed = true;
      log(s, {
        type: "TRYAL_REVEALED",
        actorId,
        targetId: target.id,
        tryalKind: card.kind,
      });
      // RULE_DERIVED P5/P6/P12: death and victory precede the live-ring snapshot.
      if (fatal) {
        log(s, { type: "CAT_FATAL", targetId: target.id });
        eliminate(s, target);
      }
      victory(s);
      if (s.outcome) return s;
      e.stage = "prepare-picking";
      if (rewards.length) {
        s.tasks.unshift(
          ...rewards.map((q) => ({
            kind: "ability" as const,
            playerId: q.id,
            ability: "rebecca" as const,
          })),
        );
      }
      resumeAfterResolution(s, p, oldTasks, now);
      return s;
    }
    if (cmd.type !== "CONSPIRACY_PICK")
      fail("BLACK_EVENT_PENDING:CONSPIRACY_ACTION_REQUIRED");
    if (e.stage !== "picking") fail("WRONG_EVENT_STAGE");
    if (!e.members.includes(actorId)) fail("NOT_TRANSMISSION_MEMBER");
    const source = living(s, e.leftOf[actorId]);
    e.picks[actorId] = conceal(source, cmd.index).id;
    if (!e.members.every((id) => e.picks[id])) return s;
    const incoming = new Map<string, Tryal>();
    for (const receiver of e.members) {
      const source = player(s, e.leftOf[receiver]);
      incoming.set(
        receiver,
        source.tryals.find((t) => t.id === e.picks[receiver] && !t.revealed) ??
          fail("TRANSMISSION_STATE_CHANGED"),
      );
    }
    const towns = e.members.filter((id) => !player(s, id).everWitch),
      newWitches = towns.filter((id) => incoming.get(id)!.kind === "witch");
    if (towns.length > 1 && newWitches.length === towns.length)
      log(s, {
        type: "SIMULTANEOUS_LAST_INFECTIONS",
        count: newWitches.length,
      });
    const originals = new Map(
      e.members.map((id) => [id, [...player(s, id).tryals]]),
    );
    const sent = new Set(incoming.values());
    for (const id of e.members) {
      const q = player(s, id),
        original = originals.get(id)!,
        hidden = original.filter((t) => !t.revealed && !sent.has(t));
      hidden.push(incoming.get(id)!);
      const mixed = shuffle(hidden, randomRequired(random));
      q.tryals = original.map((t) => (t.revealed ? t : mixed.shift()!));
      if (incoming.get(id)!.kind === "witch") q.everWitch = true;
    }
    log(s, { type: "CONSPIRACY_RESOLVED" });
    // DEFAULT_PENDING_CONFIRM P5/P14: apply every transfer first, then recheck exemptions.
    for (const q of s.players.filter(
      (q) =>
        q.alive &&
        q.tryals.some((t) => t.revealed && t.kind === "witch") &&
        !q.tryals.some((t) => !t.revealed && t.kind === "witch"),
    )) {
      if (q.alive) {
        log(s, { type: "WITCH_EXEMPTION_LOST", targetId: q.id });
        eliminate(s, q);
      }
    }
    victory(
      s,
      // DEFAULT_PENDING_CONFIRM P6: all simultaneous final infectees personally lose.
      towns.length > 0 && newWitches.length === towns.length
        ? newWitches
        : undefined,
    );
    if (s.outcome) return s;
    finishEvent(s, now);
    return s;
  }
  if (cmd.type === "NIGHT_TARGET") {
    if (e.stage !== "witches") fail("WRONG_EVENT_STAGE");
    if (!player(s, actorId).everWitch) fail("WITCH_ONLY");
    living(s, cmd.targetId);
    e.votes[actorId] = cmd.targetId;
    if (
      s.players
        .filter((q) => q.alive && q.everWitch)
        .every((q) => e.votes[q.id] === cmd.targetId)
    ) {
      e.attackTargetId = cmd.targetId;
      e.votes = {};
      if (constable(s)) e.stage = "constable";
      else confessStage(s, e, now);
    }
    return s;
  }
  if (cmd.type === "NIGHT_PROTECT") {
    if (e.stage !== "constable") fail("WRONG_EVENT_STAGE");
    if (constable(s)?.id !== actorId) fail("CONSTABLE_ONLY");
    if (cmd.targetId === null) fail("PROTECT_ANOTHER_PLAYER"); // P7/P11 standard mandatory action.
    living(s, cmd.targetId);
    if (cmd.targetId === actorId) fail("NO_SELF_TARGET");
    e.protectedId = cmd.targetId;
    confessStage(s, e, now);
    return s;
  }
  if (cmd.type === "CONFESS") {
    if (
      (cmd.useGovernor !== undefined && typeof cmd.useGovernor !== "boolean") ||
      (cmd.useGovernor && cmd.index !== undefined)
    )
      fail("BAD_GAME_COMMAND");
    if (e.stage !== "confession") fail("WRONG_EVENT_STAGE");
    if (e.deadline === null || now >= e.deadline) fail("CONFESSION_CLOSED");
    if (e.confessed.includes(actorId)) fail("ALREADY_CONFESSED");
    const q = living(s, actorId);
    if (cmd.useGovernor) {
      if (effectiveCharacter(s, actorId) !== "william_phips")
        fail("NOT_GOVERNOR");
      // DEFAULT_PENDING_CONFIRM X10: copied abilities use the copier's retained budget.
      if (q.abilityUses.william_phips) fail("ABILITY_EXHAUSTED");
      q.abilityUses.william_phips = 1;
    } else {
      const card = conceal(q, cmd.index),
        fatal = fatalReveal(q, Number(cmd.index));
      card.revealed = true;
      log(s, { type: "CONFESSION_REVEAL", actorId, tryalKind: card.kind });
      if (fatal) eliminate(s, q);
    }
    e.confessed.push(actorId);
    log(s, { type: "CONFESSED", actorId });
    victory(s);
    return s;
  }
  fail("BLACK_EVENT_PENDING:NIGHT_ACTION_REQUIRED");
}
/** Server-only deadline action. A browser cannot force early night resolution. */
export function tickWitchTown(
  input: WTState,
  now: number,
  random: Random,
): WTState | null {
  const s = structuredClone(upgradeWitchTown(input));
  if (s.checkRequired) return null;
  if (expireDay(s, now)) return s;
  if (s.pending?.kind === "tituba" && now >= s.pending.deadline) {
    finishTituba(s, now);
    return s;
  }
  if (s.phase !== "black-event" || s.pending?.kind !== "black-event")
    return null;
  if (s.checkRequired) return null;
  const p = s.pending,
    e = p.event;
  if (
    e?.type !== "night" ||
    e.stage !== "confession" ||
    e.deadline === null ||
    now < e.deadline
  )
    return null;
  const target = player(s, e.attackTargetId!);
  log(s, { type: "NIGHT_TARGET_REVEALED", targetId: target.id });
  if (
    target.alive &&
    target.id !== e.protectedId &&
    !e.confessed.includes(target.id) &&
    !target.table.some((c) => c.kind === "asylum")
  )
    eliminate(s, target);
  else log(s, { type: "NIGHT_SAVED", targetId: target.id });
  victory(s);
  if (s.outcome) return s;
  const deck = shuffle([...s.deck, ...s.discard], random);
  s.discard = [];
  // RULE_DERIVED P8: an empty remainder still yields a deck containing Night itself.
  const split = Math.floor(deck.length / 2);
  s.deck = [
    ...deck.slice(0, split),
    ...shuffle([...deck.slice(split), p.card], random),
  ];
  s.pending = null;
  s.timerDeadline = null;
  log(s, { type: "NIGHT_COMPLETE" });
  drain(s, now);
  return s;
}
export function eventPublic(s: WTState, p: Pending) {
  const e = p.event;
  if (!e) return { stage: "pending" };
  return {
    stage: e.stage,
    ...(e.type === "night" && e.stage === "confession"
      ? { deadline: e.deadline, confessed: e.confessed }
      : {}),
  };
}
export function eventPrivate(s: WTState, p: Pending, id: string) {
  const e = p.event;
  if (!e) return null;
  const q = player(s, id);
  if (e.type === "conspiracy") {
    if (e.stage === "cat" && p.drawerId === id)
      return {
        kind: "conspiracy-cat" as const,
        targetId: s.blackCatOwnerId,
        concealedCount: player(s, s.blackCatOwnerId!).tryals.filter(
          (t) => !t.revealed,
        ).length,
      };
    if (e.stage === "picking" && e.members.includes(id))
      return {
        kind: "conspiracy-pick" as const,
        sourceId: e.leftOf[id],
        concealedCount: player(s, e.leftOf[id]).tryals.filter(
          (t) => !t.revealed,
        ).length,
        submitted: !!e.picks[id],
        selectedIndex: e.picks[id]
          ? player(s, e.leftOf[id])
              .tryals.filter((t) => !t.revealed)
              .findIndex((t) => t.id === e.picks[id])
          : null,
      };
  } else {
    if (e.stage === "witches" && q.alive && q.everWitch)
      return {
        kind: "night-witch" as const,
        allies: s.players
          .filter((t) => t.alive && t.everWitch)
          .map((t) => t.id),
        votes: e.votes,
      };
    if (e.stage === "constable" && constable(s)?.id === id)
      return {
        kind: "night-constable" as const,
        ...(q.everWitch ? { knownAttackTargetId: e.attackTargetId } : {}),
      };
    if (e.stage === "constable" && q.alive && q.everWitch)
      return {
        kind: "night-witch-wait" as const,
        knownAttackTargetId: e.attackTargetId,
      };
    if (e.stage === "confession" && q.alive)
      return {
        kind: "confession" as const,
        confessed: e.confessed.includes(id),
        deadline: e.deadline,
        ...(q.everWitch ? { knownAttackTargetId: e.attackTargetId } : {}),
        governorAvailable:
          effectiveCharacter(s, id) === "william_phips" &&
          !q.abilityUses.william_phips,
        copiedGovernorCheckRequired: false,
      };
  }
  return null;
}
