import React, { useEffect, useState } from "react";
import { faceName } from "./labels.ts";
// 滚动时依次闪过的骰面（只是动画，真正结果由服务器/规则引擎决定）
const SKILL_FACES = [0, 1, 2, 3, 4, 5];
const DANGER_FACES = [0, 5];
const SPAWN_FACES = [0, 1, 2, 3, 4, 5];
// 复刻骰面图（2026-11-23）：规则面值 → 图片。技能骰：骷髅=失败，1~4 道爪痕=成功，五道划痕=大成功；危险骰：骷髅=失败，划痕=大成功
const SKILL_ART: Record<number, string> = { 0: "skill_4", 1: "skill_1", 2: "skill_5", 3: "skill_2", 4: "skill_3", 5: "skill_6" };
const dieArt = (face: number, danger: boolean) =>
  `/assets/dice/${danger ? (face === 0 ? "danger_2" : "danger_1") : SKILL_ART[face] ?? "skill_1"}.webp`;

/** 先在桌面上翻滚、骰面快速变化，再落定到真实结果；关闭动画时直接显示结果 */
export function Dice({
  face: realFace,
  danger = false,
  spawn = false,
  rollKey,
  delay = 0,
}: {
  face: number;
  danger?: boolean;
  spawn?: boolean;
  rollKey: string;
  /** 多颗骰子依次落定的延迟（毫秒） */
  delay?: number;
}) {
  // 服务端渲染（测试）时没有 document，直接显示结果
  const motion =
    typeof document !== "undefined" &&
    document.documentElement.dataset.motion !== "off";
  const [rolling, setRolling] = useState(motion);
  const [shown, setShown] = useState(realFace);
  useEffect(() => {
    if (!motion) {
      setRolling(false);
      setShown(realFace);
      return;
    }
    setRolling(true);
    const pool = spawn ? SPAWN_FACES : danger ? DANGER_FACES : SKILL_FACES;
    let i = Math.floor(Math.random() * pool.length);
    const tick = setInterval(() => {
      i = (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
      setShown(pool[i]);
    }, 85);
    const stop = setTimeout(() => {
      clearInterval(tick);
      setShown(realFace);
      setRolling(false);
    }, 1050 + delay);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [rollKey, realFace]);
  const face = shown;
  return (
    <div
      key={rollKey}
      data-rolling={rolling ? "true" : "false"}
      className={`die cube-die ${rolling ? "tumbling" : "landed"} ${danger ? "danger-die" : "skill-die"} ${face === 0 ? "failure" : face === 5 ? "great" : "success"}`}
      data-die={danger ? "danger" : "skill_check"}
      aria-label={
        rolling
          ? "骰子滚动中"
          : `${danger ? "危险骰" : "技能检定骰"}：${spawn ? "出生骰面" + realFace : faceName(realFace)}`
      }
    >
      {spawn ? (
      <svg viewBox="0 0 80 80" width="66" height="66" aria-hidden="true">
          {spawn ? (
            <text
              x="40"
              y="55"
              textAnchor="middle"
              fontSize="42"
              fill="currentColor"
            >
              {face}
            </text>
          ) : face === 0 ? (
            <path
              d="M25 25l30 30m0-30L25 55"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
            />
          ) : face === 5 ? (
            <path
              d="M40 12l8 18 21 3-16 14 5 21-18-11-18 11 5-21-16-14 21-3z"
              fill="currentColor"
            />
          ) : (
            <>
              <path
                d="M20 40l14 14 28-30"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <text x="63" y="70" fontSize="18" fill="currentColor">
                {face}
              </text>
            </>
          )}
        </svg>
      ) : (
        <img className="die-art" src={dieArt(face, danger)} width="66" height="66" alt="" aria-hidden="true" draggable={false} />
      )}
      <span>
        {rolling ? "……" : spawn ? "出生骰面 " + face : faceName(face)}
      </span>
    </div>
  );
}
