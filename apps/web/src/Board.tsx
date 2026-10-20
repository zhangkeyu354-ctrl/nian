import React, { useState, useRef, useEffect } from "react";
import type { GameState } from "../../../packages/shared/src/types.ts";
import { maps } from "../../../packages/game-engine/src/data.ts";
import {
  actorName,
  cardNames,
  propNames,
  categoryNames,
  propLabel,
  boardVisuals,
} from "../../../packages/game-engine/src/index.ts";
import { MotionIcon } from "./MotionIcon.tsx";
import { useSettings } from "./Settings.tsx";
import { Token } from "./Token.tsx";
import { TapButton, suppressCompatibilityClick } from "./TapButton.tsx";
import layoutData from "./layout.json" with { type: "json" };
const colors: Record<string, string> = {
  blue: "#62b5de",
  green: "#83bc8e",
  red: "#d98176",
  yellow: "#f1ca62",
};
export function Board({
  state,
  highlight,
  onRoom,
  onProp,
  onActor,
  selected,
  focusRoom,
  actionable = [],
  phone = false,
}: {
  state: GameState;
  highlight: Array<{ pathId: string; to: string }>;
  onRoom: (id: string) => void;
  onProp: (id: string) => void;
  onActor?: (id: string) => void;
  selected: string | null;
  focusRoom?: string | null;
  actionable?: string[];
  phone?: boolean;
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
  const height = map.id === "macmillan_estate" ? 1520 : 1320;
  const settings = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [overview, setOverview] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [size, setSize] = useState({ width: 1540, height });
  const yScale = 1;
  const [view, setView] = useState({ x: 0, y: 0, w: 1540, h: height });
  const viewRef = useRef(view);
  const touchHandled = useRef(0);
  viewRef.current = view;
  const el = useRef<HTMLDivElement>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    last = useRef<{ x: number; y: number; distance: number } | null>(null),
    drag = useRef(false);
  useEffect(() => {
    if (!expanded && !overview) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [expanded, overview]);
  const reset = () => setView({ x: 0, y: 0, w: 1540, h: height });
  // 定位：让当前房间及其全部相邻房间同时可见（保留四周安全边距）
  function focus(id = focusRoom) {
    if (size.width <= 0 || size.height <= 0) return;
    const roomId = id && layout.rooms[id] ? id : Object.keys(layout.rooms)[0];
    const ids = new Set([roomId]);
    for (const e of map.edges as Array<{
      from?: string | null;
      to?: string | null;
      rooms?: string[];
    }>) {
      const rs = e.rooms ?? [e.from, e.to];
      if (rs.includes(roomId)) rs.forEach((r) => r && ids.add(r));
    }
    const pts = [...ids].map((r) => layout.rooms[r]).filter(Boolean);
    const pad = 40;
    const x0 = Math.min(...pts.map((p) => p[0])) - 130 - pad,
      x1 = Math.max(...pts.map((p) => p[0])) + 130 + pad,
      y0 = Math.min(...pts.map((p) => p[1])) - 82 - pad,
      y1 = Math.max(...pts.map((p) => p[1])) + 118 + pad;
    const aspect = size.width / Math.max(1, size.height);
    let w = Math.max(x1 - x0, (y1 - y0) * aspect, 420);
    let h = w / aspect;
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    const clamp = (v: number, lo: number, hi: number) =>
      hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
    setView({
      x: clamp(cx - w / 2, -pad, 1540 + pad - w),
      y: clamp(cy - h / 2, -pad, height + pad - h),
      w,
      h,
    });
  }
  useEffect(() => {
    const node = el.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height: h } = entry.contentRect;
      if (width <= 0 || h <= 0) return;
      setSize({ width, height: h });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (overview || (phone && !focusRoom)) reset();
    else if (size.width < 950 || phone) focus();
    else reset();
  }, [map.id, focusRoom, size.width, size.height, phone, overview]);
  // 手机上地图缩得很小时，第一次点击只放大到该房间（防误触），放大后再点才执行操作
  const tiny = size.width < 950 && view.w / Math.max(1, size.width) > 1.4;
  function zoomRoom(id: string) {
    const r = layout.rooms[id];
    if (!r) return;
    const w = size.width < 600 ? 360 : 1000;
    const h = (w * size.height) / Math.max(1, size.width);
    setView({ x: r[0] - w / 2, y: r[1] + 18 - h / 2, w, h });
  }
  const zoom = (factor: number) =>
    setView((v) => {
      const w = Math.min(2000, Math.max(380, v.w * factor));
      const h = (w * size.height) / size.width;
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
  }, [height, size]);
  function pointer(e: React.PointerEvent, kind: string) {
    const rotated = expanded && window.innerHeight > window.innerWidth;
    const point = rotated
      ? { x: e.clientY, y: -e.clientX }
      : { x: e.clientX, y: e.clientY };
    if (kind === "down") {
      pointers.current.set(e.pointerId, point);
      drag.current = false;
    }
    if (kind === "up") {
      pointers.current.delete(e.pointerId);
      last.current = null;
      return;
    }
    if (kind === "move") {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, point);
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
          h = (w * size.height) / size.width;
        return {
          x: v.x - (dx * v.w) / size.width + (v.w - w) / 2,
          y: v.y - (dy * v.h) / size.height + (v.h - h) / 2,
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
    <div
      className={
        "board-shell" +
        (overview ? " board-overview" : "") +
        (expanded ? " board-expanded" : "") +
        (toolsOpen ? " tools-open" : " tools-collapsed")
      }
    >
      <div className="board-top">
        <span>{map.name_zh}</span>
        <div className="zoom-controls">
          <TapButton onClick={() => focus()} aria-label="定位当前角色">
            定位
          </TapButton>
          {overview && (
            <TapButton onClick={() => setOverview(false)} aria-label="返回行动">
              返回
            </TapButton>
          )}
          <TapButton
            onClick={() => setExpanded((v) => !v)}
            aria-label="横屏查看棋盘"
          >
            {expanded ? "退出横屏" : "横屏"}
          </TapButton>
          <TapButton
            className="tools-toggle"
            aria-label="显示图例与房间列表"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((v) => !v)}
          >
            {toolsOpen ? "收起" : "图例"}
          </TapButton>
          <TapButton aria-label="缩小地图" onClick={() => zoom(1.25)}>
            −
          </TapButton>
          <TapButton
            onClick={() => {
              if (phone) setOverview(true);
              reset();
            }}
            aria-label="复位地图"
          >
            全图
          </TapButton>
          <TapButton aria-label="放大地图" onClick={() => zoom(0.8)}>
            ＋
          </TapButton>
        </div>
      </div>
      <div
        className="map-viewport"
        style={
          {
            "--board-ratio": `1540/${height}`,
            "--board-height": height,
          } as React.CSSProperties
        }
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
          onPointerUp={(e) => {
            if (!phone || e.pointerType !== "touch") return;
            touchHandled.current = Date.now();
            if (drag.current) return;
            const target = (e.target as Element).closest(
              "[data-actor],[data-prop],[data-room]",
            );
            if (target) {
              suppressCompatibilityClick();
              e.preventDefault();
              target.dispatchEvent(
                new MouseEvent("click", { bubbles: true, cancelable: true }),
              );
            }
          }}
          onClickCapture={(e) => {
            if (
              phone &&
              e.nativeEvent.isTrusted &&
              (e.nativeEvent as PointerEvent).pointerType === "touch" &&
              Date.now() - touchHandled.current < 800
            ) {
              suppressCompatibilityClick();
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <defs>
            <pattern
              id="weather"
              width="90"
              height="90"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 13l90 17M-20 60L80 20M8 85l70-15"
                stroke="#566260"
                strokeWidth=".8"
                opacity=".25"
              />
              <path
                d="M5 5h1m44 42h2m20-30h1m-48 59h2"
                stroke="#a4936b"
                strokeWidth="2"
                opacity=".22"
              />
            </pattern>
            <linearGradient id="room-shade" x2="0" y2="1">
              <stop offset="0" stopColor="#111a1c" stopOpacity="0" />
              <stop offset="1" stopColor="#0e1518" stopOpacity=".96" />
            </linearGradient>
            {map.nodes.map((n) => (
              <clipPath key={n.id} id={"clip-" + n.id}>
                <rect x="-127" y="-46" width="254" height="156" rx="2" />
              </clipPath>
            ))}
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
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill="#151d20"
          />
          <rect
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill="url(#weather)"
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
            const candidate = marker
              ? [marker[0], marker[1] * yScale]
              : (pts[1] ?? [0, 0]);
            let m = candidate,
              best = Infinity;
            const safe = (q: number[]) =>
              map.nodes.every((n) => {
                const [x, y] = layout.rooms[n.id];
                return (
                  Math.abs(q[0] - x) > 157 ||
                  q[1] < y * yScale - 109 ||
                  q[1] > y * yScale + 145
                );
              });
            for (const seg of segments) {
              const ps = seg.split(" ").map((v) => v.split(",").map(Number));
              for (let j = 1; j < ps.length; j++) {
                const a = ps[j - 1],
                  b = ps[j],
                  length = Math.hypot(b[0] - a[0], b[1] - a[1]);
                for (let k = 0; k <= Math.ceil(length / 4); k++) {
                  const f = k / Math.ceil(length / 4),
                    q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
                  const d = Math.hypot(
                    q[0] - candidate[0],
                    q[1] - candidate[1],
                  );
                  if (safe(q) && d < best) {
                    m = q;
                    best = d;
                  }
                }
              }
            }
            if (segments.length === 3) {
              const p = segments[0].split(" ").at(-1)!;
              m = p.split(",").map(Number);
            }
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
                <g
                  transform={`translate(${m[0]} ${m[1]})`}
                  className={"route-badge" + (lit ? " is-lit" : "")}
                  data-route-icon={p.id}
                  aria-label={cardNames[p.color] + "路线"}
                >
                  <rect
                    x="-27"
                    y="-27"
                    width="54"
                    height="54"
                    rx="2"
                    fill="#182020"
                    stroke={colors[p.color]}
                    strokeWidth="4"
                  />
                  {map.edges.find((e) => e.id === p.id)?.jagged && (
                    <path
                      d="M-30-30l8-5 8 5 8-5 8 5 8-5 8 5 8-5 8 5v60l-8 5-8-5-8 5-8-5-8 5-8-5-8 5-8-5z"
                      fill="none"
                      stroke={colors[p.color]}
                      strokeWidth="3"
                    />
                  )}
                  <g transform="translate(-22 -22)" color="#f4efdb">
                    <MotionIcon card={p.color} size={44} />
                  </g>
                </g>
                {visuals.paths
                  .filter((v) => v.id === p.id)
                  .map((v, i) => (
                    <g
                      key={v.kind}
                      transform={`translate(${m[0] + 28 + i * 38} ${m[1] - 23})`}
                      data-testid={v.kind === "wall" ? "wall" : undefined}
                    >
                      <Token token={v} size={44} />
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
            // 棋子行：避开左上角出生标记；人多时缩小，避免与道具行或彼此重叠
            const crowded = occupants.length > 4;
            const tokenSize = crowded ? 44 : 54;
            const tokenGap = crowded ? 40 : 48;
            const tokenStart = n.spawn_faces.length ? -62 : -92;
            const slotGap = Math.min(51, 250 / Math.max(1, slots.length));
            const slotHit = Math.min(62, slotGap);
            const slotIcon = Math.min(50, slotGap - 6);
            const reachable = highlight.some((r) => r.to === n.id);
            const screenScale = Math.max(
              0.001,
              Math.min(
                size.width / Math.max(1, view.w),
                size.height / Math.max(1, view.h),
              ),
            );
            const roomHitW = phone ? Math.max(260, 48 / screenScale) : 260;
            const roomHitH = phone ? Math.max(200, 48 / screenScale) : 200;
            const actorInteractive = !phone || 62 * screenScale >= 48;
            const propInteractive =
              !phone || Math.min(slotHit, 62) * screenScale >= 48;
            return (
              <g
                key={n.id}
                data-room-container={n.id}
                transform={`translate(${x} ${y})`}
              >
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={"房间：" + n.name_zh}
                  data-room={n.id}
                  onClick={() =>
                    click(() =>
                      tiny &&
                      !reachable &&
                      (!phone ||
                        (state.phase !== "SETUP" &&
                          state.choice?.kind !== "MAP_REVEAL"))
                        ? zoomRoom(n.id)
                        : onRoom(n.id),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onRoom(n.id);
                  }}
                  className="room-node"
                >
                  {phone && (
                    <path
                      d={`M${-roomHitW / 2} ${18 - roomHitH / 2}h${roomHitW}v${roomHitH}h${-roomHitW}z`}
                      fill="transparent"
                    />
                  )}
                  <rect
                    x="-130"
                    y="-82"
                    width="260"
                    height="200"
                    rx="4"
                    fill="#1c2729"
                    stroke={
                      reachable
                        ? "#f1d47c"
                        : selected === n.id
                          ? "#d6bb78"
                          : "#736e59"
                    }
                    strokeWidth={reachable ? 6 : 3}
                  />
                  <g pointerEvents="none">
                    <g clipPath={`url(#clip-${n.id})`}>
                      <rect
                        x="-127"
                        y="-46"
                        width="254"
                        height="156"
                        fill="#283b3d"
                      />
                      <path
                        d="M-127 103l70-45 50 23 61-64 73 79v20h-254z"
                        fill="#18272b"
                      />
                      <path
                        d="M-99 68V-10l34-22 32 22v68m-40-56v64M40-32v88m22-61v92m33-105v98"
                        fill="none"
                        stroke="#76817b"
                        strokeWidth="4"
                        opacity=".4"
                      />
                      {settings.art && (
                        <image
                          data-room-art={n.id}
                          href={`/assets/${phone ? "mobile" : "desktop"}/rooms/${n.id}.webp`}
                          x="-127"
                          y="-46"
                          width="254"
                          height="156"
                          preserveAspectRatio="xMidYMid slice"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      <rect
                        x="-127"
                        y="-46"
                        width="254"
                        height="156"
                        fill="url(#room-shade)"
                      />
                    </g>
                    <text
                      x="0"
                      y="-56"
                      textAnchor="middle"
                      className="room-label"
                    >
                      {n.name_zh}
                    </text>
                    {!!n.spawn_faces.length && (
                      <g
                        transform="translate(-117 -38)"
                        data-spawn={n.spawn_faces.join(",")}
                      >
                        <rect
                          width="40"
                          height="35"
                          rx="3"
                          fill="#11191b"
                          stroke="#a89b77"
                        />
                        {n.spawn_faces.some((f) => f === 0) ? (
                          <g transform="translate(2 0)">
                            <Token
                              token={{
                                id: "spawn",
                                kind: "actor",
                                state: "healthy",
                                asset: "portrait_anonymous",
                                label: "杀手出生点",
                                location: "room",
                              }}
                              size={35}
                            />
                          </g>
                        ) : (
                          <g
                            stroke="#ece2be"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            {Array.from(
                              { length: n.spawn_faces[0] },
                              (_, i) => (
                                <path key={i} d={`M${8 + i * 6} 9l-2 19`} />
                              ),
                            )}
                          </g>
                        )}
                      </g>
                    )}
                  </g>
                  {occupants.map((a, i) => (
                    <g
                      key={a.id}
                      transform={`translate(${tokenStart + i * tokenGap} 10)`}
                      data-actor={a.id}
                      data-actor-state={a.state}
                      role={actorInteractive ? "button" : "img"}
                      tabIndex={actorInteractive ? 0 : undefined}
                      pointerEvents={actorInteractive ? undefined : "none"}
                      aria-label={"棋子：" + a.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        click(() =>
                          phone && reachable
                            ? onRoom(n.id)
                            : tiny
                              ? zoomRoom(n.id)
                              : onActor?.(a.id),
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          onActor?.(a.id);
                        }
                      }}
                    >
                      <rect
                        x="-31"
                        y="-31"
                        width="62"
                        height="76"
                        rx="8"
                        fill="transparent"
                        stroke={actionable.includes(a.id) ? "#e6d294" : "none"}
                        strokeWidth="2"
                      />
                      <g
                        transform={`translate(${-tokenSize / 2} ${-tokenSize / 2})`}
                      >
                        <Token token={a} size={tokenSize} />
                      </g>
                      <text
                        y="35"
                        textAnchor="middle"
                        fill="#f2e9cb"
                        fontSize="12"
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
                  const px = (i - (slots.length - 1) / 2) * slotGap;
                  const available = actionable.includes(p.id);
                  return (
                    <g
                      key={p.id}
                      role={propInteractive ? "button" : "img"}
                      tabIndex={propInteractive ? 0 : undefined}
                      pointerEvents={propInteractive ? undefined : "none"}
                      data-prop={p.id}
                      data-prop-state={p.state}
                      aria-label={
                        p.location === "track"
                          ? "空槽（发电机已移到进度轨）"
                          : p.location === "removed"
                            ? "空槽（道具已移除）"
                            : p.label
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        click(() =>
                          phone && reachable
                            ? onRoom(n.id)
                            : tiny && !available
                              ? zoomRoom(n.id)
                              : onProp(p.id),
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onProp(p.id);
                      }}
                      className={
                        "prop-node" + (available ? " actionable-prop" : "")
                      }
                      transform={`translate(${px} 82)`}
                    >
                      <rect
                        x={-slotHit / 2}
                        y="-31"
                        width={slotHit}
                        height="62"
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
                        <g
                          transform={`translate(${-slotIcon / 2} ${-slotIcon / 2})`}
                          pointerEvents="none"
                        >
                          <Token token={p} size={slotIcon} />
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
      <div className="board-navigation">
        <label>
          查看房间
          <select
            aria-label="查看房间"
            value=""
            onChange={(e) =>
              size.width < 950
                ? zoomRoom(e.target.value)
                : focus(e.target.value)
            }
          >
            <option value="">选择房间并定位</option>
            {map.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name_zh}
              </option>
            ))}
          </select>
        </label>
        <span>点击亮框道具执行操作 · 拖动与双指缩放</span>
      </div>
      <div className="board-legend">
        <span>
          <MotionIcon card="blue" size={24} />
          潜行（蓝）
        </span>
        <span>
          <MotionIcon card="green" size={24} />
          冲刺（绿）
        </span>
        <span>
          <MotionIcon card="red" size={24} />
          蹲伏（红）
        </span>
        <span>
          <MotionIcon card="yellow" size={24} />
          翻越（黄）· 单向箭头
        </span>
        <span>锯齿框：可破坏墙壁</span>
        <span>拖动 / 双指缩放</span>
      </div>
    </div>
  );
}
