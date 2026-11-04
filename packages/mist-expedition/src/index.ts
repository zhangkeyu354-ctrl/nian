// 迷雾远征引擎：纯函数 reduceMY / viewForMY，所有随机来自 state.rng。
import content from "./content.json" with { type: "json" };
import content2 from "./content2.json" with { type: "json" };
const W: any = content2;
export const ROUTE = ["loc-01","loc-02","loc-03","loc-12","loc-04","loc-05","loc-11","loc-06","loc-10","loc-09","loc-07","loc-08"];
export const MAX_ROUNDS = 7; export const WORLD = W;
const C: any = content;
export const PLAYER_BONUS: Record<number, number> = { 2: 2, 3: 1, 4: 2, 5: 4, 6: 4, 7: 6, 8: 7 };
export const BASE: Record<string, number> = { 简单: 9, 普通: 11, 困难: 13 };
export const COLORS = ["刚", "影", "智", "言"];
const STAGES = ["开端", "障碍", "大变局", "终局"];
export type Card = { id: string; color: string; value: number };
export type Player = { seat: number; cls: string; hp: number; stress: number; flashback: boolean; hand: Card[]; oath: string; oathTarget?: number; hiddenGoal?: string; acted: number; intelCount: number; out: boolean; uses: number; peek?: Card; traitor: boolean; recruit: boolean; defected: boolean; letterUsed: boolean; letter: boolean };
export type Log = { type: string; [k: string]: any };
export type State = {
  rng: number; n: number; phase: string; players: Player[]; deck: Card[]; discard: Card[];
  supplies: number; clues: number; omen: number; doom: number; sceneIdx: number; sceneIds: string[];
  actor: number; planId?: string; deal?: any; dealOffer?: any; intel: { seat: number; id: string }[]; nextDoom: number;
  played: { seat: number; card: Card }[]; reveal: Card[]; roll?: any; total: number; passed: number[]; forkDone: boolean;
  votes: Record<number, number | null>; inspectLeft: number; inspected: boolean; jailed?: number; lastPlays: Record<number, boolean>; inspectResults: Record<number, { target: number; effective: boolean | null }>; recruited: boolean; defections: number; boss?: { id: string; hp: number; max: number; round: number; moves: any[]; move: any; weak: string; enraged: boolean; bonus: number; blocked: boolean }; bossId: string; cur: any; pos: number; round: number; rifts: string[]; monsters: Record<string, { id: string; hp: number }>; mysteries: string[]; solved: number; progress: { kills: number; closed: number; spent: number }; usedEnc: string[]; usedMyth: string[]; visited: string[]; awakened: boolean; lastResult?: any; lastMythos?: any; fork?: any; colorSwap?: { from: string; to: string }; log: Log[]; finalOutcome?: string; ending?: string; seq: number; usedIncidents: string[];
};
export type Cmd =
  | { t: "PLAN"; seat: number; planId: string; acceptDeal?: boolean }
  | { t: "FORK"; seat: number; optionId: string }
  | { t: "CONTRIBUTE"; seat: number; cardId: string }
  | { t: "ROLL"; seat: number; push: boolean }
  | { t: "FLASHBACK"; seat: number; pay: "supplies" | "stress" }
  | { t: "PASS"; seat: number }
  | { t: "MOVE"; seat: number; pos: number }
  | { t: "VOTE"; seat: number; target: number | null }
  | { t: "INSPECT"; seat: number; target: number }
  | { t: "DEFECT"; seat: number }
  | { t: "LETTER"; seat: number; target: number }
  | { t: "ANSWER"; seat: number; accept: boolean }
  | { t: "ABILITY"; seat: number; target?: number; to?: string };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function rnd(s: State) { s.rng = (s.rng * 1664525 + 1013904223) >>> 0; let x = s.rng; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }
const die = (s: State) => 1 + Math.floor(rnd(s) * 6);
function shuffle<T>(s: State, a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pick = <T,>(s: State, a: T[]) => a[Math.floor(rnd(s) * a.length)];
export const CONTENT = C;
const mv = (name: string, text: string, target: string, changes: any) => ({ name, text, effect: { target, changes } });
export const BOSSES: Record<string, any> = Object.fromEntries(W.boss_rules.map((b: any) => [b.id, { ...b, art: b.id === "boss-golem" ? "boss-giant" : b.id }]));
export const BOSS_HP = 4;
function bossPlans(s: State) { const a = scene(s).plans; const mk = (id: string, name: string, p: any, difficulty: string) => ({ id, name, attribute: p.attribute, valid_colors: p.valid_colors, difficulty, tags: ["战斗"] }); return [mk("ATK", "猛攻：3/2/0 伤害", a[0], "简单"), mk("GRD", "格挡：成功时挡下招式，1 伤害", a[1], "简单"), mk("OPN", "寻找破绽：花 1 线索，1/0/0 伤害，下回合 +3", a[1], "普通")].filter((p) => p.id !== "OPN" || s.clues >= 1); }
const MAP_SCENE = { id: "MAP", title: "世界地图", type: "地图", narration: "选择下一站。", plans: [], intel: [], twists: [] };
export const scene = (s: State): any => s.cur ?? MAP_SCENE;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function plansOf(s: State) { if (s.boss) return bossPlans(s); const sc = scene(s); return [...sc.plans, ...(s.clues >= 2 ? sc.clue_unlock?.plans ?? [] : [])]; }
const hiddenPlan = (_s: State, _id: string) => false;
function draw(s: State): Card { if (!s.deck.length) { s.deck = shuffle(s, s.discard); s.discard = []; } return s.deck.pop()!; }
export function createGame(n: number, seed: number, classes?: string[]): State {
  if (n < 2 || n > 8) throw new Error("人数必须是 2–8");
  const s: any = { rng: seed >>> 0, n, phase: "PLAN", deck: [], discard: [], supplies: 4, clues: 1, omen: 0, doom: 0, sceneIdx: 0, nextDoom: 0, intel: [], played: [], reveal: [], total: 0, passed: [], forkDone: false, log: [], seq: 0, usedIncidents: [], votes: {}, inspectLeft: 2, inspected: false, lastPlays: {}, inspectResults: {}, recruited: false, defections: 0, cur: null, pos: 0, round: 0, rifts: [], monsters: {}, solved: 0, progress: { kills: 0, closed: 0, spent: 0 }, usedEnc: [], usedMyth: [], visited: ["loc-01"], awakened: false };
  let i = 0; for (const color of COLORS) for (let g = 0; g < 2; g++) for (const value of [1, 1, 1, 2, 2, 3]) s.deck.push({ id: `c${i++}`, color, value });
  shuffle(s, s.deck);
  const oaths = shuffle(s, C.secret_oaths.map((o: any) => o.id)) as string[];
  s.players = Array.from({ length: n }, (_, seat) => { const oath = oaths[seat]; const p: Player = { seat, cls: classes?.[seat] ?? C.game.classes[seat % 4].id, hp: 3, stress: 0, flashback: true, hand: [], oath, acted: 0, intelCount: 0, out: false, uses: 2, traitor: false, recruit: false, defected: false, letterUsed: false, letter: false };
    if (oath === "O03") p.oathTarget = (seat + 1 + Math.floor(rnd(s) * (n - 1))) % n; return p; });
  for (const p of s.players) p.hand = [draw(s), draw(s), draw(s)];
  const roll = rnd(s); const tc = n === 2 ? 0 : n <= 5 ? (roll < 0.2 ? 0 : 1) : roll < 0.15 ? 0 : roll < 0.65 ? 1 : 2;
  for (const seat of (shuffle(s, s.players.map((p: Player) => p.seat)) as number[]).slice(0, tc)) s.players[seat].traitor = true;
  s.sceneIds = []; s.bossId = pick(s, W.boss_rules as any[]).id; s.mysteries = shuffle(s, W.mysteries.filter((m: any) => m.boss === s.bossId).map((m: any) => m.id)).slice(0, 3);
  startScene(s); return s;
}
function metric(s: State, m: string) { return (s as any)[m]; }
const cmp = (a: number, op: string, b: number) => ({ ">=": a >= b, gte: a >= b, "<=": a <= b, lte: a <= b, "<": a < b, ">": a > b } as any)[op];
function forkReady(s: State, f: any) { return f.hidden_trigger.all.every((c: any) => c.stage_in ? c.stage_in.includes(STAGES[s.sceneIdx]) : c.metric ? cmp(metric(s, c.metric), c.op, c.value) : s.players.some((p: any) => cmp(p[c.any_player_metric.metric], c.any_player_metric.op, c.any_player_metric.value))); }
function pickActor(s: State) { const free = s.players.filter((p) => !p.out && p.seat !== s.jailed); const min = Math.min(...free.map((p) => p.acted)); s.actor = (free.filter((p) => p.acted === min).sort((a, b) => ((a.seat - s.round + 16) % 8) - ((b.seat - s.round + 16) % 8))[0] ?? s.players[0]).seat; s.players[s.actor].acted++; }
function reset(s: State) { s.planId = undefined; s.deal = undefined; s.colorSwap = undefined; for (const q of s.players) q.peek = undefined; s.played = []; s.reveal = []; s.roll = undefined; s.passed = []; s.intel = []; }
function dealIntel(s: State) { const cnt = s.n >= 6 ? 2 : 1, pl = s.cur.plans[0]; const pool = s.boss ? [`Boss 弱点是${s.boss.weak}色：有效的${s.boss.weak}色牌每张再 +1。`, `Boss 弱点是${s.boss.weak}色。`] : [`这次${pl.valid_colors[0]}色牌最有用：每张再 +1。`, `这次${pl.valid_colors[1]}色牌最有用：每张再 +1。`]; const fx = s.boss ? [{}, {}] : pl.valid_colors.map((c: string) => ({ plan: pl.id, color: c, card_bonus: 1 })); s.cur.intel = pool.map((text, i) => ({ id: "I" + i, text, engine_effect: fx[i] }));
  const cand = s.players.filter((p) => p.seat !== s.actor && p.seat !== s.jailed).sort((a, b) => a.intelCount - b.intelCount || a.seat - b.seat).slice(0, cnt);
  cand.forEach((p, i) => { p.intelCount++; s.intel.push({ seat: p.seat, id: "I" + i }); s.log.push({ type: "intel_given", seat: p.seat, id: "I" + i, text: pool[i] }); });
  const av: any[] = C.devil_deals.filter((d: any) => dealOk(s, d)); s.dealOffer = av.length ? pick(s, av) : undefined; s.phase = "PLAN"; }
function startScene(s: State) {
  if (s.ending) return; reset(s);
  if (s.awakened) { const b = BOSSES[s.bossId]; if (!s.boss) s.boss = { id: s.bossId, hp: BOSS_HP, max: BOSS_HP, round: 0, moves: shuffle(s, [...b.moves]), move: null, weak: pick(s, COLORS), enraged: false, bonus: 0, blocked: false }; s.boss.round++; s.boss.move = s.boss.moves[(s.boss.round - 1) % 4]; s.log.push({ type: "boss_move", name: s.boss.move.name }); pickActor(s);
    s.cur = { id: "BOSS", kind: "boss", title: b.name, type: "决战", narration: b.awaken_text, intel: [], twists: [], plans: [{ id: "P1", attribute: "力量", valid_colors: ["刚", "影"] }, { id: "P2", attribute: "魅力", valid_colors: ["智", "言"] }] }; dealIntel(s); return; }
  s.round++; if (s.round > MAX_ROUNDS) { awaken(s); return; } s.cur = null; pickActor(s); s.phase = "MAP";
}
function awaken(s: State) { const b = BOSSES[s.bossId]; s.awakened = true; s.doom = Math.min(s.doom, 4); s.log.push({ type: "awaken" }); apply(s, b.awaken_effect, s.actor, "boss"); startScene(s); }
function enterLoc(s: State) { const loc = ROUTE[s.pos], m = s.monsters[loc], b = BOSSES[s.bossId]; if (!s.visited.includes(loc)) { s.visited.push(loc); if (b.passive.loc === loc) apply(s, b.passive.effect, s.actor, "boss"); } if (s.ending) return; checkMystery(s); if (s.ending) return;
  const name = W.locations.find((l: any) => l.id === loc).name;
  if (m) { const d = W.monsters.find((x: any) => x.id === m.id); s.cur = { id: m.id, kind: "monster", loc, title: d.name, type: "遭遇怪物 · " + name, narration: d.flavor, intel: [], twists: [], plans: [{ id: "P1", name: `攻击 ${d.name}（剩 ${m.hp} 血）`, ...d.test, tags: ["战斗"] }] }; }
  else if (s.rifts.includes(loc)) s.cur = { id: "rift", kind: "rift", loc, title: "迷雾裂隙", type: "封闭裂隙 · " + name, narration: "紫灰色裂缝正把灾厄送进世界。", intel: [], twists: [], plans: [{ id: "P1", name: "封闭裂隙", attribute: "智识", difficulty: "普通", valid_colors: ["智", "影"], tags: ["调查"] }] };
  else { let pool = W.encounters.filter((e: any) => e.loc === loc && !s.usedEnc.includes(e.id)); if (!pool.length) pool = W.encounters.filter((e: any) => e.loc === loc); const e: any = pick(s, pool); s.usedEnc.push(e.id); s.cur = { id: e.id, kind: "enc", loc, title: e.title, type: name, narration: e.text, intel: [], twists: [], plans: [{ id: "P1", name: "正面处理", ...e.test, tags: ["调查"], outcomes: e.outcomes }] }; }
  dealIntel(s); }
function goalDone(s: State, g: any) { return g.type === "clues" ? s.clues >= g.amount : g.type === "close_rifts" ? s.progress.closed >= g.count : g.type === "kill_monster" ? s.progress.kills >= g.count : ROUTE[s.pos] === g.loc; }
function checkMystery(s: State) { while (s.solved < 3 && !s.awakened) { const m = W.mysteries.find((x: any) => x.id === s.mysteries[s.solved]); if (!goalDone(s, m.goal)) return; if (m.goal.type === "clues") s.clues -= m.goal.amount; s.solved++; s.progress = { kills: 0, closed: 0, spent: 0 }; s.log.push({ type: "mystery_solved", title: m.title }); s.lastResult = { title: "谜团解开：" + m.title, outcome: "完全成功", text: m.text }; } if (s.solved >= 3 && !s.ending) { s.finalOutcome = "完全成功"; finish(s); } }
function mythos(s: State) { let pool = W.mythos.filter((m: any) => !s.usedMyth.includes(m.id)); if (!pool.length) pool = W.mythos; const m: any = pick(s, pool); s.usedMyth.push(m.id); s.lastMythos = { title: m.title, text: m.text, type: m.type }; if (m.type === "rift" && !s.rifts.includes(m.loc)) s.rifts.push(m.loc); if (m.type === "monster" && !s.monsters[m.loc]) s.monsters[m.loc] = { id: m.monster_id, hp: W.monsters.find((x: any) => x.id === m.monster_id).hp }; apply(s, m.effect, s.actor, "mythos"); if (!s.ending && s.rifts.length >= 3) apply(s, { target: "team", changes: { doom: 1 } }, s.actor, "mythos"); }
function dealOk(s: State, d: any) { const a = d.availability ?? {}, p = s.players[s.actor]; return (a.actor_stress_at_most ?? 99) >= p.stress && (a.hp_at_least ?? 0) <= p.hp && (a.doom_at_most ?? 99) >= s.doom && (a.omen_at_most ?? 99) >= s.omen && (a.supplies_at_least ?? 0) <= s.supplies && (a.clues_at_least ?? 0) <= s.clues; }
function targets(s: State, t: string, who: number): number[] {
  const next = (s.actor + 1) % s.n;
  switch (t) { case "team": return []; case "actor": return [s.actor]; case "next_seat": return [next]; case "others": return s.players.filter((p) => p.seat !== s.actor).map((p) => p.seat); case "all": return s.players.map((p) => p.seat); case "selected_player": return [who];
    case "lowest_hp_player": return [[...s.players].sort((a, b) => a.hp - b.hp || a.seat - b.seat)[0].seat]; default: return []; }
}
function apply(s: State, e: any, who: number, src: string) {
  const c = e.changes; const part = [s.actor, ...s.played.filter((x) => valid(s, x.card)).map((x) => x.seat)];
  for (const f of ["supplies", "clues", "omen", "doom"]) if (c[f]) { const b = (s as any)[f]; (s as any)[f] = clamp(b + c[f], 0, 8); s.log.push({ type: "effect_applied", field: f, delta: (s as any)[f] - b, src, participants: src === "plan" ? part : [] }); }
  for (const t of targets(s, e.target, who)) { let p = s.players[t]; p.stress = clamp(p.stress + (c.stress ?? 0), 0, 6); if ((c.hp ?? 0) < 0 && p.cls !== "warrior") { const w = s.players.find((q) => q.cls === "warrior" && q.hp > 1); if (w) { p = w; s.log.push({ type: "guard", seat: w.seat }); } } p.hp = clamp(p.hp + (c.hp ?? 0), 0, 3); }
  checkDoom(s);
}
function checkDoom(s: State) { if (s.doom >= 8 && !s.ending) { if (s.awakened) finish(s); else if (s.phase !== "COUNCIL" && s.phase !== "RESOLVE" && s.phase !== "CONTRIBUTE" && s.phase !== "PLAN" && s.phase !== "MAP") { /* 等本轮结束再苏醒 */ } } }
const plan = (s: State) => s.boss ? [...bossPlans(s), ...scene(s).plans].find((p: any) => p.id === s.planId) ?? { id: "OPN", name: "寻找破绽", attribute: scene(s).plans[1].attribute, valid_colors: scene(s).plans[1].valid_colors, difficulty: "普通", tags: ["战斗"] } : [...scene(s).plans, ...(scene(s).clue_unlock?.plans ?? [])].find((p: any) => p.id === s.planId);
export function validColors(s: State): string[] { const v: string[] = plan(s)?.valid_colors ?? []; const x = s.colorSwap; return x ? v.map((c) => (c === x.from ? x.to : c)) : v; }
function valid(s: State, c: Card) { return validColors(s).includes(c.color); }
const intelOf = (s: State, id: string) => scene(s).intel.find((x: any) => x.id === id)?.engine_effect ?? {};
const myIntel = (s: State) => s.boss ? [] : s.intel.map((i) => scene(s).intel.find((x: any) => x.id === i.id).engine_effect).filter((e: any) => e.plan === s.planId);
function cardScore(s: State, c: Card) { const w = s.boss && c.color === s.boss.weak && valid(s, c) ? 1 : 0; const b = w + myIntel(s).filter((e: any) => e.color === c.color).reduce((a: number, e: any) => a + e.card_bonus, 0); return valid(s, c) ? c.value + b : -c.value; }
export function need(s: State) { return BASE[plan(s).difficulty] + PLAYER_BONUS[s.n]; }
export function outcomeOf(total: number, N: number) { return total >= N + 3 ? "完全成功" : total >= N ? "代价成功" : "失败"; }
function resolve(s: State) {
  const p = plan(s), out = outcomeOf(s.total, need(s)), c = s.cur, title = c.title;
  s.log.push({ type: "plan_resolved", scene: c.id, plan: p.id, actor: s.actor, outcome: out, tags: p.tags ?? [], difficulty: p.difficulty, participants: [s.actor, ...s.played.filter((x) => valid(s, x.card)).map((x) => x.seat)] });
  if (s.roll.panic) { const pool = C.out_of_control_results.filter((x: any) => !s.usedIncidents.includes(x.id)); const i: any = pick(s, pool.length ? pool : C.out_of_control_results); s.usedIncidents.push(i.id); s.log.push({ type: "incident_triggered", id: i.id }); if (s.players[s.actor].stress >= 6) s.players[s.actor].out = true; apply(s, i.effect, s.actor, "incident"); if (s.ending) return; }
  if (s.boss) { const b = s.boss, dmg = ({ ATK: { 完全成功: 3, 代价成功: 2, 失败: 0 }, GRD: { 完全成功: 1, 代价成功: 1, 失败: 0 }, OPN: { 完全成功: 1, 代价成功: 0, 失败: 0 } } as any)[p.id][out];
    const blocked = p.id === "GRD" && out !== "失败"; b.bonus = p.id === "OPN" ? 3 : 0; b.hp = Math.max(0, b.hp - dmg); s.log.push({ type: "boss_hit", damage: dmg, outcome: out }); s.lastResult = { title, outcome: out, text: `造成 ${dmg} 点伤害。` };
    if (b.hp <= 0) { s.finalOutcome = b.round <= 2 ? "完全成功" : "代价成功"; finish(s); return; }
    if (!blocked && out !== "完全成功") for (let i = 0; i < (b.enraged ? 2 : 1); i++) { apply(s, b.move.effect, s.actor, "boss"); if (s.ending) return; }
    if (!b.enraged && b.hp <= b.max / 2) { b.enraged = true; s.log.push({ type: "boss_enrage" }); }
    if (b.round >= 3) { s.finalOutcome = "失败"; finish(s); return; }
  } else if (c.kind === "monster") { const m = s.monsters[c.loc], d = W.monsters.find((x: any) => x.id === m.id), dmg = out === "完全成功" ? 2 : out === "代价成功" ? 1 : 0; m.hp -= dmg; if (out === "失败") apply(s, d.on_lose, s.actor, "plan"); s.lastResult = { title, outcome: out, text: m.hp <= 0 ? "怪物被击败！" : `造成 ${dmg} 点伤害。` }; if (s.ending) return; if (m.hp <= 0) { delete s.monsters[c.loc]; s.progress.kills++; apply(s, d.reward, s.actor, "plan"); if (s.ending) return; }
  } else if (c.kind === "rift") { if (out !== "失败") { s.rifts = s.rifts.filter((x) => x !== c.loc); s.progress.closed++; if (out === "代价成功") apply(s, { target: "actor", changes: { stress: 1 } }, s.actor, "plan"); } else apply(s, { target: "team", changes: { doom: 1 } }, s.actor, "plan"); s.lastResult = { title, outcome: out, text: out === "失败" ? "裂隙反而扩大了。" : "裂隙合上了。" };
  } else { const o = p.outcomes[out]; apply(s, o.effect, s.actor, "plan"); s.lastResult = { title, outcome: out, text: o.text }; }
  if (s.ending) return; checkMystery(s); if (s.ending) return;
  s.lastPlays = Object.fromEntries(s.played.map((x) => [x.seat, !!valid(s, x.card)]));
  for (const x of s.played) { s.discard.push(x.card); s.players[x.seat].hand.push(draw(s)); }
  for (const p2 of s.players) if (p2.out && p2.seat !== s.actor) p2.out = false;
  s.discard.push(...s.reveal.filter((c2) => !s.played.some((x) => x.card.id === c2.id))); s.votes = {}; s.inspected = false; if (!s.boss) mythos(s); if (s.ending) return; if (s.n === 2) { closeCouncil(s); return; } s.phase = "COUNCIL";
}
function closeCouncil(s: State) {
  const tally: Record<number, number> = {}; for (const v of Object.values(s.votes)) if (v !== null) tally[v] = (tally[v] ?? 0) + 1;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]; s.jailed = undefined; for (const p of s.players) p.letter = false;
  if (top && top[1] > s.n / 2) { s.jailed = +top[0]; s.doom = clamp(s.doom + 1, 0, 8); s.log.push({ type: "jail", seat: s.jailed }); checkDoom(s); if (s.ending) return; }
  startScene(s);
}
function finish(s: State) { const lost = s.doom >= 8 || s.finalOutcome === "失败"; s.ending = lost ? "E02" : s.finalOutcome === "代价成功" || s.doom >= 6 ? "E03" : "E01"; s.phase = "ENDING"; s.log.push({ type: "ending", id: s.ending }); }
function checkCond(s: State, c: any, p: Player): boolean {
  if (c.all) return c.all.every((x: any) => checkCond(s, x, p)); if (c.any) return c.any.some((x: any) => checkCond(s, x, p));
  if (c.kind === "team_victory") return s.ending !== "E02";
  if (c.kind === "final_metric") { const o: any = c.target === "team" ? s : c.target === "assigned_player" ? s.players[p.oathTarget!] : p; return cmp(o[c.metric], c.op, c.value); }
  if (c.kind === "event_count") { const f = c.filters ?? {}; const n = s.log.filter((e) => e.type === c.event_type && (c.player_id !== "self" || e.seat === p.seat) && (f.color_effective === undefined || e.color_effective === f.color_effective) && (!f.participant || e.participants?.includes(p.seat)) && (!f.outcome || e.outcome === f.outcome) && (!f.outcome_in || f.outcome_in.includes(e.outcome)) && (!f.tags_any || f.tags_any.some((t: string) => e.tags?.includes(t))) && (!f.field || e.field === f.field) && (f.delta_gt === undefined || e.delta > f.delta_gt)).length; return cmp(n, c.op, c.value); }
  throw new Error("未知条件 " + JSON.stringify(c));
}
export function oathDone(s: State, seat: number) { const p = s.players[seat]; return checkCond(s, C.secret_oaths.find((o: any) => o.id === p.oath).completion_condition, p); }
export function reduceMY(prev: State, c: Cmd): State {
  const s = clone(prev), bad = (m: string) => { throw new Error(m); }; if (s.ending) bad("游戏已结束");
  if (c.t === "ANSWER") { const p = s.players[c.seat]; if (!p.letter) bad("你没有待回复的密信"); p.letter = false; if (c.accept && !p.traitor && !s.recruited) { p.recruit = true; s.recruited = true; } return s; }
  if (c.t === "VOTE" || c.t === "INSPECT" || c.t === "DEFECT" || c.t === "LETTER") { if (s.phase !== "COUNCIL") bad("现在不是议事阶段"); const p = s.players[c.seat];
    if (c.t === "VOTE") { if (c.target !== null && !s.players[c.target]) bad("没有这名玩家"); s.votes[c.seat] = c.target; if (Object.keys(s.votes).length === s.n) closeCouncil(s); return s; }
    if (c.t === "INSPECT") { if (s.inspected) bad("本轮已经搜过身"); if (s.inspectLeft < 1) bad("搜身次数已用完"); if (s.clues < 1) bad("线索不足"); if (c.target === c.seat || !s.players[c.target]) bad("请选择一名队友"); s.clues--; s.inspectLeft--; s.inspected = true; s.inspectResults[c.seat] = { target: c.target, effective: s.lastPlays[c.target] ?? null }; s.log.push({ type: "inspect", seat: c.seat, target: c.target }); return s; }
    if (c.t === "DEFECT") { if (!p.traitor) bad("你不能投诚"); p.traitor = false; p.defected = true; s.defections++; if (s.boss) s.boss.hp = Math.max(1, s.boss.hp - 2); else s.doom = clamp(s.doom - 1, 0, 8); s.log.push({ type: "defect" }); return s; }
    if (c.t !== "LETTER") bad("未知操作"); if (!p.traitor) bad("只有内奸能发密信"); if (p.letterUsed) bad("密信已用过"); if (s.recruited) bad("已经有人被策反"); if (c.target === c.seat || !s.players[c.target]) bad("请选择一名玩家"); p.letterUsed = true; s.players[c.target].letter = true; return s; }
  if (c.t === "ABILITY") { const p = s.players[c.seat]; if (p.uses < 1) bad("技能次数已用完");
    if (p.cls === "ranger") { if (s.phase !== "CONTRIBUTE" || !s.deck.length) bad("暗中出力时才能偷看"); p.peek = s.deck[s.deck.length - 1]; }
    else if (p.cls === "mage") { if (s.phase !== "CONTRIBUTE" || s.colorSwap) bad("现在不能改颜色"); if (!COLORS.includes(c.to!) || validColors(s).includes(c.to!)) bad("请选一种当前无效的颜色"); s.colorSwap = { from: validColors(s)[0], to: c.to! }; }
    else if (p.cls === "bard") { const q = s.players[c.target!]; if (!q || q.seat === c.seat) bad("请选择一名队友"); q.stress = clamp(q.stress - 2, 0, 6); }
    else bad("战士的护卫是自动生效的"); p.uses--; s.log.push({ type: "ability", seat: c.seat, cls: p.cls }); return s; }
  if (c.t === "MOVE") { if (s.phase !== "MAP") bad("现在不能移动"); if (c.seat !== s.actor) bad("只有领队能选路线"); if (Math.abs(c.pos - s.pos) > 2 || c.pos < 0 || c.pos > 11) bad("太远了，最多走 2 站"); s.pos = c.pos; enterLoc(s); return s; }
  if (c.t === "FORK") { if (s.phase !== "FORK") bad("现在不是岔路"); if (c.seat !== s.actor) bad("只有主行动者能选择"); const o = s.fork.options.find((x: any) => x.id === c.optionId) ?? bad("没有这个选项"); apply(s, o.effect, s.actor, "fork"); s.fork = undefined; if (!s.ending) s.phase = "PLAN"; return s; }
  if (c.t === "PLAN") { if (s.phase !== "PLAN") bad("现在不能选方案"); if (c.seat !== s.actor) bad("只有主行动者能选方案"); if (!plansOf(s).some((p) => p.id === c.planId)) bad("这个方案不可用"); s.planId = c.planId; if (!s.boss && hiddenPlan(s, c.planId)) s.clues -= 2; if (c.planId === "OPN") s.clues -= 1;
    if (c.acceptDeal) { if (!s.dealOffer) bad("没有可用交易"); s.deal = s.dealOffer; s.log.push({ type: "deal_accepted", seat: s.actor, id: s.deal.id }); apply(s, s.deal.accepted_cost, s.actor, "deal"); if (s.ending) return s; } s.phase = "CONTRIBUTE"; return s; }
  if (c.t === "CONTRIBUTE") { if (s.phase !== "CONTRIBUTE") bad("现在不能出牌"); if (c.seat === s.actor && s.n > 2) bad("主行动者不出牌"); if (c.seat === s.jailed) bad("你被关禁闭了"); if (s.played.some((x) => x.seat === c.seat)) bad("你已经出过牌"); const p = s.players[c.seat]; const i = p.hand.findIndex((x) => x.id === c.cardId); if (i < 0) bad("这张牌不在你手里"); const card = p.hand.splice(i, 1)[0]; s.played.push({ seat: c.seat, card }); s.log.push({ type: "hidden_card_played", seat: c.seat, color_effective: !!valid(s, card) });
    if (s.played.length === (s.n === 2 ? 2 : s.n - 1 - (s.jailed !== undefined ? 1 : 0))) { s.reveal = shuffle(s, [...s.played.map((x) => x.card), draw(s), draw(s)]); s.log.push({ type: "card_reveal", cards: s.reveal }); s.phase = "ROLL"; } return s; }
  if (c.t === "ROLL") { if (s.phase !== "ROLL") bad("现在不能掷骰"); if (c.seat !== s.actor) bad("只有主行动者能掷骰"); const p = s.players[s.actor]; if (c.push) p.stress = clamp(p.stress + 1, 0, 6); const dice = [die(s), die(s)], pd = c.push ? Array.from({ length: p.stress }, () => die(s)) : [];
    const attr = C.game.classes.find((x: any) => x.id === p.cls).attributes[plan(s).attribute]; const cards = s.reveal.reduce((a, x) => a + cardScore(s, x), 0); const intel = myIntel(s).reduce((a: number, e: any) => a + (e.total_bonus ?? 0), 0);
    s.total = dice[0] + dice[1] + attr + cards + intel + pd.filter((x) => x >= 4).length + (s.deal ? 2 : 0) + (s.boss?.bonus ?? 0); s.roll = { dice, pd, panic: pd.includes(1) }; s.log.push({ type: "dice_roll", ...s.roll, total: s.total }); s.phase = "FLASHBACK"; s.passed = []; return s; }
  if (s.phase !== "FLASHBACK") bad("现在不能闪回");
  if (c.t === "FLASHBACK") { const p = s.players[c.seat]; if (c.seat === s.jailed) bad("你被关禁闭了"); if (!p.flashback) bad("你已用过闪回"); if (c.pay === "supplies") { if (s.supplies < 1) bad("物资不足"); s.supplies--; } else p.stress = clamp(p.stress + 2, 0, 6); p.flashback = false; s.total += 3; s.log.push({ type: "flashback", seat: c.seat }); return s; }
  if (!s.passed.includes(c.seat)) s.passed.push(c.seat); if (s.passed.length === s.n) { s.phase = "RESOLVE"; resolve(s); } return s;
}
export function viewForMY(s: State, seat: number) { const m0 = W.mysteries.find((x: any) => x.id === s.mysteries[s.solved]); const mapView = { route: ROUTE, pos: s.pos, rifts: s.rifts, monsters: s.monsters, round: s.round, solved: s.solved, mystery: m0 ? { title: m0.title, text: m0.text, goal: m0.goal, progress: s.progress } : null, boss: BOSSES[s.bossId].name, passive: BOSSES[s.bossId].passive.text }; const bossView = s.boss ? { name: BOSSES[s.boss.id].name, art: BOSSES[s.boss.id].art, hp: s.boss.hp, max: s.boss.max, round: s.boss.round, move: { name: s.boss.move.name, text: s.boss.move.text }, enraged: s.boss.enraged } : null; const { rng, boss, cur, mysteries, bossId, deck, discard, played, intel, log, players, votes, inspectResults, lastPlays, recruited, ...pub } = s; return { ...pub, flashbackCount: log.filter((e) => e.type === "flashback").length, mapView, bossView, voted: Object.keys(votes).map(Number), myInspect: inspectResults[seat] ?? null, deckCount: deck.length, myIntel: intel.filter((i) => i.seat === seat), players: players.map((p) => p.seat === seat ? p : { seat: p.seat, cls: p.cls, hp: p.hp, stress: p.stress, flashback: p.flashback, out: p.out, handCount: p.hand.length }), playedCount: played.length, log: log.filter((e) => e.type !== "hidden_card_played" && e.type !== "intel_given" && e.type !== "effect_applied").map(({ participants, ...e }) => e) }; }
