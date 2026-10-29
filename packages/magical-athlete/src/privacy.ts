import type { MAState } from "./types.ts";

/** 发给某位玩家的视图：去掉牌堆顺序、随机数、重放快照；别人的秘密出场选择只显示「已选」 */
export type MAView = Omit<MAState, "deck" | "turn" | "rng" | "forcedRolls"> & {
  deckCount: number;
  /** 别人的选择被隐藏为 "?"（已选）或 null（未选） */
};

export const HIDDEN_CHOICE = "?";

export function viewForMA(s: MAState, playerId: string | null): MAView {
  const { deck, turn: _turn, rng: _rng, forcedRolls: _f, ...rest } = structuredClone(s);
  const v: MAView = { ...rest, deckCount: deck.length };
  if (v.race) {
    delete v.race.forcedCycle;
    delete v.race.forcedCycleBlocked;
    delete v.race.insertionResume;
  }
  for (const p of v.players)
    if (p.id !== playerId) p.choices = p.choices.map(() => HIDDEN_CHOICE);
  // 待决定事项：只有决定人看得到选项（例如神秘蛋抽到的 3 张）
  if (v.pending && v.pending.player !== playerId)
    v.pending = { ...v.pending, options: [] };
  return v;
}
