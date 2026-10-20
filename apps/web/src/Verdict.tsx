import React, { useEffect } from "react";
import type { Event, GameState } from "../../../packages/shared/src/types.ts";
import { actorName } from "../../../packages/game-engine/src/index.ts";
import { checkNames } from "./labels.ts";
import { actorColor } from "./playerColors.ts";

/** 一次检定的大号结果播报：大成功 / 成功 / 失败 + 后果（2026-10-21） */
export interface VerdictInfo {
  seq: number;
  actorId: string;
  kind: string;
  result: "great_success" | "success" | "failure" | string;
  details: string[];
}

/** 从一批新事件里找出检定结算，并收集同批里的后果说明 */
export function verdictsFrom(s: GameState, events: Event[]): VerdictInfo[] {
  const out: VerdictInfo[] = [];
  events.forEach((e, i) => {
    if (e.type !== "CHECK_RESOLVED") return;
    const d = e.data as Record<string, unknown>;
    const details: string[] = [];
    // 结算前的杀手血点（失败骰给杀手血点）
    for (let j = i - 1; j >= 0 && events[j].type !== "DICE_ROLLED"; j--) {
      const x = events[j];
      if (x.type === "BLOODPOINTS" && x.data.actorId === s.killerId && Number(x.data.delta) > 0)
        details.push(`杀手 +${x.data.delta} 血点`);
    }
    for (let j = i + 1; j < events.length && events[j].type !== "CHECK_RESOLVED"; j++) {
      const x = events[j];
      if (x.type === "PROP_PROGRESS") details.push(`进度 ${x.data.progress}/3`);
      if (x.type === "GENERATOR_COMPLETED") details.push("发电机修好了！");
      if (x.type === "ESCAPED") details.push(`${actorName(String(x.data.actorId))} 逃脱！`);
      if (x.type === "SURVIVOR_BECOMES_HEALTHY") details.push(`${actorName(String(x.data.actorId))} 恢复健康`);
      if (x.type === "WOUNDED") details.push(`${actorName(String(x.data.actorId))} 受伤`);
      if (x.type === "BLOODPOINTS" && Number(x.data.delta) > 0)
        details.push(`${actorName(String(x.data.actorId))} +${x.data.delta} 血点`);
      if (x.type === "MADNESS_REMOVED") details.push("疯狂解除");
    }
    out.push({
      seq: e.seq,
      actorId: String(d.actorId),
      kind: String(d.kind),
      result: String(d.result),
      details: [...new Set(details)],
    });
  });
  return out;
}

const WORDS: Record<string, string> = {
  great_success: "大成功！",
  success: "成功",
  failure: "失败",
};

export function VerdictBanner({
  state,
  verdict,
  onDone,
  animate,
}: {
  state: GameState;
  verdict: VerdictInfo;
  onDone: () => void;
  animate: boolean;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, animate ? 2600 : 2200);
    return () => clearTimeout(t);
  }, [verdict.seq]);
  const who = verdict.kind === "locker" ? "被占用的储物柜" : actorName(verdict.actorId);
  return (
    <div
      className={"verdict-banner verdict-" + verdict.result}
      data-testid="verdict"
      data-result={verdict.result}
      role="status"
      aria-live="assertive"
      onClick={onDone}
    >
      <small style={{ color: actorColor(state, verdict.actorId) }}>
        {who} · {checkNames[verdict.kind] ?? "检定"}
      </small>
      <strong>{WORDS[verdict.result] ?? "已结算"}</strong>
      {!!verdict.details.length && <p>{verdict.details.join("　")}</p>}
    </div>
  );
}
