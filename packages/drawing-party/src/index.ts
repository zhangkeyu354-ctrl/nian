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
];
export interface Stroke {
  id: string;
  color: number;
  width: number;
  points: Point[];
  closed: boolean;
  chunks: { from: number; count: number; end: boolean }[];
}
export interface Drawing {
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
  id: string;
  mode: Mode;
  players: Player[];
  phase:
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
}
export type Action =
  | { type: "TEXT"; text: string }
  | { type: "SUBMIT" }
  | { type: "VOTE"; target: string }
  | { type: "BEGIN_GUESS" }
  | { type: "GUESS"; answer: string }
  | { type: "NEXT" }
  | { type: "FINISH_DISCUSSION" };
export interface GameView {
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
    category: "动物",
    words: [
      "章鱼",
      "企鹅",
      "长颈鹿",
      "刺猬",
      "蝴蝶",
      "袋鼠",
      "蜗牛",
      "螃蟹",
      "海马",
      "骆驼",
      "猫头鹰",
      "斑马",
      "水母",
      "海豹",
      "蝙蝠",
      "孔雀",
      "乌龟",
      "鳄鱼",
    ],
  },
  {
    category: "生活物品",
    words: [
      "雨伞",
      "牙刷",
      "闹钟",
      "剪刀",
      "钥匙",
      "台灯",
      "水壶",
      "背包",
      "眼镜",
      "风扇",
      "相机",
      "扫把",
      "气球",
      "枕头",
      "手套",
      "镜子",
      "梳子",
      "茶杯",
    ],
  },
  {
    category: "交通工具",
    words: [
      "自行车",
      "潜水艇",
      "直升机",
      "热气球",
      "帆船",
      "火车",
      "滑板",
      "救护车",
      "摩托车",
      "挖掘机",
      "轮船",
      "独木舟",
      "消防车",
      "公交车",
      "雪橇",
      "缆车",
      "卡车",
      "三轮车",
    ],
  },
];
const fail = (s: string): never => {
  throw Error(s);
};
export function emptyDrawing(): Drawing {
  return { strokes: [], revision: 0 };
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
    s.color >= 8 ||
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
  opt: { fakeIndex: number; wordIndex: number; optionOffset?: number },
): Game {
  if (
    !["tp", "fa"].includes(mode) ||
    players.length < 3 ||
    players.length > 8 ||
    new Set(players.map((p) => p.id)).size !== players.length
  )
    fail("需要3–8位不同玩家");
  const bank = WORDS[Math.floor(opt.wordIndex / 18) % WORDS.length],
    wi = opt.wordIndex % 18;
  const offset = (opt.optionOffset ?? 0) % 18;
  const options = [...bank.words.slice(offset), ...bank.words.slice(0, offset)];
  return {
    id: "game-" + now,
    mode,
    players: structuredClone(players),
    phase: mode === "tp" ? "PROMPT" : "DRAW",
    step: 1,
    steps: players.length - (players.length % 2),
    turn: 0,
    deadline: now + (mode === "tp" ? 60000 : 30000),
    done: [],
    chains: players.map(() => []),
    drawings: { shared: emptyDrawing() },
    votes: {},
    fakeId: players[opt.fakeIndex % players.length].id,
    category: bank.category,
    word: bank.words[wi],
    options,
    cursor: 0,
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
export function act(state: Game, id: string, a: Action, now: number): Game {
  if (!state.players.some((p) => p.id === id)) fail("不是本局玩家");
  const s = structuredClone(state);
  if (a.type === "NEXT" && s.phase === "REVEAL") {
    if (id !== s.players[0].id) fail("由房主翻页");
    if (s.cursor >= s.players.length * (s.steps + 1) - 1) s.phase = "RESULT";
    else s.cursor++;
    return s;
  }
  if (a.type === "FINISH_DISCUSSION" && s.phase === "DISCUSS") {
    if (id !== s.players[0].id) fail("由房主结束讨论");
    s.phase = "VOTE";
    s.deadline = now + 30000;
    return s;
  }
  if (s.deadline && now >= s.deadline) fail("本阶段已到时");
  if (s.mode === "tp") {
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
  if (s.mode === "tp" && (s.phase === "PROMPT" || s.phase === "TASK")) {
    for (const p of s.players.filter((p) => !s.done.includes(p.id))) {
      if (s.phase === "PROMPT")
        s.chains[s.players.findIndex((x) => x.id === p.id)].push({
          kind: "text",
          author: p.id,
          text: "戴帽子的猫",
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
  } else if (s.phase === "DRAW") finishTurn(s, now);
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
const visibleDrawing = (d: Drawing | undefined): Drawing => ({
  revision: d?.revision ?? 0,
  strokes: (d?.strokes ?? []).map((s) => ({ ...s })),
});
export function viewFor(s: Game, id: string): GameView {
  const me = s.players.some((p) => p.id === id),
    v: GameView = {
      id: s.id,
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
      ? { drawing: visibleDrawing(s.drawings[e.drawingId!]) }
      : {}),
  });
  if (s.mode === "tp") {
    const t = me ? taskFor(s, id) : null;
    if (t) {
      v.task = { ...t, source: entry(t.source) };
      v.drawing = visibleDrawing(s.drawings[t.id]);
    }
    if (s.phase === "REVEAL" || s.phase === "RESULT")
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
    v.category = s.category;
    v.drawing = visibleDrawing(s.drawings.shared);
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
