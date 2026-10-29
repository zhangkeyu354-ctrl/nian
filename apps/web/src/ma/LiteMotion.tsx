import React, { memo, useLayoutEffect, useRef } from "react";
import { motionMs, reduced } from "./motion-clock.ts";
import { diePose, skillFlightFrames } from "./lite-motion.ts";
import { ART } from "./Track.tsx";

export function CubeDie({
  value,
  rolling,
  seat,
}: {
  value: number;
  rolling: boolean;
  seat: number;
}) {
  const pose = diePose(value);
  return (
    <div
      className={"ma-bigdie ma-cube-scene" + (rolling ? " rolling" : " landed")}
      role="img"
      aria-label={rolling ? "骰子转动中" : `${value} 点`}
      data-value={rolling ? undefined : value}
    >
      <div
        className="ma-cube"
        style={{
          ["--ma-die-x" as string]: `${pose.x}deg`,
          ["--ma-die-y" as string]: `${pose.y}deg`,
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <span
            key={face}
            className={"ma-die-face face-" + face}
            data-pips={face}
            aria-hidden="true"
          >
            <img src={`${ART}/dice/player-${seat}-${face}.svg`} alt="" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function FlyingSkill({
  racer,
  duration,
  children,
}: {
  racer: string;
  duration: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || reduced() || duration <= 0 || !node.animate) return;
    const pawn = document.querySelector<HTMLElement>(
      `[data-ma-racer="${racer}"]`,
    );
    const r = node.getBoundingClientRect(),
      p = pawn?.getBoundingClientRect();
    const origin = {
      x: Math.max(
        24,
        Math.min(innerWidth - 24, p ? p.left + p.width / 2 : innerWidth / 2),
      ),
      y: Math.max(
        24,
        Math.min(
          innerHeight - 24,
          p ? p.top + p.height / 2 : innerHeight * 0.8,
        ),
      ),
    };
    const animation = node.animate(
      skillFlightFrames(origin, {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      }),
      { duration, easing: "cubic-bezier(.2,.7,.25,1)" },
    );
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (query.matches) animation.cancel();
    };
    query.addEventListener?.("change", stop);
    return () => {
      animation.cancel();
      query.removeEventListener?.("change", stop);
    };
  }, [racer, duration]);
  return (
    <div ref={ref} className="ma-skill-flight">
      {children}
    </div>
  );
}

export const RollingScore = memo(function RollingScore({
  value,
}: {
  value: number;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    previous = useRef(value);
  useLayoutEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (reduced()) return;
    const nodes = ref.current?.children;
    if (!nodes) return;
    const options = {
      duration: motionMs(240),
      easing: "cubic-bezier(.2,.7,.25,1)",
    };
    const old = (nodes[0] as HTMLElement).animate?.(
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: "translateY(-100%)", opacity: 0 },
      ],
      options,
    );
    const next = (nodes[1] as HTMLElement).animate?.(
      [
        { transform: "translateY(100%)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      options,
    );
    return () => {
      old?.cancel();
      next?.cancel();
    };
  }, [value]);
  return (
    <span ref={ref} className="ma-score-roll">
      <span className="ma-score-before" aria-hidden="true">
        {previous.current}
      </span>
      <span>{value}</span>
    </span>
  );
});

export function useWindowFade(
  ref: React.RefObject<HTMLDivElement | null>,
  duration: number,
) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node?.animate || duration <= 0 || reduced()) return;
    const edge = Math.min(0.2, 120 / duration);
    const animation = node.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: edge },
        { opacity: 1, offset: 1 - edge },
        { opacity: 0, offset: 1 },
      ],
      { duration, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [duration]);
}
