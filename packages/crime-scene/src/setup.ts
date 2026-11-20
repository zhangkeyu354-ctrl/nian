import clues from "../../../data/crime-scene/clues.json" with { type: "json" };
import means from "../../../data/crime-scene/means.json" with { type: "json" };
import tiles from "../../../data/crime-scene/tiles.json" with { type: "json" };
import { assignRoles } from "./roles.ts";

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const n = random();
    if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError("随机源须返回 [0, 1) 内的数字");
    const j = Math.floor(n * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function dealGame(playerCount: number, forensicSeat: number, cardsPerKind: 3 | 4 | 5, random: () => number = Math.random) {
  if (![3, 4, 5].includes(cardsPerKind)) throw new RangeError("每类发牌数量只能是 3、4 或 5");
  const roles = assignRoles(playerCount, forensicSeat, random);
  const clueDeck = shuffled(clues.map((card) => card.name), random);
  const meansDeck = shuffled(means.map((card) => card.name), random);
  const players = roles.map((role, seat) => ({
    seat,
    clues: role === "forensic" ? [] : clueDeck.splice(0, cardsPerKind),
    means: role === "forensic" ? [] : meansDeck.splice(0, cardsPerKind),
    excludedClues: [] as string[],
  }));
  return {
    phase: "setup" as const,
    roles,
    forensicSeat,
    players,
    badges: roles.map((role) => role !== "forensic"),
    locationOptions: tiles.filter((tile) => tile.kind === "location").map((tile) => tile.id),
    orangeDeck: shuffled(tiles.filter((tile) => tile.kind === "scene").map((tile) => tile.id), random),
  };
}
