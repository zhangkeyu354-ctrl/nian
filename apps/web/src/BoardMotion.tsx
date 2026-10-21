import React, { useEffect, useRef, useState } from "react";
import type { GameState } from "../../../packages/shared/src/types.ts";
import { boardVisuals } from "../../../packages/game-engine/src/index.ts";
import { publicMotion, type Motion } from "./experience-model.ts";
import layoutData from "./layout.json" with { type: "json" };
import { Token } from "./Token.tsx";
import { actorColor } from "./playerColors.ts";
import { useSettings } from "./Settings.tsx";
import { maps } from "../../../packages/game-engine/src/data.ts";
type Point = [number, number];
function actorAnchor(s: GameState, id: string): Point | null {
  const a = s.actors[id];
  const l = (layoutData as any)[s.mapId];
  const center = a?.room && l.rooms[a.room];
  if (!center) return null;
  const actors = boardVisuals(s).actors.filter((v) => v.room === a.room);
  const i = actors.findIndex((v) => v.id === id);
  if (i < 0) return null;
  const node = maps.maps
    .find((m) => m.id === s.mapId)
    ?.nodes.find((n) => n.id === a.room);
  return [
    center[0] +
      (node?.spawn_faces.length ? -62 : -92) +
      i * (actors.length > 4 ? 40 : 48),
    center[1] + 10,
  ];
}
/** Polyline geometry comes from the same actual route artwork as the board. */
export function motionPoints(mapId: string, m: Motion): Point[] {
  const l = (layoutData as any)[mapId],
    a = l.rooms[m.from] as Point,
    b = l.rooms[m.to] as Point;
  if (!a || !b) return [];
  const parts = (l.paths[m.pathId] ?? []).map((part: string) =>
    part.split(" ").map((p) => p.split(",").map(Number) as Point),
  );
  if (!parts.length) return [a, b];
  const dist = (x: Point, y: Point) => Math.hypot(x[0] - y[0], x[1] - y[1]);
  if (parts.length === 1) {
    const p = parts[0];
    return [
      a,
      ...(dist(a, p[0]) <= dist(a, p.at(-1)!) ? p : [...p].reverse()),
      b,
    ];
  }
  const branch = (r: Point) =>
    parts.reduce(
      (best: Point[], p: Point[]) =>
        Math.min(dist(r, p[0]), dist(r, p.at(-1)!)) <
        Math.min(dist(r, best[0]), dist(r, best.at(-1)!))
          ? p
          : best,
      parts[0],
    );
  const pa = branch(a),
    pb = branch(b);
  const start = dist(a, pa[0]) <= dist(a, pa.at(-1)!) ? pa : [...pa].reverse();
  const end = dist(b, pb.at(-1)!) <= dist(b, pb[0]) ? pb : [...pb].reverse();
  return [a, ...start, ...end, b];
}
function along(points: Point[], t: number): Point {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let left = lengths.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) {
      const f = lengths[i] ? left / lengths[i] : 1;
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * f,
        points[i][1] + (points[i + 1][1] - points[i][1]) * f,
      ];
    }
    left -= lengths[i];
  }
  return points.at(-1)!;
}
export function BoardMotion({ state }: { state: GameState }) {
  const { effectiveAnimations: motion } = useSettings();
  const prev = useRef(state);
  const [moves, setMoves] = useState<Motion[]>([]),
    [progress, setProgress] = useState(0),
    [targets, setTargets] = useState<string[]>([]),
    [contactStart, setContactStart] = useState<Point | null>(null);
  const anchors = useRef(new Map<number, [Point | null, Point | null]>());
  useEffect(() => {
    const old = prev.current;
    prev.current = state;
    if (old === state) return;
    if (!motion) {
      setMoves([]);
      setTargets([]);
      return;
    }
    const freshMoves = publicMotion(old, state);
    for (const m of freshMoves)
      anchors.current.set(m.seq, [
        actorAnchor(old, m.actorId),
        actorAnchor(state, m.actorId),
      ]);
    setMoves((q) => [...q, ...freshMoves].slice(-8));
    const ids = state.events
      .slice(old.events.length)
      .filter((e) =>
        [
          "PROP_PROGRESS",
          "PROP_REVEALED",
          "CROW_STARTLED",
          "GENERATOR_COMPLETED",
        ].includes(e.type),
      )
      .map((e) => String(e.data.propId));
    const interaction = state.pendingAction ?? old.pendingAction;
    setContactStart(
      actorAnchor(
        old,
        String(
          interaction?.actorId ?? old.roll?.actorId ?? old.turn?.actorId ?? "",
        ),
      ),
    );
    if (interaction) ids.push(String(interaction.targetId));
    for (const e of state.events.slice(old.events.length))
      if (e.data.propId || e.data.targetId)
        ids.push(String(e.data.propId ?? e.data.targetId));
    if (old.roll?.targetId && state.roll !== old.roll)
      ids.push(old.roll.targetId);
    setTargets([
      ...new Set(ids.filter((id) => state.props.some((p) => p.id === id))),
    ]);
  }, [state, motion]);
  useEffect(() => {
    if (!targets.length) return;
    const timer = setTimeout(() => setTargets([]), 700);
    return () => clearTimeout(timer);
  }, [targets]);
  useEffect(() => {
    if (!moves.length || !motion) return;
    let frame = 0;
    const start = performance.now();
    setProgress(0);
    const tick = (now: number) => {
      const f = Math.min(1, (now - start) / 500);
      setProgress(f);
      if (f < 1) frame = requestAnimationFrame(tick);
      else setMoves((q) => q.slice(1));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moves[0]?.seq, motion]);
  if (!motion) return null;
  const l = (layoutData as any)[state.mapId],
    m = moves[0],
    token = m && boardVisuals(state).actors.find((a) => a.id === m.actorId);
  const pts = m ? motionPoints(state.mapId, m) : [];
  const endpoints = m && anchors.current.get(m.seq);
  if (pts.length && endpoints) {
    if (endpoints[0]) pts[0] = endpoints[0];
    if (endpoints[1]) pts[pts.length - 1] = endpoints[1];
  }
  const pos = pts.length ? along(pts, progress) : null;
  const start = contactStart;
  return (
    <g pointerEvents="none" className="board-motion" aria-hidden="true">
      {!!targets.length && (
        <style>
          {targets
            .map(
              (id) =>
                `[data-prop=${JSON.stringify(id)}] .visual-token{animation:prop-contact .7s ease-out} [data-prop=${JSON.stringify(id)}] .progress-filled{animation:progress-fill .42s ease-out;transform-box:fill-box;transform-origin:left}`,
            )
            .join("\n")}
        </style>
      )}
      {targets.map((id) => {
        const p = state.props.find((p) => p.id === id)!;
        const room = l.rooms[p.room];
        if (!room) return null;
        const slots = boardVisuals(state).props.filter(
          (v) => v.room === p.room,
        );
        const i = slots.findIndex((v) => v.id === id);
        const x =
          room[0] +
          (i < 0
            ? 0
            : (i - (slots.length - 1) / 2) *
              Math.min(51, 250 / Math.max(1, slots.length)));
        return (
          <g key={id} data-contact={id}>
            {start && (
              <path
                className="interaction-link"
                d={`M${start[0]} ${start[1]}L${x} ${room[1] + 82}`}
              />
            )}
            <circle
              cx={x}
              cy={room[1] + 82}
              r="48"
              className="interaction-ring"
            />
          </g>
        );
      })}
      {m && pos && token && (
        <g data-moving-actor={m.actorId} data-motion-path={m.pathId}>
          <style>{`[data-actor=${JSON.stringify(m.actorId)}]{opacity:0}`}</style>
          <polyline
            points={pts.map((p) => p.join(",")).join(" ")}
            className="travel-trace"
            stroke={actorColor(state, m.actorId)}
          />
          <g transform={`translate(${pos[0] - 27} ${pos[1] - 27})`}>
            <Token token={token} size={54} />
          </g>
        </g>
      )}
    </g>
  );
}
