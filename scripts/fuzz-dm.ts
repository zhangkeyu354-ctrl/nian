// 请留遗言规则乱打测试：随机角色组合 × 随机合法操作，找卡死、报错和数据异常。
// 只用每位玩家自己的 viewDM（和网页看到的一样）来决定操作。
import {
  createDM,
  reduceDM,
  viewDM,
  actorsDM,
  roles,
  validatePool,
  defaultPool,
  type DMState,
} from "../packages/dying-message/src/index.ts";
import evidence from "../packages/dying-message/src/evidence.json" with { type: "json" };

const GAMES = Number(process.env.GAMES ?? 20000);
const cards = evidence.filter((a: any) => a.enabled).map((a: any) => a.id);
let seed = Number(process.env.SEED ?? 12345);
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const sample = <T,>(a: T[], n: number) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b.slice(0, n);
};
const role = (id: string) => roles.find((r) => r.roleId === id)!;

function randomPool(n: number) {
  const std = defaultPool(n);
  const kill = std.filter((x) => role(x).canKill).length;
  const guilty = std.filter((x) => role(x).faction === "GUILTY" && !role(x).canKill).length;
  for (let t = 0; t < 200; t++) {
    const used: Record<string, number> = {};
    const take = (f: (r: any) => boolean, k: number) => {
      const out: string[] = [];
      while (out.length < k) {
        const opts = roles.filter((r) => f(r) && (used[r.roleId] ?? 0) < r.count);
        const r = pick(opts);
        used[r.roleId] = (used[r.roleId] ?? 0) + 1;
        out.push(r.roleId);
      }
      return out;
    };
    const pool = [
      ...take((r) => r.canKill, kill),
      ...take((r) => r.faction === "GUILTY" && !r.canKill, guilty),
      ...take((r) => r.faction === "INNOCENT", n - kill - guilty),
    ];
    try {
      validatePool(pool, n);
      return sample(pool, n);
    } catch {}
  }
  throw Error("pool");
}

const issues = new Map<string, { count: number; example: string }>();
function report(kind: string, detail: string) {
  const e = issues.get(kind) ?? { count: 0, example: detail };
  e.count++;
  issues.set(kind, e);
}
const brief = (s: DMState) =>
  JSON.stringify({
    phase: s.phase,
    round: s.round,
    players: s.players.map((p) => p.roleId + (p.alive ? "" : "†")),
    protected: s.protected,
    soulmate: s.soulmate,
    forensics: s.forensics,
    groups: s.evidenceGroups,
    step: s.evidenceStep,
    pool: s.pool.length,
    discard: s.discard.length,
    deck: s.deck.length,
  });

function move(s: DMState, now: number): DMState | null {
  const actors = actorsDM(s);
  if (!actors.length) {
    report("没有可操作的人（卡死）", brief(s));
    return null;
  }
  const v0 = viewDM(s, actors[0]);
  const act = (id: string, c: any) => reduceDM(s, id, c, now);
  switch (s.phase) {
    case "NIGHT_PREPARATION": {
      const id = actors[0];
      const v = viewDM(s, id);
      if (!v.legalTargets.length) {
        report("夜间准备没有合法目标", brief(s));
        return null;
      }
      return act(id, { type: "PREPARE", target: pick(v.legalTargets) });
    }
    case "KILLER_SELECTION": {
      if (v0.legalTargets.length < v0.required) {
        report("行凶：合法目标少于需要人数（卡死）", brief(s) + " legal=" + v0.legalTargets.length + " req=" + v0.required);
        return null;
      }
      const t = sample(v0.legalTargets, v0.required);
      let n = s;
      for (const id of actors) n = reduceDM(n, id, { type: "KILL", targets: t }, now);
      return n;
    }
    case "VICTIM_EVIDENCE":
    case "KILLER_FAKE_EVIDENCE": {
      if (v0.pool.length < v0.required) {
        report(s.phase + "：可选牌少于需要张数", brief(s));
        return null;
      }
      if (!v0.active) report("行动者的 view.active=false", brief(s));
      const c = sample(v0.pool, v0.required);
      let n = s;
      for (const id of actors)
        n = reduceDM(n, id, { type: s.phase === "VICTIM_EVIDENCE" ? "TRUE" : "FAKE", cards: c }, now);
      return n;
    }
    case "SPECIAL_INFORMATION":
      return act(actors[0], { type: "INFO_ACK" });
    case "INVESTIGATION":
    case "ROUND_END": {
      const id = actors[0];
      const v = viewDM(s, id);
      if (s.forensics.includes(id)) {
        if (!v.forensic) report("鉴定专家该鉴定但界面不显示鉴定", brief(s));
        if (!v.forensicCards.length) {
          report("鉴定专家没有可鉴定的牌（卡死）", brief(s));
          return null;
        }
        return act(id, { type: "FORENSIC", card: pick(v.forensicCards) });
      }
      if (s.phase === "INVESTIGATION") {
        // 偶尔走超时
        return rnd() < 0.2
          ? reduceDM(s, id, { type: "SPEAK_TIMEOUT" }, s.deadline ?? now)
          : act(id, { type: "SPEAK_END" });
      }
      return act(id, { type: "NEXT" });
    }
    case "FIRST_VOTE":
    case "SECOND_VOTE": {
      const alive = s.players.filter((p) => p.alive).map((p) => p.id);
      // 偏向集中投票，以触发处决
      const focus = pick(alive);
      let n = s;
      for (const id of actorsDM(s))
        n = reduceDM(n, id, { type: "VOTE", target: rnd() < 0.75 ? focus : pick(alive) }, now);
      return n;
    }
    case "DEFENSE":
      return act(actors[0], { type: "DEFENSE_END" });
  }
  report("未知阶段", brief(s));
  return null;
}

function checkInvariants(s: DMState) {
  const all = [...s.pool, ...s.deck, ...s.discard, ...s.history.flatMap((h) => h.cards)];
  if (new Set(all).size !== all.length) report("证据牌重复（同一张牌出现两次）", brief(s));
  for (const id of s.players.map((p) => p.id)) {
    const v = viewDM(s, id);
    // 隐私：夜里别人身份不该泄露
    const night = ["NIGHT_PREPARATION", "KILLER_SELECTION", "VICTIM_EVIDENCE", "SPECIAL_INFORMATION", "KILLER_FAKE_EVIDENCE"].includes(s.phase);
    if (night && !s.winner)
      for (const p of v.players)
        if (p.id !== id && p.roleId) {
          const dead = s.deaths.some((d) => d.playerId === p.id && d.round < s.round);
          if (!dead) report("夜里泄露了他人身份", brief(s));
        }
    if (s.phase === "VICTIM_EVIDENCE" && v.active && v.required < 1) report("真遗言需要 0 张", brief(s));
  }
}

let finished = 0,
  rounds = 0;
const outcomes: Record<string, number> = {};
for (let g = 0; g < GAMES; g++) {
  const n = 4 + Math.floor(rnd() * 7);
  const pool = randomPool(n);
  const players = Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i }));
  let s: DMState;
  try {
    s = createDM(players, cards, Math.floor(rnd() * 2 ** 31), pool);
  } catch (e) {
    report("开局报错: " + (e as Error).message, pool.join(","));
    continue;
  }
  let now = 1000;
  for (let step = 0; step < 4000 && s.phase !== "GAME_OVER"; step++) {
    now += 1000;
    let next: DMState | null;
    try {
      next = move(s, now);
    } catch (e) {
      report("合法操作被拒/报错: " + (e as Error).message + " @" + s.phase, brief(s));
      next = null;
    }
    if (!next) break;
    s = next;
    try {
      checkInvariants(s);
    } catch (e) {
      report("视图报错: " + (e as Error).message, brief(s));
      break;
    }
    if (step === 3999) report("超过 4000 步没结束（死循环）", brief(s));
  }
  if (s.phase === "GAME_OVER") {
    finished++;
    rounds += s.round;
    outcomes[s.winner!] = (outcomes[s.winner!] ?? 0) + 1;
  }
}
console.log(`对局 ${GAMES}，正常结束 ${finished}，平均 ${(rounds / Math.max(1, finished)).toFixed(1)} 轮`, outcomes);
if (!issues.size) console.log("FUZZ_PASS 没有发现问题");
for (const [k, v] of [...issues].sort((a, b) => b[1].count - a[1].count))
  console.log(`\n[${v.count}] ${k}\n   例：${v.example.slice(0, 600)}`);
