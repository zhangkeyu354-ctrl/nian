import React, { useState, useRef, useEffect } from "react";
import type { GameState } from "../../../packages/shared/src/types.ts";
import { maps } from "../../../packages/game-engine/src/data.ts";
import {
  actorName,
  propNames,
  categoryNames,
  propLabel,
  boardVisuals,
} from "../../../packages/game-engine/src/index.ts";
import { Token } from "./Token.tsx";
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
  const visuals = boardVisuals(state);
  const props = visuals.props;
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
                {visuals.paths
                  .filter((v) => v.id === p.id)
                  .map((v, i) => (
                    <g
                      key={v.kind}
                      transform={`translate(${m[0] - 27 + i * 43} ${m[1] - 26})`}
                      data-testid={v.kind === "wall" ? "wall" : undefined}
                    >
                      <Token token={v} size={54} />
                    </g>
                  ))}
                {state.entity?.id === p.id && (
                  <g transform={`translate(${m[0] - 20} ${m[1] - 65})`}>
                    <Token
                      token={{
                        id: p.id,
                        kind: "entity",
                        state: "active",
                        label: "恶灵封锁",
                        asset: "entity",
                        location: "path",
                      }}
                      size={40}
                    />
                  </g>
                )}
              </g>
            );
          })}
          {map.nodes.map((n) => {
            const [x, sourceY] = layout.rooms[n.id];
            const y = sourceY * yScale;
            const occupants = visuals.actors.filter((a) => a.room === n.id);
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
                    <g
                      key={a.id}
                      transform={`translate(${-82 + i * 40} 23)`}
                      data-actor={a.id}
                      data-actor-state={a.state}
                    >
                      <g transform="translate(-18 -18)">
                        <Token token={a} size={36} />
                      </g>
                      <text
                        y="22"
                        textAnchor="middle"
                        fill="#243931"
                        fontSize="10"
                      >
                        {a.label.replace("·", "").slice(0, 3)}
                      </text>
                      <title>
                        {a.label} ·{" "}
                        {a.state === "hooked"
                          ? "挂在钩子上"
                          : a.state === "carried"
                            ? "被扛起"
                            : a.wounded
                              ? "受伤"
                              : "健康"}
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
                      data-prop-state={p.state}
                      aria-label={
                        p.location === "track"
                          ? "空槽（发电机已移到进度轨）"
                          : p.location === "removed"
                            ? "空槽（道具已移除）"
                            : p.label
                      }
                      onClick={() => click(() => onProp(p.id))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onProp(p.id);
                      }}
                      className="prop-node"
                      transform={`translate(${px} 68)`}
                    >
                      <rect
                        x="-17"
                        y="-23"
                        width="34"
                        height="44"
                        fill="transparent"
                        stroke={selected === p.id ? "#b7883b" : "none"}
                        strokeWidth="3"
                      />
                      {p.location === "removed" || p.location === "track" ? (
                        <path
                          d="M0 -18l15 9v18L0 18l-15-9V-9z"
                          fill="none"
                          stroke="#818a78"
                          strokeDasharray="3 3"
                        />
                      ) : (
                        <g transform="translate(-18 -23)" pointerEvents="none">
                          <Token token={p} size={36} />
                        </g>
                      )}
                    </g>
                  );
                })}
                {visuals.markers
                  .filter((v) => v.room === n.id && v.kind === "phantasm")
                  .map((v) => (
                    <g key={v.kind} transform="translate(77 5)">
                      <Token token={v} size={30} />
                    </g>
                  ))}
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
