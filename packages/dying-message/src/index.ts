import data from "./roles.json" with { type: "json" };
export const roles = data.roles;
export const instances = data.instances;
export type Phase =
  | "NIGHT_PREPARATION"
  | "KILLER_SELECTION"
  | "VICTIM_EVIDENCE"
  | "SPECIAL_INFORMATION"
  | "KILLER_FAKE_EVIDENCE"
  | "INVESTIGATION"
  | "FIRST_VOTE"
  | "DEFENSE"
  | "SECOND_VOTE"
  | "ROUND_END"
  | "GAME_OVER";
export interface Player {
  id: string;
  name: string;
  roleId: string;
  alive: boolean;
  seat: number;
}
export interface Evidence {
  round: number;
  victims: string[];
  cards: string[];
  truth: string[];
  revealed: Record<string, boolean>;
}
export interface Death {
  deathId: string;
  playerId: string;
  cause: string;
  round: number;
  phase: Phase;
  sourceCharacter: string;
  triggeredEffects: string[];
}
export interface DMState {
  players: Player[];
  seed: number;
  round: number;
  phase: Phase;
  pool: string[];
  deck: string[];
  discard: string[];
  history: Evidence[];
  truth: string[];
  votes: Record<string, string>;
  voteResults: {
    round: number;
    ballot: number;
    tally: Record<string, number>;
  }[];
  suspect: string | null;
  winner: "INNOCENT" | "GUILTY" | null;
  proposals: Record<string, string[]>;
  nightVictims: string[];
  directVictims: string[];
  protected: Record<string, string>;
  soulmate: string | null;
  skipNights: number;
  ack: string[];
  forensics: string[];
  deaths: Death[];
  speaker: string | null;
  speechDone: string[];
  deadline: number | null;
  hostageWipe: boolean;
}
export interface DMCommand {
  type: string;
  targets?: string[];
  cards?: string[];
  target?: string;
  card?: string;
}
const role = (id: string) => {
  const r = roles.find((r) => r.roleId === id);
  if (!r) throw Error("未知角色");
  return r;
};
export const isKiller = (p: Player) => role(p.roleId).canKill;
const living = (s: DMState) => s.players.filter((p) => p.alive);
const killers = (s: DMState) => living(s).filter(isKiller);
function requireRule(ok: unknown, msg = "当前不能执行此操作"): asserts ok {
  if (!ok) throw Error(msg);
}
function random(s: DMState) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
function shuffle<T>(s: DMState, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function defaultPool(n: number) {
  requireRule(Number.isInteger(n) && n >= 4 && n <= 10, "支持4–10人");
  const k = n >= 8 ? 2 : 1,
    extra = n === 6 || n === 7 || n >= 9 ? 1 : 0;
  return [
    ...Array(k).fill("killer"),
    ...Array(extra).fill("accomplice"),
    ...Array(n - k - extra).fill("civilian"),
  ] as string[];
}
export function validatePool(pool: string[], n: number) {
  requireRule(Array.isArray(pool) && pool.length === n, "角色数量必须等于人数");
  const standard = defaultPool(n);
  for (const r of roles)
    requireRule(
      pool.filter((id) => id === r.roleId).length <= r.count,
      "角色超过卡片数量",
    );
  pool.forEach(role);
  requireRule(
    pool.filter((id) => role(id).canKill).length ===
      standard.filter((id) => role(id).canKill).length,
    "杀手人数须符合人数配置",
  );
  requireRule(
    pool.filter((id) => role(id).faction === "GUILTY").length ===
      standard.filter((id) => role(id).faction === "GUILTY").length,
    "有罪阵营人数须符合人数配置",
  );
}
export function createDM(
  players: { id: string; name: string }[],
  cards: string[],
  seed: number,
  assigned?: string[],
): DMState {
  const pool = assigned ?? defaultPool(players.length);
  validatePool(pool, players.length);
  requireRule(
    new Set(players.map((p) => p.id)).size === players.length,
    "玩家重复",
  );
  requireRule(
    cards.length >= 9 && new Set(cards).size === cards.length,
    "证据库不足或重复",
  );
  const s: DMState = {
    players: players.map((p, i) => ({
      ...p,
      roleId: pool[i],
      seat: i + 1,
      alive: true,
    })),
    seed: seed >>> 0,
    round: 1,
    phase: "NIGHT_PREPARATION",
    pool: [],
    deck: [],
    discard: [],
    history: [],
    truth: [],
    votes: {},
    voteResults: [],
    suspect: null,
    winner: null,
    proposals: {},
    nightVictims: [],
    directVictims: [],
    protected: {},
    soulmate: null,
    skipNights: 0,
    ack: [],
    forensics: [],
    deaths: [],
    speaker: null,
    speechDone: [],
    deadline: null,
    hostageWipe: false,
  };
  s.deck = shuffle(s, [...cards]);
  draw(s);
  prepare(s);
  return s;
}
export function randomRoles(pool: string[], seed: number) {
  const s = { seed } as DMState;
  return shuffle(s, [...pool]);
}
function draw(s: DMState) {
  while (s.pool.length < 9) {
    if (!s.deck.length) s.deck = shuffle(s, s.discard.splice(0));
    requireRule(s.deck.length, "证据牌已耗尽，无法补足9张");
    s.pool.push(s.deck.pop()!);
  }
}
function preparationActors(s: DMState) {
  const soul = living(s).find((p) => p.roleId === "soulmate");
  if (s.round === 1 && soul && !s.soulmate) return [soul.id];
  return living(s)
    .filter(
      (p) => p.roleId === "wonder-dog" && !Object.hasOwn(s.protected, p.id),
    )
    .map((p) => p.id);
}
function prepare(s: DMState) {
  s.protected = {};
  s.proposals = {};
  s.ack = [];
  s.nightVictims = [];
  s.directVictims = [];
  s.truth = [];
  s.speechDone = [];
  s.speaker = null;
  s.deadline = null;
  if (s.skipNights > 0) {
    s.skipNights--;
    discussion(s, 0);
  } else {
    s.phase = preparationActors(s).length
      ? "NIGHT_PREPARATION"
      : "KILLER_SELECTION";
  }
}
function death(s: DMState, ids: string[], cause: string) {
  let queue = ids.map((id) => ({ id, cause }));
  const processed = new Set<string>();
  while (queue.length) {
    const batch = queue;
    queue = [];
    const aliveBefore = living(s);
    for (const item of batch) {
      const p = s.players.find((p) => p.id === item.id);
      if (!p || !p.alive || processed.has(p.id)) continue;
      processed.add(p.id);
      p.alive = false;
      const e: Death = {
        deathId: `${s.round}-${s.deaths.length + 1}`,
        playerId: p.id,
        cause: item.cause,
        round: s.round,
        phase: s.phase,
        sourceCharacter: p.roleId,
        triggeredEffects: [],
      };
      s.deaths.push(e);
      if (cause === "MURDER") s.nightVictims.push(p.id);
      if (item.cause === "MURDER") {
        s.directVictims.push(p.id);
        if (p.roleId === "muay-thai") {
          s.skipNights++;
          e.triggeredEffects.push("SKIP_NIGHT");
        }
      }
      if (
        p.roleId === "forensic-scientist" &&
        s.history.some((h) => h.round === s.round - 1)
      )
        s.forensics.push(p.id);
      if (p.roleId === "hostage") {
        e.triggeredEffects.push("HOSTAGE");
        const index = aliveBefore.findIndex((x) => x.id === p.id);
        for (const delta of [-1, 1]) {
          const next =
            aliveBefore[
              (index + delta + aliveBefore.length) % aliveBefore.length
            ];
          if (next && next.id !== p.id)
            queue.push({ id: next.id, cause: "HOSTAGE" });
        }
      }
      const soul = s.players.find((p) => p.roleId === "soulmate");
      if (soul && s.soulmate && (p.id === soul.id || p.id === s.soulmate)) {
        queue.push({
          id: p.id === soul.id ? s.soulmate : soul.id,
          cause: "SOULMATE",
        });
        e.triggeredEffects.push("SOULMATE");
      }
    }
  }
  if (
    !living(s).length &&
    s.deaths.some(
      (d) => d.round === s.round && d.triggeredEffects.includes("HOSTAGE"),
    )
  )
    s.hostageWipe = true;
}
function win(s: DMState) {
  if (s.hostageWipe) s.winner = "GUILTY";
  else if (!killers(s).length) s.winner = "INNOCENT";
  else if (
    killers(s).length >=
    living(s).filter((p) => role(p.roleId).faction === "INNOCENT").length
  )
    s.winner = "GUILTY";
  if (s.winner) {
    s.phase = "GAME_OVER";
    s.deadline = null;
    s.speaker = null;
    return true;
  }
  return false;
}
function discussion(s: DMState, now: number) {
  if (win(s)) return;
  s.phase = "INVESTIGATION";
  s.speechDone = [];
  s.speaker = living(s)[0]?.id ?? null;
  s.deadline = s.speaker && !s.forensics.length ? now + 300000 : null;
}
function consensus(
  s: DMState,
  id: string,
  choices: string[],
  actors: string[],
) {
  requireRule(actors.includes(id), "不是你的行动窗口");
  s.proposals[id] = [...choices].sort();
  const key = JSON.stringify(s.proposals[id]);
  if (!actors.every((a) => JSON.stringify(s.proposals[a]) === key))
    return false;
  s.proposals = {};
  return true;
}
function counts(s: DMState) {
  return {
    trueCount:
      1 +
      s.directVictims.filter(
        (id) => s.players.find((p) => p.id === id)?.roleId === "noble",
      ).length,
    fakeCount: Math.max(
      0,
      2 +
        killers(s).filter((p) => p.roleId === "professional-killer").length -
        s.directVictims.filter(
          (id) => s.players.find((p) => p.id === id)?.roleId === "celebrity",
        ).length,
    ),
  };
}
function infoActors(s: DMState) {
  return living(s)
    .filter((p) => ["private-detective", "mastermind"].includes(p.roleId))
    .sort(
      (a, b) =>
        Number(a.roleId === "mastermind") - Number(b.roleId === "mastermind"),
    )
    .map((p) => p.id);
}
function publish(s: DMState, cards: string[], now: number) {
  s.history.push({
    round: s.round,
    victims: [...s.nightVictims],
    cards: shuffle(s, [...s.truth, ...cards]),
    truth: [...s.truth],
    revealed: {},
  });
  for (const c of [...s.truth, ...cards]) {
    s.pool = s.pool.filter((x) => x !== c);
    s.discard = s.discard.filter((x) => x !== c);
  }
  discussion(s, now);
}
function ballot(s: DMState) {
  const tally: Record<string, number> = {};
  Object.values(s.votes).forEach((id) => (tally[id] = (tally[id] ?? 0) + 1));
  s.voteResults.push({
    round: s.round,
    ballot: s.phase === "FIRST_VOTE" ? 1 : 2,
    tally,
  });
  return (
    Object.keys(tally).find((id) => tally[id] > living(s).length / 2) ?? null
  );
}
export function reduceDM(
  original: DMState,
  actor: string,
  c: DMCommand,
  now = 0,
): DMState {
  const s = structuredClone(original),
    p = s.players.find((p) => p.id === actor);
  requireRule(p, "玩家不存在");
  requireRule(c && typeof c.type === "string", "无效命令");
  const a = actorsDM(s);
  switch (c.type) {
    case "PREPARE": {
      requireRule(s.phase === "NIGHT_PREPARATION" && a.includes(actor));
      const target = s.players.find((p) => p.id === c.target);
      requireRule(target?.alive && target.id !== actor, "目标无效");
      if (p.roleId === "soulmate") s.soulmate = target.id;
      else {
        requireRule(target.roleId !== "wonder-dog", "不能保护其他名犬");
        s.protected[actor] = target.id;
      }
      if (!preparationActors(s).length) s.phase = "KILLER_SELECTION";
      break;
    }
    case "KILL": {
      requireRule(s.phase === "KILLER_SELECTION");
      const targets = c.targets;
      requireRule(
        Array.isArray(targets) &&
          targets.length ===
            Math.min(
              1 + killers(s).filter((p) => p.roleId === "serial-killer").length,
              living(s).length - 1,
            ) &&
          new Set(targets).size === targets.length,
        "击杀人数不符",
      );
      requireRule(
        targets.every(
          (id) =>
            s.players.some((p) => p.id === id && p.alive) &&
            !Object.values(s.protected).includes(id),
        ),
        "目标无效或受到保护",
      );
      if (
        !consensus(
          s,
          actor,
          targets,
          killers(s).map((p) => p.id),
        )
      )
        break;
      death(s, targets, "MURDER");
      if (!killers(s).length || s.hostageWipe) {
        win(s);
        break;
      }
      s.phase = "VICTIM_EVIDENCE";
      break;
    }
    case "TRUE": {
      requireRule(s.phase === "VICTIM_EVIDENCE");
      const cards = c.cards;
      requireRule(
        Array.isArray(cards) &&
          new Set(cards).size === cards.length &&
          cards.length === counts(s).trueCount,
        "真遗言数量不符",
      );
      const janitor = s.directVictims.some(
        (id) => s.players.find((p) => p.id === id)?.roleId === "janitor",
      );
      requireRule(
        cards.every(
          (id) => s.pool.includes(id) || (janitor && s.discard.includes(id)),
        ),
        "无效证据",
      );
      if (!consensus(s, actor, cards, s.nightVictims)) break;
      s.truth = [...cards];
      s.ack = [];
      s.phase = infoActors(s).length
        ? "SPECIAL_INFORMATION"
        : "KILLER_FAKE_EVIDENCE";
      s.deadline = s.phase === "SPECIAL_INFORMATION" ? now + 5000 : null;
      if (s.phase === "KILLER_FAKE_EVIDENCE" && counts(s).fakeCount === 0)
        publish(s, [], now);
      break;
    }
    case "INFO_ACK":
      requireRule(s.phase === "SPECIAL_INFORMATION" && a.includes(actor));
      s.ack.push(actor);
      s.deadline = now + 5000;
      if (infoActors(s).every((id) => s.ack.includes(id))) {
        s.phase = "KILLER_FAKE_EVIDENCE";
        s.deadline = null;
        if (!counts(s).fakeCount) publish(s, [], now);
      }
      break;
    case "FAKE": {
      requireRule(s.phase === "KILLER_FAKE_EVIDENCE");
      const cards = c.cards;
      requireRule(
        Array.isArray(cards) &&
          cards.length === counts(s).fakeCount &&
          new Set(cards).size === cards.length,
        "假遗言数量不符",
      );
      requireRule(
        cards.every((id) => s.pool.includes(id) && !s.truth.includes(id)),
        "无效证据",
      );
      if (
        consensus(
          s,
          actor,
          cards,
          killers(s).map((p) => p.id),
        )
      )
        publish(s, cards, now);
      break;
    }
    case "FORENSIC": {
      requireRule(
        ["INVESTIGATION", "ROUND_END"].includes(s.phase) &&
          s.forensics.includes(actor),
      );
      const h = s.history.find((h) => h.round === s.round - 1);
      requireRule(
        h && c.card && h.cards.includes(c.card),
        "只能鉴定上一轮死者遗言",
      );
      h.revealed[c.card] = h.truth.includes(c.card);
      s.forensics = s.forensics.filter((id) => id !== actor);
      if (!s.forensics.length) {
        if (s.phase === "INVESTIGATION") s.deadline = now + 300000;
        else win(s);
      }
      break;
    }
    case "SPEAK_END":
    case "SPEAK_TIMEOUT": {
      requireRule(
        s.phase === "INVESTIGATION" &&
          s.speaker === actor &&
          !s.forensics.length,
      );
      if (c.type === "SPEAK_TIMEOUT")
        requireRule(s.deadline !== null && now >= s.deadline, "尚未到时");
      s.speechDone.push(actor);
      s.speaker =
        living(s).find((p) => !s.speechDone.includes(p.id))?.id ?? null;
      s.deadline = s.speaker ? now + 300000 : null;
      if (!s.speaker) {
        s.phase = "FIRST_VOTE";
        s.votes = {};
      }
      break;
    }
    case "VOTE_START":
      requireRule(
        s.phase === "INVESTIGATION" &&
          !s.speaker &&
          !s.forensics.length &&
          p.alive,
      );
      s.phase = "FIRST_VOTE";
      s.votes = {};
      break;
    case "VOTE": {
      requireRule(
        ["FIRST_VOTE", "SECOND_VOTE"].includes(s.phase) && p.alive,
        "不能投票",
      );
      requireRule(
        c.target && s.players.some((p) => p.alive && p.id === c.target),
        "投票目标无效",
      );
      requireRule(!Object.hasOwn(s.votes, actor), "已投票");
      s.votes[actor] = c.target;
      if (Object.keys(s.votes).length !== living(s).length) break;
      const majority = ballot(s);
      if (s.phase === "FIRST_VOTE") {
        s.suspect = majority;
        s.phase = majority ? "DEFENSE" : "ROUND_END";
      } else {
        if (majority && majority === s.suspect)
          death(s, [majority], "EXECUTION");
        s.phase = "ROUND_END";
        if (!s.forensics.length) win(s);
      }
      s.votes = {};
      break;
    }
    case "DEFENSE_END":
      requireRule(s.phase === "DEFENSE" && s.suspect === actor);
      s.phase = "SECOND_VOTE";
      s.votes = {};
      break;
    case "NEXT":
      requireRule(s.phase === "ROUND_END" && !s.forensics.length && p.alive);
      if (win(s)) break;
      s.discard.push(...s.pool);
      s.pool = [];
      draw(s);
      s.round++;
      prepare(s);
      if ((s.phase as Phase) === "INVESTIGATION") discussion(s, now);
      break;
    default:
      throw Error("未知命令");
  }
  return s;
}
export function actorsDM(s: DMState): string[] {
  switch (s.phase) {
    case "NIGHT_PREPARATION":
      return preparationActors(s);
    case "KILLER_SELECTION":
    case "KILLER_FAKE_EVIDENCE":
      return killers(s).map((p) => p.id);
    case "VICTIM_EVIDENCE":
      return s.nightVictims;
    case "SPECIAL_INFORMATION":
      return infoActors(s)
        .filter((id) => !s.ack.includes(id))
        .slice(0, 1);
    case "INVESTIGATION":
      return s.forensics.length ? s.forensics : s.speaker ? [s.speaker] : [];
    case "FIRST_VOTE":
    case "SECOND_VOTE":
      return living(s)
        .filter((p) => !Object.hasOwn(s.votes, p.id))
        .map((p) => p.id);
    case "DEFENSE":
      return s.suspect ? [s.suspect] : [];
    case "ROUND_END":
      return s.forensics.length ? s.forensics : living(s).map((p) => p.id);
    default:
      return [];
  }
}
export function viewDM(s: DMState, id: string) {
  const me = s.players.find((p) => p.id === id);
  requireRule(me, "未入座");
  const active = actorsDM(s).includes(id);
  const night = [
    "NIGHT_PREPARATION",
    "KILLER_SELECTION",
    "VICTIM_EVIDENCE",
    "SPECIAL_INFORMATION",
    "KILLER_FAKE_EVIDENCE",
  ].includes(s.phase);
  const history = s.history.map((h) => ({
    round: h.round,
    victims: h.victims,
    cards: h.cards,
    revealed: s.winner
      ? Object.fromEntries(h.cards.map((c) => [c, h.truth.includes(c)]))
      : h.revealed,
  }));
  const canSeeKillers =
    isKiller(me) || s.nightVictims.includes(id) || !!s.winner;
  const showTruth =
    (s.phase === "SPECIAL_INFORMATION" && active) ||
    (s.phase === "KILLER_FAKE_EVIDENCE" && active);
  return {
    round: s.round,
    phase: s.phase,
    winner: s.winner,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      alive:
        night && p.id !== id
          ? !s.deaths.some((d) => d.playerId === p.id && d.round < s.round)
          : p.alive,
      ...((!p.alive && !night) || s.winner || p.id === id
        ? { roleId: p.roleId }
        : {}),
    })),
    me: { id, roleId: me.roleId, alive: me.alive, fated: s.soulmate === id },
    active,
    waiting: active ? "轮到你了" : "等待其他玩家完成操作",
    killers: canSeeKillers
      ? s.players
          .filter(isKiller)
          .filter((p) => p.alive || s.nightVictims.includes(p.id))
          .map((p) => ({ id: p.id, name: p.name, seat: p.seat }))
      : [],
    pool:
      s.phase === "VICTIM_EVIDENCE" &&
      active &&
      s.directVictims.some(
        (id) => s.players.find((p) => p.id === id)?.roleId === "janitor",
      )
        ? [...s.pool, ...s.discard]
        : s.pool.filter(
            (c) =>
              !(
                s.phase === "KILLER_FAKE_EVIDENCE" &&
                active &&
                s.truth.includes(c)
              ),
          ),
    trueCards: showTruth ? s.truth : [],
    teamChoices:
      active &&
      ["KILLER_SELECTION", "VICTIM_EVIDENCE", "KILLER_FAKE_EVIDENCE"].includes(
        s.phase,
      )
        ? Object.entries(s.proposals).map(([playerId, choices]) => ({
            playerId,
            choices,
          }))
        : [],
    selection: active ? (s.proposals[id] ?? []) : [],
    required:
      s.phase === "KILLER_SELECTION"
        ? Math.min(
            1 + killers(s).filter((p) => p.roleId === "serial-killer").length,
            living(s).length - 1,
          )
        : s.phase === "VICTIM_EVIDENCE"
          ? counts(s).trueCount
          : counts(s).fakeCount,
    legalTargets: active
      ? s.players
          .filter(
            (p) =>
              p.alive &&
              (s.phase !== "NIGHT_PREPARATION" ||
                (p.id !== id &&
                  (me.roleId !== "wonder-dog" || p.roleId !== "wonder-dog"))) &&
              (s.phase !== "KILLER_SELECTION" ||
                !Object.values(s.protected).includes(p.id)),
          )
          .map((p) => p.id)
      : [],
    history,
    suspect: s.suspect,
    speaker: s.speaker,
    deadline: s.deadline,
    speechDone: s.speechDone,
    voted: Object.keys(s.votes).length,
    myVote: s.votes[id] ?? null,
    voteResults: s.voteResults,
    forensic: active && s.forensics.includes(id),
    forensicCards:
      active && s.forensics.includes(id)
        ? (s.history.find((h) => h.round === s.round - 1)?.cards ?? [])
        : [],
  };
}
export type DMView = ReturnType<typeof viewDM>;
