import type { CNState, Role } from "./types.ts";

/** 发给客户端的牌：未揭晓的牌只有队长（和结束后所有人）才带 role 字段 */
export interface CNViewCard {
  word: string;
  revealed: boolean;
  role?: Role;
}
export type CNView = Omit<CNState, "cards"> & { cards: CNViewCard[] };

/**
 * 按身份过滤：
 * - 队长：看到全部 25 张身份
 * - 猜词队员、观众：只看到已揭晓的身份（未揭晓牌根本不带 role 字段）
 * - 结束后：全部公开
 */
export function viewForCN(s: CNState, playerId: string | null): CNView {
  const seeAll =
    s.phase === "over" || (!!playerId && (s.captains.red === playerId || s.captains.blue === playerId));
  const { cards, ...rest } = structuredClone(s);
  return {
    ...rest,
    cards: cards.map((c) =>
      seeAll || c.revealed ? { word: c.word, revealed: c.revealed, role: c.role } : { word: c.word, revealed: false },
    ),
  };
}
