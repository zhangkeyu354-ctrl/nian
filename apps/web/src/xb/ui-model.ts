import type { View } from "../../../../packages/xiabaiwang/src/engine.ts";
import { scoreRound } from "../../../../packages/xiabaiwang/src/rules.ts";
export function settlement(view: View) {
  const h = view.history.at(-1);
  if (!h) return [];
  const steps =
    h.scoring ??
    scoreRound(
      view.players.map((p) => p.id),
      h.guesser,
      h.truth,
      h.selected,
      h.challenged,
      h.difficulty,
    );
  return [
    {
      kind: "guess",
      label:
        h.selected === h.truth
          ? "指认结果 · 找到老实人"
          : "指认结果 · 瞎掰成功",
      delta: steps[0].delta,
    },
    {
      kind: "challenge",
      label: !h.challenged
        ? "质疑结果 · 本轮未使用"
        : h.challenged === h.truth
          ? "质疑结果 · 误中老实人"
          : "质疑结果 · 命中瞎掰人",
      delta: steps[1].delta,
    },
    { kind: "total", label: "总分变化", delta: h.delta },
  ];
}
export function revealFrame(elapsed: number, players: number) {
  const scoreAt = 600 + players * 900;
  const duration = Math.max(6000, scoreAt + 1400);
  return {
    visible: Math.min(
      players,
      Math.max(0, Math.floor((elapsed - 600) / 900) + 1),
    ),
    scores: elapsed >= scoreAt,
    done: elapsed >= duration,
    duration,
  };
}
export function titles(view: View, hits: Record<string, number>) {
  const bluff: Record<string, number> = {},
    fooled: Record<string, number> = {};
  for (const h of view.history)
    if (h.selected !== h.truth) {
      bluff[h.selected] = (bluff[h.selected] ?? 0) + 1;
      fooled[h.guesser] = (fooled[h.guesser] ?? 0) + 1;
    }
  const best = (values: Record<string, number>) => {
    const max = Math.max(0, ...view.players.map((p) => values[p.id] ?? 0));
    return max
      ? view.players
          .filter((p) => values[p.id] === max)
          .map((p) => p.name)
          .join("、")
      : "本局无人";
  };
  return [
    { title: "最佳瞎掰王", names: best(bluff), icon: "🎭" },
    { title: "最容易上当", names: best(fooled), icon: "❔" },
    { title: "粑粑收集者", names: best(hits), icon: "💩" },
  ];
}
export function ranking(view: View, previous = false) {
  const last = view.history.at(-1);
  return view.players
    .map((p, i) => ({
      ...p,
      seat: i,
      displayScore: p.score - (previous ? (last?.delta[p.id] ?? 0) : 0),
    }))
    .sort((a, b) => b.displayScore - a.displayScore || a.seat - b.seat);
}
