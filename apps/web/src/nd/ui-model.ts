import type { NDEvent } from "../../../../packages/naodong-scale/src/index.ts";
export function swapSeats(order: readonly number[], a: number, b: number) {
  const next = [...order],
    i = next.indexOf(a),
    j = next.indexOf(b);
  if (i >= 0 && j >= 0) [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export function moveSeat(order: readonly number[], from: number, to: number) {
  const next = [...order],
    i = next.indexOf(from),
    j = next.indexOf(to);
  if (i < 0 || j < 0) return next;
  next.splice(i, 1);
  next.splice(j, 0, from);
  return next;
}
export function recapRounds(history: readonly NDEvent[]) {
  return [1, 2, 3, 4, 5]
    .filter((round) => history.some((e) => e.round === round))
    .map((round) => ({
      round,
      reveals: history.filter(
        (e) => e.round === round && e.type === "REVEALED",
      ),
      mistakes: history
        .filter((e) => e.round === round && e.type === "REVEALED")
        .reduce((n, e) => n + (e.penalty ?? 0), 0),
    }));
}
export function entertainmentTitles(history: readonly NDEvent[]) {
  const captains = [
    ...new Set(
      history.filter((e) => e.type === "REVEALED").map((e) => e.captain),
    ),
  ];
  return captains.map((seat) => {
    const hits = history.filter(
        (e) => e.type === "REVEALED" && e.captain === seat && e.correct,
      ).length,
      total = history.filter(
        (e) => e.type === "REVEALED" && e.captain === seat,
      ).length;
    return {
      seat,
      title: total > 0 && hits === total ? "稳稳接住" : "一起动脑",
      detail: `带队翻开 ${total} 张，判对 ${hits} 张`,
    };
  });
}
