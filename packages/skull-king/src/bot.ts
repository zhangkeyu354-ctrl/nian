import { CARDS, legalPlays, resolveTrick, cardsThisRound, strength, type SKState, type Command, type Played } from "./index.ts";

/** 估算一手牌能赢几墩 */
export function estimateBid(hand: number[], players: number): number {
  let e = 0;
  for (const id of hand) {
    const c = CARDS[id];
    if (c.kind === "king") e += 0.95;
    else if (c.kind === "pirate") e += 0.8;
    else if (c.kind === "tigress") e += 0.6;
    else if (c.kind === "mermaid") e += 0.6;
    else if (c.kind === "suit") {
      if (c.suit === "black") e += c.n! >= 11 ? 0.75 : c.n! >= 7 ? 0.4 : 0.15;
      else e += c.n! >= 13 ? 0.45 : c.n! >= 11 ? 0.2 : 0;
    }
  }
  if (players >= 6) e *= 0.85;
  return Math.max(0, Math.min(hand.length, Math.round(e)));
}

function winsNow(trick: Played[], me: Played) {
  return resolveTrick([...trick, me]).winner === me.seat;
}

export function botMove(s: SKState, seat: number): Command {
  const p = s.players[seat];
  if (s.phase === "BID") return { type: "BID", actor: seat, bid: estimateBid(p.hand, s.players.length) };
  if (s.phase === "SHOT") return { type: "SHOT", actor: seat, shot: "grape" };
  if (s.phase === "ABILITY" && s.ability) {
    const need = p.bid! - p.won;
    switch (s.ability.pirate) {
      case "rosie":
        return { type: "ROSIE", actor: seat, target: need > 0 ? seat : (seat + 1) % s.players.length };
      case "bendt": {
        const k = s.ability.drawn.length;
        const sorted = [...p.hand].sort((a, b) => strength(a) - strength(b));
        return { type: "BENDT", actor: seat, discard: need > 0 ? sorted.slice(0, k) : sorted.slice(-k) };
      }
      case "rascal":
        return { type: "RASCAL", actor: seat, bet: 0 };
      case "juanita":
        return { type: "JUANITA", actor: seat };
      case "harry": {
        const left = cardsThisRound(s) - s.tricks.length;
        const d = p.won - p.bid!;
        const delta = left === 0 && Math.abs(d) === 1 ? (d as -1 | 1) : 0;
        return { type: "HARRY", actor: seat, delta };
      }
    }
  }
  // 出牌
  const legal = legalPlays(p.hand, s.trick);
  const want = p.won < (p.bid ?? 0);
  type Opt = { id: number; as?: "pirate" | "escape" };
  const opts: Opt[] = legal.flatMap((id): Opt[] => (CARDS[id].kind === "tigress" ? [{ id, as: "pirate" }, { id, as: "escape" }] : [{ id }]));
  const scored = opts.map((o) => ({ ...o, win: winsNow(s.trick, { seat, id: o.id, ...(o.as ? { as: o.as } : {}) }), st: strength(o.id, o.as) }));
  let pick;
  if (want) {
    const winners = scored.filter((o) => o.win).sort((a, b) => a.st - b.st);
    pick = winners[0] ?? scored.sort((a, b) => a.st - b.st)[0];
  } else {
    const losers = scored.filter((o) => !o.win).sort((a, b) => b.st - a.st);
    pick = losers[0] ?? scored.sort((a, b) => a.st - b.st)[0];
  }
  return { type: "PLAY", actor: seat, id: pick.id, ...(pick.as ? { as: pick.as } : {}) };
}
