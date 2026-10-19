import React, { useState, useRef, useEffect } from "react";
import type { GameState } from "../../../packages/shared/src/types.ts";
import { maps } from "../../../packages/game-engine/src/data.ts";
import {
  actorName,
  propNames,
  categoryNames,
  propLabel,
  publicProps,
} from "../../../packages/game-engine/src/index.ts";
import layoutData from "./layout.json" with { type: "json" };
const colors: Record<string, string> = {
  blue: "#62b5de",
  green: "#83bc8e",
  red: "#d98176",
  yellow: "#f1ca62",
};
const marks: Record<string, string> = {
  generator: "电",
  exit_gate: "门",
  hook: "钩",
  hex_totem: "咒",
  chest: "箱",
  locker: "柜",
  pallet: "板",
  crow: "鸦",
};
export function Board({
  state,
  highlight,
  onRoom,
  onProp,
  selected,
}: {
  state: GameState;
  highlight: Array<{ pathId: string; to: string }>;
  onRoom: (id: string) => void;
  onProp: (id: string) => void;
  selected: string | null;
}) {
  const map = maps.maps.find((m) => m.id === state.mapId)!;
  const layout = (
    layoutData as Record<
      string,
      {
        rooms: Record<string, number[]>;
        paths: Record<string, string[]>;
        markers: Record<string, number[]>;
      }
    >
  )[map.id];
  const height = map.id === "macmillan_estate" ? 1000 : 880;
  const yScale = 0.66;
  const [view, setView] = useState({ x: 0, y: 0, w: 1540, h: height });
  const viewRef = useRef(view);
  viewRef.current = view;
  const el = useRef<HTMLDivElement>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    last = useRef<{ x: number; y: number; distance: number } | null>(null),
    drag = useRef(false);
  const reset = () => setView({ x: 0, y: 0, w: 1540, h: height });
  useEffect(reset, [map.id]);
  const zoom = (factor: number) =>
    setView((v) => {
      const w = Math.min(2000, Math.max(380, v.w * factor));
      const h = (w / 1540) * height;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });
  useEffect(() => {
    const node = el.current!;
    const f = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.1 : 0.9);
    };
    node.addEventListener("wheel", f, { passive: false });
    return () => node.removeEventListener("wheel", f);
  }, [height]);
  function pointer(e: React.PointerEvent, kind: string) {
    if (kind === "down") {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag.current = false;
    }
    if (kind === "up") {
      pointers.current.delete(e.pointerId);
      last.current = null;
      return;
    }
    if (kind === "move") {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const pts = [...pointers.current.values()];
    const center = {
      x: pts.reduce((v, p) => v + p.x, 0) / pts.length,
      y: pts.reduce((v, p) => v + p.y, 0) / pts.length,
      distance:
        pts.length > 1
          ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
          : 0,
    };
    if (kind === "move" && last.current) {
      const prev = last.current;
      const dx = center.x - prev.x,
        dy = center.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.current = true;
      const rect = el.current!.getBoundingClientRect();
      setView((v) => {
        const factor =
          prev.distance && center.distance
            ? prev.distance / center.distance
            : 1;
        const w = Math.min(2000, Math.max(380, v.w * factor)),
          h = (w / 1540) * height;
        return {
          x: v.x - (dx * v.w) / rect.width + (v.w - w) / 2,
          y: v.y - (dy * v.h) / rect.height + (v.h - h) / 2,
          w,
          h,
        };
      });
    }
    last.current = center;
  }
  const click = (fn: () => void) => {
    if (!drag.current) fn();
  };
  const props = publicProps(state);
  return (
    <div className="board-shell">
      <div className="board-top">
        <span>{map.name_zh}</span>
        <div className="zoom-controls">
          <button aria-label="缩小地图" onClick={() => zoom(1.25)}>
            −
          </button>
          <button onClick={reset} aria-label="复位地图">
            {Math.round((1540 / view.w) * 100)}%
          </button>
          <button aria-label="放大地图" onClick={() => zoom(0.8)}>
            ＋
          </button>
        </div>
      </div>
      <div
        className="map-viewport"
        ref={el}
        onPointerDown={(e) => pointer(e, "down")}
        onPointerMove={(e) => pointer(e, "move")}
        onPointerUp={(e) => pointer(e, "up")}
        onPointerCancel={(e) => pointer(e, "up")}
        onPointerLeave={(e) => pointer(e, "up")}
      >
        <svg
          data-testid="board"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          role="img"
          aria-label={`${map.name_zh}数字棋盘，房间和道具可点击`}
        >
          <defs>
            {Object.entries(colors).map(([id, color]) => (
              <marker
                key={id}
                id={"arrow-" + id}
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="5"
                orient="auto"
              >
                <path d="M0 0 L10 5 L0 10 Z" fill={color} />
              </marker>
            ))}
            <pattern
              id="grid"
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M50 0H0V50"
                fill="none"
                stroke="#2b3837"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect
            x="-6000"
            y="-6000"
            width="12000"
            height="12000"
            fill="#1d2928"
          />
          <rect
            x="-6000"
            y="-6000"
            width="12000"
            height="12000"
            fill="url(#grid)"
            opacity=".42"
          />
          {Object.values(state.paths).map((p) => {
            const segments = (layout.paths[p.id] ?? []).map((segment) =>
              segment
                .split(" ")
                .map((point) => {
                  const [x, y] = point.split(",").map(Number);
                  return `${x},${y * yScale}`;
                })
                .join(" "),
            );
            const lit = highlight.some((r) => r.pathId === p.id);
            const pts =
              segments[0]?.split(" ").map((v) => v.split(",").map(Number)) ??
              [];
            const marker = layout.markers[p.id];
            const m = marker
              ? [marker[0], marker[1] * yScale]
              : (pts[Math.floor(pts.length / 2)] ?? [0, 0]);
            return (
              <g
                key={p.id}
                data-path={p.id}
                data-highlighted={lit ? "true" : "false"}
              >
                {segments.map((points, i) => (
                  <React.Fragment key={i}>
                    {lit && (
                      <polyline
                        points={points}
                        className="route-glow"
                        stroke={colors[p.color]}
                      />
                    )}
                    <polyline
                      points={points}
                      fill="none"
                      stroke={colors[p.color]}
                      strokeWidth={lit ? 8 : 5}
                      opacity={lit ? 1 : 0.62}
                      strokeLinejoin="round"
                      markerEnd={
                        p.direction !== "both"
                          ? "url(#arrow-" + p.color + ")"
                          : undefined
                      }
                    />
                  </React.Fragment>
                ))}
                {p.wall && !p.temporaryWall && (
                  <g className="wall" data-testid="wall">
                    <title>可破坏墙壁</title>
                    <path
                      d="M-32 -13L-24 -20L-16 -13L-8 -20L0 -13L8 -20L16 -13L24 -20L32 -13L32 13L24 20L16 13L8 20L0 13L-8 20L-16 13L-24 20L-32 13Z"
                      transform={`translate(${m[0]} ${m[1]})`}
                      fill="#b5a789"
                      stroke="#332e28"
                      strokeWidth="3"
                    />
                    <text
                      x={m[0]}
                      y={m[1] + 7}
                      textAnchor="middle"
                      fill="#252820"
                      fontSize="19"
                    >
                      墙
                    </text>
                  </g>
                )}
                {p.pallet && (
                  <text x={m[0]} y={m[1] - 20} className="path-token">
                    木板
                  </text>
                )}
                {p.bearTrap && (
                  <text x={m[0]} y={m[1] + 35} className="path-token">
                    捕兽夹
                  </text>
                )}
                {state.entity?.id === p.id && (
                  <text x={m[0]} y={m[1] - 22} className="path-token">
                    恶灵
                  </text>
                )}
              </g>
            );
          })}
          {map.nodes.map((n) => {
            const [x, sourceY] = layout.rooms[n.id];
            const y = sourceY * yScale;
            const occupants = Object.values(state.actors).filter(
              (a) => a.room === n.id,
            );
            const slots = props.filter((p) => p.room === n.id);
            const reachable = highlight.some((r) => r.to === n.id);
            return (
              <g key={n.id} transform={`translate(${x} ${y})`}>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={"房间：" + n.name_zh}
                  data-room={n.id}
                  onClick={() => click(() => onRoom(n.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onRoom(n.id);
                  }}
                  className="room-node"
                >
                  <rect
                    x="-109"
                    y="-46"
                    width="218"
                    height="139"
                    rx="7"
                    fill={selected === n.id ? "#e8dfbb" : "#c7c9b8"}
                    stroke={
                      reachable
                        ? "#f1d47c"
                        : selected === n.id
                          ? "#f3dd9a"
                          : "#819289"
                    }
                    strokeWidth={reachable ? 7 : 3}
                  />
                  <text
                    x="0"
                    y="-16"
                    textAnchor="middle"
                    className="room-label"
                  >
                    {n.name_zh}
                  </text>
                  {!!n.spawn_faces.length && (
                    <text x="-96" y="6" fontSize="15" fill="#48564f">
                      出生 {n.spawn_faces.join("/")}
                    </text>
                  )}
                  {occupants.map((a, i) => (
                    <g key={a.id} transform={`translate(${-79 + i * 38} 27)`}>
                      <circle
                        r="17"
                        fill={
                          a.side === "killer"
                            ? "#943d37"
                            : a.health === "wounded"
                              ? "#a27830"
                              : "#335b60"
                        }
                        stroke="#fff8e1"
                        strokeWidth="2"
                      />
                      <text
                        y="6"
                        textAnchor="middle"
                        fill="white"
                        fontSize="17"
                      >
                        {actorName(a.id).slice(0, 1)}
                      </text>
                      <title>
                        {actorName(a.id)}
                        {a.hookId ? "（挂钩）" : a.lockerId ? "（躲藏）" : ""}
                      </title>
                    </g>
                  ))}
                </g>
                {slots.map((p, i) => {
                  const px = -91 + i * 36;
                  return (
                    <g
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      data-prop={p.id}
                      aria-label={propLabel(state, p.id)}
                      onClick={() => click(() => onProp(p.id))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onProp(p.id);
                      }}
                      className={"prop-node " + (p.removed ? "removed" : "")}
                      transform={`translate(${px} 68)`}
                    >
                      <rect
                        x="-15"
                        y="-18"
                        width="31"
                        height="34"
                        rx="4"
                        fill={
                          p.kind
                            ? "#f0eddc"
                            : (
                                {
                                  objective: "#8d9fc2",
                                  boldness: "#b97869",
                                  survival: "#92a785",
                                  altruism: "#b4a181",
                                } as Record<string, string>
                              )[p.category]
                        }
                        stroke={selected === p.id ? "#9c5a13" : "#677467"}
                        strokeWidth="2"
                      />
                      <text
                        y="5"
                        textAnchor="middle"
                        fontSize="20"
                        fill="#26342f"
                      >
                        {p.removed
                          ? "·"
                          : p.kind
                            ? marks[p.kind]
                            : categoryNames[p.category].slice(0, 1)}
                      </text>
                      {p.progress > 0 && (
                        <text
                          x="0"
                          y="33"
                          fontSize="18"
                          textAnchor="middle"
                          fill="#fff0ab"
                        >
                          {"●".repeat(p.progress)}
                        </text>
                      )}
                      {state.entity?.id === p.id && (
                        <text x="0" y="-23" fontSize="16" fill="#902f28">
                          恶灵
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="board-legend">
        <span>
          <i style={{ background: colors.blue }} />蓝
        </span>
        <span>
          <i style={{ background: colors.green }} />绿
        </span>
        <span>
          <i style={{ background: colors.red }} />红
        </span>
        <span>
          <i style={{ background: colors.yellow }} />黄 · 单向箭头
        </span>
        <span>锯齿框：可破坏墙壁</span>
        <span>拖动 / 双指缩放</span>
      </div>
    </div>
  );
}
