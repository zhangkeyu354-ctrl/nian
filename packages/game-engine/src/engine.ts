import type {
  GameState,
  Actor,
  Card,
  CreateOptions,
  Command,
  Payload,
  Job,
  Roll,
  Window,
  Turn,
} from "../../shared/src/types.ts";
import { maps, roster, boardPerks, rules, dice, items } from "./data.ts";
import { legalRoutes, connected } from "./graph.ts";
import { resultClass, resolveDice } from "./dice.ts";
import { matches, applyAbility, applyPower } from "./skills.ts";
import {
  useItem,
  resolveItem,
  itemResponders,
  selectMapReveal,
  negatePendingItem,
} from "./items.ts";
export { legalRoutes, connected, resolveDice };
export type { GameState, Command, CreateOptions };
export class RuleError extends Error {
  constructor(
    public code: string,
    public detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "RuleError";
  }
}
export function requireThat(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new RuleError("ILLEGAL_COMMAND", detail);
}
export function checkRule(id: string) {
  if (["Q01", "Q02", "Q04", "Q05", "Q07", "Q08", "Q09"].includes(id)) return;
  const r = rules.rules.find((r) => r.id === id);
  if (!r || r.status !== "CONFIRMED") throw new RuleError("CHECK_REQUIRED", id);
}
export function actor(s: GameState, id: unknown): Actor {
  requireThat(typeof id === "string" && s.actors[id], `unknown actor ${id}`);
  return s.actors[id];
}
export function active(a: Actor) {
  return !a.hookId && !a.lockerId;
}
export function text(p: Payload, k: string): string {
  requireThat(typeof p[k] === "string", `${k} required`);
  return p[k] as string;
}
export function number(p: Payload, k: string): number {
  requireThat(Number.isInteger(p[k]), `${k} integer required`);
  return p[k] as number;
}
export function enqueue(s: GameState, ...jobs: Job[]) {
  s.jobs.unshift(...jobs);
}
export function log(
  s: GameState,
  type: string,
  data: Payload = {},
  sourceRef = ["B01:p6/p8-p16", "U02:当前采用规则"],
) {
  s.events.push({
    seq: s.events.length + 1,
    round: s.round,
    type,
    data: structuredClone(data),
    sourceRef,
  });
}
export function random(s: GameState, max: number) {
  const limit = Math.floor(4294967296 / max) * max;
  let x: number;
  do {
    let t = s.rng >>> 0;
    t ^= t << 13;
    t ^= t >>> 17;
    t ^= t << 5;
    s.rng = t >>> 0;
    x = s.rng;
  } while (x >= limit);
  return x % max;
}
function shuffle<T>(s: GameState, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = random(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function gain(s: GameState, id: string, n: number) {
  const a = actor(s, id);
  a.blood = Math.max(0, Math.min(a.side === "killer" ? 12 : 6, a.blood + n));
  log(s, "BLOODPOINTS", {
    actorId: id,
    delta: n === 0 ? 0 : n,
    value: a.blood,
  });
}
export function spend(s: GameState, id: string, n: number) {
  requireThat(n >= 0 && actor(s, id).blood >= n, "insufficient bloodpoints");
  gain(s, id, -n);
}
export function win(s: GameState, side: "survivor" | "killer") {
  s.winner = side;
  s.phase = "OVER";
  s.jobs = [];
  s.window = null;
  s.choice = null;
  log(s, "GAME_OVER", { winner: side }, ["B01:p11"]);
}
export function sacrificeProgress(s: GameState, n: number) {
  s.sacrifice += n;
  log(s, "SACRIFICE_PROGRESS", { amount: n, total: s.sacrifice });
  if (s.sacrifice >= 8) win(s, "killer");
}
export function signal(s: GameState, event: string, context: Payload = {}) {
  enqueue(s, { kind: "SIGNAL", event, context });
}
/** 卡特的电火花：没有神经紊乱 → 获得神经紊乱；已经神经紊乱 → 变为受伤 */
function doctorEffect(s: GameState, id: string) {
  const v = actor(s, id);
  if (v.madness) wounded(s, id);
  else {
    v.madness = true;
    log(s, "MADNESS_GAINED", { actorId: id });
  }
}
export function wounded(s: GameState, id: string) {
  const a = actor(s, id);
  if (a.health === "healthy") {
    a.health = "wounded";
    a.woundedRound = s.round;
    log(s, "WOUNDED", { actorId: id });
  }
}
export function healthy(s: GameState, id: string) {
  const a = actor(s, id);
  if (a.health === "healthy") return;
  a.health = "healthy";
  a.woundedRound = null;
  signal(s, "SURVIVOR_BECOMES_HEALTHY", { actorId: id });
}
export function prop(s: GameState, id: unknown) {
  const p = s.props.find((p) => p.id === id && !p.removed);
  requireThat(p, "unknown/removed prop");
  return p;
}
export function card(s: GameState, a: Actor, c: unknown): Card {
  const hand = s.hands[a.ownerId];
  requireThat(
    typeof c === "string" && hand.includes(c as Card),
    "card unavailable/shared hand already committed",
  );
  hand.splice(hand.indexOf(c as Card), 1);
  return c as Card;
}
export function createGame(o: CreateOptions): GameState {
  if (o.mode && o.mode !== "ADEPT")
    throw new RuleError("CHECK_REQUIRED", `${o.mode} card deck: Phase4`);
  requireThat(Number.isInteger(o.seed), "integer seed");
  requireThat(
    o.survivors.length === 4 && new Set(o.survivors).size === 4,
    "exactly four unique survivors",
  );
  requireThat(roster.get(o.killer)?.side === "killer", "base killer required");
  for (const id of o.survivors)
    requireThat(roster.get(id)?.side === "survivor", "base survivor required");
  const map = maps.maps.find((m) => m.id === o.mapId);
  requireThat(
    map && map.status === "CONFIRMED" && map.topology_status === "CONFIRMED",
    "CHECK_REQUIRED map",
  );
  const s: GameState = {
    version: 1,
    mapId: o.mapId,
    rng: o.seed >>> 0 || 1,
    seed: o.seed,
    round: 1,
    phase: "SETUP",
    actors: {},
    survivors: [...o.survivors],
    killerId: o.killer,
    firstPlayer: 0,
    hands: {},
    plans: {},
    publicPlans: [],
    props: [],
    paths: {},
    entity: null,
    phantasms: [],
    sacrifice: 0,
    completedGenerators: 0,
    generatorsThisRound: 0,
    setupIndex: 0,
    turnOrder: [],
    cursor: 0,
    turn: null,
    savedTurns: [],
    killerBonusUsed: false,
    killerBonusForbidden: false,
    usedPerks: [],
    jobs: [],
    window: null,
    choice: null,
    roll: null,
    pendingAction: null,
    winner: null,
    events: [],
    unresolvedAbilities: [],
    itemDeck: [],
    itemDiscard: [],
  };
  for (const id of [...o.survivors, o.killer]) {
    const c = roster.get(id)!;
    const ownerId = o.owners?.[id] ?? id;
    const side = c.side as Actor["side"];
    s.actors[id] = {
      id,
      side,
      ownerId,
      room: null,
      blood: side === "killer" ? 4 : 2,
      health: "healthy",
      woundedRound: null,
      hookId: null,
      lockerId: null,
      personalSacrifice: side === "survivor" ? 1 : 0,
      madness: false,
      perks: [...c.starting_perks],
      powerUsed: false,
      item: null,
    };
    const others = Object.values(s.actors).filter((a) => a.ownerId === ownerId);
    requireThat(
      others.every((a) => a.side === side),
      "killer cannot share survivor owner",
    );
    requireThat(others.length <= 2, "max two survivors per player");
    s.hands[ownerId] =
      side === "killer"
        ? ["blue", "green", "red", "yellow", "wait"]
        : ["blue", "green", "red", "yellow"];
  }
  requireThat(
    Object.keys(s.hands).length >= 3 && Object.keys(s.hands).length <= 5,
    "3-5 players",
  );
  for (const e of map.edges) {
    const p = e as unknown as {
      id: string;
      rooms?: string[];
      from: string;
      to: string;
      color: Card;
      direction: "both" | "a_to_b";
      jagged: boolean;
      status: string;
    };
    requireThat(p.status === "CONFIRMED", "CHECK_REQUIRED path");
    s.paths[p.id] = {
      id: p.id,
      rooms: p.rooms ?? [p.from, p.to],
      from: p.from,
      to: p.to,
      color: p.color,
      direction: p.direction,
      wall: p.jagged,
      pallet: false,
      bearTrap: false,
      temporaryWall: false,
    };
  }
  const pools: Record<string, string[]> = {
    objective: [...Array(8).fill("generator"), ...Array(2).fill("exit_gate")],
    boldness: [...Array(5).fill("hook"), ...Array(5).fill("hex_totem")],
    survival: [...Array(6).fill("chest"), ...Array(6).fill("locker")],
    altruism: [...Array(6).fill("pallet"), ...Array(6).fill("crow")],
  };
  for (const p of Object.values(pools)) shuffle(s, p);
  for (const n of map.nodes)
    for (const [category, count] of Object.entries(n.initial_prop_counts!))
      for (let i = 0; i < count; i++)
        s.props.push({
          id: `${n.id}:${category}:${i}`,
          room: n.id,
          kind: pools[category].pop()!,
          category,
          revealed: false,
          removed: false,
          progress: 0,
        });
  s.itemDeck = shuffle(
    s,
    items.physical_cards.map((c) => c.definition_id),
  );
  s.unresolvedAbilities = Object.values(s.actors).flatMap((a) =>
    a.perks.filter((id) => boardPerks.get(id)?.status !== "CONFIRMED"),
  );
  log(s, "GAME_CREATED", {
    seed: o.seed,
    mapId: o.mapId,
    survivors: o.survivors,
    killer: o.killer,
    unresolvedAbilities: s.unresolvedAbilities,
  });
  return s;
}
function orderedSurvivors(s: GameState) {
  return [
    ...s.survivors.slice(s.firstPlayer),
    ...s.survivors.slice(0, s.firstPlayer),
  ];
}
function reveal(s: GameState, pid: string, id: string) {
  const p = prop(s, pid);
  requireThat(!p.revealed, "already revealed");
  p.revealed = true;
  log(s, "PROP_REVEALED", { actorId: id, propId: p.id, kind: p.kind });
}
function startPlanning(s: GameState) {
  s.phase = "PLANNING";
  s.turn = null;
  s.plans = {};
  s.publicPlans = [];
  enqueue(s, { kind: "SIGNAL", event: "PLANNING_START", context: {} });
}
function startTurn(s: GameState) {
  // 被献祭的逃生者跳过回合（B01 p15）。计划阶段在钩子上、本轮行动中才被救下的逃生者
  // 没有放置移动牌，本轮也没有回合（救援时已获得一次移动，B01 p13）。
  while (
    s.cursor < s.turnOrder.length &&
    (actor(s, s.turnOrder[s.cursor]).hookId ||
      !s.plans[s.turnOrder[s.cursor]]?.length)
  )
    s.cursor++;
  if (s.cursor >= s.turnOrder.length) {
    enqueue(
      s,
      { kind: "SIGNAL", event: "CLEANUP_START", context: {} },
      { kind: "CLEANUP" },
    );
    return;
  }
  const id = s.turnOrder[s.cursor];
  const index = s.turnOrder.slice(0, s.cursor).filter((x) => x === id).length;
  s.phase = "ACTING";
  s.turn = {
    actorId: id,
    card: s.plans[id][index],
    index,
    bonus: false,
    stage: "MOVE",
    interactionSpent: false,
    interacted: false,
    token: s.events.length + 1,
  };
  log(s, "TURN_START", { actorId: id, index, card: s.turn.card });
  enqueue(
    s,
    { kind: "SIGNAL", event: "OWN_TURN_START", context: { actorId: id } },
    { kind: "SIGNAL", event: "BEFORE_OWN_MOVE", context: { actorId: id } },
  );
}
export function grantBonus(s: GameState, id: string) {
  const a = actor(s, id);
  requireThat(!a.hookId, "hooked cannot take bonus");
  if (a.side === "killer") {
    requireThat(
      !s.killerBonusUsed && !s.killerBonusForbidden,
      "killer bonus limited once per round",
    );
    s.killerBonusUsed = true;
  }
  requireThat(s.hands[a.ownerId].length, "no bonus movement card");
  s.savedTurns.push({ turn: s.turn, jobs: s.jobs, phase: s.phase });
  s.jobs = [];
  s.turn = {
    actorId: id,
    card: null,
    index: 0,
    bonus: true,
    stage: "SELECT_BONUS",
    interactionSpent: false,
    interacted: false,
    token: s.events.length + 1,
  };
  s.choice = { kind: "BONUS_CARD", actorId: id };
  s.phase = "ACTING";
  log(s, "BONUS_TURN_GRANTED", { actorId: id });
}
function finishTurn(s: GameState) {
  const t = s.turn!;
  for (const p of Object.values(s.paths))
    if (p.temporaryWallUntil === t.token) {
      p.temporaryWall = false;
      delete p.temporaryWallUntil;
    }
  if (t.bonus) {
    const f = s.savedTurns.pop()!;
    s.turn = f.turn;
    s.jobs.push(...f.jobs);
    s.phase = f.phase;
    log(s, "BONUS_TURN_END", { actorId: t.actorId });
    return;
  }
  if (
    t.actorId === s.killerId &&
    t.index === 1 &&
    !s.killerBonusUsed &&
    !s.killerBonusForbidden &&
    s.hands[actor(s, s.killerId).ownerId].length
  ) {
    s.phase = "BONUS_OFFER";
    return;
  }
  s.turn = null;
  s.cursor++;
  startTurn(s);
}
export function moveEffect(
  s: GameState,
  id: string,
  pathId: string,
  to: string,
  opts: {
    ignore?: boolean;
    reverse?: boolean;
    destroy?: boolean;
    normal?: boolean;
    palletWindowResolved?: boolean;
    entryWindowResolved?: boolean;
  } = {},
): "moved" | "deferred" | "blocked" {
  const a = actor(s, id);
  requireThat(a.room && !a.hookId, "cannot move");
  const route = legalRoutes(
    s,
    a.room,
    a.side,
    undefined,
    false,
    opts.ignore,
    opts.reverse,
  ).find((r) => r.pathId === pathId && r.to === to);
  requireThat(route, "illegal effect route");
  const p = s.paths[pathId];
  a.lockerId = null;
  if (
    a.side === "killer" &&
    p.pallet &&
    !opts.ignore &&
    !opts.palletWindowResolved
  ) {
    enqueue(
      s,
      {
        kind: "SIGNAL",
        event: "BEFORE_PALLET_MOVE",
        context: { actorId: id, pathId },
      },
      {
        kind: "MOVE_EFFECT",
        actorId: id,
        pathId,
        to,
        opts: { ...opts, palletWindowResolved: true },
      },
    );
    return "deferred";
  }
  if (opts.destroy) {
    if (p.pallet) {
      log(s, "PALLET_DESTROYED", { actorId: s.killerId, pathId });
      signal(s, "BLOCKER_DESTROYED", {
        actorId: s.killerId,
        kind: "pallet",
        pathId,
      });
    }
    if (p.wall && !p.temporaryWall) {
      log(s, "WALL_DESTROYED", { actorId: s.killerId, pathId });
      p.wall = false;
    }
    p.pallet = false;
  }
  if (a.side === "killer" && p.pallet && !opts.ignore) {
    p.pallet = false;
    if (s.turn) s.turn.interactionSpent = true;
    log(s, "PALLET_DESTROYED", { actorId: id, pathId });
    signal(s, "BLOCKER_DESTROYED", { actorId: id, kind: "pallet" });
    return "blocked";
  }
  if (a.side === "killer") {
    const entry = killerEntry(s, id, to, !!opts.entryWindowResolved);
    if (entry === "window") {
      enqueue(
        s,
        {
          kind: "SIGNAL",
          event: "KILLER_WOULD_ENTER",
          context: { actorId: id, to },
        },
        {
          kind: "MOVE_EFFECT",
          actorId: id,
          pathId,
          to,
          opts: { ...opts, entryWindowResolved: true },
        },
      );
      return "deferred";
    }
    if (entry === "blocked") return "blocked";
  }
  if (a.side === "killer" && p.wall && !p.temporaryWall && !opts.ignore) {
    p.wall = false;
    log(s, "WALL_DESTROYED", { actorId: id, pathId });
    signal(s, "BLOCKER_DESTROYED", { actorId: id, kind: "wall" });
  }
  const from = a.room;
  a.room = to;
  log(s, "MOVED", { actorId: id, from, to, pathId });
  const jobs: Job[] = [
    { kind: "REVEAL_ROOM", actorId: id, room: to },
    {
      kind: "SIGNAL",
      event: "AFTER_MOVE",
      context: { actorId: id, from, to, pathId, normal: opts.normal ?? false },
    },
  ];
  if (a.side === "survivor" && p.bearTrap)
    jobs.push({
      kind: "CHECK",
      actorId: id,
      checkKind: "beartrap",
      targetId: pathId,
      die: "danger",
    });
  if (a.side === "survivor" && s.phantasms.includes(to)) {
    s.phantasms = s.phantasms.filter((r) => r !== to);
    jobs.push({
      kind: "CHECK",
      actorId: id,
      checkKind: "phantasm",
      targetId: to,
    });
  }
  enqueue(s, ...jobs);
  return "moved";
}
/** 鞭炮：杀手将要进入一个有持物逃生者的空间时，先给他们响应机会 */
function killerEntry(
  s: GameState,
  id: string,
  to: string,
  resolved: boolean,
): "go" | "window" | "blocked" {
  if (!resolved)
    return itemResponders(s, "KILLER_WOULD_ENTER", { actorId: id, to }).length
      ? "window"
      : "go";
  const b = s.blockedEntry;
  s.blockedEntry = null;
  if (b?.room !== to) return "go";
  log(s, "MOVE_BLOCKED", { actorId: id, to, by: b.by });
  // B01 p18 FAQ：移动因故失败时，也失去本次交互机会
  if (s.turn?.actorId === id) s.turn.interactionSpent = true;
  if (s.pendingAction?.actorId === id) s.pendingAction = null;
  return "blocked";
}
export function teleport(
  s: GameState,
  id: string,
  to: string,
  resolved = false,
): "moved" | "deferred" | "blocked" {
  const a = actor(s, id);
  requireThat(
    maps.maps.find((m) => m.id === s.mapId)!.nodes.some((n) => n.id === to),
    "unknown room",
  );
  if (a.side === "killer") {
    const entry = killerEntry(s, id, to, resolved);
    if (entry === "window") {
      enqueue(
        s,
        {
          kind: "SIGNAL",
          event: "KILLER_WOULD_ENTER",
          context: { actorId: id, to },
        },
        { kind: "TELEPORT", actorId: id, to },
      );
      return "deferred";
    }
    if (entry === "blocked") return "blocked";
  }
  const from = a.room;
  a.lockerId = null;
  a.room = to;
  log(s, "TELEPORTED", { actorId: id, from, to });
  enqueue(
    s,
    { kind: "REVEAL_ROOM", actorId: id, room: to },
    {
      kind: "SIGNAL",
      event: "AFTER_MOVE",
      context: { actorId: id, from, to, pathId: null, normal: false },
    },
  );
  return "moved";
}
export function beginRoll(
  s: GameState,
  id: string,
  kind: string,
  targetId: string,
  data: Payload = {},
  die?: "skill_check" | "danger",
  count = 1,
) {
  requireThat(!s.roll, "nested unresolved check");
  const a = actor(s, id);
  s.roll = {
    actorId: id,
    kind,
    targetId,
    data,
    die:
      die ??
      (a.madness &&
      ["generator", "exit", "locker", "heal", "totem"].includes(kind)
        ? "danger"
        : "skill_check"),
    count,
    faces: [],
    classes: [],
    failureCredit: [],
    keep: kind === "carry" ? 0 : null,
  };
  enqueue(
    s,
    {
      kind: "SIGNAL",
      event: "BEFORE_ROLL",
      context: { actorId: id, checkKind: kind },
    },
    { kind: "ROLL" },
    {
      kind: "SIGNAL",
      event: "AFTER_ROLL",
      context: { actorId: id, checkKind: kind },
    },
    { kind: "KEEP" },
    { kind: "RESOLVE_ROLL" },
  );
}
/**
 * 搬运的一步。route 是杀手预先选好的路线，budget 是还能走的格数（=掷骰数）。
 * 被鞭炮阻止的一步不消耗格数、不进入那个空间；杀手可以用剩余格数改走别的路线（CARRY_REROUTE）。
 */
function carryMove(s: GameState, j: Payload) {
  const victimId = text(j, "victimId");
  const route = (j.route ?? []) as Array<{ pathId: string; to: string }>;
  const budget = number(j, "budget");
  const k = actor(s, s.killerId),
    v = actor(s, victimId);
  const finish = () => {
    const h = availableHook(s, k.room!);
    if (h) hook(s, v.id, h.id);
    else log(s, "ESCAPED", { actorId: v.id, reason: "no_hook" });
  };
  if (!route.length || budget <= 0) return finish();
  const [step, ...rest] = route;
  requireThat(
    legalRoutes(s, k.room!, "killer", undefined, true).some(
      (p) => p.pathId === step.pathId && p.to === step.to,
    ),
    "illegal carry path",
  );
  const entry = killerEntry(s, k.id, step.to, !!j.entryWindowResolved);
  if (entry === "window") {
    enqueue(
      s,
      {
        kind: "SIGNAL",
        event: "KILLER_WOULD_ENTER",
        context: { actorId: k.id, to: step.to, carrying: v.id },
      },
      { ...j, kind: "CARRY_MOVE", entryWindowResolved: true },
    );
    return;
  }
  if (entry === "blocked") {
    if (legalRoutes(s, k.room!, "killer", undefined, true).length)
      s.choice = {
        kind: "CARRY_REROUTE",
        actorId: k.id,
        victimId: v.id,
        budget,
        blocked: step.to,
      };
    else finish();
    return;
  }
  const from = k.room;
  k.room = step.to;
  v.room = step.to;
  log(
    s,
    "CARRIED",
    { actorId: v.id, from, to: step.to, pathId: step.pathId, revealed: false },
    ["U02:Q01/Q08"],
  );
  enqueue(s, { kind: "CARRY_MOVE", victimId: v.id, route: rest, budget: budget - 1 });
}
function availableHook(s: GameState, room: string) {
  return s.props.find(
    (p) =>
      p.room === room &&
      p.kind === "hook" &&
      p.revealed &&
      !p.removed &&
      !(s.entity?.kind === "prop" && s.entity.id === p.id) &&
      !Object.values(s.actors).some((a) => a.hookId === p.id),
  );
}
function hook(s: GameState, victimId: string, pid: string) {
  const v = actor(s, victimId);
  v.hookId = pid;
  v.lockerId = null;
  log(s, "HOOKED", { actorId: victimId, hookId: pid });
  if (v.personalSacrifice) {
    const n = v.personalSacrifice;
    v.personalSacrifice = 0;
    sacrificeProgress(s, n);
  }
  if (!s.winner)
    signal(s, "AFTER_SACRIFICE", { actorId: s.killerId, targetId: victimId });
}
function attemptPickUp(s: GameState, victimId: string) {
  const k = actor(s, s.killerId),
    v = actor(s, victimId);
  requireThat(v.room === k.room && !v.hookId, "victim unavailable");
  v.lockerId = null;
  const h = availableHook(s, k.room!);
  if (h) hook(s, victimId, h.id);
  else s.choice = { kind: "CARRY", actorId: k.id, victimId };
}
function resolveRoll(s: GameState) {
  const r = s.roll!;
  requireThat(r.keep !== null, "keep result required");
  const a = actor(s, r.actorId);
  const cls = r.classes[r.keep];
  const ok = cls !== "failure";
  const great = cls === "great_success";
  gain(s, s.killerId, r.failureCredit.filter(Boolean).length);
  if (
    a.madness &&
    ["generator", "exit", "locker", "heal", "totem"].includes(r.kind) &&
    cls === "failure"
  ) {
    a.madness = false;
    log(s, "MADNESS_REMOVED", { actorId: a.id });
  }
  s.roll = null;
  log(s, "CHECK_RESOLVED", {
    actorId: r.actorId,
    kind: r.kind,
    faces: r.faces,
    kept: r.keep,
    result: cls,
  });
  if (r.kind === "generator" || r.kind === "exit") {
    const p = prop(s, r.targetId);
    if (r.kind === "exit") {
      if (ok) p.progress = Math.min(3, p.progress + 1);
      log(s, "PROP_PROGRESS", { propId: p.id, progress: p.progress });
      if (p.progress === 3) {
        win(s, "survivor");
        return;
      }
    } else addGeneratorProgress(s, p.id, ok ? (great ? 2 : 1) : 0, r.actorId);
    if (!ok && r.kind === "generator")
      signal(s, "GENERATOR_FAILURE", { actorId: r.actorId, propId: p.id });
  } else if (r.kind === "totem") {
    if (ok) {
      prop(s, r.targetId).removed = true;
      gain(s, r.actorId, 2);
    }
  } else if (
    r.kind === "heal" ||
    r.kind === "self_heal" ||
    r.kind === "botany"
  ) {
    if (ok) healthy(s, r.targetId);
  } else if (r.kind === "locker") {
    if (ok) {
      prop(s, r.targetId).removed = true;
      a.lockerId = null;
    } else attemptPickUp(s, text(r.data, "victimId"));
  } else if (r.kind === "beartrap") {
    if (!ok) {
      s.paths[r.targetId].bearTrap = false;
      if (a.health === "wounded") sacrificeProgress(s, 1);
      else wounded(s, a.id);
    }
  } else if (r.kind === "phantasm") {
    s.choice = {
      kind: "PHANTASM",
      actorId: s.killerId,
      room: r.targetId,
      price: r.faces[0],
    };
  } else if (r.kind === "oppressive") {
    // 医生「压迫性气场」：失败时该物品被弃掉，不产生效果
    if (!ok) negatePendingItem(s);
  } else if (r.kind === "carry") {
    const victimId = text(r.data, "victimId");
    const route = r.data.route as Array<{ pathId: string; to: string }>;
    if (r.faces.some((f) => f === 5)) {
      log(s, "ESCAPED", { actorId: victimId, reason: "great_success" });
      return;
    }
    // 逐步搬运：每一步进入有持物逃生者的空间前，都给他们用鞭炮阻止的机会（Q14 用户裁定）
    enqueue(s, {
      kind: "CARRY_MOVE",
      victimId,
      route,
      budget: r.faces.length,
    });
  } else throw new RuleError("CHECK_REQUIRED", `check kind ${r.kind}`);
}
/** 用掉一个技能或物品后要恢复的窗口；该响应者已无事可做时直接跳到下一位（省一次点击） */
export function afterUse(
  s: GameState,
  w: Window,
  id: string,
  justUsedPerk?: string,
): Window | null {
  const a = actor(s, id);
  const more =
    (w.eligible[id] ?? []).some(
      (pid) =>
        pid !== justUsedPerk &&
        !s.usedPerks.includes(pid) &&
        boardPerks.get(pid)!.bloodpoint_cost <= a.blood,
    ) ||
    (!!a.item && (w.itemActors ?? []).includes(id)) ||
    // 自己将要交互时用了技能（如锦囊妙计），可能还要改选交互对象
    (w.event === "WOULD_INTERACT" && w.context.actorId === id);
  if (more) return w;
  const index = w.index + 1;
  return index < w.actors.length ? { ...w, index } : null;
}
/** 给发电机加进度；满 3 时完成（掷骰修理与工具箱共用） */
export function addGeneratorProgress(
  s: GameState,
  pid: string,
  n: number,
  actorId: string,
) {
  const p = prop(s, pid);
  p.progress = Math.min(3, p.progress + n);
  log(s, "PROP_PROGRESS", { propId: p.id, progress: p.progress });
  if (p.progress === 3) {
    p.removed = true;
    s.completedGenerators++;
    s.generatorsThisRound++;
    signal(s, "GENERATOR_COMPLETED", { actorId, propId: p.id });
  }
}
export function validateInteraction(s: GameState, action: Payload) {
  const a = actor(s, action.actorId),
    kind = text(action, "action");
  requireThat(a.room && active(a), "cannot interact");
  if (kind === "power") {
    requireThat(a.side === "killer" && !a.powerUsed, "power unavailable");
    return;
  }
  if (["attack", "pickup", "heal"].includes(kind)) {
    const v = actor(s, action.targetId);
    requireThat(
      v.side === "survivor" && v.id !== a.id && active(v) && v.room === a.room,
      "invalid survivor target",
    );
    requireThat(
      kind === "heal"
        ? a.side === "survivor" && v.health === "wounded"
        : a.side === "killer",
      "wrong interaction side",
    );
    if (kind === "attack")
      requireThat(v.health === "healthy", "attack healthy only");
    if (kind === "pickup")
      requireThat(
        v.health === "wounded" && v.woundedRound !== s.round,
        "cannot pick up newly wounded",
      );
    return;
  }
  const p = prop(s, action.targetId);
  requireThat(
    p.revealed &&
      p.room === a.room &&
      !(s.entity?.kind === "prop" && s.entity.id === p.id),
    "prop not interactable",
  );
  const expected: Record<string, string> = {
    repair: "generator",
    exit: "exit_gate",
    cleanse: "hex_totem",
    chest: "chest",
    locker: "locker",
    crow: "crow",
    pallet: "pallet",
    rescue: "hook",
    damage: "generator",
    venerate: "hex_totem",
    scout: "crow",
    search: "locker",
  };
  requireThat(expected[kind] && expected[kind] === p.kind, "wrong prop/action");
  const survivorActions = [
    "repair",
    "exit",
    "cleanse",
    "chest",
    "locker",
    "crow",
    "pallet",
    "rescue",
  ];
  requireThat(
    survivorActions.includes(kind) === (a.side === "survivor"),
    "wrong interaction side",
  );
  if (kind === "exit")
    requireThat(s.completedGenerators >= 4, "exit unpowered");
  if (kind === "locker")
    requireThat(
      !Object.values(s.actors).some((v) => v.lockerId === p.id),
      "occupied locker",
    );
  if (kind === "search")
    requireThat(
      Object.values(s.actors).some((v) => v.lockerId === p.id),
      "must search occupied locker",
    );
  if (kind === "pallet") {
    const path = s.paths[text(action, "pathId")];
    requireThat(
      path &&
        path.rooms.includes(a.room) &&
        (!path.wall || path.temporaryWall) &&
        !path.pallet &&
        !path.bearTrap &&
        !(s.entity?.kind === "path" && s.entity.id === path.id),
      "occupied/nonadjacent path",
    );
  }
}
/** 妖巫传送后可交互的逃生者及交互方式 */
export function phantasmTargets(s: GameState) {
  const out: Array<{ action: string; targetId: string }> = [];
  for (const v of s.survivors)
    for (const action of ["attack", "pickup"]) {
      try {
        validateInteraction(s, { actorId: s.killerId, action, targetId: v });
        out.push({ action, targetId: v });
      } catch {}
    }
  return out;
}
function performInteraction(s: GameState) {
  const action = s.pendingAction!;
  s.pendingAction = null;
  const id = text(action, "actorId"),
    a = actor(s, id),
    kind = text(action, "action");
  const pid = typeof action.targetId === "string" ? action.targetId : null;
  // 宣告交互之后、结算之前，交互对象可能已被合法地改变：
  // AUDIT-B02 梅格「急速静谧」躲进柜子；埃斯「锦囊妙计」把要交互的道具换走了；等等。
  // 不得卡局，也不得对已经不合法的对象强行结算。妖巫传送交互的原文是"与那个空间里的
  // 一位逃生者交互"，所以让杀手在该空间重新选择；其他情况本次交互作废（交互机会已用掉）。
  try {
    validateInteraction(s, action);
  } catch (e) {
    if (!(e instanceof RuleError) || e.code !== "ILLEGAL_COMMAND") throw e;
    if (action.phantasm && phantasmTargets(s).length) {
      s.choice = { kind: "PHANTASM_TARGET", actorId: a.id, room: a.room };
      return;
    }
    log(s, "INTERACTION_LOST", { actorId: a.id, action: kind, targetId: pid });
    return;
  }
  if (kind === "attack" || kind === "pickup" || kind === "heal") {
    const v = actor(s, pid);
    requireThat(
      v.side === "survivor" && v.room === a.room && active(v) && v.id !== a.id,
      "invalid survivor target",
    );
    if (kind === "attack") {
      requireThat(
        a.side === "killer" && v.health === "healthy",
        "attack healthy only",
      );
      wounded(s, v.id);
      signal(s, "AFTER_ATTACK", { actorId: a.id, targetId: v.id });
    }
    if (kind === "pickup") {
      requireThat(
        a.side === "killer" &&
          v.health === "wounded" &&
          v.woundedRound !== s.round,
        "cannot pick up newly wounded",
      );
      attemptPickUp(s, v.id);
    }
    if (kind === "heal") {
      requireThat(
        a.side === "survivor" && v.health === "wounded",
        "heal another wounded survivor",
      );
      beginRoll(s, a.id, "heal", v.id);
    }
    return;
  }
  if (kind === "power") {
    requireThat(a.side === "killer" && !a.powerUsed, "power once per round");
    applyPower(s, action);
    a.powerUsed = true;
    return;
  }
  const p = prop(s, pid);
  requireThat(
    p.room === a.room &&
      p.revealed &&
      !(s.entity?.kind === "prop" && s.entity.id === p.id),
    "prop not interactable",
  );
  if (a.side === "survivor") {
    if (kind === "repair") {
      requireThat(p.kind === "generator", "not generator");
      beginRoll(s, a.id, "generator", p.id);
    } else if (kind === "exit") {
      requireThat(
        p.kind === "exit_gate" && s.completedGenerators >= 4,
        "exit unpowered",
      );
      beginRoll(s, a.id, "exit", p.id);
    } else if (kind === "cleanse") {
      requireThat(p.kind === "hex_totem", "not totem");
      beginRoll(s, a.id, "totem", p.id);
    } else if (kind === "chest") {
      requireThat(p.kind === "chest", "not chest");
      p.removed = true;
      enqueue(
        s,
        { kind: "DRAW_ITEM", actorId: a.id },
        {
          kind: "SIGNAL",
          event: "AFTER_CHEST",
          context: { actorId: a.id, propId: p.id },
        },
      );
    } else if (kind === "locker") {
      requireThat(
        p.kind === "locker" &&
          !Object.values(s.actors).some((v) => v.lockerId === p.id),
        "occupied locker",
      );
      a.lockerId = p.id;
      log(s, "HIDDEN_IN_LOCKER", { actorId: a.id, propId: p.id });
    } else if (kind === "crow") {
      requireThat(p.kind === "crow", "not crow");
      log(s,'CROW_STARTLED',{propId:p.id});
      gain(s, s.killerId, 1);
      enqueue(s, { kind: "BONUS", actorId: a.id });
    } else if (kind === "pallet") {
      requireThat(p.kind === "pallet", "not pallet");
      const path = s.paths[text(action, "pathId")];
      requireThat(
        path &&
          path.rooms.includes(a.room) &&
          (!path.wall || path.temporaryWall) &&
          !path.pallet &&
          !path.bearTrap &&
          !(s.entity?.kind === "path" && s.entity.id === path.id),
        "occupied/nonadjacent path",
      );
      path.pallet = true;
      p.removed = true;
      log(s, "PALLET_PLACED", { actorId: a.id, pathId: path.id });
    } else if (kind === "rescue") {
      requireThat(p.kind === "hook", "not hook");
      s.entity = { kind: "prop", id: p.id };
      const v = Object.values(s.actors).find((v) => v.hookId === p.id);
      if (v) {
        v.hookId = null;
        gain(s, a.id, 1);
        enqueue(
          s,
          { kind: "OPTIONAL_MOVE", actorId: a.id },
          { kind: "OPTIONAL_MOVE", actorId: v.id },
        );
      }
      signal(s, "AFTER_SABOTAGE", { actorId: a.id, propId: p.id });
    } else throw new RuleError("CHECK_REQUIRED", kind);
  } else {
    if (kind === "damage") {
      requireThat(p.kind === "generator", "cannot damage exit");
      p.progress = 0;
      log(s, "GENERATOR_DAMAGED", { actorId: a.id, propId: p.id });
      signal(s, "GENERATOR_DAMAGED", { actorId: a.id, propId: p.id });
    } else if (kind === "venerate") {
      requireThat(p.kind === "hex_totem", "not totem");
      gain(s, a.id, 2);
    } else if (kind === "scout") {
      requireThat(p.kind === "crow", "not crow");
      p.removed = true;
      gain(s, a.id, 1);
    } else if (kind === "search") {
      const v = Object.values(s.actors).find((v) => v.lockerId === p.id);
      requireThat(p.kind === "locker" && v, "must search occupied locker");
      beginRoll(s, v.id, "locker", p.id, { victimId: v.id });
    } else throw new RuleError("CHECK_REQUIRED", kind);
  }
}
function run(s: GameState) {
  let guard = 0;
  while (!s.winner && !s.window && !s.choice && s.jobs.length) {
    requireThat(++guard < 500, "continuation loop");
    const j = s.jobs.shift()!;
    if (j.kind === "SIGNAL") {
      const event = text(j, "event"),
        context = (j.context ?? {}) as Payload;
      log(s, event, context);
      const ids = [...orderedSurvivors(s), s.killerId];
      const eligible: Record<string, string[]> = {};
      for (const id of ids) {
        const a = actor(s, id);
        eligible[id] = active(a)
          ? a.perks.filter(
              (pid) =>
                !s.usedPerks.includes(pid) &&
                // 尚未实现的技能不弹出询问（只会显示"未实现"，白白多点一次）
                boardPerks.get(pid)!.status === "CONFIRMED" &&
                boardPerks.get(pid)!.bloodpoint_cost <= a.blood &&
                matches(s, id, pid, event, context),
            )
          : [];
      }
      const itemActors = itemResponders(s, event, context);
      const actors = ids.filter(
        (id) => eligible[id].length || itemActors.includes(id),
      );
      if (actors.length)
        s.window = {
          event,
          context,
          actors,
          index: 0,
          eligible,
          ...(itemActors.length ? { itemActors } : {}),
        };
    } else if (j.kind === "RESTORE_WINDOW")
      s.window = j.window as unknown as Window;
    else if (j.kind === "REVEAL_ROOM") {
      const id = text(j, "actorId"),
        room = text(j, "room");
      if (s.props.some((p) => p.room === room && !p.revealed && !p.removed))
        s.choice = { kind: "REVEAL", actorId: id, room };
    } else if (j.kind === "CHECK")
      beginRoll(
        s,
        text(j, "actorId"),
        text(j, "checkKind"),
        text(j, "targetId"),
        (j.data ?? {}) as Payload,
        j.die as "danger" | undefined,
      );
    else if (j.kind === "ROLL") {
      const r = s.roll!;
      requireThat(r.count >= 1 && r.count <= 4, "dice count");
      const faces = dice.dice.find((d) => d.id === r.die)!.faces;
      r.faces = Array.from({ length: r.count }, () => faces[random(s, 6)]);
      r.classes = r.faces.map(resultClass);
      r.failureCredit = r.faces.map((f) => f === 0);
      log(s, "DICE_ROLLED", {
        actorId: r.actorId,
        die: r.die,
        faces: r.faces,
        kind: r.kind,
      });
    } else if (j.kind === "KEEP") {
      const r = s.roll!;
      if (r.kind === "carry" || r.faces.length === 1) r.keep = 0;
      else s.choice = { kind: "KEEP", actorId: r.actorId };
    } else if (j.kind === "RESOLVE_ROLL") resolveRoll(s);
    else if (j.kind === "DO_INTERACTION") {
      if (s.pendingAction) performInteraction(s);
    } else if (j.kind === "TURN_INTERACT") {
      if (s.turn) s.turn.stage = "INTERACT";
    } else if (j.kind === "FINISH_TURN") finishTurn(s);
    else if (j.kind === "ADVANCE_AFTER_BONUS") {
      s.turn = null;
      s.cursor++;
      startTurn(s);
    } else if (j.kind === "DOCTOR_SHOCK") {
      const v = actor(s, text(j, "actorId"));
      if (v.room === j.room && active(v)) {
        if (v.blood >= 1)
          s.choice = { kind: "DOCTOR_SHOCK", actorId: v.id, room: j.room };
        else doctorEffect(s, v.id);
      }
    } else if (j.kind === "DRAW_ITEM") {
      const a = actor(s, text(j, "actorId"));
      requireThat(
        s.itemDeck.length,
        "item deck exhausted; no invented recycling",
      );
      const item = s.itemDeck.pop()!;
      log(s, "ITEM_DRAWN", { actorId: a.id, item });
      if (a.item)
        s.choice = { kind: "KEEP_ITEM", actorId: a.id, newItem: item };
      else a.item = item;
    } else if (j.kind === "START_ACTIONS") {
      s.turnOrder = [
        ...orderedSurvivors(s),
        ...s.plans[s.killerId].map(() => s.killerId),
      ];
      s.cursor = 0;
      startTurn(s);
    } else if (j.kind === "BONUS") grantBonus(s, text(j, "actorId"));
    else if (j.kind === "GAIN")
      gain(s, text(j, "actorId"), number(j, "amount"));
    else if (j.kind === "OPTIONAL_MOVE")
      s.choice = { kind: "OPTIONAL_MOVE", actorId: text(j, "actorId") };
    else if (j.kind === "MOVE_EFFECT")
      moveEffect(
        s,
        text(j, "actorId"),
        text(j, "pathId"),
        text(j, "to"),
        (j.opts ?? {}) as Parameters<typeof moveEffect>[4],
      );
    else if (j.kind === "HEALTHY") healthy(s, text(j, "actorId"));
    else if (j.kind === "CLEANUP") {
      for (const a of Object.values(s.actors))
        if (a.hookId) {
          sacrificeProgress(s, 1);
          if (s.winner) return;
        }
      s.entity = null;
      s.sealedCard = null;
      for (const p of Object.values(s.paths)) p.temporaryWall = false;
      s.firstPlayer = (s.firstPlayer + 1) % 4;
      // B01 p11 清理阶段属于本轮：记录在轮数加一之前
      log(s, "ROUND_CLEANUP");
      s.round++;
      s.usedPerks = [];
      s.killerBonusUsed = false;
      s.killerBonusForbidden = false;
      s.generatorsThisRound = 0;
      for (const a of Object.values(s.actors)) {
        a.powerUsed = false;
        s.hands[a.ownerId] =
          a.side === "killer"
            ? ["blue", "green", "red", "yellow", "wait"]
            : ["blue", "green", "red", "yellow"];
      }
      startPlanning(s);
    } else if (j.kind === "RESOLVE_ITEM") resolveItem(s, j);
    else if (j.kind === "CARRY_MOVE") carryMove(s, j);
    else if (j.kind === "TELEPORT")
      teleport(s, text(j, "actorId"), text(j, "to"), true);
    else if (j.kind === "CHAINSAW_HIT") {
      const v = actor(s, j.targetId);
      if (
        actor(s, s.killerId).room === j.room &&
        v.room === j.room &&
        active(v)
      )
        wounded(s, v.id);
    } else if (j.kind === "REMOVE_TEMP_WALL")
      s.paths[text(j, "pathId")].temporaryWall = false;
    else throw new RuleError("CHECK_REQUIRED", `continuation ${j.kind}`);
  }
}
function select(s: GameState, c: Command) {
  const choice = s.choice!;
  requireThat(c.actorId === choice.actorId, "choice owner");
  s.choice = null;
  if (choice.kind === "SPAWN_ROLL") {
    const map = maps.maps.find((m) => m.id === s.mapId)!;
    const a = actor(s, choice.actorId);
    const face = random(s, 6);
    const n = map.nodes.find((n) => (n.spawn_faces as number[]).includes(face));
    requireThat(n, "missing spawn face");
    a.room = n.id;
    log(s, "SPAWNED", { actorId: a.id, face, room: n.id });
    const order = choice.order as string[],
      index = (choice.index as number) + 1;
    if (index < order.length)
      s.choice = { kind: "SPAWN_ROLL", actorId: order[index], order, index };
    else startPlanning(s);
    return;
  }
  if (choice.kind === "REVEAL") {
    const p = prop(s, text(c, "propId"));
    requireThat(
      p.room === choice.room && !p.revealed,
      "reveal in entered room",
    );
    reveal(s, p.id, choice.actorId);
  } else if (choice.kind === "KEEP") {
    const i = number(c, "index");
    requireThat(s.roll && i >= 0 && i < s.roll.faces.length, "keep index");
    s.roll.keep = i;
  } else if (choice.kind === "DOCTOR_SHOCK") {
    requireThat(c.option === "pay" || c.option === "effect", "pay/effect choice");
    if (c.option === "pay") {
      spend(s, choice.actorId, 1);
      log(s, "DOCTOR_SHOCK_PAID", { actorId: choice.actorId });
    } else doctorEffect(s, choice.actorId);
  } else if (choice.kind === "KEEP_ITEM") {
    const a = actor(s, choice.actorId);
    requireThat(c.option === "old" || c.option === "new", "keep item option");
    const item = text(choice, "newItem");
    if (c.option === "new") {
      s.itemDiscard.push(a.item!);
      a.item = item;
    } else s.itemDiscard.push(item);
  } else if (choice.kind === "BONUS_CARD") {
    const a = actor(s, choice.actorId);
    s.turn!.card = card(s, a, c.card);
    s.turn!.stage = "MOVE";
    enqueue(
      s,
      { kind: "SIGNAL", event: "OWN_TURN_START", context: { actorId: a.id } },
      { kind: "SIGNAL", event: "BEFORE_OWN_MOVE", context: { actorId: a.id } },
    );
  } else if (choice.kind === "OPTIONAL_MOVE") {
    if (c.pathId !== undefined)
      moveEffect(s, choice.actorId, text(c, "pathId"), text(c, "to"));
  } else if (choice.kind === "CARRY") {
    const victimId = text(choice, "victimId"),
      count = number(c, "dice");
    requireThat(
      count >= 0 && count <= 4 && Array.isArray(c.route),
      "carry dice/route",
    );
    const route = c.route as Array<{ pathId: string; to: string }>;
    requireThat(route.length <= count, "carry distance");
    let room = actor(s, s.killerId).room!;
    for (const step of route) {
      requireThat(
        typeof step.pathId === "string" &&
          typeof step.to === "string" &&
          legalRoutes(s, room, "killer", undefined, true).some(
            (p) => p.pathId === step.pathId && p.to === step.to,
          ),
        "carry route blocked/reversed",
      );
      room = step.to;
    }
    if (count === 0) {
      log(s, "ESCAPED", { actorId: victimId, reason: "no_distance" });
      return;
    }
    beginRoll(
      s,
      victimId,
      "carry",
      victimId,
      { victimId, route },
      "skill_check",
      count,
    );
  } else if (choice.kind === "PHANTASM") {
    if (c.option === "blood") gain(s, s.killerId, 1);
    else {
      requireThat(c.option === "teleport", "phantasm option");
      const v = actor(s, text(c, "targetId"));
      requireThat(
        v.side === "survivor" && active(v) && v.room === choice.room,
        "phantasm interaction target",
      );
      spend(s, s.killerId, number(choice, "price"));
      requireThat(
        c.action === "attack" || c.action === "pickup",
        "phantasm interaction: attack/pickup",
      );
      s.pendingAction = {
        actorId: s.killerId,
        action: c.action,
        targetId: v.id,
        phantasm: true,
      };
      enqueue(s, { kind: "DO_INTERACTION" });
      teleport(s, s.killerId, text(choice, "room"));
    }
  } else if (choice.kind === "PHANTASM_TARGET") {
    const next = {
      actorId: s.killerId,
      action: text(c, "action"),
      targetId: text(c, "targetId"),
      phantasm: true,
    };
    requireThat(
      phantasmTargets(s).some(
        (t) => t.action === next.action && t.targetId === next.targetId,
      ),
      "phantasm retarget",
    );
    s.pendingAction = next;
    log(s, "INTERACTION_REVISED", {
      actorId: next.actorId,
      action: next.action,
      targetId: next.targetId,
    });
    enqueue(s, { kind: "DO_INTERACTION" });
  } else if (choice.kind === "MAP_REVEAL") selectMapReveal(s, choice, c);
  else if (choice.kind === "CARRY_REROUTE") {
    // 每次走一步；不选路线表示停下
    const victimId = text(choice, "victimId"),
      budget = number(choice, "budget");
    if (c.pathId === undefined)
      enqueue(s, { kind: "CARRY_MOVE", victimId, route: [], budget: 0 });
    else {
      const step = { pathId: text(c, "pathId"), to: text(c, "to") };
      requireThat(
        legalRoutes(s, actor(s, s.killerId).room!, "killer", undefined, true).some(
          (p) => p.pathId === step.pathId && p.to === step.to,
        ),
        "carry route blocked/reversed",
      );
      enqueue(s, { kind: "CARRY_MOVE", victimId, route: [step], budget, reroute: true });
    }
  } else if (choice.kind === "REPLAN") {
    // 幽灵「穷追不舍」：被选中的逃生者从手牌中背面朝上放一张新牌
    const a = actor(s, choice.actorId);
    s.plans[a.id] = [card(s, a, c.card)];
    s.publicPlans = s.publicPlans.filter((x) => x !== a.id);
    log(s, "PLAN_REPLACED", { actorId: a.id });
  }
  else throw new RuleError("CHECK_REQUIRED", `choice ${choice.kind}`);
}
export function reduce(state: GameState, c: Command): GameState {
  requireThat(c && typeof c.type === "string", "command type");
  if (
    c.type === "USE_PERK" &&
    boardPerks.get(String(c.perkId))?.status === "CHECK_REQUIRED"
  )
    throw new RuleError("CHECK_REQUIRED", `${c.perkId}: Phase4`);
  requireThat(!state.winner, "game already ended");
  const s: GameState = structuredClone({ ...state, events: [] });
  s.events = [...state.events];
  if (c.type === "SELECT") {
    requireThat(s.choice && !s.window, "no choice");
    select(s, c);
    run(s);
    return s;
  }
  if (c.type === "USE_ITEM") {
    useItem(s, c);
    run(s);
    return s;
  }
  requireThat(!s.choice, "pending choice must resolve");
  if (c.type === "PASS" || c.type === "USE_PERK") {
    const w = s.window;
    requireThat(w && c.actorId === w.actors[w.index], "response order");
    if (c.type === "PASS") {
      w.index++;
      if (w.index === w.actors.length) s.window = null;
    } else {
      const id = text(c, "perkId");
      requireThat(
        w.eligible[c.actorId!].includes(id) && !s.usedPerks.includes(id),
        "perk not available",
      );
      const p = boardPerks.get(id)!;
      if (p.status !== "CONFIRMED")
        throw new RuleError("CHECK_REQUIRED", `${id}: Q11 Phase4`);
      const a = actor(s, c.actorId);
      requireThat(active(a), "cannot use perk while hidden/hooked");
      spend(s, a.id, p.bloodpoint_cost);
      s.usedPerks.push(id);
      s.window = null;
      // 用完之后，如果这个人在这个时机已经没有别的可用技能/物品，就不再问他第二遍
      const next = afterUse(s, w, a.id, id);
      if (next) enqueue(s, { kind: "RESTORE_WINDOW", window: next });
      applyAbility(s, a.id, id, c, w.context);
      log(
        s,
        "PERK_USED",
        { actorId: a.id, perkId: id, sourceRef: p.source_ref },
        p.source_ref,
      );
    }
    run(s);
    return s;
  }
  if (c.type === "REVISE_INTERACTION") {
    requireThat(
      s.window?.event === "WOULD_INTERACT" &&
        s.window.actors[s.window.index] === c.actorId &&
        s.pendingAction,
      "only the current before-interaction responder may revise its target",
    );
    const next: Payload = {
      ...s.pendingAction,
      ...c,
      actorId: s.pendingAction.actorId,
    };
    validateInteraction(s, next);
    s.pendingAction = next;
    log(s, "INTERACTION_REVISED", {
      actorId: next.actorId,
      action: next.action,
      targetId: next.targetId,
    });
    return s;
  }
  requireThat(!s.window, "response window must resolve");
  if (c.type === "SETUP_REVEAL") {
    requireThat(
      s.phase === "SETUP" && c.actorId === s.survivors[s.setupIndex],
      "setup reveal order",
    );
    reveal(s, text(c, "propId"), c.actorId!);
    s.setupIndex++;
    if (s.setupIndex === 4) {
      // B01 p6：每个角色掷黑骰决定出生空间。从先手玩家起按座位顺序（逃生者依次，最后杀手），
      // 每人自己点"掷骰"（用户 2026-10-20 要求）。
      const order = [...orderedSurvivors(s), s.killerId];
      s.choice = { kind: "SPAWN_ROLL", actorId: order[0], order, index: 0 };
    }
  } else if (c.type === "PLAN") {
    requireThat(s.phase === "PLANNING", "not planning");
    const a = actor(s, c.actorId);
    requireThat(
      !a.hookId && !s.plans[a.id] && Array.isArray(c.cards),
      "plan unavailable",
    );
    requireThat(
      s.publicPlans.every((id) => !!s.plans[id]) ||
        s.publicPlans.includes(a.id),
      "forced public plan must precede other plans",
    );
    const cards = c.cards as Card[];
    requireThat(
      cards.length === (a.side === "killer" ? 2 : 1),
      "wrong plan count",
    );
    s.plans[a.id] = cards.map((v) => card(s, a, v));
    log(s, "PLAN_SUBMITTED", {
      actorId: a.id,
      ...(s.publicPlans.includes(a.id) ? { cards } : {}),
    });
    if (
      Object.values(s.actors)
        .filter((a) => !a.hookId)
        .every((a) => s.plans[a.id])
    )
      enqueue(
        s,
        { kind: "SIGNAL", event: "PLANNING_END", context: {} },
        { kind: "START_ACTIONS" },
      );
  } else if (c.type === "MOVE") {
    const t = s.turn;
    requireThat(
      s.phase === "ACTING" &&
        t &&
        t.actorId === c.actorId &&
        t.stage === "MOVE",
      "not actor move",
    );
    const a = actor(s, c.actorId);
    a.lockerId = null;
    const sealed =
      a.side === "survivor" && !!s.sealedCard && t.card === s.sealedCard;
    const routes = sealed ? [] : legalRoutes(s, a.room!, a.side, t.card!);
    t.stage = "INTERACT";
    enqueue(s, { kind: "TURN_INTERACT" });
    if (sealed) {
      // 妖巫「第三封印」：无法移动，也就不能交互（Q11 用户裁定：持续整轮，含额外回合）
      t.interactionSpent = true;
      log(s, "SEALED_MOVE_FAILED", { actorId: a.id, card: t.card });
    } else if (t.card === "wait") log(s, "WAITED", { actorId: a.id });
    else if (!routes.length) {
      t.interactionSpent = true;
      log(s, "MOVEMENT_FAILED", { actorId: a.id, card: t.card });
    } else {
      requireThat(
        routes.some((r) => r.pathId === c.pathId && r.to === c.to),
        "must make legal planned move",
      );
      moveEffect(s, a.id, text(c, "pathId"), text(c, "to"), { normal: true });
    }
  } else if (c.type === "INTERACT") {
    const t = s.turn;
    requireThat(
      s.phase === "ACTING" &&
        t &&
        t.actorId === c.actorId &&
        t.stage === "INTERACT" &&
        !t.interactionSpent,
      "no interaction",
    );
    // 手电筒阻止交互机会，也就阻止了占用交互机会的杀手力量（用户裁定 2026-10-20，推翻 Q13）
    requireThat(!t.noInteract, "flashlight: killer cannot interact this turn");
    validateInteraction(s, c);
    t.interactionSpent = true;
    t.interacted = true;
    s.pendingAction = { ...c, actorId: c.actorId, action: text(c, "action") };
    enqueue(
      s,
      {
        kind: "SIGNAL",
        event: "WOULD_INTERACT",
        context: { actorId: c.actorId },
      },
      { kind: "DO_INTERACTION" },
    );
  } else if (c.type === "END_TURN") {
    const t = s.turn;
    requireThat(
      s.phase === "ACTING" &&
        t &&
        t.actorId === c.actorId &&
        t.stage === "INTERACT",
      "not turn end",
    );
    t.stage = "DONE";
    enqueue(
      s,
      {
        kind: "SIGNAL",
        event: "OWN_TURN_END",
        context: { actorId: t.actorId },
      },
      { kind: "FINISH_TURN" },
    );
  } else if (c.type === "KILLER_BONUS") {
    requireThat(
      s.phase === "BONUS_OFFER" && c.actorId === s.killerId,
      "not killer bonus offer",
    );
    if (c.accept) {
      const k = actor(s, s.killerId);
      const cost = Math.max(
        0,
        4 -
          (s.killerId === "doctor"
            ? Object.values(s.actors).filter((a) => a.madness).length
            : 0),
      );
      spend(s, k.id, cost);
      enqueue(s, { kind: "ADVANCE_AFTER_BONUS" });
      grantBonus(s, k.id);
    } else {
      s.turn = null;
      s.cursor++;
      startTurn(s);
    }
  } else throw new RuleError("CHECK_REQUIRED", `command ${c.type}`);
  run(s);
  return s;
}
