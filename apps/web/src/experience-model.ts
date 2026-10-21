import type { GameState, Event } from "../../../packages/shared/src/types.ts";
import {
  actorName,
  boardVisuals,
} from "../../../packages/game-engine/src/index.ts";
export interface Motion {
  seq: number;
  actorId: string;
  pathId: string;
  from: string;
  to: string;
}
export function publicMotion(before: GameState, after: GameState): Motion[] {
  const visible = new Set(boardVisuals(after).actors.map((a) => a.id));
  return after.events
    .slice(before.events.length)
    .filter((e) => e.type === "MOVED" && visible.has(String(e.data.actorId)))
    .map((e) => ({
      seq: e.seq,
      actorId: String(e.data.actorId),
      pathId: String(e.data.pathId),
      from: String(e.data.from),
      to: String(e.data.to),
    }));
}
export function threatFor(
  s: GameState,
  seat: string | null,
): { level: "none" | "same" | "near"; actors: string[] } {
  const k = s.actors[s.killerId];
  const rooms = new Set(Object.values(s.paths).flatMap((p) => p.rooms));
  if (!k?.room || !rooms.has(k.room) || !seat || s.winner)
    return { level: "none", actors: [] } as const;
  const mine = Object.values(s.actors).filter(
    (a) => a.ownerId === seat && a.side === "survivor" && !!a.room && !a.hookId,
  );
  const same = mine.filter((a) => a.room === k.room);
  if (same.length)
    return { level: "same", actors: same.map((a) => a.id) } as const;
  const adjacent = mine.filter((a) =>
    Object.values(s.paths).some(
      (p) => p.rooms.includes(a.room!) && p.rooms.includes(k.room!),
    ),
  );
  return {
    level: adjacent.length ? "near" : "none",
    actors: adjacent.map((a) => a.id),
  } as const;
}
export function skillReason(
  skill: { id: string; available: boolean; cost: number },
  blood: number,
  used: string[],
) {
  if (skill.available) return null;
  if (used.includes(skill.id)) return "本轮已用过";
  if (blood < skill.cost) return "血点不足";
  return "时机未到";
}
export interface MajorNotice {
  seq: number;
  kind: string;
  title: string;
  actorId: string;
  detail: string;
  icon: string;
}
export function majorNotices(s: GameState, events: Event[]): MajorNotice[] {
  const names: Record<string, [string, string]> = {
    WOUNDED: ["受伤", "✕"],
    HOOKED: ["挂上钩子", "♜"],
    ESCAPED: ["逃脱成功", "↗"],
    SACRIFICE_PROGRESS: ["献祭进度推进", "✦"],
    GENERATOR_COMPLETED: ["发电机完成", "⚙"],
    EXIT_GATE_OPENED: ["出口大门开启", "↗"],
    GAME_OVER: [s.winner === "survivor" ? "逃脱成功" : "献祭完成", "✦"],
  };
  return events
    .filter((e) => names[e.type])
    .filter(
      (e) =>
        e.type !== "WOUNDED" || !s.actors[String(e.data.actorId)]?.lockerId,
    )
    .map((e) => ({
      seq: e.seq,
      kind: e.type,
      title: names[e.type][0],
      icon: names[e.type][1],
      actorId: String(e.data.actorId ?? ""),
      detail:
        e.type === "GENERATOR_COMPLETED"
          ? `${s.completedGenerators}/4 台发电机`
          : e.type === "SACRIFICE_PROGRESS"
            ? `${s.sacrifice}/8 献祭进度`
            : actorName(String(e.data.actorId ?? "")),
    }));
}
