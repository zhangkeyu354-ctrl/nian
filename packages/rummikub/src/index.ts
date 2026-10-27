export type Color = "R" | "B" | "O" | "K";
export type RKVariant = "classic" | "xp";
export interface Tile {
  id: string;
  color: Color | null;
  value: number | null;
}
export interface Interpretation {
  kind: "run" | "group";
  score: number;
  jokers: Record<string, { color: Color; value: number }>;
}
export interface Meld {
  id: string;
  tiles: string[];
}
export interface Draft {
  rack: string[];
  board: Meld[];
  retrieved: string[];
}
export interface Player {
  name: string;
  rack: string[];
  opened: boolean;
  score: number;
  wins: number;
}
export interface Result {
  blocked: boolean;
  winners: number[];
  scores: number[];
  rackPoints: number[];
}
export interface RKState {
  variant: RKVariant;
  phase: "PLAYING" | "FINISHED";
  players: Player[];
  pool: string[];
  board: Meld[];
  current: number;
  seed: number;
  random: number;
  startDraw: { seat: number; tile: string; round: number }[];
  minutes: 0 | 1 | 2;
  deadline: number | null;
  game: number;
  nextMeld: number;
  passes: number;
  turn: Draft;
  draft: Draft;
  undo: Draft[];
  redo: Draft[];
  seq: Record<string, number>;
  assertions: boolean;
  result: Result | null;
  lastAction: null | {
    type: string;
    seat: number;
    count: number;
    error?: string;
  };
}
interface Base {
  actor: number | "server";
  seq: number;
  now: number;
}
export type Command = Base &
  (
    | {
        type: "MOVE";
        tiles: string[];
        to: { rack: true } | { meld: string | null; index?: number };
      }
    | { type: "SPLIT"; meld: string; at: number }
    | { type: "MERGE"; melds: string[] }
    | {
        type:
          | "UNDO"
          | "REDO"
          | "RESET"
          | "COMMIT"
          | "DRAW"
          | "TIMEOUT"
          | "NEXT_GAME";
      }
  );
export class RKError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RKError";
  }
}
const COLORS: Color[] = ["R", "B", "O", "K"];
const NAMES: Record<Color, string> = { R: "红", B: "蓝", O: "橙", K: "黑" };
export function createTiles(variant: RKVariant = "classic"): Tile[] {
  if (variant !== "classic" && variant !== "xp")
    throw new RKError("未知拉密玩法");
  const out: Tile[] = [];
  for (const color of COLORS)
    for (let value = 1; value <= 13; value++)
      for (const copy of variant === "xp" ? ["a", "b", "c"] : ["a", "b"])
        out.push({
          id: `${color}${String(value).padStart(2, "0")}${copy}`,
          color,
          value,
        });
  return [
    ...out,
    { id: "J1", color: null, value: null },
    { id: "J2", color: null, value: null },
    ...(variant === "xp"
      ? [
          { id: "J3", color: null, value: null },
          { id: "J4", color: null, value: null },
        ]
      : []),
  ];
}
const TILES = createTiles("xp");
const CLASSIC_IDS = new Set(createTiles().map((t) => t.id));
const BY_ID = new Map(TILES.map((t) => [t.id, t]));
export function tileName(id: string) {
  const t = BY_ID.get(id);
  return !t ? id : t.color ? NAMES[t.color] + t.value : "百搭牌" + id.slice(1);
}
const isJoker = (id: string) => BY_ID.get(id)?.color === null;
const copy = <T>(v: T): T => structuredClone(v);
function check(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new RKError(reason);
}
// No positional inference: assign each joker to every missing (color,value) slot.
export function validateMeld(ids: string[]): Interpretation[] {
  if (
    !Array.isArray(ids) ||
    ids.length < 3 ||
    ids.length > 13 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !BY_ID.has(id))
  )
    return [];
  const ordinary = ids
    .map((id) => BY_ID.get(id)!)
    .filter((t) => t.color !== null);
  const jokers = ids.filter(isJoker).sort();
  const out: Interpretation[] = [];
  function assign(
    kind: "run" | "group",
    slots: { color: Color; value: number }[],
    score: number,
  ) {
    function visit(
      remaining: typeof slots,
      j: number,
      map: Interpretation["jokers"],
    ) {
      if (j === jokers.length) {
        out.push({ kind, score, jokers: map });
        return;
      }
      remaining.forEach((slot, i) =>
        visit(
          remaining.filter((_, k) => k !== i),
          j + 1,
          { ...map, [jokers[j]]: slot },
        ),
      );
    }
    visit(slots, 0, {});
  }
  if (
    ids.length <= 4 &&
    ordinary.every((t) => t.value === ordinary[0]?.value) &&
    new Set(ordinary.map((t) => t.color)).size === ordinary.length
  ) {
    const value = ordinary[0]?.value;
    if (value) {
      const missing = COLORS.filter(
        (c) => !ordinary.some((t) => t.color === c),
      );
      // Choose subsets and permutations without requiring all unused colors.
      function groups(
        remaining: Color[],
        j: number,
        map: Interpretation["jokers"],
      ) {
        if (j === jokers.length) {
          out.push({ kind: "group", score: value! * ids.length, jokers: map });
          return;
        }
        remaining.forEach((color, i) =>
          groups(
            remaining.filter((_, k) => k !== i),
            j + 1,
            { ...map, [jokers[j]]: { color, value: value! } },
          ),
        );
      }
      groups(missing, 0, {});
    }
  }
  for (const color of COLORS) {
    if (
      ordinary.some((t) => t.color !== color) ||
      new Set(ordinary.map((t) => t.value)).size !== ordinary.length
    )
      continue;
    for (let start = 1; start + ids.length - 1 <= 13; start++) {
      const values = Array.from({ length: ids.length }, (_, i) => start + i);
      if (ordinary.some((t) => !values.includes(t.value!))) continue;
      const missing = values
        .filter((v) => !ordinary.some((t) => t.value === v))
        .map((value) => ({ color, value }));
      if (missing.length === jokers.length)
        assign(
          "run",
          missing,
          values.reduce((a, b) => a + b, 0),
        );
    }
  }
  return out.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "run" ? -1 : 1) ||
      b.score - a.score ||
      JSON.stringify(a.jokers).localeCompare(JSON.stringify(b.jokers), "en"),
  );
}
function random(s: { random: number }) {
  let x = s.random | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.random = x >>> 0;
  return s.random / 4294967296;
}
function shuffle<T>(items: T[], s: { random: number }) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function snapshot(s: RKState) {
  return {
    rack: [...s.players[s.current].rack],
    board: copy(s.board),
    retrieved: [],
  } satisfies Draft;
}
function beginTurn(s: RKState, now: number) {
  s.turn = snapshot(s);
  s.draft = copy(s.turn);
  s.undo = [];
  s.redo = [];
  s.deadline = s.minutes ? now + TURN_SECONDS[s.minutes] * 1000 : null;
}
function deal(s: RKState, now: number) {
  const tiles = createTiles(s.variant ?? "classic");
  s.startDraw = [];
  let candidates = s.players.map((_, i) => i);
  let round = 0;
  while (candidates.length > 1) {
    const draw = shuffle(
      tiles.filter((t) => t.color !== null).map((t) => t.id),
      s,
    ).slice(0, candidates.length);
    const max = Math.max(...draw.map((id) => BY_ID.get(id)!.value!));
    candidates.forEach((seat, i) =>
      s.startDraw.push({ seat, tile: draw[i], round }),
    );
    candidates = candidates.filter((_, i) => BY_ID.get(draw[i])!.value === max);
    round++;
  }
  s.current = candidates[0];
  s.pool = shuffle(
    tiles.map((t) => t.id),
    s,
  );
  s.board = [];
  s.nextMeld = 0;
  s.passes = 0;
  s.result = null;
  s.phase = "PLAYING";
  s.lastAction = null;
  s.players.forEach((p) => {
    p.rack = s.pool.splice(0, 14);
    p.opened = false;
  });
  beginTurn(s, now);
}
export function createRK(
  names: string[],
  options: {
    seed: number;
    now?: number;
    minutes?: 0 | 1 | 2;
    assertions?: boolean;
    variant?: RKVariant;
  },
): RKState {
  const variant = options.variant ?? "classic";
  check(variant === "classic" || variant === "xp", "未知拉密玩法");
  check(
    Array.isArray(names) &&
      names.length >= (variant === "xp" ? 5 : 2) &&
      names.length <= (variant === "xp" ? 6 : 4) &&
      names.every((n) => typeof n === "string" && n.trim().length > 0),
    variant === "xp"
      ? "XP 只支持 5–6 位有名字的玩家"
      : "只支持 2–4 位有名字的玩家",
  );
  check(
    Number.isInteger(options.seed) &&
      options.seed >= 0 &&
      options.seed <= 0xffffffff,
    "随机种子必须是 32 位无符号整数",
  );
  const now = options.now ?? 0,
    minutes = options.minutes ?? 1;
  check(Number.isFinite(now) && now >= 0, "服务器时间无效");
  check([0, 1, 2].includes(minutes), "计时只能设置为 100 秒、200 秒或不限");
  const s: RKState = {
    variant,
    phase: "PLAYING",
    players: names.map((name) => ({
      name,
      rack: [],
      opened: false,
      score: 0,
      wins: 0,
    })),
    pool: [],
    board: [],
    current: 0,
    seed: options.seed,
    random: options.seed || 0x9e3779b9,
    startDraw: [],
    minutes,
    deadline: null,
    game: 1,
    nextMeld: 0,
    passes: 0,
    turn: { rack: [], board: [], retrieved: [] },
    draft: { rack: [], board: [], retrieved: [] },
    undo: [],
    redo: [],
    seq: {},
    assertions: options.assertions ?? false,
    result: null,
    lastAction: null,
  };
  deal(s, now);
  if (s.assertions) assertInvariants(s);
  return s;
}
export function rackPoints(rack: string[]) {
  return rack.reduce((sum, id) => sum + (BY_ID.get(id)!.value ?? 30), 0);
}
export function scoreGame(points: number[], blocked: boolean): Result {
  const min = Math.min(...points);
  const winners = points.flatMap((p, i) =>
    p === (blocked ? min : 0) ? [i] : [],
  );
  check(
    points.length >= 2 &&
      points.every((p) => Number.isFinite(p) && p >= 0) &&
      winners.length > 0,
    "结算点数无效",
  );
  const negatives = points.map((p, i) =>
    winners.includes(i) ? 0 : blocked ? min - p : -p,
  );
  const gain = -negatives.reduce((a, b) => a + b, 0) / winners.length;
  return {
    blocked,
    winners,
    scores: negatives.map((v, i) => (winners.includes(i) ? gain : v)),
    rackPoints: [...points],
  };
}
function finish(s: RKState, blocked: boolean) {
  s.result = scoreGame(
    s.players.map((p) => rackPoints(p.rack)),
    blocked,
  );
  s.players.forEach((p, i) => {
    p.score += s.result!.scores[i];
    if (s.result!.winners.includes(i)) p.wins++;
  });
  s.phase = "FINISHED";
  s.deadline = null;
  beginTurn(s, 0);
  s.deadline = null;
}
export interface Validation {
  ok: boolean;
  reason: string;
  points: number;
  interpretations: Record<string, Interpretation>;
}
export function validateTurn(s: RKState): Validation {
  const d = s.draft;
  let points = 0;
  const interpretations: Record<string, Interpretation> = {};
  const fail = (reason: string): Validation => ({
    ok: false,
    reason,
    points,
    interpretations,
  });
  const all = d.board.flatMap((m) => m.tiles);
  for (const id of s.turn.board.flatMap((m) => m.tiles))
    if (!all.includes(id)) return fail(`桌面的 ${tileName(id)} 不能拿回手牌`);
  if (!s.players[s.current].opened) {
    for (const old of s.turn.board) {
      const current = d.board.find((m) => m.id === old.id);
      if (
        !current ||
        JSON.stringify(current.tiles) !== JSON.stringify(old.tiles)
      )
        return fail("破冰回合不能改动桌面已有组合");
    }
  }
  for (const [i, m] of d.board.entries()) {
    const values = validateMeld(m.tiles);
    if (!values.length) {
      const desc = m.tiles.map(tileName).join(" ");
      const tiles = m.tiles.map((id) => BY_ID.get(id));
      const run = tiles.every((t) => t?.color === tiles[0]?.color);
      return fail(
        `第 ${i + 1} 组 ${desc} ${m.tiles.length < 3 ? "不足 3 张" : run ? "不连续" : "不能组成同数异色组或同色顺子"}`,
      );
    }
    interpretations[m.id] = values[0];
    if (!s.turn.board.some((b) => b.id === m.id)) points += values[0].score;
  }
  const played = s.turn.rack.filter((id) => !d.rack.includes(id));
  if (!played.length) return fail("至少打出一张手牌，否则请摸牌并结束");
  if (!s.players[s.current].opened && points < 30)
    return fail(`破冰只有 ${points} 分，还差 ${30 - points} 分`);
  for (const original of s.turn.board) {
    for (const joker of original.tiles.filter(isJoker)) {
      const target = d.board.find((m) => m.tiles.includes(joker));
      if (!target)
        return fail(`桌面的 ${tileName(joker)} 必须在本回合重新使用`);
      const retrieved =
        d.retrieved.includes(joker) ||
        original.tiles
          .filter((id) => !isJoker(id))
          .some((id) => !target.tiles.includes(id));
      if (
        retrieved &&
        target.tiles.length === original.tiles.length &&
        target.tiles.every((id) => original.tiles.includes(id))
      )
        return fail(`取出的 ${tileName(joker)} 必须用于新组合，不能只改变排列`);
    }
  }
  return { ok: true, reason: "", points, interpretations };
}
function validateConservation(s: RKState, d: Draft) {
  const ids = [
    ...s.pool,
    ...s.players.flatMap((p, i) => (i === s.current ? d.rack : p.rack)),
    ...d.board.flatMap((m) => m.tiles),
  ];
  check(
    ids.length === (s.variant === "xp" ? 160 : 106) &&
      new Set(ids).size === ids.length &&
      ids.every((id) =>
        s.variant === "xp" ? BY_ID.has(id) : CLASSIC_IDS.has(id),
      ),
    `牌不变量失败：必须 ${s.variant === "xp" ? 160 : 106} 张且无重复、无丢失`,
  );
  check(
    new Set(d.board.map((m) => m.id)).size === d.board.length &&
      d.board.every((m) => m.tiles.length > 0),
    "组合 ID 重复或组合为空",
  );
  const table = new Set(d.board.flatMap((m) => m.tiles));
  check(
    s.turn.board.every((m) => m.tiles.every((id) => table.has(id))),
    "桌面牌不能回到手牌",
  );
}
export function assertInvariants(s: RKState) {
  check(
    s.variant === undefined || s.variant === "classic" || s.variant === "xp",
    "未知拉密玩法",
  );
  check(
    s.players.length >= (s.variant === "xp" ? 5 : 2) &&
      s.players.length <= (s.variant === "xp" ? 6 : 4) &&
      s.current >= 0 &&
      s.current < s.players.length,
    "座位不变量失败",
  );
  const ids = [
    ...s.pool,
    ...s.players.flatMap((p) => p.rack),
    ...s.board.flatMap((m) => m.tiles),
  ];
  check(
    ids.length === (s.variant === "xp" ? 160 : 106) &&
      new Set(ids).size === ids.length &&
      ids.every((id) =>
        s.variant === "xp" ? BY_ID.has(id) : CLASSIC_IDS.has(id),
      ),
    `牌不变量失败：必须 ${s.variant === "xp" ? 160 : 106} 张且无重复、无丢失`,
  );
  check(
    s.board.every((m) => validateMeld(m.tiles).length > 0),
    "正式桌面包含非法组合",
  );
  check(
    JSON.stringify(s.turn.rack) === JSON.stringify(s.players[s.current].rack) &&
      JSON.stringify(s.turn.board) === JSON.stringify(s.board),
    "回合快照与正式状态不一致",
  );
  for (const d of [s.turn, s.draft, ...s.undo, ...s.redo])
    validateConservation(s, d);
}
function nextTurn(s: RKState, now: number) {
  s.current = (s.current + 1) % s.players.length;
  beginTurn(s, now);
}
function drawEnd(
  s: RKState,
  n: number,
  now: number,
  type: string,
  error?: string,
) {
  const seat = s.current;
  const drawn = s.pool.splice(0, n);
  s.players[seat].rack.push(...drawn);
  s.lastAction = {
    type,
    seat,
    count: drawn.length,
    ...(error ? { error } : {}),
  };
  if (drawn.length) s.passes = 0;
  else s.passes++;
  if (!s.pool.length && s.passes >= s.players.length) finish(s, true);
  else nextTurn(s, now);
}
/** 合法顺子按数字从小到大自动排列（百搭牌按所代表的数字）；其他组合保持原样。 */
export function orderMeld(tiles: string[]): string[] {
  const interp = validateMeld(tiles)[0];
  if (!interp || interp.kind !== "run") return tiles;
  const value = (id: string) =>
    BY_ID.get(id)?.value ?? interp.jokers[id]?.value ?? 0;
  return [...tiles].sort((a, b) => value(a) - value(b));
}
/** 每回合限时：1 档 = 100 秒，2 档 = 200 秒。 */
export const TURN_SECONDS: Record<number, number> = { 0: 0, 1: 100, 2: 200 };
function edit(s: RKState, c: Command) {
  const old = copy(s.draft);
  const d = s.draft;
  const canTouch = (m: Meld) =>
    check(
      s.players[s.current].opened || !s.turn.board.some((b) => b.id === m.id),
      "破冰回合不能改动桌面已有组合",
    );
  switch (c.type) {
    case "MOVE": {
      check(
        Array.isArray(c.tiles) &&
          c.tiles.length > 0 &&
          new Set(c.tiles).size === c.tiles.length &&
          c.tiles.every((id) => typeof id === "string" && BY_ID.has(id)),
        "请选择不重复的有效牌",
      );
      check(c.to && typeof c.to === "object", "移牌目标无效");
      const available = [...d.rack, ...d.board.flatMap((m) => m.tiles)];
      check(
        c.tiles.every((id) => available.includes(id)),
        "只能移动自己手牌或桌面已有牌",
      );
      const tableIds = new Set(s.turn.board.flatMap((m) => m.tiles));
      if ("rack" in c.to) {
        check(c.to.rack === true, "手牌目标无效");
        const id = c.tiles.find((id) => tableIds.has(id));
        check(!id, `桌面的 ${tileName(id ?? "")} 不能拿回手牌`);
      } else {
        const to = c.to;
        check(
          to.meld === null || typeof c.to.meld === "string",
          "目标组合无效",
        );
        if (c.to.meld !== null) {
          const m = d.board.find((m) => m.id === to.meld);
          check(m, "目标组合不存在");
          canTouch(m);
        }
        if (c.to.index !== undefined)
          check(
            Number.isInteger(c.to.index) && c.to.index >= 0,
            "插入位置无效",
          );
      }
      d.board
        .filter((m) => m.tiles.some((id) => c.tiles.includes(id)))
        .forEach(canTouch);
      c.tiles
        .filter((id) => tableIds.has(id) && isJoker(id))
        .forEach((id) => {
          if (!d.retrieved.includes(id)) d.retrieved.push(id);
        });
      d.rack = d.rack.filter((id) => !c.tiles.includes(id));
      d.board.forEach(
        (m) => (m.tiles = m.tiles.filter((id) => !c.tiles.includes(id))),
      );
      if ("rack" in c.to) d.rack.push(...c.tiles);
      else if (c.to.meld === null)
        d.board.push({ id: `m${s.nextMeld++}`, tiles: [...c.tiles] });
      else {
        const to = c.to;
        const target = d.board.find((m) => m.id === to.meld)!;
        const at = c.to.index ?? target.tiles.length;
        check(at <= target.tiles.length, "插入位置超出组合");
        target.tiles.splice(at, 0, ...c.tiles);
      }
      d.board = d.board.filter((m) => m.tiles.length);
      break;
    }
    case "SPLIT": {
      const m = d.board.find((m) => m.id === c.meld);
      check(m, "要拆分的组合不存在");
      canTouch(m);
      check(
        Number.isInteger(c.at) && c.at > 0 && c.at < m.tiles.length,
        "拆分位置必须在两张牌之间",
      );
      const second = { id: `m${s.nextMeld++}`, tiles: m.tiles.splice(c.at) };
      d.board.splice(d.board.indexOf(m) + 1, 0, second);
      break;
    }
    case "MERGE": {
      check(
        Array.isArray(c.melds) &&
          c.melds.length >= 2 &&
          new Set(c.melds).size === c.melds.length,
        "至少选择两个不同组合",
      );
      const groups = c.melds.map((id) => {
        const m = d.board.find((m) => m.id === id);
        check(m, "要合并的组合不存在");
        canTouch(m);
        return m;
      });
      groups[0].tiles = groups.flatMap((m) => m.tiles);
      d.board = d.board.filter((m) => !c.melds.slice(1).includes(m.id));
      break;
    }
    default:
      throw new RKError("未知草稿命令");
  }
  d.board.forEach((m) => (m.tiles = orderMeld(m.tiles)));
  validateConservation(s, d);
  s.undo.push(old);
  s.redo = [];
}
export function reduceRK(state: RKState, cmd: Command): RKState {
  check(
    cmd &&
      typeof cmd === "object" &&
      Number.isSafeInteger(cmd.seq) &&
      cmd.seq > 0,
    "seq 必须为正整数",
  );
  check(
    [
      "MOVE",
      "SPLIT",
      "MERGE",
      "UNDO",
      "REDO",
      "RESET",
      "COMMIT",
      "DRAW",
      "TIMEOUT",
      "NEXT_GAME",
    ].includes(cmd.type),
    "未知拉密命令",
  );
  check(
    cmd.actor === "server" ||
      (Number.isInteger(cmd.actor) &&
        cmd.actor >= 0 &&
        cmd.actor < state.players.length),
    "玩家座位无效",
  );
  const actor = String(cmd.actor);
  // Replay protection persists across turns and games, before permission checks.
  if (cmd.seq <= (state.seq[actor] ?? 0)) return state;
  check(Number.isFinite(cmd.now) && cmd.now >= 0, "服务器时间无效");
  if (cmd.type === "TIMEOUT")
    check(cmd.actor === "server", "超时只能由服务器触发");
  else check(cmd.actor === state.current, "尚未轮到你，不能修改对局");
  check(
    cmd.type === "NEXT_GAME"
      ? state.phase === "FINISHED"
      : state.phase === "PLAYING",
    "当前对局阶段不接受该操作",
  );
  const s = copy(state);
  s.seq[actor] = cmd.seq;
  if (
    cmd.type !== "TIMEOUT" &&
    cmd.type !== "NEXT_GAME" &&
    s.deadline !== null &&
    cmd.now >= s.deadline
  ) {
    drawEnd(s, 3, cmd.now, "TIMEOUT", "回合超时，已还原并罚摸 3 张");
  } else
    switch (cmd.type) {
      case "MOVE":
      case "SPLIT":
      case "MERGE":
        edit(s, cmd);
        break;
      case "UNDO":
        check(s.undo.length, "没有可撤销的操作");
        s.redo.push(copy(s.draft));
        s.draft = s.undo.pop()!;
        break;
      case "REDO":
        check(s.redo.length, "没有可重做的操作");
        s.undo.push(copy(s.draft));
        s.draft = s.redo.pop()!;
        break;
      case "RESET":
        s.undo.push(copy(s.draft));
        s.draft = copy(s.turn);
        s.redo = [];
        break;
      case "DRAW":
        drawEnd(s, 1, cmd.now, "DRAW");
        break;
      case "TIMEOUT":
        check(
          s.deadline !== null && cmd.now >= s.deadline,
          "尚未到回合截止时间或未启用计时",
        );
        drawEnd(s, 3, cmd.now, "TIMEOUT", "回合超时，已还原并罚摸 3 张");
        break;
      case "COMMIT": {
        const validation = validateTurn(s);
        if (!validation.ok) {
          drawEnd(s, 3, cmd.now, "INVALID", validation.reason);
          break;
        }
        const seat = s.current;
        const count = s.players[seat].rack.length - s.draft.rack.length;
        s.board = copy(s.draft.board);
        s.players[seat].rack = [...s.draft.rack];
        s.players[seat].opened = true;
        s.passes = 0;
        s.lastAction = { type: "COMMIT", seat, count };
        if (!s.players[seat].rack.length) finish(s, false);
        else nextTurn(s, cmd.now);
        break;
      }
      case "NEXT_GAME":
        s.game++;
        deal(s, cmd.now);
        break;
      default:
        throw new RKError("未知拉密命令");
    }
  if (s.assertions) assertInvariants(s);
  return s;
}
export function matchRanking(s: RKState) {
  return s.players
    .map((p, seat) => ({ seat, wins: p.wins, score: p.score }))
    .sort((a, b) => b.wins - a.wins || b.score - a.score);
}
export function viewForRK(s: RKState, seat: number) {
  check(
    Number.isInteger(seat) && seat >= 0 && seat < s.players.length,
    "玩家座位无效",
  );
  const ownTurn = s.phase === "PLAYING" && s.current === seat;
  const action = s.lastAction
    ? {
        type: s.lastAction.type,
        seat: s.lastAction.seat,
        count: s.lastAction.count,
        ...(s.lastAction.seat === seat && s.lastAction.error
          ? { error: s.lastAction.error }
          : {}),
      }
    : null;
  return {
    variant: s.variant ?? "classic",
    phase: s.phase,
    game: s.game,
    me: seat,
    current: s.current,
    deadline: s.deadline,
    minutes: s.minutes,
    poolCount: s.pool.length,
    startDraw: copy(s.startDraw),
    board: copy(s.board),
    lastAction: action,
    result: copy(s.result),
    ranking: matchRanking(s),
    players: s.players.map((p, i) => ({
      seat: i,
      name: p.name,
      count: p.rack.length,
      opened: p.opened,
      score: p.score,
      wins: p.wins,
      ...(i === seat || s.phase === "FINISHED" ? { rack: [...p.rack] } : {}),
    })),
    ...(ownTurn
      ? {
          draft: copy(s.draft),
          validation: validateTurn(s),
          canUndo: s.undo.length > 0,
          canRedo: s.redo.length > 0,
        }
      : {}),
  };
}
