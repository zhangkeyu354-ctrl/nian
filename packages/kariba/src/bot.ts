import { previewKB, valueOf, type KBState } from "./index.ts";

export type BotLevel = "easy" | "normal";

export function karibaBotView(state: KBState, seat: number) {
  return { hand: state.players[seat].hand.slice(), pond: state.pond.map((pile) => pile.length) };
}

export function chooseKaribaPlay(
  view: ReturnType<typeof karibaBotView>, level: BotLevel, random: () => number,
) {
  const groups = new Map<number, string[]>();
  const pond = view.pond.map((count) => Array<string>(count).fill(""));
  for (const id of view.hand) {
    const value = valueOf(id);
    const group = groups.get(value) ?? [];
    group.push(id);
    groups.set(value, group);
  }
  const choices = [...groups].flatMap(([value, ids]) => ids.map((_, index) => {
    const count = index + 1;
    const result = previewKB(pond, value, count);
    return {
      cards: ids.slice(0, count),
      score: result.cards * 4 - (!result.target && result.total === 2 ? 2 : 0) + count * 0.1,
    };
  }));
  if (choices.length === 0) throw new Error("人机没有可打出的牌");
  choices.sort((a, b) => b.score - a.score);
  if (level === "easy" && random() < 0.45)
    return choices[Math.min(Math.floor(random() * choices.length), choices.length - 1)].cards;
  return choices[0].cards;
}
