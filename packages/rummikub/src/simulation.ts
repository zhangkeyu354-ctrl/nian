import {
  createRK,
  reduceRK,
  validateMeld,
  viewForRK,
  assertInvariants,
  type RKState,
  type Command,
  type RKVariant,
} from "./index.ts";
// Intentionally modest AI: self-rack groups/runs and extensions, no full table solver.
export function findRackMelds(rack: string[]): string[][] {
  const jokers = rack.filter((id) => id[0] === "J");
  const ordinary = rack.filter((id) => id[0] !== "J");
  const candidates: string[][] = [];
  const value = (id: string) => Number(id.slice(1, 3));
  for (let n = 1; n <= 13; n++) {
    const tiles = ["R", "B", "O", "K"]
      .map((c) => ordinary.find((id) => id[0] === c && value(id) === n))
      .filter((x): x is string => !!x);
    if (tiles.length >= 3) candidates.push(tiles);
    if (tiles.length >= 1 && tiles.length + jokers.length >= 3)
      candidates.push([
        ...tiles,
        ...jokers.slice(0, Math.max(0, 3 - tiles.length)),
      ]);
  }
  for (const color of ["R", "B", "O", "K"])
    for (let start = 1; start <= 11; start++)
      for (let end = start + 2; end <= 13; end++) {
        const tiles: string[] = [];
        let j = 0;
        for (let n = start; n <= end; n++) {
          const id =
            ordinary.find((id) => id[0] === color && value(id) === n) ??
            jokers[j++];
          if (!id) {
            tiles.length = 0;
            break;
          }
          tiles.push(id);
        }
        if (tiles.length && validateMeld(tiles).length) candidates.push(tiles);
      }
  candidates.sort(
    (a, b) =>
      validateMeld(b)[0].score - validateMeld(a)[0].score ||
      b.length - a.length,
  );
  const used = new Set<string>();
  const out: string[][] = [];
  for (const c of candidates)
    if (c.every((id) => !used.has(id))) {
      out.push(c);
      c.forEach((id) => used.add(id));
    }
  return out;
}
function act(s: RKState, body: Record<string, unknown>): RKState {
  return reduceRK(s, {
    ...body,
    actor: s.current,
    seq: (s.seq[String(s.current)] ?? 0) + 1,
    now: 0,
  } as Command);
}
export function aiTurn(s: RKState): RKState {
  const view = viewForRK(s, s.current);
  const rack = view.players[s.current].rack!;
  const plan = findRackMelds(rack);
  const points = plan.reduce((n, m) => n + validateMeld(m)[0].score, 0);
  if (!s.players[s.current].opened && points < 30)
    return act(s, { type: "DRAW" });
  let d = s;
  let moved = false;
  for (const tiles of plan) {
    d = act(d, { type: "MOVE", tiles, to: { meld: null } });
    moved = true;
  }
  if (s.players[s.current].opened) {
    for (const id of [...d.draft.rack]) {
      const target = d.draft.board.find(
        (m) => validateMeld([...m.tiles, id]).length > 0,
      );
      if (target) {
        d = act(d, { type: "MOVE", tiles: [id], to: { meld: target.id } });
        moved = true;
      }
    }
  }
  return act(d, { type: moved ? "COMMIT" : "DRAW" });
}
export function simulateRK(
  players: number,
  seed: number,
  maxTurns = 2000,
  variant: RKVariant = "classic",
) {
  let state = createRK(
    Array.from({ length: players }, (_, i) => `模拟${i + 1}`),
    { seed, now: 0, minutes: 0, assertions: true, variant },
  );
  let turns = 0;
  while (state.phase === "PLAYING" && turns < maxTurns) {
    state = aiTurn(state);
    turns++;
  }
  if (state.phase !== "FINISHED")
    throw new Error(
      `模拟未终局：players=${players}, seed=${seed}, turns=${turns}`,
    );
  assertInvariants(state);
  if (
    state.players.some((p) => !Number.isFinite(p.score)) ||
    Math.abs(state.result!.scores.reduce((a, b) => a + b, 0)) > 1e-9
  )
    throw new Error(`计分异常：${seed}`);
  return {
    players,
    seed,
    turns,
    blocked: state.result!.blocked,
    winners: state.result!.winners,
    scores: state.result!.scores,
  };
}
