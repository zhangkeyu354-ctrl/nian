import type { GameState } from "../../shared/src/types.ts";
import { maps } from "./data.ts";
import { actorName, propNames } from "./controls.ts";
export const backCategories: Record<string, { label: string; color: string }> =
  {
    objective: { label: "目标", color: "#d8b95c" },
    boldness: { label: "无惧", color: "#bb6458" },
    survival: { label: "逃生", color: "#609cb7" },
    altruism: { label: "援助", color: "#7da579" },
  };
export interface VisualToken {
  id: string;
  kind: string;
  state: string;
  label: string;
  asset: string;
  location: "room" | "path" | "track" | "removed";
  room?: string;
  progress?: number;
  color?: string;
  wounded?: boolean;
  madness?: boolean;
}
export const visualCatalog: Record<string, Record<string, string>> = {
  back: {
    objective: "目标 · 未翻开",
    boldness: "无惧 · 未翻开",
    survival: "逃生 · 未翻开",
    altruism: "援助 · 未翻开",
  },
  generator: {
    idle: "0个进度",
    progress_1: "1个进度",
    progress_2: "2个进度",
    completed: "修好 · 移到进度轨",
    blocked: "被恶灵封锁",
  },
  exit_gate: {
    unpowered: "未通电",
    powered: "已通电",
    progress_1: "1个进度",
    progress_2: "2个进度",
    open: "出口开启",
  },
  hook: {
    empty: "空钩",
    occupied: "挂着逃生者",
    broken: "被破坏 · 恶灵指示物",
  },
  hex_totem: { normal: "正常", cleansed: "已净化 · 移除" },
  chest: { unopened: "未搜索", searched: "已搜索 · 移除" },
  locker: { empty: "空", occupied: "被占用", removed: "已移除" },
  pallet: { in_room: "在房间里", on_path: "放倒在路线上", destroyed: "被摧毁" },
  crow: { still: "静止", startled: "被惊飞" },
  wall: { intact: "完整", broken: "被破坏", temporary: "临时移开" },
  bear_trap: { active: "捕兽夹" },
  phantasm: { active: "鬼灵陷阱" },
  madness: { active: "神经紊乱（疯狂）" },
  entity: { active: "恶灵指示物" },
  actor: {
    healthy: "健康",
    wounded: "受伤环",
    carried: "被扛起",
    hidden: "躲在柜子里 · 匿名",
    hooked: "挂在钩子上",
  },
};
export const visualKindNames: Record<string, string> = {
  ...propNames,
  back: "道具背面",
  wall: "可破坏墙壁",
  bear_trap: "捕兽夹",
  phantasm: "鬼灵陷阱",
  madness: "神经紊乱",
  entity: "恶灵",
  actor: "角色棋子",
};
export function sampleVisual(kind: string, state: string): VisualToken {
  return {
    id: kind + "-" + state,
    kind,
    state,
    label: visualCatalog[kind][state],
    asset:
      kind === "back"
        ? "back_" + state
        : kind === "actor"
          ? "portrait_anonymous"
          : kind,
    location:
      state === "completed"
        ? "track"
        : ["cleansed", "searched", "removed", "destroyed"].includes(state)
          ? "removed"
          : "room",
    progress:
      state === "completed" || state === "open"
        ? 3
        : state === "progress_2"
          ? 2
          : state === "progress_1"
            ? 1
            : 0,
    color: kind === "back" ? backCategories[state].color : undefined,
    wounded: state === "wounded",
  };
}
export function propVisual(s: GameState, id: string): VisualToken {
  const p = s.props.find((p) => p.id === id)!;
  if (!p.revealed)
    return { ...sampleVisual("back", p.category), id: p.id, room: p.room };
  let state = "normal";
  let location: VisualToken["location"] = p.removed ? "removed" : "room";
  switch (p.kind) {
    case "generator":
      state = p.removed
        ? "completed"
        : s.entity?.id === p.id
          ? "blocked"
          : p.progress
            ? "progress_" + p.progress
            : "idle";
      if (p.removed) location = "track";
      break;
    case "exit_gate":
      state =
        p.progress >= 3
          ? "open"
          : p.progress
            ? "progress_" + p.progress
            : s.completedGenerators >= 4
              ? "powered"
              : "unpowered";
      break;
    case "hook":
      state =
        s.entity?.id === p.id
          ? "broken"
          : Object.values(s.actors).some((a) => a.hookId === p.id)
            ? "occupied"
            : "empty";
      break;
    case "hex_totem":
      state = p.removed ? "cleansed" : "normal";
      break;
    case "chest":
      state = p.removed ? "searched" : "unopened";
      break;
    case "locker":
      state = p.removed
        ? "removed"
        : Object.values(s.actors).some((a) => a.lockerId === p.id)
          ? "occupied"
          : "empty";
      break;
    case "pallet":
      state = p.removed ? "on_path" : "in_room";
      break;
    case "crow":
      state =
        p.removed ||
        s.events.some(
          (e) =>
            e.type === "CROW_STARTLED" &&
            e.data.propId === p.id &&
            e.round === s.round,
        )
          ? "startled"
          : "still";
      break;
  }
  return {
    id,
    kind: p.kind,
    state,
    label: `${propNames[p.kind]} · ${visualCatalog[p.kind]?.[state] ?? state}`,
    asset: p.kind,
    location,
    room: p.room,
    progress: p.progress,
  };
}
export function boardVisuals(s: GameState) {
  const carry =
    s.choice?.kind === "CARRY"
      ? s.choice.victimId
      : s.roll?.kind === "carry"
        ? s.roll.data.victimId
        : null;
  const actors: VisualToken[] = Object.values(s.actors)
    .filter((a) => !a.lockerId)
    .map((a) => ({
      id: a.id,
      kind: "actor",
      state: a.hookId
        ? "hooked"
        : carry === a.id
          ? "carried"
          : a.health === "wounded"
            ? "wounded"
            : "healthy",
      label: actorName(a.id),
      asset: "portrait_" + a.id,
      location: "room",
      room: a.room ?? undefined,
      wounded: a.health === "wounded",
      madness: a.madness,
    }));
  const map = maps.maps.find((m) => m.id === s.mapId)!;
  const paths: VisualToken[] = [];
  for (const p of Object.values(s.paths)) {
    const initial = map.edges.find((e) => e.id === p.id)!;
    if (initial.jagged)
      paths.push({
        id: p.id,
        kind: "wall",
        state: p.temporaryWall ? "temporary" : p.wall ? "intact" : "broken",
        label:
          "可破坏墙壁 · " +
          (p.temporaryWall ? "临时移开" : p.wall ? "完整" : "被破坏"),
        asset: "wall",
        location: "path",
      });
    if (
      p.pallet ||
      s.events.some(
        (e) => e.type === "PALLET_DESTROYED" && e.data.pathId === p.id,
      )
    )
      paths.push({
        id: p.id,
        kind: "pallet",
        state: p.pallet ? "on_path" : "destroyed",
        label: "木板 · " + (p.pallet ? "放倒在路线上" : "被摧毁"),
        asset: "pallet",
        location: "path",
      });
    if (p.bearTrap)
      paths.push({
        id: p.id,
        kind: "bear_trap",
        state: "active",
        label: "捕兽夹",
        asset: "bear_trap",
        location: "path",
      });
  }
  const markers: VisualToken[] = s.phantasms.map((room) => ({
    id: room,
    kind: "phantasm",
    state: "active",
    label: "鬼灵陷阱",
    asset: "phantasm",
    room,
    location: "room",
  }));
  for (const a of actors)
    if (a.madness)
      markers.push({
        id: a.id,
        kind: "madness",
        state: "active",
        label: "神经紊乱（疯狂）",
        asset: "madness",
        room: a.room,
        location: "room",
      });
  if (s.entity)
    markers.push({
      id: s.entity.id,
      kind: "entity",
      state: "active",
      label: "恶灵指示物",
      asset: "entity",
      location: s.entity.kind === "path" ? "path" : "room",
      room: s.props.find((p) => p.id === s.entity?.id)?.room,
    });
  return {
    props: s.props.map((p) => propVisual(s, p.id)),
    actors,
    paths,
    markers,
  };
}
export interface Feedback {
  id: string;
  kind: string;
  label: string;
  asset: string;
  target?: string;
  progress?: number;
  backAsset?: string;
}
export function feedbackEvents(
  before: GameState,
  after: GameState,
): Feedback[] {
  const effects: Feedback[] = [];
  const add = (
    kind: string,
    label: string,
    asset: string,
    target?: string,
    progress?: number,
  ) =>
    effects.push({
      id: `${after.events.length}-${effects.length}`,
      kind,
      label,
      asset,
      target,
      progress,
    });
  for (const e of after.events.slice(before.events.length)) {
    const d = e.data;
    if (e.type === "PROP_REVEALED") {
      add(
        "flip",
        "翻开" + propNames[String(d.kind)],
        String(d.kind),
        String(d.propId),
      );
      effects.at(-1)!.backAsset =
        "back_" + before.props.find((p) => p.id === d.propId)!.category;
    }
    if (e.type === "WOUNDED" && !after.actors[String(d.actorId)]?.lockerId)
      add(
        "attack",
        actorName(String(d.actorId)) + "受伤",
        "portrait_" + d.actorId,
        String(d.actorId),
      );
    if (e.type === "HOOKED")
      add(
        "hook",
        actorName(String(d.actorId)) + "被挂上钩子",
        "hook",
        String(d.actorId),
      );
    if (e.type === "CARRIED")
      add("carry", "正在搬运逃生者", "hook", String(d.actorId));
    if (e.type === "HIDDEN_IN_LOCKER") add("hide", "储物柜被占用", "locker");
    if (e.type === "CROW_STARTLED")
      add("startle", "乌鸦被惊飞", "crow", String(d.propId));
    if (e.type === "PALLET_PLACED")
      add("pallet", "木板放倒在路线上", "pallet", String(d.pathId));
  }
  for (const p of after.props) {
    const prev = before.props.find((x) => x.id === p.id)!;
    if (p.progress > prev.progress)
      add(
        "progress",
        `${propNames[p.kind]}进度 ${p.progress}/3`,
        p.kind,
        p.id,
        p.progress,
      );
    if (
      p.removed &&
      !prev.removed &&
      ["hex_totem", "chest", "crow"].includes(p.kind)
    )
      add(
        "remove",
        `${propNames[p.kind]}已${p.kind === "hex_totem" ? "净化" : p.kind === "chest" ? "搜索" : "惊飞"}并移除`,
        p.kind,
        p.id,
      );
  }
  return effects.slice(0, 8);
}
