import {
  createGame,
  reduce,
  legalRoutes,
} from "../packages/game-engine/src/index.ts";
import type {
  GameState,
  Command,
  CreateOptions,
  Card,
} from "../packages/shared/src/types.ts";
export function route(
  s: GameState,
  start: string,
  goals: Set<string>,
  side: "killer" | "survivor",
  carry = false,
) {
  if (goals.has(start)) return [];
  const todo = [
      { room: start, steps: [] as Array<{ pathId: string; to: string }> },
    ],
    seen = new Set([start]);
  while (todo.length) {
    const p = todo.shift()!;
    for (const next of legalRoutes(s, p.room, side, undefined, carry)) {
      if (seen.has(next.to)) continue;
      const steps = [...p.steps, { pathId: next.pathId, to: next.to }];
      if (goals.has(next.to)) return steps;
      seen.add(next.to);
      todo.push({ room: next.to, steps });
    }
  }
  return null;
}
function survivorGoals(s: GameState) {
  const kind = s.completedGenerators >= 4 ? "exit_gate" : "generator";
  const known = s.props.filter(
    (p) => p.revealed && !p.removed && p.kind === kind && p.progress < 3,
  );
  const hidden = s.props.filter(
    (p) => !p.revealed && !p.removed && p.category === "objective",
  );
  return new Set([...known, ...hidden].map((p) => p.room));
}
function victims(s: GameState) {
  const a = Object.values(s.actors).filter(
    (a) => a.side === "survivor" && !a.hookId && !a.lockerId,
  );
  const old = a.filter(
    (a) => a.health === "wounded" && a.woundedRound !== s.round,
  );
  return old.length ? old : a;
}
function bestMove(
  s: GameState,
  id: string,
  moves: ReturnType<typeof legalRoutes>,
  goal: "survivor" | "killer",
) {
  const a = s.actors[id];
  if (!moves.length) return undefined;
  if (a.side === "survivor" && goal === "killer") return moves[0];
  const goals =
    a.side === "survivor"
      ? survivorGoals(s)
      : new Set(victims(s).map((a) => a.room!));
  return [...moves].sort(
    (a, b) =>
      (route(s, a.to, goals, s.actors[id].side)?.length ?? 999) -
      (route(s, b.to, goals, s.actors[id].side)?.length ?? 999),
  )[0];
}
function plan(s: GameState, id: string, goal: "survivor" | "killer"): Card[] {
  const a = s.actors[id],
    hand = [...s.hands[a.ownerId]];
  if (a.side === "survivor") {
    if (goal === "killer") {
      const missing = hand.find(
        (c) => !legalRoutes(s, a.room!, a.side, c).length,
      );
      if (missing) return [missing];
    }
    const best = bestMove(
      s,
      id,
      legalRoutes(s, a.room!, a.side).filter((r) => hand.includes(r.color)),
      goal,
    );
    return [best?.color ?? hand[0]];
  }
  if (goal === "survivor") return ["wait", hand.find((c) => c !== "wait")!];
  const goals = new Set(victims(s).map((a) => a.room!));
  const steps = route(s, a.room!, goals, "killer");
  const first: Card = steps?.length ? s.paths[steps[0].pathId].color : "wait";
  hand.splice(hand.indexOf(first), 1);
  const nextRoom = steps?.[0]?.to ?? a.room!;
  const next = route(s, nextRoom, goals, "killer");
  const desired: Card = next?.length ? s.paths[next[0].pathId].color : "wait";
  return [first, hand.includes(desired) ? desired : hand[0]];
}
export function nextCommand(
  s: GameState,
  goal: "survivor" | "killer",
): Command {
  if (s.window) {
    const actorId = s.window.actors[s.window.index];
    const available = s.window.eligible[actorId].filter(
      (id) => !s.usedPerks.includes(id),
    );
    if (goal === "survivor" && available.includes("board_dwight_3"))
      return { type: "USE_PERK", actorId, perkId: "board_dwight_3" };
    if (goal === "survivor" && available.includes("board_ace_1"))
      return { type: "USE_PERK", actorId, perkId: "board_ace_1", index: 0 };
    if (goal === "killer" && available.includes("board_doctor_1"))
      return { type: "USE_PERK", actorId, perkId: "board_doctor_1" };
    return { type: "PASS", actorId };
  }
  if (s.choice) {
    const c = s.choice,
      id = c.actorId;
    if (c.kind === "REVEAL") {
      const options = s.props.filter(
        (p) => p.room === c.room && !p.revealed && !p.removed,
      );
      return {
        type: "SELECT",
        actorId: id,
        propId: (
          options.find(
            (p) =>
              p.category === (goal === "survivor" ? "objective" : "boldness"),
          ) ?? options[0]
        ).id,
      };
    }
    if (c.kind === "KEEP") {
      const r = s.roll!;
      return {
        type: "SELECT",
        actorId: id,
        index: r.faces.indexOf(Math.max(...r.faces)),
      };
    }
    if (c.kind === "KEEP_ITEM")
      return { type: "SELECT", actorId: id, option: "old" };
    if (c.kind === "BONUS_CARD")
      return {
        type: "SELECT",
        actorId: id,
        card: s.hands[s.actors[id].ownerId][0],
      };
    if (c.kind === "OPTIONAL_MOVE") return { type: "SELECT", actorId: id };
    if (c.kind === "PHANTASM")
      return { type: "SELECT", actorId: id, option: "blood" };
    if (c.kind === "CARRY") {
      const hooks = s.props.filter(
        (p) =>
          p.revealed &&
          !p.removed &&
          p.kind === "hook" &&
          !Object.values(s.actors).some((a) => a.hookId === p.id) &&
          !(s.entity?.id === p.id),
      );
      const path =
        route(
          s,
          s.actors[id].room!,
          new Set(hooks.map((p) => p.room)),
          "killer",
          true,
        ) ?? [];
      return {
        type: "SELECT",
        actorId: id,
        dice: Math.min(4, path.length),
        route: path.slice(0, 4),
      };
    }
    throw new Error("unhandled simulation choice " + c.kind);
  }
  if (s.phase === "SETUP") {
    const color = goal === "survivor" ? "objective" : "boldness";
    return {
      type: "SETUP_REVEAL",
      actorId: s.survivors[s.setupIndex],
      propId: (s.props.find((p) => !p.revealed && p.category === color) ??
        s.props.find((p) => !p.revealed))!.id,
    };
  }
  if (s.phase === "PLANNING") {
    const id = [...s.publicPlans, ...s.survivors, s.killerId].find(
      (id) => !s.plans[id] && !s.actors[id].hookId,
    )!;
    return { type: "PLAN", actorId: id, cards: plan(s, id, goal) };
  }
  if (s.phase === "BONUS_OFFER")
    return { type: "KILLER_BONUS", actorId: s.killerId, accept: false };
  const t = s.turn!;
  const a = s.actors[t.actorId];
  if (t.stage === "MOVE") {
    const moves = legalRoutes(s, a.room!, a.side, t.card!);
    const move = bestMove(s, a.id, moves, goal);
    return {
      type: "MOVE",
      actorId: a.id,
      ...(move ? { pathId: move.pathId, to: move.to } : {}),
    };
  }
  if (t.stage === "INTERACT") {
    if (!t.interactionSpent) {
      if (a.side === "survivor" && goal === "survivor") {
        const p = s.props.find(
          (p) =>
            p.room === a.room &&
            p.revealed &&
            !p.removed &&
            (s.completedGenerators < 4
              ? p.kind === "generator"
              : p.kind === "exit_gate"),
        );
        if (p)
          return {
            type: "INTERACT",
            actorId: a.id,
            action: p.kind === "generator" ? "repair" : "exit",
            targetId: p.id,
          };
      }
      if (a.side === "killer" && goal === "killer") {
        const nearby = Object.values(s.actors).filter(
          (v) =>
            v.side === "survivor" &&
            v.room === a.room &&
            !v.hookId &&
            !v.lockerId,
        );
        const injured = nearby.find(
          (v) => v.health === "wounded" && v.woundedRound !== s.round,
        );
        if (injured)
          return {
            type: "INTERACT",
            actorId: a.id,
            action: "pickup",
            targetId: injured.id,
          };
        const healthy = nearby.find((v) => v.health === "healthy");
        if (healthy)
          return {
            type: "INTERACT",
            actorId: a.id,
            action: "attack",
            targetId: healthy.id,
          };
      }
    }
    return { type: "END_TURN", actorId: a.id };
  }
  throw new Error(
    "unhandled simulation state " +
      JSON.stringify({ phase: s.phase, turn: s.turn, jobs: s.jobs }),
  );
}
export function simulateGame(
  o: CreateOptions,
  goal: "survivor" | "killer",
  limit = 12000,
) {
  let state = createGame(o);
  const commands: Command[] = [];
  for (let i = 0; i < limit && !state.winner; i++) {
    const c = nextCommand(state, goal);
    commands.push(c);
    try {
      state = reduce(state, c);
    } catch (error) {
      throw new Error(
        JSON.stringify({
          step: i,
          command: c,
          phase: state.phase,
          turn: state.turn,
          window: state.window,
          choice: state.choice,
          cause: String(error),
        }),
      );
    }
  }
  if (!state.winner)
    throw new Error(
      "simulation limit " +
        JSON.stringify({
          round: state.round,
          props: state.props.filter(
            (p) => p.revealed && !p.removed && p.kind === "hook",
          ),
          actors: state.actors,
        }),
    );
  return { options: o, goal, commands, state };
}
