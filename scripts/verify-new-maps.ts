// 新地图（克洛普瑞恩疯人院、奥蒙德）：校验连线 + 固定种子整局模拟，逃生者和杀手都要能赢
import { simulateGame } from "./simulation.ts";
import maps from "../packages/game-data/MAP_DATA.json" with { type: "json" };
import { BOARD_LAYOUT } from "../apps/web/src/boardLayout.ts";
const ids = ["crotus_prenn_asylum", "ormond"];
let fail = 0;
for (const id of ids) {
  const m = (maps as any).maps.find((x: any) => x.id === id);
  const rooms = new Set(m.nodes.map((n: any) => n.id));
  const deg = new Map<string, number>();
  for (const e of m.edges) for (const r of e.rooms) { if (!rooms.has(r)) { console.error(id, e.id, "未知房间", r); fail++; } deg.set(r, (deg.get(r) ?? 0) + 1); }
  for (const r of rooms) if (!deg.get(r as string)) { console.error(id, "孤立房间", r); fail++; }
  const L = BOARD_LAYOUT[id];
  for (const e of m.edges) if (!L?.markers[e.id]) { console.error(id, e.id, "棋盘上没有路线图标"); fail++; }
  for (const r of rooms) if (!L?.rooms[r as string]) { console.error(id, r, "棋盘上没有房间"); fail++; }
  console.log(id, "房间", rooms.size, "路线", m.edges.length);
}
const S = [["dwight", "claudette", "jake", "ace"], ["meg", "nea", "feng_min", "ace"], ["dwight", "meg", "jake", "claudette"]];
const K = ["trapper", "nurse", "doctor", "hag", "hillbilly"];
for (const mapId of ids) {
  const wins = new Set<string>();
  for (let i = 0; i < 12 && wins.size < 2; i++) {
    for (const goal of ["survivor", "killer"] as const) {
      if (wins.has(goal)) continue;
      const seed = 5000 + i * 37 + (goal === "killer" ? 1 : 0);
      try {
        const r = simulateGame({ seed, mapId, survivors: S[i % 3], killer: K[i % 5] }, goal);
        console.log(JSON.stringify({ mapId, seed, goal, winner: r.state.winner, commands: r.commands.length }));
        if (r.state.winner === goal) wins.add(goal);
      } catch (e) {
        const msg = String((e as Error).message);
        if (msg.startsWith("simulation limit")) console.log(JSON.stringify({ mapId, seed, goal, winner: "步数上限（机器人没打完）" }));
        else { console.error(mapId, seed, "出错", msg.slice(0, 300)); fail++; }
      }
    }
  }
  if (wins.size < 2) { console.error(mapId, "没能让双方都赢", [...wins]); fail++; }
}
if (fail) { console.error("失败", fail); process.exit(1); }
console.log("新地图检查通过");
