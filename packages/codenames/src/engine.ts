import {
  DEFAULT_TIMING,
  TEAMS,
  other,
  type CNCommand,
  type CNSetup,
  type CNState,
  type ClueNumber,
  type Role,
  type Team,
  type TurnEnd,
} from "./types.ts";

export class CNRuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, msg: string): never => {
  throw new CNRuleError(code, msg);
};

/** 可复现的随机数（mulberry32） */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const MIN_TEAM_SIZE = 2;
export const CLUE_MAX_CHARS = 12;

/** 开局：抽 25 词，随机先手（9 张）、后手 8、中立 7、刺客 1（规则书 p.3） */
export function createCNGame(setup: CNSetup): CNState {
  const rand = rng(setup.seed);
  const pool = [...new Set(setup.words.map((w) => w.trim()).filter(Boolean))];
  if (pool.length < 25) fail("CN_WORDS", "词库不足 25 个词。");
  const members = (t: Team) => setup.players.filter((p) => p.team === t);
  for (const t of TEAMS)
    if (members(t).length < MIN_TEAM_SIZE)
      fail("CN_TEAM_SIZE", "每队至少需要 2 人（1 名队长 + 至少 1 名猜词队员）。");

  const captains = {} as Record<Team, string>;
  for (const t of TEAMS) {
    const given = setup.captains?.[t];
    if (given) {
      if (!members(t).some((p) => p.id === given)) fail("CN_CAPTAIN", "队长必须是本队成员。");
      captains[t] = given;
    } else {
      const m = members(t);
      captains[t] = m[Math.floor(rand() * m.length)].id;
    }
  }
  const operators = {} as Record<Team, string>;
  for (const t of TEAMS) operators[t] = members(t).find((p) => p.id !== captains[t])!.id;

  const first: Team = rand() < 0.5 ? "red" : "blue";
  // 抽 25 个词，跳过与已选词互相包含的（例如「熊猫」和「猫」不同时出现）
  const words: string[] = [];
  for (const w of shuffle(pool, rand)) {
    if (words.length === 25) break;
    if (words.some((x) => x.includes(w) || w.includes(x))) continue;
    words.push(w);
  }
  if (words.length < 25) fail("CN_WORDS", "词库里能互不包含的词不足 25 个。");
  const roles: Role[] = [
    ...Array<Role>(9).fill(first),
    ...Array<Role>(8).fill(other(first)),
    ...Array<Role>(7).fill("neutral"),
    "assassin",
  ];
  const dealt = shuffle(roles, rand);
  const timing = setup.timing ?? DEFAULT_TIMING;
  return {
    players: setup.players.map((p) => ({ ...p })),
    captains,
    operators,
    cards: words.map((word, i) => ({ word, role: dealt[i], revealed: false })),
    first,
    turn: first,
    phase: "clue",
    deadline: setup.now + timing.clueMs,
    timing,
    limit: null,
    guessesMade: 0,
    marks: {},
    extraUsed: { red: false, blue: false },
    log: [{ team: first, clue: null, reveals: [], extra: false, end: null }],
    winner: null,
    endReason: null,
  };
}

export const remaining = (s: CNState, t: Team) =>
  s.cards.filter((c) => c.role === t && !c.revealed).length;

/** 本回合最多翻几张：N → N+1；0 和 ∞ → null（不限，R10–R12） */
export const guessLimit = (n: ClueNumber): number | null => (n === "inf" || n === 0 ? null : n + 1);

/** 线索规范化：去首尾空白、全角转半角、英文小写，用于比较 */
export const normalizeClue = (w: string) =>
  w
    .trim()
    .normalize("NFKC")
    .toLowerCase();

/** 线索合法性（R07）：1–12 字、无空格、不等于也不包含任何未揭晓的桌面词 */
export function clueProblem(s: CNState, word: string): string | null {
  const w = normalizeClue(word);
  const len = Array.from(w).length;
  if (len === 0) return "请输入线索词。";
  if (len > CLUE_MAX_CHARS) return `线索最多 ${CLUE_MAX_CHARS} 个字。`;
  if (/\s/.test(w)) return "线索只能是一个词，不能有空格。";
  for (const c of s.cards) {
    if (c.revealed) continue;
    const b = normalizeClue(c.word);
    if (w === b || w.includes(b)) return `不能用桌面上的词「${c.word}」做线索。`;
  }
  return null;
}

const teamOf = (s: CNState, id: string) => s.players.find((p) => p.id === id)?.team ?? null;
const isCaptain = (s: CNState, id: string) => s.captains.red === id || s.captains.blue === id;
const curLog = (s: CNState) => s.log[s.log.length - 1];

function endTurn(s: CNState, at: number, why: TurnEnd) {
  curLog(s).end = why;
  s.turn = other(s.turn);
  s.phase = "clue";
  s.deadline = at + s.timing.clueMs;
  s.limit = null;
  s.guessesMade = 0;
  s.marks = {};
  s.report = null;
  s.log.push({ team: s.turn, clue: null, reveals: [], extra: false, end: null });
}
function finish(s: CNState, winner: Team, reason: "all" | "assassin", why: TurnEnd) {
  curLog(s).end = why;
  s.winner = winner;
  s.endReason = reason;
  s.phase = "over";
  s.deadline = 0;
  s.marks = {};
  s.report = null;
}

/** 纯函数：返回新状态，不合法时抛 CNRuleError */
export function reduceCN(prev: CNState, cmd: CNCommand): CNState {
  if (prev.phase === "over") fail("CN_OVER", "这一局已经结束了。");
  const s: CNState = structuredClone(prev);

  if (cmd.type === "TIMEOUT") {
    if (cmd.at < s.deadline) fail("CN_NOT_YET", "时间还没到。");
    endTurn(s, cmd.at, s.phase === "clue" ? "clue-timeout" : "guess-timeout");
    return s;
  }
  if (cmd.at >= s.deadline) fail("CN_TIME_UP", "时间到了，本回合已结束。");
  const me = cmd.player;
  const team = teamOf(s, me);
  if (!team) fail("CN_NOT_PLAYER", "你不在任何一队，只能观战。");

  switch (cmd.type) {
    case "GIVE_CLUE": {
      if (s.phase !== "clue") fail("CN_PHASE", "现在不是出线索的时候。");
      if (s.captains[s.turn] !== me) fail("CN_NOT_CAPTAIN", "只有当前队伍的队长可以出线索。");
      const n = cmd.number;
      if (!(n === "inf" || (Number.isInteger(n) && n >= 0 && n <= 9)))
        fail("CN_BAD_NUMBER", "数字只能是 0–9 或 ∞。");
      const problem = clueProblem(s, String(cmd.word ?? ""));
      if (problem) fail("CN_BAD_CLUE", problem);
      curLog(s).clue = { word: String(cmd.word).trim(), number: n };
      s.phase = "guess";
      s.limit = guessLimit(n);
      s.guessesMade = 0;
      s.deadline = cmd.at + s.timing.guessMs;
      return s;
    }
    case "MARK": {
      guesserCheck(s, me, team!);
      const c = s.cards[cmd.index] ?? fail("CN_BAD_CARD", "没有这张牌。");
      if (c.revealed) fail("CN_REVEALED", "这张牌已经翻开了。");
      const list = s.marks[cmd.index] ?? [];
      s.marks[cmd.index] = list.includes(me) ? list.filter((x) => x !== me) : [...list, me];
      if (!s.marks[cmd.index].length) delete s.marks[cmd.index];
      return s;
    }
    case "REVEAL": {
      guesserCheck(s, me, team!);
      if (s.operators[s.turn] !== me) fail("CN_NOT_OPERATOR", "只有本队操作员能确认翻牌。");
      const c = s.cards[cmd.index] ?? fail("CN_BAD_CARD", "没有这张牌。");
      if (c.revealed) fail("CN_REVEALED", "这张牌已经翻开了。");
      c.revealed = true;
      delete s.marks[cmd.index];
      s.guessesMade++;
      curLog(s).reveals.push({ index: cmd.index, word: c.word, role: c.role, by: me });
      if (c.role === "assassin") {
        finish(s, other(s.turn), "assassin", "assassin");
        return s;
      }
      for (const t of TEAMS)
        if (remaining(s, t) === 0) {
          finish(s, t, "all", "win");
          return s;
        }
      if (c.role !== s.turn) endTurn(s, cmd.at, "wrong");
      else if (s.limit !== null && s.guessesMade >= s.limit) endTurn(s, cmd.at, "limit");
      return s;
    }
    case "END_GUESSING": {
      guesserCheck(s, me, team!);
      if (s.operators[s.turn] !== me) fail("CN_NOT_OPERATOR", "只有本队操作员能结束猜词。");
      if (s.guessesMade < 1) fail("CN_MUST_GUESS", "至少先翻开一张牌，才能结束猜词。");
      endTurn(s, cmd.at, "stop");
      return s;
    }
    case "EXTRA_TIME": {
      guesserCheck(s, me, team!);
      if (s.extraUsed[s.turn]) fail("CN_EXTRA_USED", "本队这局的加时已经用过了。");
      s.extraUsed[s.turn] = true;
      s.deadline += s.timing.extraMs;
      curLog(s).extra = true;
      return s;
    }
    case "REPORT": {
      // 对方的猜词队员举报当前队长的线索违规（给了太多信息等）
      if (s.phase !== "guess") fail("CN_PHASE", "队长出了线索之后才能举报。");
      if (team === s.turn) fail("CN_REPORT_OWN", "只能举报对方队长。");
      if (isCaptain(s, me)) fail("CN_REPORT_CAPTAIN", "队长不能举报，请让队员来。");
      if (s.report) fail("CN_REPORT_PENDING", "已经有一个举报在等对方确认了。");
      if (s.reportClosed === s.log.length) fail("CN_REPORT_CLOSED", "这条线索的举报已经被驳回，不能再举报。");
      s.report = { by: me, against: s.turn };
      return s;
    }
    case "CONFIRM_REPORT":
    case "REJECT_REPORT": {
      if (!s.report) fail("CN_NO_REPORT", "现在没有举报。");
      if (team !== s.report!.against || isCaptain(s, me))
        fail("CN_REPORT_JUDGE", "要由被举报一方的猜词队员来确认。");
      if (cmd.type === "CONFIRM_REPORT") {
        endTurn(s, cmd.at, "foul"); // 违规成立：本队回合立即结束，轮到举报方
      } else {
        s.report = null;
        s.reportClosed = s.log.length;
      }
      return s;
    }
    case "TAKE_OPERATOR": {
      if (isCaptain(s, me)) fail("CN_CAPTAIN_NO_OP", "队长不能担任翻牌操作员。");
      s.operators[team!] = me;
      return s;
    }
  }
  return fail("CN_BAD_COMMAND", "未知操作。");
}

/** 猜词阶段的本队猜词队员（不是队长） */
function guesserCheck(s: CNState, me: string, team: Team) {
  if (s.phase !== "guess") fail("CN_PHASE", "现在不是猜词阶段。");
  if (team !== s.turn) fail("CN_NOT_YOUR_TURN", "现在是对方队伍的回合。");
  if (s.captains[team] === me) fail("CN_CAPTAIN_NO_GUESS", "队长不能参与猜词。");
}
