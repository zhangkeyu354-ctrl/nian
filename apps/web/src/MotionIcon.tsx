import React from "react";
import type { Card } from "../../../packages/shared/src/types.ts";
/** Original geometric action pictograms; no official artwork is used. */
export function MotionIcon({ card, size = 40 }: { card: Card; size?: number }) {
  const poses: Record<Card, { head: number[]; body: string }> = {
    blue: {
      head: [34, 13],
      body: "M32 24l-5 16 8 12m-8-12-9 14m13-26-11 9-8-2m17-5 10 8 9-2",
    },
    green: {
      head: [39, 11],
      body: "M36 22l-11 14 12 9 12-3M25 36l-9 15-10 2m27-29 10 7 12-5M31 26l-13-2-7 8",
    },
    red: {
      head: [37, 25],
      body: "M34 35l-14 6 16 4 12 9M22 41l-8 10 12 3m10-18 9 5 9-1",
    },
    yellow: {
      head: [27, 12],
      body: "M29 23l10 11 14-9M38 34L24 43 9 38m20-14-13 5-5-7M5 52h54M44 40v12",
    },
    wait: {
      head: [32, 12],
      body: "M32 24v17m0-13-12 9m12-9 12 9M32 41l-8 15m8-15 8 15",
    },
  };
  const p = poses[card];
  return (
    <svg
      className="motion-icon"
      data-motion-icon={card}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <circle cx={p.head[0]} cy={p.head[1]} r="6" fill="currentColor" />
      <path
        d={p.body}
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
