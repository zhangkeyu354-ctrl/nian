import { valueOf, addTargets, type DUState, type Command } from "./index.ts";

/** 简单人机：优先出能出的最多张数（同张数时出最小的数字），其次加牌，再其次拿小组合，最后翻转。 */
export function botMove(s: DUState, seat: number, rand: () => number = Math.random): Command {
  const p = s.players[seat];
  const groups = new Map<number, number[]>();
  for (const c of p.hand) groups.set(valueOf(c), [...(groups.get(valueOf(c)) ?? []), c.id]);
  const top = new Map<number, number>();
  s.players.forEach((q) => q.zones.forEach((g) => g && top.set(g.cards.length, Math.max(top.get(g.cards.length) ?? 0, g.value))));
  let best: { ids: number[]; value: number } | null = null;
  for (const [value, ids] of groups)
    for (let k = ids.length; k >= 1; k--) {
      if (top.has(k) && top.get(k)! >= value) continue;
      if (!best || k > best.ids.length || (k === best.ids.length && value < best.value)) best = { ids: ids.slice(0, k), value };
      break;
    }
  if (best) return { type: "PLAY", actor: seat, cards: best.ids };
  for (const c of p.hand) {
    const t = addTargets(s, seat, c)[0];
    if (t) return { type: "ADD", actor: seat, card: c.id, target: t.seat, zone: t.zone };
  }
  if (rand() < 0.3) {
    const opts: { seat: number; zone: number; n: number }[] = [];
    s.players.forEach((q, t) => t !== seat && q.zones.forEach((g, zone) => g && opts.push({ seat: t, zone, n: g.cards.length })));
    opts.sort((a, b) => a.n - b.n);
    if (opts[0] && opts[0].n <= 2) return { type: "TAKE", actor: seat, target: opts[0].seat, zone: opts[0].zone };
  }
  return { type: "ROTATE", actor: seat };
}
