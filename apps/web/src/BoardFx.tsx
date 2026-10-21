import React, { useEffect, useRef, useState } from "react";
import type { GameState, Event } from "../../../packages/shared/src/types.ts";
import { boardVisuals, actorName, roomName } from "../../../packages/game-engine/src/index.ts";
import layoutData from "./layout.json" with { type: "json" };
import { useSettings } from "./Settings.tsx";
import { actorColor } from "./playerColors.ts";
import "./board-fx.css";

/**
 * 动作特效（2026-10-22 第二版）：每个行动都有棋盘特效 + 顶部动作播报。
 * 只读公开事件 / 公开状态（与所有人看到的一样），不改变规则；关闭动画时不显示。
 */
type Kind =
  | "slash" | "lift" | "hook" | "sacrifice" | "rescue" | "pallet" | "break" | "chest"
  | "repair" | "sparks" | "complete" | "heal" | "healed" | "cleanse" | "totem"
  | "hide" | "search" | "exit" | "sabotage" | "reveal" | "trap" | "escape"
  | "power" | "teleport" | "item" | "crow";
interface Fx { id: string; kind: Kind; x: number; y: number; color?: string }
export interface Callout { id: string; icon: string; text: string; color: string; tone: string }
const LIFE: Partial<Record<Kind, number>> = { hook: 1700, sacrifice: 1700, complete: 1900, escape: 1900, repair: 1500, cleanse: 1500, heal: 1500 };

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
const targetRoom = (s: GameState, id: unknown) => propRoom(s, id) ?? s.actors[String(id)]?.room;
const short = (id: string) => actorName(id).split("·")[0];
const ROLL_FX: Record<string, [Kind, string, string]> = {
  generator: ["repair", "🔧", "修理发电机"],
  exit: ["exit", "🚪", "开启出口大门"],
  heal: ["heal", "✚", "治疗"],
  self_heal: ["heal", "✚", "自我治疗"],
  totem: ["cleanse", "🕯", "净化厄咒图腾"],
  locker: ["search", "🔦", "搜查储物柜"],
  carry: ["lift", "💪", "挣扎脱身"],
  beartrap: ["trap", "⚠", "被捕兽夹夹住"],
};

export function fxFrom(before: GameState, after: GameState, events: Event[]) {
  const fx: Fx[] = [];
  const calls: Callout[] = [];
  const add = (kind: Kind, at: [number, number] | null, key: string | number, color?: string) => {
    if (at) fx.push({ id: `${kind}-${key}`, kind, x: at[0], y: at[1], color });
  };
  const say = (key: string | number, who: string, icon: string, text: string, tone = "info") =>
    calls.push({ id: `c-${key}`, icon, text: `${who ? short(who) + " " : ""}${text}`, color: who ? actorColor(after, who) : "#ffe08a", tone });
  // 检定开始（出现新的掷骰）：在目标处放出"正在做什么"的特效
  if (after.roll && after.roll !== before.roll && (!before.roll || before.roll.targetId !== after.roll.targetId || before.roll.kind !== after.roll.kind)) {
    const r = after.roll;
    const m = ROLL_FX[r.kind];
    if (m) {
      add(m[0], roomPoint(after, targetRoom(after, r.targetId) ?? after.actors[r.actorId]?.room), `roll-${after.events.length}`, actorColor(after, r.actorId));
      say(`roll-${after.events.length}`, r.kind === "locker" ? "" : r.actorId, m[1], r.kind === "locker" ? "杀手搜查储物柜" : m[2], "act");
    }
  }
  for (const e of events) {
    const d = e.data as Record<string, unknown>;
    const who = String(d.actorId ?? "");
    const k = e.seq;
    switch (e.type) {
      case "WOUNDED":
        if (!after.actors[who]?.lockerId) {
          add("slash", roomPoint(after, after.actors[who]?.room), k);
          say(k, who, "🩸", "受伤了！", "danger");
        }
        break;
      case "HOOKED":
        add("hook", roomPoint(after, propRoom(after, d.hookId) ?? after.actors[who]?.room), k);
        say(k, who, "🪝", "被挂上钩子！", "danger");
        break;
      case "SACRIFICE_PROGRESS":
        for (const a of Object.values(after.actors))
          if (a.hookId) add("sacrifice", roomPoint(after, propRoom(after, a.hookId)), `${k}-${a.id}`);
        say(k, "", "☠", `献祭进度 ${after.sacrifice}/8`, "danger");
        break;
      case "AFTER_SACRIFICE":
        add("sacrifice", roomPoint(before, before.actors[who]?.room ?? propRoom(before, before.actors[who]?.hookId)), k);
        say(k, who, "☠", "被献祭了", "danger");
        break;
      case "PALLET_PLACED":
        add("pallet", pathPoint(after, String(d.pathId)), k);
        say(k, who, "🪵", "放下木板！", "act");
        break;
      case "PALLET_DESTROYED":
        add("break", pathPoint(after, String(d.pathId)), k);
        say(k, who, "💥", "踢碎了木板", "danger");
        break;
      case "WALL_DESTROYED":
      case "WALL_REMOVED":
        add("break", pathPoint(after, String(d.pathId)), k);
        say(k, who, "💥", "破坏了墙壁", "act");
        break;
      case "AFTER_CHEST":
        add("chest", roomPoint(after, propRoom(before, d.propId) ?? after.actors[who]?.room), k);
        say(k, who, "📦", "打开了箱子", "act");
        break;
      case "ITEM_DRAWN":
        if (!calls.some((c) => c.icon === "📦")) say(k, who, "🎁", "获得一件物品", "act");
        break;
      case "PROP_PROGRESS":
        add("sparks", roomPoint(after, propRoom(after, d.propId)), k);
        break;
      case "GENERATOR_COMPLETED":
        add("complete", roomPoint(after, propRoom(after, d.propId)), k);
        say(k, "", "⚡", `发电机修好了！${after.completedGenerators}/4`, "good");
        break;
      case "GENERATOR_DAMAGED":
        add("sabotage", roomPoint(after, propRoom(after, d.propId)), k);
        say(k, who, "🔨", "破坏了发电机", "danger");
        break;
      case "HIDDEN_IN_LOCKER":
        add("hide", roomPoint(after, propRoom(after, d.propId)), k);
        say(k, "", "🚪", "有人躲进了储物柜", "act");
        break;
      case "PROP_REVEALED":
        add("reveal", roomPoint(after, propRoom(after, d.propId)), k);
        break;
      case "SURVIVOR_BECOMES_HEALTHY":
        add("healed", roomPoint(after, after.actors[who]?.room), k);
        say(k, who, "💚", "恢复健康", "good");
        break;
      case "BEAR_TRAP_PLACED":
        add("trap", pathPoint(after, String(d.pathId)), k);
        say(k, after.killerId, "⚙", "放置了捕兽夹", "danger");
        break;
      case "ESCAPED":
        add("escape", roomPoint(before, before.actors[who]?.room), k);
        say(k, who, "🏃", "逃脱了！", "good");
        break;
      case "CHECK_RESOLVED":
        if (d.kind === "totem" && d.result !== "failure" && before.roll?.targetId)
          add("totem", roomPoint(before, propRoom(before, before.roll.targetId)), k);
        break;
      case "POWER_USED":
        add("power", roomPoint(after, after.actors[who]?.room), k);
        say(k, who, "🩸", "发动杀手力量", "danger");
        break;
      case "TELEPORTED":
        add("teleport", roomPoint(after, String(d.from)), `${k}-from`);
        add("teleport", roomPoint(after, String(d.to)), `${k}-to`);
        say(k, who, "🌀", `瞬移到「${roomName(after, String(d.to))}」`, "danger");
        break;
      case "ITEM_USED":
        add("item", roomPoint(after, after.actors[who]?.room), k);
        say(k, who, "✨", "使用了物品", "act");
        break;
      case "MOVED":
        say(k, who, "👣", `进入「${roomName(after, String(d.to))}」`, who === after.killerId ? "danger" : "info");
        break;
    }
  }
  // 状态变化推出来的：扛起、被救下、乌鸦被惊动
  const was = new Set(boardVisuals(before).actors.filter((a) => a.state === "carried").map((a) => a.id));
  for (const a of boardVisuals(after).actors)
    if (a.state === "carried" && !was.has(a.id)) {
      add("lift", roomPoint(after, a.room), `${a.id}-${after.events.length}`);
      say(`lift-${after.events.length}`, after.killerId, "💀", `扛起了${short(a.id)}`, "danger");
    }
  for (const id of after.survivors)
    if (before.actors[id]?.hookId && !after.actors[id]?.hookId && after.actors[id]?.room && !after.winner) {
      add("rescue", roomPoint(after, after.actors[id].room), `${id}-${after.events.length}`);
      say(`rescue-${id}-${after.events.length}`, id, "🙌", "被救下钩子！", "good");
    }
  for (const p of after.props)
    if (p.kind === "crow" && p.removed && !before.props.find((q) => q.id === p.id)?.removed) {
      add("crow", roomPoint(after, p.room), `${p.id}`);
      say(`crow-${p.id}`, "", "🐦", "乌鸦被惊飞了", "act");
    }
  return { fx, calls };
}

const SLASH = "M-70 -46 Q 0 0 70 46";
export function BoardFx({ state }: { state: GameState }) {
  const { effectiveAnimations } = useSettings();
  const prev = useRef(state);
  const [fx, setFx] = useState<Fx[]>([]);
  useEffect(() => {
    const old = prev.current;
    prev.current = state;
    if (old === state || !effectiveAnimations) return;
    const fresh = fxFrom(old, state, state.events.slice(old.events.length)).fx;
    if (!fresh.length) return;
    setFx((q) => [...q, ...fresh].slice(-12));
    for (const f of fresh) setTimeout(() => setFx((q) => q.filter((x) => x.id !== f.id)), LIFE[f.kind] ?? 1300);
  }, [state, effectiveAnimations]);
  if (!fx.length) return null;
  return (
    <g className="board-fx" pointerEvents="none" aria-hidden="true">
      {fx.map((f) => (
        <g key={f.id} transform={`translate(${f.x} ${f.y}) scale(1.35)`} className={"fx fx-" + f.kind} data-fx={f.kind} style={{ ["--fx" as string]: f.color ?? "#ffd23a" }}>
          <circle className="fx-flash" r="120" />
          {f.kind === "slash" && (
            <>
              <circle className="fx-burst" r="100" />
              {[-28, 0, 28].map((o) => <path key={o} className="fx-claw" d={SLASH} transform={`translate(${o} ${-o / 2})`} />)}
            </>
          )}
          {f.kind === "lift" && (
            <>
              <circle className="fx-ring red" r="78" />
              <path className="fx-arrow" d="M0 30 V-64 M-24 -40 L0 -64 L24 -40" />
            </>
          )}
          {f.kind === "hook" && (
            <>
              <line className="fx-chain" x1="0" y1="-190" x2="0" y2="-36" />
              <path className="fx-hook" d="M0 -44 V-6 Q0 20 -20 20 Q-38 20 -38 0" />
              <circle className="fx-ring red" r="88" />
              <circle className="fx-ring red late" r="60" />
            </>
          )}
          {(f.kind === "sacrifice") && (
            <>
              {[-66, -33, 0, 33, 66].map((x, i) => (
                <path key={i} className="fx-spike" d={`M${x - 13} 66 L${x} ${-46 - (i % 2) * 34} L${x + 13} 66 Z`} style={{ animationDelay: i * 60 + "ms" }} />
              ))}
              <circle className="fx-ring dark" r="96" />
            </>
          )}
          {f.kind === "rescue" && (
            <>
              <circle className="fx-ring green" r="84" />
              <path className="fx-arrow green" d="M0 40 V-56 M-24 -32 L0 -56 L24 -32" />
            </>
          )}
          {f.kind === "pallet" && (
            <>
              <rect className="fx-plank" x="-52" y="-10" width="104" height="20" rx="3" />
              {[-44, -16, 16, 44].map((x, i) => <circle key={i} className="fx-dust" cx={x} cy="18" r="12" style={{ animationDelay: 350 + i * 30 + "ms" }} />)}
            </>
          )}
          {(f.kind === "break" || f.kind === "sabotage") &&
            [0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
              <rect key={r} className={"fx-splinter" + (f.kind === "sabotage" ? " metal" : "")} x="-5" y="-26" width="10" height="26" style={{ transform: `rotate(${r}deg)` }} />
            ))}
          {f.kind === "chest" && (
            <>
              <circle className="fx-glow gold" r="80" />
              {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} className="fx-coin" cx={(i - 2.5) * 16} cy="0" r="7" style={{ animationDelay: i * 50 + "ms" }} />)}
              <rect className="fx-card" x="-18" y="-26" width="36" height="50" rx="4" />
            </>
          )}
          {f.kind === "repair" && (
            <>
              <g className="fx-gear"><circle r="34" /><path d="M0 -52 V-34 M0 34 V52 M-52 0 H-34 M34 0 H52 M-37 -37 L-24 -24 M24 24 L37 37 M37 -37 L24 -24 M-24 24 L-37 37" /></g>
              {[0, 60, 120, 180, 240, 300].map((r) => <line key={r} className="fx-spark slow" x1="0" y1="-40" x2="0" y2="-70" style={{ transform: `rotate(${r}deg)` }} />)}
            </>
          )}
          {f.kind === "sparks" &&
            [0, 45, 90, 135, 180, 225, 270, 315].map((r) => <line key={r} className="fx-spark" x1="0" y1="0" x2="0" y2="-44" style={{ transform: `rotate(${r}deg)` }} />)}
          {f.kind === "complete" && (
            <>
              <circle className="fx-glow gold" r="140" />
              <circle className="fx-ring gold" r="100" />
              <circle className="fx-ring gold late" r="70" />
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((r) => <line key={r} className="fx-ray" x1="0" y1="-60" x2="0" y2="-150" style={{ transform: `rotate(${r}deg)` }} />)}
            </>
          )}
          {(f.kind === "heal" || f.kind === "healed") && (
            <>
              <circle className="fx-glow green" r="90" />
              <path className="fx-cross" d="M-14 -44 H14 V-14 H44 V14 H14 V44 H-14 V14 H-44 V-14 H-14 Z" />
            </>
          )}
          {(f.kind === "cleanse" || f.kind === "totem") && (
            <>
              <circle className="fx-rune" r="70" />
              {[0, 1, 2, 3, 4].map((i) => <circle key={i} className="fx-smoke" cx={(i - 2) * 22} cy="0" r="24" style={{ animationDelay: i * 70 + "ms" }} />)}
            </>
          )}
          {f.kind === "hide" && <rect className="fx-door" x="-34" y="-56" width="68" height="112" rx="4" />}
          {f.kind === "search" && <path className="fx-beam-sweep" d="M0 0 L-90 -160 L90 -160 Z" />}
          {f.kind === "exit" && [-40, -20, 0, 20, 40].map((x, i) => <rect key={i} className="fx-bar" x={x - 5} y="-90" width="10" height="120" style={{ animationDelay: i * 60 + "ms" }} />)}
          {f.kind === "reveal" && <rect className="fx-flip" x="-30" y="-30" width="60" height="60" rx="6" />}
          {f.kind === "trap" && (
            <>
              <path className="fx-jaw" d="M-40 0 L-27 -18 L-13 0 L0 -18 L13 0 L27 -18 L40 0" />
              <path className="fx-jaw low" d="M-40 0 L-27 18 L-13 0 L0 18 L13 0 L27 18 L40 0" />
            </>
          )}
          {f.kind === "escape" && <rect className="fx-beam" x="-46" y="-300" width="92" height="340" />}
          {f.kind === "power" && (
            <>
              <circle className="fx-ring red" r="100" />
              <circle className="fx-ring red late" r="70" />
              <circle className="fx-burst" r="90" />
            </>
          )}
          {f.kind === "teleport" && (
            <>
              <circle className="fx-vortex" r="70" />
              <circle className="fx-ring dark" r="90" />
            </>
          )}
          {f.kind === "item" && (
            <>
              <circle className="fx-glow gold" r="70" />
              {[0, 72, 144, 216, 288].map((r) => <path key={r} className="fx-star" d="M0 -60 l5 12 13 1 -10 8 4 13 -12 -7 -12 7 4 -13 -10 -8 13 -1z" style={{ transform: `rotate(${r}deg)` }} />)}
            </>
          )}
          {f.kind === "crow" && [0, 1, 2].map((i) => <path key={i} className="fx-crow" d="M-18 0 Q-9 -10 0 0 Q9 -10 18 0" style={{ animationDelay: i * 90 + "ms" }} />)}
        </g>
      ))}
    </g>
  );
}

/** 顶部动作播报：每个行动一句话 + 图标，所有人同时看到（2026-10-22） */
export function ActionCallouts({ state }: { state: GameState }) {
  const { effectiveAnimations } = useSettings();
  const prev = useRef(state);
  const [list, setList] = useState<Callout[]>([]);
  useEffect(() => {
    const old = prev.current;
    prev.current = state;
    if (old === state || state.events.length < old.events.length) return;
    const { calls } = fxFrom(old, state, state.events.slice(old.events.length));
    if (!calls.length) return;
    // 同一批里重要的放前面，最多显示 3 条
    const order = { danger: 0, good: 1, act: 2, info: 3 } as Record<string, number>;
    const fresh = calls.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 3);
    setList((q) => [...fresh, ...q].slice(0, 3));
    for (const c of fresh) setTimeout(() => setList((q) => q.filter((x) => x.id !== c.id)), effectiveAnimations ? 2400 : 1800);
  }, [state]);
  if (!list.length) return null;
  return (
    <div className="action-callouts" aria-live="polite" data-testid="action-callouts">
      {list.map((c) => (
        <div key={c.id} className={"action-callout tone-" + c.tone} style={{ ["--c" as string]: c.color }}>
          <span className="ac-icon">{c.icon}</span>
          <span className="ac-text">{c.text}</span>
        </div>
      ))}
    </div>
  );
}
