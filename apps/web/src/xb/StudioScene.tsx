import React, { useEffect, useState } from "react";
import { studioPolicy } from "./art-policy.ts";
export function StudioScene({ powerSave }: { powerSave: boolean }) {
  const [size, setSize] = useState(() => ({
    width: innerWidth,
    portrait: innerHeight > innerWidth,
  }));
  useEffect(() => {
    const resize = () =>
      setSize({ width: innerWidth, portrait: innerHeight > innerWidth });
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  const n = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const policy = studioPolicy({
    ...size,
    powerSave,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    memory: n.deviceMemory,
    cores: n.hardwareConcurrency,
    saveData: n.connection?.saveData,
  });
  return (
    <div
      className="xb-studio-scene"
      aria-hidden="true"
      data-preblurred={policy.preblurred}
    >
      <img
        src={policy.src}
        alt=""
        decoding="async"
        fetchPriority="high"
        style={{ filter: policy.liveBlur ? "blur(1.5px)" : "none" }}
      />
      <div />
    </div>
  );
}
export function OnAir({ phase }: { phase: string }) {
  const state =
    phase === "reveal"
      ? "reveal"
      : ["discussion", "challenge", "guess"].includes(phase)
        ? "live"
        : "off";
  return (
    <span
      className="xb-on-air"
      data-state={state}
      data-testid="xb-on-air"
      aria-label={
        state === "off" ? "等待开播" : state === "live" ? "直播中" : "揭晓中"
      }
    >
      <i />
      ON AIR
    </span>
  );
}
