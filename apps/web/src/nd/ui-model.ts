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
  const reveals = history.filter((e) => e.type === "REVEALED");
  const awards: { seat: number; title: string; detail: string }[] = [];
  const captains = [...new Set(reveals.map((e) => e.captain))]
    .map((seat) => {
      const all = reveals.filter((e) => e.captain === seat && e.seat !== seat);
      return {
        seat,
        total: all.length,
        hits: all.filter((e) => e.correct).length,
      };
    })
    .filter((x) => x.hits > 0)
    .sort(
      (a, b) =>
        b.hits / b.total - a.hits / a.total ||
        b.total - a.total ||
        a.seat - b.seat,
    );
  if (captains[0]) {
    const c = captains[0];
    awards.push({
      seat: c.seat,
      title: "最准队长",
      detail: `带队判对 ${c.hits} / ${c.total} 张`,
    });
  }
  const seats = [
    ...new Set(reveals.flatMap((e) => (e.seat === undefined ? [] : [e.seat]))),
  ];
  for (const correct of [false, true]) {
    const ranked = seats
      .map((seat) => ({
        seat,
        count: reveals.filter((e) => e.seat === seat && e.correct === correct)
          .length,
      }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || a.seat - b.seat);
    if (ranked[0]) {
      const x = ranked[0];
      awards.push({
        seat: x.seat,
        title: correct ? "人形量表" : "最离谱答案",
        detail: `秘密数字被排${correct ? "对" : "错"} ${x.count} 次`,
      });
    }
  }
  return awards.slice(0, 4);
}
