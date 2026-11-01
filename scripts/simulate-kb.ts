/** 卡里巴湖平衡模拟：npx tsx scripts/simulate-kb.ts [局数]（默认 3000） */
import { createKB, reduceKB, simpleAI, teamScoresKB, winnersKB } from "../packages/kariba/src/index.ts";

const N = Number(process.argv[2] ?? 3000);
const cases: [number, "solo" | "team"][] = [
  [2, "solo"], [3, "solo"], [4, "solo"], [5, "solo"], [4, "team"], [6, "team"], [8, "team"],
];

function lcg(seed: number) {
  let x = seed || 1;
  return () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
}

console.log(`每种配置 ${N} 局，种子 1–${N}；简单 AI；先手随机。胜率按「相对先手的位置」统计（并列按人头平分）。\n`);
for (const [n, mode] of cases) {
  const groups = mode === "team" ? n / 2 : n;
  const posWin = Array(groups).fill(0);
  let maxChase = 0, sumChase = 0, chases = 0, sumGap = 0, sumTurns = 0, ties = 0;
  for (let seed = 1; seed <= N; seed++) {
    let s = createKB(Array.from({ length: n }, (_, i) => `p${i}`), { seed, mode });
    const r = lcg(seed * 31 + n);
    while (s.phase === "PLAY") s = reduceKB(s, {
      type: "PLAY", actor: s.turn, seq: (s.seq[String(s.turn)] ?? 0) + 1, now: 0, cardIds: simpleAI(s, s.turn, r),
    });
    for (const l of s.log) for (const e of l.events) if (e.type === "CHASE") {
      maxChase = Math.max(maxChase, e.cards); sumChase += e.cards; chases++;
    }
    const ts = [...teamScoresKB(s).entries()].sort((a, b) => b[1] - a[1]);
    sumGap += ts[0][1] - ts[1][1];
    sumTurns += s.turnNo;
    // 相对先手位置：组队时用队伍里先出牌的那个人
    const winTeams = [...new Set(winnersKB(s).map((i) => s.players[i].team))];
    if (winTeams.length > 1) ties++;
    for (const t of winTeams) {
      const seats = s.players.map((p, i) => (p.team === t ? i : -1)).filter((i) => i >= 0);
      const rel = Math.min(...seats.map((i) => (i - s.first + n) % n));
      posWin[rel] += 1 / winTeams.length;
    }
  }
  const pct = posWin.map((w) => ((w / N) * 100).toFixed(1) + "%");
  const fair = 100 / groups;
  const dev = Math.max(...posWin.map((w) => Math.abs((w / N) * 100 - fair)));
  console.log(
    `${mode === "team" ? `${n}人组队(${groups}队)` : `${n}人个人战`}｜按出牌顺序胜率 ${pct.join(" / ")}（均值 ${fair.toFixed(1)}%，最大偏离 ${dev.toFixed(1)} 点）｜单次最大收牌 ${maxChase}｜平均每次收牌 ${(sumChase / chases).toFixed(2)}｜第1-2名平均差 ${(sumGap / N).toFixed(1)}｜平均总回合 ${(sumTurns / N).toFixed(0)}｜并列 ${((ties / N) * 100).toFixed(1)}%`,
  );
}
