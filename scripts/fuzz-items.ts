// 随机合法对局压力测试：只通过公开命令推进，随机穿插物品使用（包括不在自己回合时）。
// 检查：任何时刻都不会卡死（没有胜负时总有人有合法命令）、不抛出意外错误、隐私视图不泄露物品。
// 用法：npx tsx scripts/fuzz-items.ts [局数=300]
import { strict as assert } from "node:assert";
import {
  createGame,
  reduce,
  getControls,
  viewFor,
  HIDDEN,
  itemActions,
} from "../packages/game-engine/src/index.ts";
import type { GameState, Command, Card } from "../packages/shared/src/types.ts";

const games = Number(process.argv[2] ?? 300);
const survivorsPool = ["dwight", "meg", "claudette", "jake", "nea", "ace", "feng_min"];
const killers = ["trapper", "wraith", "hillbilly", "nurse", "hag", "doctor"];
const maps = ["macmillan_estate", "autohaven_wreckers"];
let rng = 12345;
const rand = (n: number) => {
  rng = (rng * 1103515245 + 12345) >>> 0;
  return rng % n;
};
const pick = <T>(a: T[]) => a[rand(a.length)];
const stats = { games: 0, commands: 0, itemUses: 0, byItem: {} as Record<string, number>, winners: {} as Record<string, number>, rounds: 0 };

function planCommand(s: GameState): Command | null {
  const id = [...s.publicPlans, ...s.survivors, s.killerId].find(
    (id) => !s.plans[id] && !s.actors[id].hookId,
  );
  if (!id) return null;
  const hand = [...s.hands[s.actors[id].ownerId]];
  const n = s.actors[id].side === "killer" ? 2 : 1;
  const cards: Card[] = [];
  for (let i = 0; i < n; i++) cards.push(hand.splice(rand(hand.length), 1)[0]);
  return { type: "PLAN", actorId: id, cards };
}

for (let g = 0; g < games; g++) {
  const pool = [...survivorsPool];
  const survivors = Array.from({ length: 4 }, () => pool.splice(rand(pool.length), 1)[0]);
  let s = createGame({ seed: 1000 + g, mapId: pick(maps), survivors, killer: pick(killers) });
  for (let step = 0; step < 4000 && !s.winner; step++) {
    // 偶尔让不在回合中的持有者插入使用物品
    if (rand(6) === 0) {
      const holders = s.survivors.filter((id) => s.actors[id].item);
      const other = holders.length ? itemActions(s, pick(holders)) : [];
      if (other.length) {
        const a = pick(other);
        s = reduce(s, a.command);
        stats.itemUses++;
        stats.byItem[String(a.command.itemId)] = (stats.byItem[String(a.command.itemId)] ?? 0) + 1;
        stats.commands++;
        continue;
      }
    }
    let command: Command | null = null;
    if (s.phase === "PLANNING" && !s.window && !s.choice) command = planCommand(s);
    else if (s.choice?.kind === "CARRY") {
      // 搬运：随机掷 0-2 颗、不移动（路线合法性由专门测试覆盖）
      const n = rand(3);
      command = { type: "SELECT", actorId: s.killerId, dice: n, route: [] };
    } else {
      const c = getControls(s);
      const acts = c.actions;
      if (!acts.length) { try { reduce(s, {type:"END_TURN", actorId: s.turn!.actorId}); } catch (e) { console.log("END_TURN error", (e as Error).stack, JSON.stringify(s.actors.dwight)); } }
      if (!acts.length) console.log(JSON.stringify({turn: s.turn, killer: s.killerId, jobs: s.jobs, pending: s.pendingAction, last: s.events.slice(-8).map(e=>[e.type,e.data])}, null, 1));
      assert(acts.length, `卡住：没有合法命令 (game ${g}, phase ${s.phase}, choice ${s.choice?.kind}, window ${s.window?.event})`);
      // 物品优先一点，增加覆盖
      const items = acts.filter((a) => a.command.type === "USE_ITEM");
      const a = items.length && rand(3) === 0 ? pick(items) : pick(acts);
      command = a.command;
      if (command.type === "USE_ITEM") {
        stats.itemUses++;
        stats.byItem[String(command.itemId)] = (stats.byItem[String(command.itemId)] ?? 0) + 1;
      }
    }
    if (!command) {
      if (s.choice?.kind === "CARRY")
        command = { type: "SELECT", actorId: s.killerId, dice: 0, route: [] };
    }
    assert(command, `无命令 game ${g}`);
    s = reduce(s, command);
    stats.commands++;
    // 隐私：别人的物品永远是 hidden
    if (step % 25 === 0)
      for (const seat of Object.keys(s.hands)) {
        const v = viewFor(s, seat);
        for (const a of Object.values(v.actors))
          if (a.item && a.ownerId !== seat) assert.equal(a.item, HIDDEN);
      }
  }
  if (s.winner) stats.winners[s.winner] = (stats.winners[s.winner] ?? 0) + 1;
  else stats.winners.unfinished = (stats.winners.unfinished ?? 0) + 1;
  stats.rounds += s.round;
  stats.games++;
  console.log("game", g, s.winner ?? "unfinished", "round", s.round, "items", stats.itemUses);
}
console.log("FUZZ_ITEMS_PASS", JSON.stringify(stats));
