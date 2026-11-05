import { useEffect, useRef, useState } from "react";
import type { GameState } from "../../../packages/shared/src/types.ts";
import { useSettings } from "./Settings.tsx";
import "./scene-fx.css";

/**
 * 场景氛围（2026-11-05，CC0 素材）：
 * - 背景：按地图换一张昏暗场景图；对局结束换成胜负背景
 * - 雾：棋盘上缓慢飘动的烟雾层
 * - 转场：新一轮开始 / 杀手回合开始 / 对局结束时，播放一次遮罩转场
 * 只看公开状态；全部不接收点击；关闭动画时只保留静态背景。
 */
const T = "/assets/cc0/transitions/";
const KINDS = {
  round: { file: "Dissolve01_17", color: "#0b0f12", label: "" },
  killer: { file: "Slash02_17", color: "#3a0406", label: "" },
  over: { file: "Melt01_15", color: "#050505", label: "" },
} as const;
type K = keyof typeof KINDS;

export function sceneBackground(s: GameState) {
  if (s.winner) return s.winner === "killer" ? "killer_win" : "escape_road";
  return s.mapId === "macmillan_estate" ? "mansion" : "factory";
}

export function SceneFx({ state }: { state: GameState }) {
  const { effectiveAnimations } = useSettings();
  const prev = useRef(state);
  const [run, setRun] = useState<{ k: K; id: number } | null>(null);
  useEffect(() => {
    const old = prev.current;
    prev.current = state;
    if (old === state || !effectiveAnimations) return;
    let k: K | null = null;
    if (state.winner && !old.winner) k = "over";
    else if (state.turn?.actorId === state.killerId && old.turn?.actorId !== state.killerId) k = "killer";
    else if (state.round !== old.round && state.round > 1) k = "round";
    if (!k) return;
    const id = Date.now();
    setRun({ k, id });
    const t = setTimeout(() => setRun((r) => (r?.id === id ? null : r)), 1100);
    return () => clearTimeout(t);
  }, [state, effectiveAnimations]);
  const bg = sceneBackground(state);
  const n = run ? Number(KINDS[run.k].file.split("_")[1]) : 0;
  return (
    <>
      <div
        className={"scene-bg" + (state.winner ? " is-over" : "")}
        aria-hidden="true"
        style={{ backgroundImage: `url(/assets/cc0/bg/${bg}.webp)` }}
      />
      {state.winner && (
        <div className={"scene-over scene-over-" + state.winner} aria-hidden="true" style={{ backgroundImage: `linear-gradient(180deg, rgba(5,6,7,.15), rgba(5,6,7,.75)), url(/assets/cc0/bg/${bg}.webp)` }}>
          <strong>{state.winner === "killer" ? "献祭完成" : "逃出生天"}</strong>
          <span>{state.winner === "killer" ? "杀手获胜" : "逃生者获胜"}</span>
        </div>
      )}
      {run && (
        <div
          key={run.id}
          className="scene-transition"
          data-scene-transition={run.k}
          aria-hidden="true"
          style={{
            background: KINDS[run.k].color,
            ["--mask" as string]: `url(${T}${KINDS[run.k].file}.png)`,
            ["--n" as string]: n,
            ["--steps" as string]: n - 1,
          }}
        />
      )}
    </>
  );
}
