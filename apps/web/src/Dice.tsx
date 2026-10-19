import React from "react";
import { faceName } from "./labels.ts";
export function Dice({
  face,
  danger = false,
  spawn = false,
  rollKey,
}: {
  face: number;
  danger?: boolean;
  spawn?: boolean;
  rollKey: string;
}) {
  return (
    <div
      key={rollKey}
      className={`die cube-die ${danger ? "danger-die" : "skill-die"} ${face === 0 ? "failure" : face === 5 ? "great" : "success"}`}
      data-die={danger ? "danger" : "skill_check"}
      aria-label={`${danger ? "危险骰" : "技能检定骰"}：${spawn ? "出生骰面" + face : faceName(face)}`}
    >
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
      <span>{spawn ? "出生骰面 " + face : faceName(face)}</span>
    </div>
  );
}
