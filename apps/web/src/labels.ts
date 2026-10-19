import {
  actorName,
  roomName,
  propNames,
  cardNames,
} from "../../../packages/game-engine/src/index.ts";
import { perks, items } from "../../../packages/game-engine/src/data.ts";
import type { GameState, Event } from "../../../packages/shared/src/types.ts";
export const phases: Record<string, string> = {
  SETUP: "准备",
  PLANNING: "秘密计划",
  ACTING: "行动",
  BONUS_OFFER: "杀手奖励行动",
  OVER: "对局结束",
};
export const stages: Record<string, string> = {
  MOVE: "选择合法路线",
  INTERACT: "选择交互",
  DONE: "行动结束",
  SELECT_BONUS: "选择奖励移动牌",
};
export const checkNames: Record<string, string> = {
  generator: "修理发电机",
  exit: "开启出口大门",
  heal: "治疗",
  totem: "厄咒图腾",
  locker: "储物柜",
  carry: "挣脱搬运",
  beartrap: "捕兽夹",
  phantasm: "幻影",
  botany: "植物学知识",
  self_heal: "自我治疗",
};
export const triggerNames: Record<string, string> = {
  WOULD_INTERACT: "交互前",
  OWN_TURN_START: "回合开始时",
  BEFORE_OWN_MOVE: "移动前",
  AFTER_MOVE: "移动后",
  BEFORE_ROLL: "检定前",
  AFTER_ROLL: "掷骰后",
  AFTER_ATTACK: "攻击后",
  OWN_TURN_END: "回合结束时",
  PLANNING_END: "计划结束时",
  PLANNING_START: "计划开始时",
  CLEANUP_START: "清理开始时",
  BEFORE_PALLET_MOVE: "经过木板前",
  BLOCKER_DESTROYED: "障碍摧毁后",
  AFTER_CHEST: "搜索箱子后",
  AFTER_SABOTAGE: "破坏后",
  AFTER_SACRIFICE: "献祭后",
  GENERATOR_COMPLETED: "发电机完成时",
  GENERATOR_FAILURE: "修理失败时",
  SURVIVOR_BECOMES_HEALTHY: "逃生者恢复健康时",
  ITEM_USED: "使用物品后",
};
export const faceName = (n: number) =>
  n === 0 ? "失败" : n === 5 ? "大成功" : "成功";
export function itemInfo(id: string | null) {
  const p = items.physical_cards.find((p) => p.id === id);
  return items.definitions.find((d) => d.id === p?.definition_id);
}
export function eventText(s: GameState, e: Event) {
  const d = e.data as Record<string, any>,
    a = d.actorId ? actorName(d.actorId) : "双方";
  const room = (id: string) => roomName(s, id);
  const skill = () =>
    perks.board_perks.find((p) => p.id === d.perkId)?.name_zh ?? "板载技能";
  switch (e.type) {
    case "GAME_CREATED":
      return "对局已建立，请依次翻开起始道具。";
    case "PROP_REVEALED":
      return `${a}翻开了${propNames[d.kind] ?? "道具"}。`;
    case "SPAWNED":
      return `${a}出生骰为${d.face}，位于${room(d.room)}。`;
    case "PLAN_SUBMITTED":
      return `${a}已提交${d.cards ? "公开" : "秘密"}计划${d.cards ? "：" + d.cards.map((c: keyof typeof cardNames) => cardNames[c]).join("、") : ""}。`;
    case "TURN_START":
      return `${a}开始行动：${cardNames[d.card as keyof typeof cardNames] ?? "奖励行动"}。`;
    case "PLANNED_CARD_REVEALED":
      return `${a}的第${d.index + 1}张计划牌揭示为${cardNames[d.card as keyof typeof cardNames]}。`;
    case "MOVED":
    case "TELEPORTED":
      return `${a}${e.type === "TELEPORTED" ? "传送" : "移动"}：${room(d.from)} → ${room(d.to)}。`;
    case "BLOODPOINTS":
      return `${a}${d.delta >= 0 ? "获得" : "失去"}${Math.abs(d.delta)}血点，现有${d.value}。`;
    case "DICE_ROLLED":
      return `${a}进行${checkNames[d.kind] ?? "检定"}：${d.faces.map((f: number) => f + "（" + faceName(f) + "）").join("、")}。`;
    case "CHECK_RESOLVED":
      return `${a}检定结算：${({ failure: "失败", success: "成功", great_success: "大成功" } as Record<string, string>)[d.result] ?? "已结算"}。`;
    case "PROP_PROGRESS":
      return `道具进度变为${d.progress}。`;
    case "GENERATOR_COMPLETED":
      return "一台发电机已完成。";
    case "GENERATOR_DAMAGED":
      return `${a}破坏了发电机。`;
    case "SACRIFICE_PROGRESS":
      return `献祭进度增加${d.amount}，共${d.total}。`;
    case "WOUNDED":
      return `${a}受伤。`;
    case "HEALTHY":
    case "SURVIVOR_BECOMES_HEALTHY":
      return `${a}恢复健康。`;
    case "HOOKED":
      return `${a}被挂上钩子。`;
    case "ESCAPED":
      return `${a}挣脱了搬运。`;
    case "CARRIED":
      return `${a}被搬运；途中不翻开道具。`;
    case "HIDDEN_IN_LOCKER":
      return `${a}躲入储物柜。`;
    case "ITEM_DRAWN":
      return `${a}摸到${itemInfo(d.item)?.name_zh ?? "一张物品"}。`;
    case "PERK_USED":
      return `${a}使用「${skill()}」。`;
    case "POWER_USED":
      return `${a}使用杀手力量。`;
    case "BEAR_TRAP_PLACED":
      return "路线放置了捕兽夹。";
    case "PALLET_PLACED":
      return `${a}放置木板。`;
    case "PALLET_DESTROYED":
      return `${a}摧毁木板。`;
    case "WALL_DESTROYED":
      return `${a}摧毁可破坏墙壁。`;
    case "WAITED":
      return `${a}等待。`;
    case "MOVEMENT_FAILED":
      return `${a}没有合法路线，移动失败并失去交互。`;
    case "BONUS_TURN_GRANTED":
      return `${a}获得奖励行动。`;
    case "BONUS_TURN_END":
      return `${a}完成奖励行动。`;
    case "ROUND_CLEANUP":
      return "本轮清理完成。";
    case "MADNESS_REMOVED":
      return `${a}移除疯狂。`;
    case "INTERACTION_REVISED":
      return `${a}重新选择交互。`;
    case "GAME_OVER":
      return d.winner === "survivor"
        ? "出口大门开启，逃生者获胜！"
        : "献祭完成，杀手获胜！";
    default:
      return triggerNames[e.type]
        ? `${a}：${triggerNames[e.type]}。`
        : "规则流程已推进。";
  }
}
