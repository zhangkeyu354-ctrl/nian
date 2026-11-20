import type { Card, Command, GameState, Side } from "../../shared/src/types.ts";
import { getControls, previewRoutes } from "./controls.ts";
import { validateInteraction } from "./engine.ts";
import { legalRoutes } from "./graph.ts";
import { viewFor } from "./privacy.ts";

type Level = "easy" | "normal";
type Rated = { command: Command; score: number };
type Step = { pathId: string; to: string };
type Goal = { room: string; value: number };

function nearest(s: GameState, start: string, side: Side, carry = false, limit = 12) {
  const paths = new Map<string, Step[]>([[start, []]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const room = queue[i];
    const path = paths.get(room)!;
    if (path.length >= limit) continue;
    for (const { to, pathId } of legalRoutes(s, room, side, undefined, carry)) {
      if (paths.has(to)) continue;
      paths.set(to, [...path, { pathId, to }]);
      queue.push(to);
    }
  }
  return paths;
}

function goalsFor(s: GameState, id: string): Goal[] {
  const actor = s.actors[id];
  if (actor.side === "killer") {
    return s.survivors.flatMap((other) => {
      const a = s.actors[other];
      return a.room && !a.hookId ? [{ room: a.room, value: a.health === "wounded" ? 21 : 16 }] : [];
    });
  }
  const objective = s.completedGenerators >= 4 ? "exit_gate" : "generator";
  const goals = s.props.flatMap((p): Goal[] => {
    if (p.removed || s.entity?.id === p.id) return [];
    if (p.kind === objective && p.progress < 3) return [{ room: p.room, value: 19 + p.progress }];
    if (!p.revealed && p.category === "objective") return [{ room: p.room, value: 16 }];
    if (p.kind === "hook" && s.survivors.some((v) => s.actors[v].hookId === p.id))
      return [{ room: p.room, value: 24 }];
    return [];
  });
  return goals;
}

function atRoom(s: GameState, id: string, room: string, goals: Goal[]) {
  const actor = s.actors[id];
  const paths = nearest(s, room, actor.side);
  const values = goals.map((goal) => goal.value - 5 * (paths.get(goal.room)?.length ?? 20));
  const score = values.length ? Math.max(...values) : 0;
  return score - (actor.side === "survivor" && s.actors[s.killerId].room === room ? 1 : 0);
}

function targets(s: GameState, actorId: string): Rated[] {
  const a = s.actors[actorId];
  const rated: Rated[] = [{ command: { type: "END_TURN", actorId }, score: 0 }];
  if (s.turn?.interactionSpent || s.turn?.noInteract) return rated;
  const scores: Record<string, number> = a.side === "killer"
    ? { pickup: 32, attack: 26, search: 24, damage: 15, venerate: 9, scout: 5 }
    : { rescue: 32, exit: 31, repair: 25, heal: 15, cleanse: 10, chest: 6, crow: 4 };
  for (const targetId of [
    ...s.props.filter(p => p.revealed && !p.removed && p.room === a.room).map(p => p.id),
    ...s.survivors,
  ]) {
    for (const [action, baseScore] of Object.entries(scores)) {
      const command: Command = { type: "INTERACT", actorId, action, targetId };
      try { validateInteraction(s, command); } catch { continue; }
      const prop = s.props.find(p => p.id === targetId);
      if (action === "rescue" && !s.survivors.some(v => s.actors[v].hookId === targetId)) continue;
      if ((action === "repair" || action === "damage") && prop && prop.progress >= 3) continue;
      if (action === "damage" && prop?.progress === 0) continue;
      rated.push({ command, score: baseScore + (prop?.progress ?? 0) });
    }
  }
  return rated;
}

/** Candidate construction runs only on the authorized, redacted seat projection. */
export function dbdBotView(full: GameState, ownerId: string) {
  const s = viewFor(full, ownerId);
  const actorId = s.choice?.actorId ?? s.turn?.actorId;
  function options(id: string): Rated[] {
    const a = s.actors[id];
    if (!a || a.ownerId !== ownerId) return [];
    const goals = goalsFor(s, id);
    const base = { actorId: id };
    if (s.window) return [{ command: { type: "PASS", ...base }, score: 0 }];
    if (s.choice?.kind === "CARRY" && a.room) {
      const occupied = new Set(s.survivors.map(v => s.actors[v].hookId));
      const hooks = s.props.filter(p => p.revealed && !p.removed && p.kind === "hook" &&
        !occupied.has(p.id) && p.id !== s.entity?.id);
      const routes = nearest(s, a.room, "killer", true, 4);
      const path = hooks.map(h => routes.get(h.room)).filter((x): x is Step[] => !!x)
        .sort((a, b) => a.length - b.length)[0];
      // Zero dice ends the carry. A hook in this space is handled by the rules before CARRY.
      const fallback = legalRoutes(s, a.room, "killer", undefined, true)[0];
      const route = path?.length ? path : fallback ? [fallback] : [];
      return [{ command: { type: "SELECT", ...base, dice: route.length, route }, score: 0 }];
    }
    if (s.choice || s.phase === "SETUP" || s.phase === "BONUS_OFFER") {
      return getControls(s).actions.map(({ command }) => {
        let score = 0;
        if (s.choice?.kind === "KEEP") {
          const index = Number(command.index);
          score = ({ critical: 3, success: 2, failure: 1 } as Record<string, number>)[s.roll?.classes[index] ?? ""] ?? 0;
        }
        if (s.choice?.kind === "REVEAL") {
          const prop = s.props.find(p => p.id === command.propId);
          score = prop?.category === (a.side === "survivor" ? "objective" : "boldness") ? 5 : 0;
        }
        if (s.choice?.kind === "DOCTOR_SHOCK" && command.option === "pay") score = a.madness ? 4 : 1;
        if (s.choice?.kind === "KEEP_ITEM" && command.option === "old") score = 1;
        if (command.type === "KILLER_BONUS" && command.accept === true && a.blood > 3) score = 3;
        return { command, score };
      });
    }
    if (s.phase === "PLANNING" && !s.plans[id] && !a.hookId && a.room) {
      const cards = s.hands[ownerId];
      const destinations = (from: string, card: Card) =>
        card === "wait" ? [from] : legalRoutes(s, from, a.side, card).map(r => r.to);
      const rate = (c: Card, rest?: Card) => {
        const first = destinations(a.room!, c);
        if (!first.length) return -100;
        return Math.max(...first.map(room => {
          const initial = atRoom(s, id, room, goals);
          const later = rest === undefined ? [] : destinations(room, rest);
          return initial + (later.length ? Math.max(...later.map(r => atRoom(s, id, r, goals))) * 0.7 : rest ? -3 : 0);
        })) + (c === "wait" ? -0.5 : 0);
      };
      return cards.flatMap((c, i) => a.side === "survivor"
        ? [{ command: { type: "PLAN", ...base, cards: [c] }, score: rate(c) }]
        : cards.flatMap((next, j) => j === i ? [] : [{
            command: { type: "PLAN", ...base, cards: [c, next] }, score: rate(c, next),
          }]));
    }
    if (actorId === id && s.turn?.stage === "MOVE") {
      const routes = previewRoutes(s, id, s.turn.card!);
      return routes.length ? routes.map(({ to, pathId }) => ({
        command: { type: "MOVE", ...base, to, pathId }, score: atRoom(s, id, to, goals),
      })) : [{ command: { type: "MOVE", ...base }, score: 0 }];
    }
    if (actorId === id && s.turn?.stage === "INTERACT") return targets(s, id);
    return [];
  }
  const owned = Object.values(s.actors).filter(a => a.ownerId === ownerId);
  return {
    candidates: Object.fromEntries(owned.map(a => [a.id, options(a.id)])),
    hand: [...(s.hands[ownerId] ?? [])],
  };
}

export function chooseDbdMove(
  view: ReturnType<typeof dbdBotView>, actorId: string, level: Level, random: () => number,
): Command {
  const list = [...(view.candidates[actorId] ?? [])].sort((a, b) => b.score - a.score);
  if (!list.length) throw new Error("没有可用的人机行动：" + actorId);
  const best = list[0].score;
  const pool = level === "easy" && random() < 0.35
    ? list.filter(c => c.score >= best - 8)
    : list.filter(c => c.score === best);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].command;
}
