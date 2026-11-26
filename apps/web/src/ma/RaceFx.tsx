import React from "react";
import meta from "../vfx-meta.json" with { type: "json" };

export type RaceFxKind = "portal" | "teleport" | "reveal" | "monster" | "out" | "power" | "coins" | "gold" | "silver" | "bronze" | "trip" | "duel" | "finale";
export interface RaceFxCue {
  id: number;
  kind: RaceFxKind;
  racer?: string;
  pos?: number;
  color?: string;
  duration: number;
}

const sprite: Record<RaceFxKind, string> = {
  portal: "portal", teleport: "teleport", reveal: "reveal", monster: "slash",
  out: "break", power: "power", coins: "coins", gold: "complete",
  silver: "complete", bronze: "complete", trip: "dust", duel: "slash", finale: "complete",
};
const particle: Partial<Record<RaceFxKind, string>> = {
  reveal: "magic_02", gold: "star_09", silver: "star_06", bronze: "star_04", finale: "star_09",
};
const tint: Partial<Record<RaceFxKind, string>> = {
  gold: "#ffd338", silver: "#d8e5fa", bronze: "#d99458", monster: "#ff5555", out: "#d9b98b",
};
const scale: Partial<Record<RaceFxKind, number>> = {
  portal: .8, teleport: .8, reveal: .65, monster: .85, out: .7, power: .42,
  coins: 1.2, gold: 1, silver: .78, bronze: .58, trip: .65, duel: .72, finale: 1.15,
};
export function raceFxBaseDuration(kind: RaceFxKind) {
  const frame = (meta as Record<string, { n: number; ms: number }>)[sprite[kind]];
  return frame.n * frame.ms;
}

/** Position is supplied by Track's physical-space layout, including mirror races. */
export function RaceFx({ cues, spot, place }: {
  cues: RaceFxCue[];
  spot: Map<string, { x: number; y: number }>;
  place: (pos: number) => { x: number; y: number };
}) {
  if (!cues.length) return null;
  return <div className="ma-race-fx-layer" aria-hidden="true" data-testid="ma-race-fx-layer">
    {cues.slice(-4).map(cue => {
      const at = cue.pos === undefined ? (cue.racer ? spot.get(cue.racer) : { x: .5, y: .5 }) : place(cue.pos);
      if (!at) return null;
      const id = sprite[cue.kind];
      const frame = (meta as Record<string, { w: number; h: number; n: number; ms: number }>)[id];
      if (!frame) return null;
      const factor = scale[cue.kind] ?? 1;
      const width = frame.w * factor, height = frame.h * factor;
      const color = cue.color ?? tint[cue.kind] ?? "#c5aaff";
      return <span key={cue.id} className={`ma-race-fx ma-race-fx-${cue.kind}`}
        data-testid={`ma-race-fx-${cue.kind}`}
        style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, width, height, color,
          ["--ma-fx-duration" as string]: `${cue.duration}ms` }}>
        <span className="ma-race-fx-clip" style={{ width, height }}>
          <img src={`/assets/cc0/vfx/${id}.png`} alt="" draggable={false}
            style={{ width: width * frame.n, height, animationDuration: `${cue.duration}ms`,
              ["--ma-fx-distance" as string]: `${-width * frame.n}px`,
              ["--ma-fx-steps" as string]: `steps(${frame.n})` }} />
        </span>
        {particle[cue.kind] && <span className="ma-race-fx-particle"
          style={{ animationDuration: `${cue.duration}ms`,
            maskImage: `url(/assets/cc0/particles/${particle[cue.kind]}.webp)`,
            WebkitMaskImage: `url(/assets/cc0/particles/${particle[cue.kind]}.webp)` }} />}
      </span>;
    })}
  </div>;
}
