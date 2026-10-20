import React, { useEffect, useRef, useState } from "react";
import type { GameState } from "../../../packages/shared/src/types.ts";
import { actorName, cardNames } from "../../../packages/game-engine/src/index.ts";
import { triggerNames, checkNames } from "./labels.ts";
import { actorColor } from "./playerColors.ts";

/** 让所有人随时知道"现在是什么阶段、谁在做什么"（2026-10-21） */
const short = (id: string) => actorName(id).split("·")[0];

export function phaseTitle(s: GameState): string {
  if (s.winner) return s.winner === "survivor" ? "对局结束 · 逃生者获胜" : "对局结束 · 杀手获胜";
  if (s.phase === "SETUP") return `第${s.round}轮 · 准备：依次掷出生骰`;
  if (s.phase === "PLANNING") return `第${s.round}轮 · 计划阶段：秘密选牌`;
  if (s.phase === "BONUS_OFFER") return `第${s.round}轮 · 杀手是否追加行动`;
  if (s.phase === "ACTING" && s.turn) {
    if (s.turn.actorId === s.killerId)
      return `第${s.round}轮 · 杀手行动${s.turn.bonus ? "（奖励行动）" : `（第${s.turn.index + 1}张牌）`}`;
    return `第${s.round}轮 · 逃生者行动${s.turn.bonus ? "（奖励行动）" : ""}`;
  }
  return `第${s.round}轮`;
}

/** 一句大白话：此刻在等谁、做什么 */
export function nowDoing(s: GameState): string {
  if (s.winner) return "点下方按钮返回大厅或再开一局";
  if (s.window) {
    const who = s.window.actors[s.window.index];
    return `等${short(who)}决定是否用技能/物品（${triggerNames[s.window.event] ?? "响应"}）`;
  }
  const c = s.choice;
  if (c) {
    const who = short(c.actorId);
    const map: Record<string, string> = {
      SPAWN_ROLL: `${who}掷出生骰`,
      ROLL_DICE: `${who}掷骰：${checkNames[String(c.checkKind)] ?? "检定"}`,
      KEEP: `${who}选择保留哪颗骰子`,
      REVEAL: `${who}翻开所在房间的一个道具`,
      KEEP_ITEM: `${who}选择保留哪件物品`,
      BONUS_CARD: `${who}选择奖励行动用的移动牌`,
      OPTIONAL_MOVE: `${who}决定是否移动`,
      CARRY: "杀手扛着逃生者，选择搬运路线",
      CARRY_REROUTE: "杀手被鞭炮拦下，重新选路线",
      PHANTASM: "妖巫的幻影被触发",
      PHANTASM_TARGET: "妖巫重新选择目标",
      MAP_REVEAL: `${who}用地图翻开道具`,
      REPLAN: `${who}重新放一张移动牌`,
      DOCTOR_SHOCK: `${who}决定：付血点还是承受电火花`,
    };
    return map[c.kind] ?? `${who}正在选择`;
  }
  if (s.phase === "PLANNING") {
    const need = [...s.survivors, s.killerId].filter((id) => !s.actors[id].hookId);
    const done = need.filter((id) => s.plans[id]?.length).length;
    return `所有人秘密选牌中：${done}/${need.length} 已选好`;
  }
  if (s.phase === "BONUS_OFFER") return "杀手决定是否支付血点追加一次行动";
  const t = s.turn;
  if (s.phase === "ACTING" && t) {
    const who = short(t.actorId);
    const card = t.card ? cardNames[t.card]?.split("（")[0] : "";
    if (t.stage === "MOVE") return `${who}亮出「${card}」，正在移动`;
    if (t.stage === "INTERACT" && !t.interactionSpent) return `${who}选择交互（或结束行动）`;
    if (t.stage === "SELECT_BONUS") return `${who}选择奖励移动牌`;
    return `${who}的行动即将结束`;
  }
  return "";
}

/** 行动顺序条：计划阶段显示谁已选好；行动阶段显示顺序、已完成、当前、未到 */
export function OrderStrip({ state: s }: { state: GameState }) {
  let items: Array<{ id: string; label: string; status: "done" | "now" | "todo" | "out" }> = [];
  if (s.phase === "PLANNING") {
    items = [...s.survivors, s.killerId].map((id) => ({
      id,
      label: short(id),
      status: s.actors[id].hookId ? "out" : s.plans[id]?.length ? "done" : "todo",
    }));
  } else if (s.phase === "SETUP" && s.choice?.kind === "SPAWN_ROLL") {
    const order = s.choice.order as string[], at = s.choice.index as number;
    items = order.map((id, i) => ({ id, label: short(id), status: i < at ? "done" : i === at ? "now" : "todo" }));
  } else if (s.turnOrder?.length && (s.phase === "ACTING" || s.phase === "BONUS_OFFER")) {
    let k = 0;
    items = s.turnOrder.map((id, i) => {
      const killerN = id === s.killerId ? ++k : 0;
      return {
        id,
        label: id === s.killerId ? `杀手${killerN === 1 ? "①" : "②"}` : short(id).slice(0, 3),
        status: s.actors[id].hookId
          ? "out"
          : i < s.cursor || s.phase === "BONUS_OFFER"
            ? "done"
            : i === s.cursor
              ? "now"
              : "todo",
      };
    });
  }
  const ref = useRef<HTMLOListElement>(null);
  const nowIndex = items.findIndex((x) => x.status === "now");
  useEffect(() => {
    const el = ref.current?.children[nowIndex] as HTMLElement | undefined;
    el?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [nowIndex, s.round]);
  if (!items.length) return null;
  return (
    <ol ref={ref} className="order-strip" data-testid="order-strip" aria-label="行动顺序">
      {items.map((x, i) => (
        <li key={i} className={"os-" + x.status} style={{ ["--c" as string]: actorColor(s, x.id) }}>
          <i />
          {x.label}
          {x.status === "done" ? " ✓" : ""}
        </li>
      ))}
    </ol>
  );
}

/** 阶段切换时的大字提示：新一轮、行动开始、杀手回合、清理、轮到你 */
export function PhaseSplash({ state, myActors }: { state: GameState; myActors: string[] }) {
  const [splash, setSplash] = useState<{ key: number; title: string; sub: string; tone: string } | null>(null);
  const seen = useRef(state.events.length);
  useEffect(() => {
    const fresh = state.events.slice(seen.current);
    seen.current = state.events.length;
    let pick: { title: string; sub: string; tone: string } | null = null;
    for (const e of fresh) {
      if (e.type === "PLANNING_START")
        pick = { title: `第 ${e.round} 轮`, sub: "计划阶段：每人秘密放一张移动牌（杀手两张）", tone: "plan" };
      else if (e.type === "PLANNING_END")
        pick = { title: "行动阶段", sub: "从先手逃生者开始，依次亮牌、移动、交互", tone: "act" };
      else if (e.type === "TURN_START") {
        const id = String(e.data.actorId);
        if (myActors.includes(id)) pick = { title: "轮到你了！", sub: `${actorName(id)}：亮出移动牌，先移动`, tone: "you" };
        else if (id === state.killerId && Number(e.data.index) === 0)
          pick = { title: "杀手行动", sub: "杀手依次亮出两张移动牌，每张移动一次并交互一次", tone: "killer" };
      } else if (e.type === "CLEANUP_START")
        pick = { title: "回合结束", sub: "挂钩的逃生者增加献祭进度，先手标记交给下一位", tone: "cleanup" };
      else if (e.type === "GAME_OVER") pick = null;
    }
    if (pick) setSplash({ key: Date.now(), ...pick });
  }, [state.events.length]);
  useEffect(() => {
    if (!splash) return;
    const t = setTimeout(() => setSplash(null), 1900);
    return () => clearTimeout(t);
  }, [splash?.key]);
  if (!splash) return null;
  return (
    <div className={"phase-splash tone-" + splash.tone} role="status" aria-live="polite" key={splash.key}>
      <strong>{splash.title}</strong>
      <span>{splash.sub}</span>
    </div>
  );
}
