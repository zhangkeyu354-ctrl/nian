import { reduceRK, validateMeld, validateTurn, viewForRK, type Command, type RKState } from "./index.ts";
import { findRackMelds } from "./simulation.ts";

type Level = "easy" | "normal";
type Move = Extract<Command, { type: "MOVE" }>;

export function rummikubBotView(view: ReturnType<typeof viewForRK>) {
  return {
    opened: view.players[view.me].opened,
    rack: [...(view.draft?.rack ?? view.players[view.me].rack ?? [])],
    board: view.board.map(({ id, tiles }) => ({ id, tiles: [...tiles] })),
  };
}

export function planRummikubTurn(view: ReturnType<typeof rummikubBotView>, level: Level): Omit<Move, "actor" | "seq" | "now">[] {
  const melds = findRackMelds(view.rack);
  if (!view.opened && melds.reduce((n, m) => n + validateMeld(m)[0].score, 0) < 30) return [];
  const moves: Omit<Move, "actor" | "seq" | "now">[] = [];
  const used = new Set<string>();
  let opening = 0;
  for (const tiles of melds) {
    if (level === "easy" && (view.opened ? moves.length > 0 : opening >= 30)) break;
    moves.push({ type: "MOVE", tiles, to: { meld: null } });
    tiles.forEach(id => used.add(id));
    opening += validateMeld(tiles)[0].score;
  }
  if (view.opened && (level === "normal" || !moves.length)) {
    const board = view.board.map(m => ({ ...m, tiles: [...m.tiles] }));
    for (const id of view.rack) {
      if (used.has(id)) continue;
      const target = board.find(m => validateMeld([...m.tiles, id]).length);
      if (!target) continue;
      target.tiles.push(id);
      moves.push({ type: "MOVE", tiles: [id], to: { meld: target.id } });
      if (level === "easy") break;
    }
  }
  return moves;
}

/** Draft edits remain private. Publish a validated commit or use the existing draw action. */
export function runRummikubBotTurn(state: RKState, level: Level, now: number): RKState {
  const actor = state.current;
  const act = (s: RKState, body: Omit<Move, "actor" | "seq" | "now"> | { type: "COMMIT" | "DRAW" }) =>
    reduceRK(s, { ...body, actor, seq: (s.seq[String(actor)] ?? 0) + 1, now });
  let staged = state;
  for (const move of planRummikubTurn(rummikubBotView(viewForRK(state, actor)), level)) {
    staged = act(staged, move);
  }
  if (staged !== state && validateTurn(staged).ok) return act(staged, { type: "COMMIT" });
  return act(state, { type: "DRAW" });
}
