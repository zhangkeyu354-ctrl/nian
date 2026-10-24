/** UI辅助信息与引擎计分分离，只有CALL复用已有SPEAK动作。 */
import { randomBytes } from "node:crypto";
import { act, type State } from "../../../packages/xiabaiwang/src/engine.ts";
import type {
  XBCommand,
  XBNoteTag,
  XBCallout,
  XBPublicNotes,
} from "../../../packages/shared/src/xb-protocol.ts";
export interface XBAids {
  gameId: string;
  readUntil: number;
  revealAt: number;
  speechSeconds: 0 | 30 | 60;
  speakerAt: number;
  speechUsed: Record<string, number>;
  notes: Record<number, XBPublicNotes>;
  votes: Record<number, Record<string, string>>;
  callouts: Record<string, XBCallout>;
}
interface RoomData {
  code: string;
  players: { id: string }[];
  state: State | null;
  aids?: XBAids;
}
export function freshAids(seconds: 0 | 30 | 60 = 0): XBAids {
  return {
    gameId: randomBytes(8).toString("hex"),
    readUntil: 0,
    revealAt: 0,
    speechSeconds: seconds,
    speakerAt: 0,
    speechUsed: {},
    notes: {},
    votes: {},
    callouts: {},
  };
}
export function beginRead(a: XBAids, now = Date.now()) {
  a.readUntil = now + 9000;
  a.revealAt = 0;
  a.speakerAt = 0;
  a.speechUsed = {};
  a.callouts = {};
}
export function trackSpeaker(
  a: XBAids,
  previous: string | null,
  next: string | null,
  now = Date.now(),
) {
  if (previous === next) return;
  if (previous && a.speakerAt)
    a.speechUsed[previous] =
      (a.speechUsed[previous] ?? 0) + Math.max(0, now - a.speakerAt);
  a.speakerAt = next ? now : 0;
}
export function applyAid(f: RoomData, actor: string, c: XBCommand) {
  if (!["SET_SPEECH", "CALL", "NOTE", "CROWN"].includes(c.type)) return false;
  const a = f.aids ?? { ...freshAids(), gameId: `legacy-${f.code}` },
    s = f.state;
  if (c.type === "SET_SPEECH") {
    if (actor !== f.players[0]?.id) throw Error("仅房主可以设置发言计时");
    if (s) throw Error("开局后不能更换发言计时");
    if (![0, 30, 60].includes(c.seconds)) throw Error("发言计时无效");
    a.speechSeconds = c.seconds;
    f.aids = a;
    return true;
  }
  if (c.type !== "CALL" && c.type !== "NOTE" && c.type !== "CROWN")
    return false;
  if (!s || c.round !== s.round) throw Error("回合已变化，请刷新状态");
  if (!f.players.some((p) => p.id === c.target)) throw Error("目标无效");
  if (c.type === "CROWN") {
    if (s.phase !== "reveal") throw Error("只能在本轮揭晓后送皇冠");
    const votes = (a.votes[s.round] ??= {});
    if (votes[actor]) throw Error("本轮已送过皇冠");
    votes[actor] = c.target;
    f.aids = a;
    return true;
  }
  if (s.phase !== "discussion") throw Error("只能在讨论阶段操作");
  if (actor !== s.guesser) throw Error("只有想想可以点名或记小抄");
  if (c.target === s.guesser) throw Error("请选择其他玩家");
  if (c.type === "NOTE") {
    if (c.tag !== null && !["suspect", "truthy", "unknown"].includes(c.tag))
      throw Error("小抄标签无效");
    const notes = (a.notes[s.round] ??= {
      round: s.round,
      guesser: s.guesser,
      tags: {},
    });
    if (c.tag === null) delete notes.tags[c.target];
    else notes.tags[c.target] = c.tag;
  } else {
    const previous = s.speaker;
    f.state = act(s, actor, {
      type: "SPEAK",
      target: c.target,
      round: s.round,
    });
    trackSpeaker(a, previous, c.target);
    a.callouts[c.target] = {
      id: randomBytes(8).toString("hex"),
      round: s.round,
      target: c.target,
      at: Date.now(),
    };
  }
  f.aids = a;
  return true;
}
export function aidSnapshot(f: RoomData, me: string | null, now = Date.now()) {
  const a = f.aids,
    s = f.state;
  const counts: Record<string, number> = {},
    totals: Record<string, number> = {};
  for (const [round, votes] of Object.entries(a?.votes ?? {}))
    for (const target of Object.values(votes)) {
      totals[target] = (totals[target] ?? 0) + 1;
      if (Number(round) === s?.round)
        counts[target] = (counts[target] ?? 0) + 1;
    }
  const callout = me ? a?.callouts[me] : undefined;
  return {
    serverNow: now,
    gameId: a?.gameId ?? `legacy-${f.code}`,
    readUntil: a?.readUntil ?? 0,
    revealAt: a?.revealAt ?? 0,
    speechSeconds: a?.speechSeconds ?? 0,
    speechUsed: { ...a?.speechUsed },
    speakerAt: a?.speakerAt ?? 0,
    ...(callout &&
    s?.phase === "discussion" &&
    callout.round === s.round &&
    s.speaker === callout.target &&
    s.muted !== callout.target &&
    now - callout.at < 4000
      ? { callout: { ...callout } }
      : {}),
    ...(s?.phase === "discussion" && me === s.guesser
      ? { privateNotes: { ...a?.notes[s.round]?.tags } }
      : {}),
    revealedNotes:
      s?.history.flatMap((h) =>
        a?.notes[h.round] ? [structuredClone(a.notes[h.round])] : [],
      ) ?? [],
    crownCounts: counts,
    crownTotals: totals,
    ...(me && s && a?.votes[s.round]?.[me]
      ? { myCrownVote: a.votes[s.round][me] }
      : {}),
  };
}
