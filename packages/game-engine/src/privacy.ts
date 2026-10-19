import type { GameState, Payload } from "../../shared/src/types.ts";

/** 占位值：隐藏信息一律替换为它，保留数组长度，方便界面显示"牌背"与数量。 */
export const HIDDEN = "hidden";

/**
 * 按座位生成玩家视图（联机时服务器只发送这个）。
 *
 * 隐藏的内容：
 * - 随机种子与随机数状态（否则可以推算道具布置和骰子）
 * - 未翻开道具的种类（只保留类别，即道具背面颜色）
 * - 其他玩家手中的移动牌，以及尚未公开的计划牌
 * - 物品牌库的顺序；其他玩家持有或摸到的物品
 *
 * 公开的内容：棋盘位置、已翻开的道具、已打出的移动牌、骰子结果、血点、伤势、进度等。
 * 储物柜：规则原文要求把逃生者棋子放在储物柜上，所以占用者身份属于公开信息。
 *
 * 物品（用户裁定 U-ITEM，2026-10-19）：持有中的物品只有持有者能看到；
 * 打出（使用/弃掉）时所有人都能看到。Phase 4 实现物品效果时，使用物品的事件
 * 必须带上物品 id，且不要在这里隐藏它；弃牌堆 itemDiscard 本来就是公开的。
 */
export function viewFor(full: GameState, seat: string | null): GameState {
  const s: GameState = structuredClone(full);
  const mine = (actorId: unknown) =>
    seat !== null && s.actors[String(actorId)]?.ownerId === seat;

  s.seed = 0;
  s.rng = 0;

  // 第三封印弃掉的牌：是否公开待核（CHECK_REQUIRED_PUBLIC_DISCARD），暂时只有杀手自己看得到；
  // 一旦封住某位逃生者（SEALED_MOVE_FAILED 带出颜色）就公开
  if (s.sealedCard && !mine(s.killerId)) {
    const shown = s.events.some(
      (e, i) =>
        e.type === "SEALED_MOVE_FAILED" &&
        !s.events.slice(i).some((x) => x.type === "ROUND_CLEANUP"),
    );
    if (!shown) s.sealedCard = HIDDEN as never;
  }

  for (const p of s.props) if (!p.revealed) p.kind = HIDDEN;

  s.itemDeck = s.itemDeck.map(() => HIDDEN);
  for (const a of Object.values(s.actors))
    if (a.item && a.ownerId !== seat) a.item = HIDDEN;
  if (s.choice?.kind === "KEEP_ITEM" && !mine(s.choice.actorId))
    s.choice = { ...s.choice, newItem: HIDDEN };

  for (const owner of Object.keys(s.hands))
    if (owner !== seat)
      s.hands[owner] = s.hands[owner].map(() => HIDDEN) as never;

  // 本轮已经亮出的计划牌（回合开始时翻开，或被技能翻开）
  const revealed = new Set<string>();
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i];
    if (e.type === "ROUND_CLEANUP") break;
    if (e.type === "TURN_START" || e.type === "PLANNED_CARD_REVEALED")
      revealed.add(`${e.data.actorId}#${e.data.index}`);
  }
  for (const [id, cards] of Object.entries(s.plans)) {
    if (mine(id) || s.publicPlans.includes(id)) continue;
    s.plans[id] = cards.map((c, i) =>
      revealed.has(`${id}#${i}`) ? c : HIDDEN,
    ) as never;
  }

  s.events = s.events.map((e) => {
    if (e.type === "GAME_CREATED") {
      const { seed: _seed, ...rest } = e.data as Payload;
      return { ...e, data: rest };
    }
    if (e.type === "ITEM_DRAWN" && !mine(e.data.actorId))
      return { ...e, data: { ...e.data, item: HIDDEN } };
    return e;
  });
  return s;
}
