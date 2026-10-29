import React, { useEffect, useLayoutEffect, useRef } from "react";
import { motionMs, reduced } from "./motion-clock.ts";
import { travelFrames, type TravelCue } from "./travel.ts";

interface Pose {
  x: number;
  y: number;
  pos: number;
  board: string;
  w: number;
  h: number;
}
/** World translation and sprite posture have separate transforms. No frame state. */
export function PawnMotion({
  pose,
  cue,
  vertical,
  zIndex,
  children,
}: {
  pose: Pose;
  cue?: TravelCue;
  vertical: boolean;
  zIndex: number;
  children: React.ReactElement;
}) {
  const root = useRef<HTMLDivElement>(null),
    previous = useRef<Pose | null>(null);
  const animations = useRef<Animation[]>([]);
  const stop = () => {
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
  };
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      if (query.matches) stop();
    };
    query.addEventListener?.("change", change);
    return () => {
      query.removeEventListener?.("change", change);
      stop();
    };
  }, []);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = pose;
    if (
      !before ||
      !root.current ||
      before.board !== pose.board ||
      before.w !== pose.w ||
      before.h !== pose.h
    ) {
      stop();
      return;
    }
    if (before.x === pose.x && before.y === pose.y) {
      if (!cue) stop();
      return;
    }
    stop();
    if (reduced() || !root.current.animate) return;
    const moved = before.pos !== pose.pos;
    // A skipped/coalesced server update has no travel cue: reveal its final
    // position immediately instead of starting a fresh cosmetic glide.
    if (moved && !cue) return;
    const kind = moved && cue ? cue.kind : "drag";
    const duration = motionMs(kind === "warp" ? 900 : 400, cue?.weight ?? 1);
    const animation = root.current.animate(
      travelFrames(before, pose, kind, vertical),
      {
        duration,
        easing: kind === "drag" ? "cubic-bezier(.2,.7,.25,1)" : "linear",
      },
    );
    animations.current.push(animation);
  }, [pose.x, pose.y, pose.pos, pose.board, pose.w, pose.h, cue?.id]);
  const last = !!cue && pose.pos === cue.to && cue.kind !== "warp";
  return (
    <div
      ref={root}
      className="ma-travel"
      data-motion={cue?.kind}
      style={{
        transform: `translate3d(${pose.x}px,${pose.y}px,0)`,
        zIndex,
        ["--ma-dust-delay" as string]: `${motionMs(280, cue?.weight ?? 1)}ms`,
        ["--ma-dust-ms" as string]: `${motionMs(180, cue?.weight ?? 1)}ms`,
      }}
    >
      {children}
      {last && (
        <span
          className={"ma-landing-dust" + (vertical ? " vertical" : "")}
          key={cue.id}
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
