import React, { useEffect, useRef, useState } from "react";
import type { GameState, Event } from "../../../packages/shared/src/types.ts";
import { boardVisuals } from "../../../packages/game-engine/src/index.ts";
import layoutData from "./layout.json" with { type: "json" };
import { useSettings } from "./Settings.tsx";
import "./board-fx.css";

/**
 * 棋盘上的动作特效（2026-10-21）：攻击、扛起、挂钩、献祭、放木板、破坏木板/墙、
 * 开箱、修发电机、发电机完成、净化图腾、捕兽夹、逃脱。
 * 只看公开事件和公开状态（所有人都看得到），不改变任何规则；关闭动画时不显示。
 */
type Kind =
  | "slash"
  | "lift"
  | "hook"
  | "sacrifice"
  | "pallet"
  | "break"
  | "chest"
  | "sparks"
  | "complete"
  | "totem"
  | "trap"
  | "escape";
interface Fx {
  id: string;
  kind: Kind;
  x: number;
  y: number;
}
const LIFE: Record<Kind, number> = {
  slash: 1000, lift: 1200, hook: 1500, sacrifice: 1500, pallet: 1100, break: 1000,
  chest: 1300, sparks: 900, complete: 1600, totem: 1300, trap: 900, escape: 1600,
};

function roomPoint(s: GameState, room: string | null | undefined): [number, number] | null {
  const l = (layoutData as any)[s.mapId];
  const p = room && l?.rooms[room];
  return p ? [p[0], p[1] + 20] : null;
}
function pathPoint(s: GameState, pathId: string): [number, number] | null {
  const l = (layoutData as any)[s.mapId];
  if (l?.markers?.[pathId]) return l.markers[pathId] as [number, number];
  const seg: string | undefined = l?.paths?.[pathId]?.[0];
  if (!seg) return null;
  const pts = seg.split(" ").map((v) => v.split(",").map(Number));
  return pts[Math.floor(pts.length / 2)] as [number, number];
}
const propRoom = (s: GameState, id: unknown) => s.props.find((p) => p.id === id)?.room;

export function fxFrom(before: GameState, after: GameState, events: Event[]): Fx[] {
  const out: Fx[] = [];
  const add = (kind: Kind, at: [number, number] | null, key: string | number) => {
    if (at) out.push({ id: `${kind}-${key}`, kind, x: at[0], y: at[1] });
  };
  for (const e of events) {
    const d = e.data as Record<string, unknown>;
    const who = String(d.actorId ?? "");
    switch (e.type) {
      case "WOUNDED":
        if (!after.actors[who]?.lockerId) add("slash", roomPoint(after, after.actors[who]?.room), e.seq);
        break;
      case "HOOKED":
        add("hook", roomPoint(after, propRoom(after, d.hookId) ?? after.actors[who]?.room), e.seq);
        break;
      case "SACRIFICE_PROGRESS":
        // 献祭进度：每个挂在钩子上的人所在的钩子处升起尖刺
        for (const a of Object.values(after.actors))
          if (a.hookId) add("sacrifice", roomPoint(after, propRoom(after, a.hookId)), `${e.seq}-${a.id}`);
        break;
      case "AFTER_SACRIFICE":
        add("sacrifice", roomPoint(before, before.actors[who]?.room ?? propRoom(before, before.actors[who]?.hookId)), e.seq);
        break;
      case "PALLET_PLACED":
        add("pallet", pathPoint(after, String(d.pathId)), e.seq);
        break;
      case "PALLET_DESTROYED":
      case "WALL_DESTROYED":
      case "WALL_REMOVED":
        add("break", pathPoint(after, String(d.pathId)), e.seq);
        break;
      case "AFTER_CHEST":
        add("chest", roomPoint(after, propRoom(before, d.propId) ?? after.actors[who]?.room), e.seq);
        break;
      case "PROP_PROGRESS":
        add("sparks", roomPoint(after, propRoom(after, d.propId)), e.seq);
        break;
      case "GENERATOR_COMPLETED":
        add("complete", roomPoint(after, propRoom(after, d.propId)), e.seq);
        break;
      case "BEAR_TRAP_PLACED":
        add("trap", pathPoint(after, String(d.pathId)), e.seq);
        break;
      case "ESCAPED":
        add("escape", roomPoint(before, before.actors[who]?.room), e.seq);
        break;
      case "CHECK_RESOLVED":
        if (d.kind === "totem" && d.result !== "failure" && before.roll?.targetId)
          add("totem", roomPoint(before, propRoom(before, before.roll.targetId)), e.seq);
        break;
    }
  }
  // 扛起：有人从"不被扛"变成"被扛"
  const was = new Set(boardVisuals(before).actors.filter((a) => a.state === "carried").map((a) => a.id));
  for (const a of boardVisuals(after).actors)
    if (a.state === "carried" && !was.has(a.id)) add("lift", roomPoint(after, a.room), `${a.id}-${after.events.length}`);
  return out;
}

const SLASH = "M-60 -40 Q 0 0 60 40";
export function BoardFx({ state }: { state: GameState }) {
  const { effectiveAnimations } = useSettings();
  const prev = useRef(state);
  const [fx, setFx] = useState<Fx[]>([]);
  useEffect(() => {
    const old = prev.current;
    prev.current = state;
    if (old === state || !effectiveAnimations || state.events.length <= old.events.length) return;
    const fresh = fxFrom(old, state, state.events.slice(old.events.length));
    if (!fresh.length) return;
    setFx((q) => [...q, ...fresh].slice(-10));
    for (const f of fresh)
      setTimeout(() => setFx((q) => q.filter((x) => x.id !== f.id)), LIFE[f.kind]);
  }, [state, effectiveAnimations]);
  if (!fx.length) return null;
  return (
    <g className="board-fx" pointerEvents="none" aria-hidden="true">
      {fx.map((f) => (
        <g key={f.id} transform={`translate(${f.x} ${f.y})`} className={"fx fx-" + f.kind} data-fx={f.kind}>
          {f.kind === "slash" && (
            <>
              <circle className="fx-burst" r="90" />
              {[-26, 0, 26].map((o) => (
                <path key={o} className="fx-claw" d={SLASH} transform={`translate(${o} ${-o / 2})`} />
              ))}
            </>
          )}
          {f.kind === "lift" && (
            <>
              <circle className="fx-ring red" r="70" />
              <path className="fx-arrow" d="M0 30 V-60 M-22 -38 L0 -60 L22 -38" />
              <text className="fx-text" y="-78" textAnchor="middle">扛起！</text>
            </>
          )}
          {f.kind === "hook" && (
            <>
              <line className="fx-chain" x1="0" y1="-160" x2="0" y2="-34" />
              <path className="fx-hook" d="M0 -40 V-6 Q0 18 -18 18 Q-34 18 -34 0" />
              <circle className="fx-ring red" r="80" />
            </>
          )}
          {f.kind === "sacrifice" && (
            <>
              {[-60, -30, 0, 30, 60].map((x, i) => (
                <path key={i} className="fx-spike" d={`M${x - 12} 60 L${x} ${-40 - (i % 2) * 30} L${x + 12} 60 Z`} style={{ animationDelay: i * 60 + "ms" }} />
              ))}
              <circle className="fx-ring dark" r="90" />
            </>
          )}
          {f.kind === "pallet" && (
            <>
              <rect className="fx-plank" x="-46" y="-9" width="92" height="18" rx="3" />
              {[-40, -14, 14, 40].map((x, i) => (
                <circle key={i} className="fx-dust" cx={x} cy="16" r="10" style={{ animationDelay: 350 + i * 30 + "ms" }} />
              ))}
            </>
          )}
          {f.kind === "break" &&
            [0, 60, 120, 180, 240, 300].map((r) => (
              <rect key={r} className="fx-splinter" x="-4" y="-22" width="8" height="22" style={{ transform: `rotate(${r}deg)` }} />
            ))}
          {f.kind === "chest" && (
            <>
              <circle className="fx-glow gold" r="70" />
              <rect className="fx-card" x="-16" y="-24" width="32" height="44" rx="4" />
            </>
          )}
          {f.kind === "sparks" &&
            [0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
              <line key={r} className="fx-spark" x1="0" y1="0" x2="0" y2="-34" style={{ transform: `rotate(${r}deg)` }} />
            ))}
          {f.kind === "complete" && (
            <>
              <circle className="fx-glow gold" r="120" />
              <circle className="fx-ring gold" r="90" />
              <text className="fx-text gold" y="-96" textAnchor="middle">发电机修好！</text>
            </>
          )}
          {f.kind === "totem" &&
            [0, 1, 2, 3, 4].map((i) => (
              <circle key={i} className="fx-smoke" cx={(i - 2) * 20} cy="0" r="22" style={{ animationDelay: i * 70 + "ms" }} />
            ))}
          {f.kind === "trap" && (
            <>
              <path className="fx-jaw" d="M-36 0 L-24 -16 L-12 0 L0 -16 L12 0 L24 -16 L36 0" />
              <path className="fx-jaw low" d="M-36 0 L-24 16 L-12 0 L0 16 L12 0 L24 16 L36 0" />
            </>
          )}
          {f.kind === "escape" && (
            <>
              <rect className="fx-beam" x="-40" y="-260" width="80" height="300" />
              <text className="fx-text light" y="-110" textAnchor="middle">逃脱！</text>
            </>
          )}
        </g>
      ))}
    </g>
  );
}
