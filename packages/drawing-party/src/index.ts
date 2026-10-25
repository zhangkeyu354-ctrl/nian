export type Mode = "tp" | "fa";
export type Point = [number, number, number];
export const COLORS = [
  "#242333",
  "#ed5368",
  "#e6a52d",
  "#25a78c",
  "#4576dc",
  "#a658c7",
  "#ce6f30",
  "#45a9bf",
  "#d6408f",
  "#6f9a2a",
];
export interface Stroke {
  id: string;
  color: number;
  width: number;
  points: Point[];
  closed: boolean;
  chunks: { from: number; count: number; end: boolean }[];
}
export const NEW_PAPER_ASPECT = 4 / 3;
export interface Drawing {
  aspect?: number;
  strokes: Stroke[];
  revision: number;
}
export interface Chunk {
  id: string;
  seq: number;
  points: Point[];
  color: number;
  width: number;
  end: boolean;
}
export interface Player {
  id: string;
  name: string;
}
export interface Entry {
  kind: "text" | "drawing";
  author: string;
  text?: string;
  drawingId?: string;
  missing?: boolean;
}
export interface Game {
  paperAspect?: number;
  id: string;
  mode: Mode;
  players: Player[];
  phase:
    | "THEME"
    | "THEME_RESULT"
    | "VERDICT"
    | "VERDICT_RESULT"
    | "AWARD"
    | "AWARD_RESULT"
    | "CATEGORY"
    | "PROMPT"
    | "TASK"
    | "DRAW"
    | "DISCUSS"
    | "VOTE"
    | "OBSERVE"
    | "GUESS"
    | "REVEAL"
    | "RESULT";
  step: number;
  steps: number;
  turn: number;
  deadline: number;
  done: string[];
  chains: Entry[][];
  drawings: Record<string, Drawing>;
  votes: Record<string, string>;
  fakeId: string;
  category: string;
  word: string;
  options: string[];
  winner?: "fake" | "artists";
  guess?: string;
  cursor: number;
  theme?: string;
  themeVotes?: Record<string, number>;
  themeTieSeed?: number;
  themeRandomIndex?: number;
  verdictVotes?: Record<string, VerdictChoice>;
  verdictResults?: VerdictResult[];
  awardVotes?: Record<string, AwardBallot>;
  awardResults?: AwardResult[];
  categoryVotes?: Record<string, number>;
  categorySeed?: number;
  categoryOffset?: number;
  categoryTieSeed?: number;
}
export const TP_THEMES = [
  "影视",
  "成语",
  "童话故事",
  "动漫",
  "歌词",
  "随机",
  "自定义",
];
export type VerdictChoice = "success" | "offtrack" | null;
export interface VerdictResult {
  chain: number;
  success: number;
  offtrack: number;
  abstain: number;
  outcome: "success" | "offtrack" | "mixed";
  votes: Record<string, VerdictChoice>;
}
export interface AwardBallot {
  mvp: string | null;
  dud: string | null;
}
export interface AwardResult {
  votes?: Record<string, AwardBallot>;
  chain: number;
  mvp: Record<string, number>;
  dud: Record<string, number>;
  mvpWinners: string[];
  dudWinners: string[];
}
export function gameScope(
  g: Pick<Game, "id" | "mode" | "phase" | "step" | "turn" | "cursor">,
) {
  return [
    g.id,
    g.phase,
    g.step,
    g.turn,
    ...(g.mode === "tp" ? [g.cursor] : []),
  ].join(":");
}
export type Action =
  | { type: "VERDICT_VOTE"; chain: number; choice: VerdictChoice }
  | { type: "THEME_VOTE"; theme: number }
  | {
      type: "AWARD_VOTE";
      chain: number;
      mvp?: string | null;
      dud?: string | null;
    }
  | { type: "CATEGORY_VOTE"; category: number }
  | { type: "TEXT"; text: string }
  | { type: "SUBMIT" }
  | { type: "VOTE"; target: string }
  | { type: "BEGIN_GUESS" }
  | { type: "GUESS"; answer: string }
  | { type: "NEXT" }
  | { type: "FINISH_DISCUSSION" };
export interface GameView {
  paperAspect?: number;
  id: string;
  mode: Mode;
  phase: Game["phase"];
  players: Player[];
  step: number;
  steps: number;
  turn: number;
  deadline: number;
  completed: number;
  currentId?: string;
  theme?: string;
  themes?: string[];
  myThemeVote?: number;
  awardChain?: number;
  awardCandidates?: string[];
  verdictVotes?: Record<string, VerdictChoice>;
  verdictResults?: VerdictResult[];
  awardVotes?: Record<string, AwardBallot>;
  myAwardVote?: AwardBallot;
  awardResults?: AwardResult[];
  awardTotals?: AwardResult;
  categories?: string[];
  myCategoryVote?: number;
  task?: {
    id: string;
    chain: string;
    kind: "text" | "drawing";
    source: Entry & { drawing?: Drawing };
  };
  drawing?: Drawing;
  submitted: boolean;
  category?: string;
  word?: string;
  role?: "artist" | "fake";
  options?: string[];
  myVote?: string;
  winner?: Game["winner"];
  guess?: string;
  fakeId?: string;
  votes?: Record<string, string>;
  cursor: number;
  albums?: { owner: Player; entries: (Entry & { drawing?: Drawing })[] }[];
}
export const WORDS = [
  {
    category: "职业",
    words: [
      "医生",
      "教师",
      "消防员",
      "厨师",
      "警察",
      "宇航员",
      "画家",
      "理发师",
      "农民",
      "记者",
      "歌手",
      "司机",
      "邮递员",
      "摄影师",
      "裁缝",
      "渔夫",
      "飞行员",
      "建筑工人",
    ],
  },
  {
    category: "文具 / 工具",
    words: [
      "剪刀",
      "铅笔",
      "橡皮",
      "尺子",
      "圆规",
      "订书机",
      "胶水",
      "胶带",
      "画笔",
      "锤子",
      "螺丝刀",
      "扳手",
      "钳子",
      "锯子",
      "铲子",
      "钉子",
      "书包",
      "笔筒",
    ],
  },
  {
    category: "家具 / 电器",
    words: [
      "沙发",
      "椅子",
      "餐桌",
      "书架",
      "衣柜",
      "床",
      "台灯",
      "电视",
      "冰箱",
      "空调",
      "风扇",
      "洗衣机",
      "微波炉",
      "烤箱",
      "吸尘器",
      "吹风机",
      "镜子",
      "钟表",
    ],
  },
  {
    category: "昆虫",
    words: [
      "蝴蝶",
      "蜜蜂",
      "蚂蚁",
      "蜻蜓",
      "瓢虫",
      "蚊子",
      "苍蝇",
      "螳螂",
      "蝉",
      "蟋蟀",
      "蚱蜢",
      "萤火虫",
      "甲虫",
      "蛾子",
      "蟑螂",
      "竹节虫",
      "白蚁",
      "独角仙",
    ],
  },
  {
    category: "陆栖动物",
    words: [
      "长颈鹿",
      "大象",
      "老虎",
      "狮子",
      "熊猫",
      "袋鼠",
      "斑马",
      "骆驼",
      "刺猬",
      "蜗牛",
      "兔子",
      "松鼠",
      "猴子",
      "狐狸",
      "狼",
      "乌龟",
      "鳄鱼",
      "犀牛",
    ],
  },
];
const fail = (s: string): never => {
  throw Error(s);
};
export function emptyDrawing(aspect?: number): Drawing {
  return { strokes: [], revision: 0, ...(aspect ? { aspect } : {}) };
}
function checkPoints(points: unknown): asserts points is Point[] {
  if (!Array.isArray(points)) throw Error("笔画数据无效");
  if (points.length > 12000) fail("笔画数据过大");
  let last = -1;
  for (const p of points) {
    if (
      !Array.isArray(p) ||
      p.length !== 3 ||
      p.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
      p[0] < 0 ||
      p[0] > 1024 ||
      p[1] < 0 ||
      p[1] > 1024 ||
      p[2] < 0 ||
      p[2] < last ||
      p[2] > 180000
    )
      fail("无效画布坐标");
    last = p[2];
  }
}
export function validateStroke(s: {
  id: string;
  color: number;
  width: number;
  points: Point[];
}) {
  if (
    typeof s.id !== "string" ||
    !s.id.length ||
    s.id.length > 100 ||
    !Number.isInteger(s.color) ||
    s.color < 0 ||
    s.color >= COLORS.length ||
    ![4, 8, 16, 28].includes(s.width)
  )
    fail("无效画笔");
  checkPoints(s.points);
}
export function appendChunk(d: Drawing, c: Chunk) {
  validateStroke(c);
  if (
    !Number.isInteger(c.seq) ||
    c.seq < 0 ||
    c.seq > 2400 ||
    c.points.length > 128 ||
    typeof c.end !== "boolean"
  )
    fail("无效笔画分片");
  let s = d.strokes.find((s) => s.id === c.id);
  if (!s) {
    if (c.seq !== 0 || d.strokes.length >= 150) fail("笔画序号或数量超限");
    s = {
      id: c.id,
      color: c.color,
      width: c.width,
      points: [],
      closed: false,
      chunks: [],
    };
    d.strokes.push(s);
  }
  if (s.color !== c.color || s.width !== c.width) fail("笔画样式不能中途改变");
  if (c.seq < s.chunks.length) {
    const old = s.chunks[c.seq];
    if (
      old.end !== c.end ||
      JSON.stringify(s.points.slice(old.from, old.from + old.count)) !==
        JSON.stringify(c.points)
    )
      fail("重复序号内容冲突");
    return;
  }
  if (s.closed || c.seq !== s.chunks.length) fail("笔画已结束或分片不连续");
  if (
    d.strokes.reduce((n, s) => n + s.points.length, 0) + c.points.length >
    12000
  )
    fail("画作点数超限");
  if (
    c.points.length &&
    s.points.length &&
    c.points[0][2] < s.points.at(-1)![2]
  )
    fail("笔画时间倒退");
  s.chunks.push({ from: s.points.length, count: c.points.length, end: c.end });
  s.points.push(...c.points);
  s.closed = c.end;
  d.revision++;
}
export function startGame(
  mode: Mode,
  players: Player[],
  now: number,
  opt: {
    fakeIndex: number;
    wordIndex: number;
    optionOffset?: number;
    categoryVote?: boolean;
    categoryTieSeed?: number;
    themeTieSeed?: number;
    themeRandomIndex?: number;
  },
): Game {
  if (
    !["tp", "fa"].includes(mode) ||
    players.length < 3 ||
    players.length > 10 ||
    new Set(players.map((p) => p.id)).size !== players.length
  )
    fail("需要3–10位不同玩家");
  const bank = WORDS[Math.floor(opt.wordIndex / 18) % WORDS.length],
    wi = opt.wordIndex % 18;
  const offset = (opt.optionOffset ?? 0) % 18;
  const options = [...bank.words.slice(offset), ...bank.words.slice(0, offset)];
  return {
    id: "game-" + now,
    paperAspect: NEW_PAPER_ASPECT,
    mode,
    players: structuredClone(players),
    phase: mode === "tp" ? "THEME" : opt.categoryVote ? "CATEGORY" : "DRAW",
    step: 1,
    steps: players.length - (players.length % 2),
    turn: 0,
    deadline: now + 30000,
    done: [],
    chains: players.map(() => []),
    drawings: { shared: emptyDrawing(NEW_PAPER_ASPECT) },
    votes: {},
    fakeId: players[opt.fakeIndex % players.length].id,
    category: bank.category,
    word: bank.words[wi],
    options,
    cursor: 0,
    ...(mode === "tp"
      ? {
          themeVotes: {},
          themeTieSeed: opt.themeTieSeed ?? 0,
          themeRandomIndex: opt.themeRandomIndex ?? 0,
          verdictVotes: {},
          verdictResults: [],
          awardVotes: {},
          awardResults: [],
        }
      : {}),
    ...(mode === "fa" && opt.categoryVote
      ? {
          categoryVotes: {},
          categorySeed: opt.wordIndex,
          categoryOffset: offset,
          categoryTieSeed: opt.categoryTieSeed ?? 0,
        }
      : {}),
  };
}
export function taskFor(s: Game, id: string) {
  if (s.mode !== "tp" || s.phase !== "TASK") return null;
  const idx = s.players.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const n = s.players.length,
    c = (idx - (s.step - 1 + (n % 2)) + n * 2) % n;
  return {
    id: s.id + "-" + c + "-" + s.step,
    chain: String(c),
    kind: (s.step % 2 ? "drawing" : "text") as "drawing" | "text",
    source: s.chains[c].at(-1)!,
  };
}
function nextTask(s: Game, now: number) {
  if (s.phase === "PROMPT") {
    s.phase = "TASK";
    s.step = 1;
  } else if (s.step >= s.steps) {
    s.phase = "REVEAL";
    s.deadline = 0;
    s.done = [];
    return;
  } else s.step++;
  s.done = [];
  s.deadline = now + (s.step % 2 ? 90000 : 40000);
}
function resolveCategory(s: Game, now: number) {
  const totals = new Map<number, number>();
  for (const v of Object.values(s.categoryVotes ?? {}))
    totals.set(v, (totals.get(v) ?? 0) + 1);
  const max = Math.max(0, ...totals.values()),
    top = [...totals]
      .filter(([, n]) => n === max)
      .map(([i]) => i)
      .sort((a, b) => a - b);
  const seed = s.categorySeed ?? 0,
    selected = top.length ? top[(s.categoryTieSeed ?? 0) % top.length] : -1;
  const bank =
    WORDS[selected < 0 ? Math.floor(seed / 18) % WORDS.length : selected];
  s.category = bank.category;
  s.word = bank.words[seed % 18];
  const offset = s.categoryOffset ?? 0;
  s.options = [...bank.words.slice(offset), ...bank.words.slice(0, offset)];
  s.phase = "DRAW";
  s.deadline = now + 30000;
}
function finishTurn(s: Game, now: number) {
  for (const stroke of s.drawings.shared.strokes) stroke.closed = true;
  s.turn++;
  s.done = [];
  if (s.turn >= s.players.length * 2) {
    s.phase = "DISCUSS";
    s.deadline = now + 90000;
  } else s.deadline = now + 30000;
}
function decide(s: Game, now: number) {
  const totals = new Map<string, number>();
  for (const target of Object.values(s.votes))
    totals.set(target, (totals.get(target) ?? 0) + 1);
  const max = Math.max(0, ...totals.values()),
    top = [...totals].filter(([, n]) => n === max).map(([id]) => id);
  if (top.length === 1 && top[0] === s.fakeId) {
    s.phase = "OBSERVE";
    s.deadline = now + 15000;
  } else {
    s.phase = "RESULT";
    s.winner = "fake";
    s.deadline = 0;
  }
}
function resolveTheme(s: Game, now: number) {
  const votes = Object.values(s.themeVotes ?? {}),
    totals = TP_THEMES.map((_, i) => votes.filter((v) => v === i).length);
  const max = Math.max(0, ...totals),
    top = totals.flatMap((n, i) => (n === max ? [i] : []));
  const choice = votes.length ? top[(s.themeTieSeed ?? 0) % top.length] : 5;
  s.theme =
    choice === 6
      ? undefined
      : TP_THEMES[choice === 5 ? (s.themeRandomIndex ?? 0) % 5 : choice];
  s.phase = "THEME_RESULT";
  s.deadline = now + 1500;
}
const awardChain = (s: Game) => Math.floor(s.cursor / (s.steps + 1));
function winners(t: Record<string, number>): string[] {
  const max = Math.max(0, ...Object.values(t));
  return max
    ? Object.keys(t)
        .filter((id) => t[id] === max)
        .sort()
    : [];
}
function resolveVerdict(s: Game) {
  for (const p of s.players)
    if (!Object.hasOwn(s.verdictVotes!, p.id)) s.verdictVotes![p.id] = null;
  const values = Object.values(s.verdictVotes!),
    success = values.filter((v) => v === "success").length,
    offtrack = values.filter((v) => v === "offtrack").length;
  s.verdictResults!.push({
    chain: awardChain(s),
    success,
    offtrack,
    abstain: s.players.length - success - offtrack,
    outcome:
      success > offtrack
        ? "success"
        : offtrack > success
          ? "offtrack"
          : "mixed",
    votes: structuredClone(s.verdictVotes!),
  });
  s.phase = "VERDICT_RESULT";
  s.deadline = 0;
}
function resolveAward(s: Game) {
  for (const p of s.players)
    if (!Object.hasOwn(s.awardVotes!, p.id))
      s.awardVotes![p.id] = { mvp: null, dud: null };
  const mvp: Record<string, number> = {},
    dud: Record<string, number> = {};
  for (const ballot of Object.values(s.awardVotes ?? {}))
    for (const key of ["mvp", "dud"] as const) {
      const id = ballot[key];
      const tally = key === "mvp" ? mvp : dud;
      if (id) tally[id] = (tally[id] ?? 0) + 1;
    }
  s.awardResults!.push({
    chain: awardChain(s),
    votes: structuredClone(s.awardVotes!),
    mvp,
    dud,
    mvpWinners: winners(mvp),
    dudWinners: winners(dud),
  });
  s.phase = "AWARD_RESULT";
  s.deadline = 0;
}
function awardTotals(s: Game): AwardResult {
  const mvp: Record<string, number> = {},
    dud: Record<string, number> = {};
  for (const result of s.awardResults ?? [])
    for (const key of ["mvp", "dud"] as const)
      for (const [id, n] of Object.entries(result[key])) {
        const t = key === "mvp" ? mvp : dud;
        t[id] = (t[id] ?? 0) + n;
      }
  return {
    chain: -1,
    mvp,
    dud,
    mvpWinners: winners(mvp),
    dudWinners: winners(dud),
  };
}
export function act(state: Game, id: string, a: Action, now: number): Game {
  if (!state.players.some((p) => p.id === id)) fail("不是本局玩家");
  const s = structuredClone(state);
  if (a.type === "NEXT" && s.phase === "REVEAL") {
    if (id !== s.players[0].id) fail("由房主翻页");
    if (s.cursor >= s.players.length * (s.steps + 1) - 1) s.phase = "RESULT";
    else {
      s.cursor++;
      if (
        s.mode === "tp" &&
        s.awardResults &&
        s.cursor % (s.steps + 1) === s.steps
      ) {
        s.phase = s.verdictResults ? "VERDICT" : "AWARD";
        s.verdictVotes = {};
        s.awardVotes = {};
        s.deadline = now + 30000;
      }
    }
    return s;
  }
  if (s.mode === "tp" && a.type === "NEXT" && s.phase === "VERDICT_RESULT") {
    if (id !== s.players[0].id) fail("由房主继续");
    s.phase = "AWARD";
    s.awardVotes = {};
    s.deadline = now + 30000;
    return s;
  }
  if (s.mode === "tp" && a.type === "NEXT" && s.phase === "AWARD_RESULT") {
    if (id !== s.players[0].id) fail("由房主翻页");
    if (s.cursor >= s.players.length * (s.steps + 1) - 1) s.phase = "RESULT";
    else {
      s.cursor++;
      s.phase = "REVEAL";
    }
    return s;
  }
  if (a.type === "FINISH_DISCUSSION" && s.phase === "DISCUSS") {
    if (id !== s.players[0].id) fail("由房主结束讨论");
    s.phase = "VOTE";
    s.deadline = now + 30000;
    return s;
  }
  if (s.deadline && now >= s.deadline) fail("本阶段已到时");
  if (s.mode === "tp" && s.phase === "VERDICT" && a.type === "VERDICT_VOTE") {
    if (!Number.isInteger(a.chain) || a.chain !== awardChain(s))
      fail("传话本已变化");
    if (!["success", "offtrack", null].includes(a.choice))
      fail("请选择成功、跑偏或弃权");
    if (Object.hasOwn(s.verdictVotes!, id)) fail("已经提交成功判断票");
    s.verdictVotes![id] = a.choice;
    if (Object.keys(s.verdictVotes!).length === s.players.length)
      resolveVerdict(s);
  } else if (
    s.mode === "tp" &&
    s.phase === "THEME" &&
    a.type === "THEME_VOTE"
  ) {
    if (
      !Number.isInteger(a.theme) ||
      a.theme < 0 ||
      a.theme > 6 ||
      Object.hasOwn(s.themeVotes!, id)
    )
      fail("无效或重复主题投票");
    s.themeVotes![id] = a.theme;
    if (Object.keys(s.themeVotes!).length === s.players.length)
      resolveTheme(s, now);
  } else if (
    s.mode === "tp" &&
    s.phase === "AWARD" &&
    a.type === "AWARD_VOTE"
  ) {
    if (!Number.isInteger(a.chain) || a.chain !== awardChain(s))
      fail("传话本已变化");
    if (Object.hasOwn(s.awardVotes!, id)) fail("已经提交本轮投票");
    const candidates = new Set(s.chains[a.chain].map((e) => e.author));
    for (const target of [a.mvp, a.dud])
      if (
        target != null &&
        (typeof target !== "string" || target === id || !candidates.has(target))
      )
        fail("不能投给自己或无效候选人");
    s.awardVotes![id] = { mvp: a.mvp ?? null, dud: a.dud ?? null };
    if (Object.keys(s.awardVotes!).length === s.players.length) resolveAward(s);
  } else if (s.phase === "CATEGORY" && a.type === "CATEGORY_VOTE") {
    if (
      !Number.isInteger(a.category) ||
      a.category < -1 ||
      a.category >= WORDS.length ||
      Object.hasOwn(s.categoryVotes!, id)
    )
      fail("无效或重复主题投票");
    s.categoryVotes![id] = a.category;
    if (Object.keys(s.categoryVotes!).length === s.players.length)
      resolveCategory(s, now);
  } else if (s.mode === "tp") {
    if (s.done.includes(id)) fail("已经提交");
    if (s.phase === "PROMPT" && a.type === "TEXT") {
      const text = String(a.text).trim();
      if (!text || Array.from(text).length > 40) fail("请填写1–40字");
      s.chains[s.players.findIndex((p) => p.id === id)].push({
        kind: "text",
        author: id,
        text,
      });
      s.done.push(id);
    } else if (s.phase === "TASK") {
      const task = taskFor(s, id)!;
      if (task.kind === "drawing" && a.type === "SUBMIT") {
        s.chains[Number(task.chain)].push({
          kind: "drawing",
          author: id,
          drawingId: task.id,
        });
        for (const st of s.drawings[task.id]?.strokes ?? []) st.closed = true;
      } else if (task.kind === "text" && a.type === "TEXT") {
        const text = String(a.text).trim();
        if (!text || Array.from(text).length > 40) fail("请填写1–40字");
        s.chains[Number(task.chain)].push({ kind: "text", author: id, text });
      } else fail("当前任务不能这样操作");
      s.done.push(id);
    } else fail("当前不能提交");
    if (s.done.length === s.players.length) nextTask(s, now);
  } else if (s.phase === "DRAW" && a.type === "SUBMIT") {
    if (s.players[s.turn % s.players.length].id !== id) fail("尚未轮到你");
    finishTurn(s, now);
  } else if (s.phase === "VOTE" && a.type === "VOTE") {
    if (
      s.votes[id] ||
      a.target === id ||
      !s.players.some((p) => p.id === a.target)
    )
      fail("无效或重复投票");
    s.votes[id] = a.target;
    if (Object.keys(s.votes).length === s.players.length) decide(s, now);
  } else if (s.phase === "OBSERVE" && a.type === "BEGIN_GUESS") {
    if (id !== s.fakeId) fail("仅卧底猜题");
    s.phase = "GUESS";
    s.deadline = now + 30000;
  } else if (s.phase === "GUESS" && a.type === "GUESS") {
    if (id !== s.fakeId || !s.options.includes(a.answer)) fail("无效猜题");
    s.guess = a.answer;
    s.winner = a.answer === s.word ? "fake" : "artists";
    s.phase = "RESULT";
    s.deadline = 0;
  } else fail("当前不能执行此操作");
  return s;
}
export function tick(state: Game, now: number): Game {
  if (!state.deadline || now < state.deadline) return state;
  const s = structuredClone(state);
  if (s.mode === "tp" && s.phase === "THEME") resolveTheme(s, now);
  else if (s.mode === "tp" && s.phase === "THEME_RESULT") {
    s.phase = "PROMPT";
    s.deadline = now + 60000;
  } else if (s.mode === "tp" && s.phase === "VERDICT") resolveVerdict(s);
  else if (s.mode === "tp" && s.phase === "AWARD") resolveAward(s);
  else if (s.mode === "tp" && (s.phase === "PROMPT" || s.phase === "TASK")) {
    for (const p of s.players.filter((p) => !s.done.includes(p.id))) {
      if (s.phase === "PROMPT")
        s.chains[s.players.findIndex((x) => x.id === p.id)].push({
          kind: "text",
          author: p.id,
          text: "未出题",
          missing: true,
        });
      else {
        const t = taskFor(s, p.id)!;
        s.chains[Number(t.chain)].push(
          t.kind === "drawing"
            ? { kind: "drawing", author: p.id, drawingId: t.id, missing: true }
            : { kind: "text", author: p.id, text: "未猜出", missing: true },
        );
        for (const st of s.drawings[t.id]?.strokes ?? []) st.closed = true;
      }
    }
    nextTask(s, now);
  } else if (s.phase === "CATEGORY") resolveCategory(s, now);
  else if (s.phase === "DRAW") finishTurn(s, now);
  else if (s.phase === "DISCUSS") {
    s.phase = "VOTE";
    s.deadline = now + 30000;
  } else if (s.phase === "VOTE") decide(s, now);
  else if (s.phase === "OBSERVE") {
    s.phase = "GUESS";
    s.deadline = now + 30000;
  } else if (s.phase === "GUESS") {
    s.phase = "RESULT";
    s.winner = "artists";
    s.deadline = 0;
  }
  return s;
}
const visibleDrawing = (d: Drawing | undefined, aspect = 2): Drawing => ({
  aspect: d?.aspect ?? aspect,
  revision: d?.revision ?? 0,
  strokes: (d?.strokes ?? []).map((s) => ({ ...s })),
});
export function viewFor(s: Game, id: string): GameView {
  const me = s.players.some((p) => p.id === id),
    v: GameView = {
      id: s.id,
      paperAspect: s.paperAspect ?? 2,
      mode: s.mode,
      phase: s.phase,
      players: s.players,
      step: s.step,
      steps: s.steps,
      turn: s.turn,
      deadline: s.deadline,
      completed: s.mode === "tp" ? s.done.length : Object.keys(s.votes).length,
      submitted: s.done.includes(id),
      cursor: s.cursor,
    };
  const entry = (e: Entry) => ({
    ...e,
    ...(e.kind === "drawing"
      ? { drawing: visibleDrawing(s.drawings[e.drawingId!], s.paperAspect) }
      : {}),
  });
  if (s.mode === "tp") {
    v.theme = s.theme;
    if (s.phase === "THEME") {
      v.themes = TP_THEMES;
      v.completed = Object.keys(s.themeVotes ?? {}).length;
      if (me) v.myThemeVote = s.themeVotes?.[id];
      return v;
    }
    v.awardResults = structuredClone(s.awardResults ?? []);
    v.verdictResults = structuredClone(s.verdictResults ?? []);
    if (
      ["VERDICT", "VERDICT_RESULT", "AWARD", "AWARD_RESULT"].includes(s.phase)
    )
      v.verdictVotes = structuredClone(s.verdictVotes ?? {});
    if (
      ["VERDICT", "VERDICT_RESULT", "AWARD", "AWARD_RESULT"].includes(s.phase)
    ) {
      v.awardChain = awardChain(s);
      v.awardCandidates = [
        ...new Set(s.chains[v.awardChain].map((e) => e.author)),
      ];
      v.completed = Object.keys(
        s.phase.startsWith("VERDICT")
          ? (s.verdictVotes ?? {})
          : (s.awardVotes ?? {}),
      ).length;
      if (s.phase === "AWARD" || s.phase === "AWARD_RESULT")
        v.awardVotes = structuredClone(s.awardVotes ?? {});
      if (me) v.myAwardVote = s.awardVotes?.[id];
    }
    if (s.phase === "RESULT") v.awardTotals = awardTotals(s);
    const t = me ? taskFor(s, id) : null;
    if (t) {
      v.task = { ...t, source: entry(t.source) };
      v.drawing = visibleDrawing(s.drawings[t.id], s.paperAspect);
    }
    if (
      [
        "REVEAL",
        "VERDICT",
        "VERDICT_RESULT",
        "AWARD",
        "AWARD_RESULT",
        "RESULT",
      ].includes(s.phase)
    )
      v.albums = s.chains.map((es, c) => ({
        owner: s.players[c],
        entries: es
          .slice(
            0,
            s.phase === "RESULT"
              ? es.length
              : Math.max(0, s.cursor - c * (s.steps + 1) + 1),
          )
          .map(entry),
      }));
  } else {
    if (s.phase === "CATEGORY") {
      v.categories = [...WORDS.map((b) => b.category), "随机"];
      v.completed = Object.keys(s.categoryVotes ?? {}).length;
      if (me) v.myCategoryVote = s.categoryVotes?.[id];
      return v;
    }
    v.category = s.category;
    v.drawing = visibleDrawing(s.drawings.shared, s.paperAspect);
    if (me) {
      v.role = id === s.fakeId ? "fake" : "artist";
      if (id !== s.fakeId || s.phase === "RESULT") v.word = s.word;
    }
    if (s.phase === "DRAW")
      v.currentId = s.players[s.turn % s.players.length].id;
    if (s.phase === "GUESS" && id === s.fakeId) v.options = s.options;
    if (s.phase === "VOTE") v.myVote = s.votes[id];
    if (s.phase === "RESULT") {
      v.fakeId = s.fakeId;
      v.word = s.word;
      v.votes = s.votes;
      v.winner = s.winner;
      v.guess = s.guess;
    }
  }
  return v;
}
