import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { feedback, type Feedback } from "./feel.ts";
import { Loudmouth } from "./Art.tsx";
export function RollingScore({
  value,
  powerSave,
}: {
  value: number;
  powerSave: boolean;
}) {
  const [shown, setShown] = useState(value),
    previous = useRef(value);
  useEffect(() => {
    const start = performance.now(),
      from = previous.current;
    previous.current = value;
    if (powerSave) {
      setShown(value);
      return;
    }
    let id = 0;
    const run = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      setShown(Math.round(from + (value - from) * (1 - (1 - p) ** 3)));
      if (p < 1) id = requestAnimationFrame(run);
    };
    id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  }, [value, powerSave]);
  return (
    <span className={value < shown ? "xb-count-loss" : "xb-count-gain"}>
      {shown}分
    </span>
  );
}
export function HoldRing({ holding }: { holding: boolean }) {
  return (
    <span
      className={"xb-hold-ring " + (holding ? "is-holding" : "")}
      aria-hidden="true"
    >
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={
            {
              "--angle": `${i * 10}deg`,
              "--delay": `${(i * 500) / 36}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
export function FeelLayer({
  selected,
  speaker,
  stage,
  powerSave,
  sound,
  warmup,
  spotlight,
  winner,
  skipped,
}: {
  selected: string;
  speaker: string | null | undefined;
  stage: string;
  powerSave: boolean;
  sound: boolean;
  warmup: boolean;
  spotlight: boolean;
  winner: string;
  skipped: boolean;
}) {
  const [banner, setBanner] = useState(""),
    [rects, setRects] = useState<{
      select: DOMRect | null;
      speaker: DOMRect | null;
    }>({ select: null, speaker: null });
  const last = useRef("");
  useEffect(() => {
    if (last.current === stage) return;
    last.current = stage;
    const labels: Record<string, string> = {
      deal: "瞎掰王，开播！",
      rotation: "换个频道，接着掰",
      discussion: "开麦时间",
      reveal: "真相即将接通",
      over: "今晚的嘴强王者",
    };
    setBanner(labels[stage] ?? "");
    if (labels[stage])
      feedback(stage === "deal" ? "opening" : "transition", {
        sound,
        vibration: false,
      });
    const t = setTimeout(() => setBanner(""), stage === "deal" ? 1500 : 1000);
    return () => clearTimeout(t);
  }, [stage]);
  useLayoutEffect(() => {
    const read = () =>
      setRects({
        select: selected
          ? (document
              .getElementById("xb-avatar-" + selected)
              ?.getBoundingClientRect() ?? null)
          : null,
        speaker: speaker
          ? (document
              .getElementById("xb-avatar-" + speaker)
              ?.getBoundingClientRect() ?? null)
          : null,
      });
    read();
    window.addEventListener("resize", read);
    window.addEventListener("scroll", read, true);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("scroll", read, true);
    };
  }, [selected, speaker, stage]);
  const position = (r: DOMRect) => ({
    width: r.width,
    height: r.height,
    transform: `translate(${r.x}px,${r.y - 6}px)`,
  });
  return (
    <>
      {banner && (
        <div
          className="xb-channel-banner"
          key={stage}
          data-testid="xb-channel-banner"
        >
          <Loudmouth small />
          {banner}
        </div>
      )}
      {warmup && !skipped && (
        <div className="xb-warmup" data-testid="xb-warmup">
          <span>耳朵竖起来，真相要来了…</span>
        </div>
      )}
      {rects.select && (
        <div
          className="xb-selection-glider"
          style={position(rects.select)}
          aria-hidden="true"
        >
          {!powerSave &&
            [0, 1, 2, 3].map((i) => (
              <i key={i} style={{ "--n": i } as React.CSSProperties}>
                ✦
              </i>
            ))}
        </div>
      )}
      {rects.speaker && !powerSave && (
        <div
          className="xb-speaker-glider"
          style={position(rects.speaker)}
          aria-hidden="true"
        >
          {[0, 1, 2].map((i) => (
            <i key={i} style={{ animationDelay: `${i * 300}ms` }} />
          ))}
        </div>
      )}
      {spotlight && !skipped && (
        <div className="xb-spotlight" data-testid="xb-spotlight">
          🎙 本轮高光：{winner}
        </div>
      )}
    </>
  );
}
