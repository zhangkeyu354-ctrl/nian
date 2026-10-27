import type {
  SSAction,
  SSSnapshot,
} from "../packages/shared/src/ss-protocol.ts";
/** Acceptance bot sees only authenticated per-seat projections. */
export function nextSSAction(
  snaps: SSSnapshot[],
): { seat: number; action: SSAction } | null {
  const v = snaps[0].view!;
  if (v.phase === "FINISHED") return null;
  if (v.phase === "PACK") {
    const seat = v.players.findIndex((p, i) => i !== v.guard && !p.submitted);
    const mine = snaps[seat].view!.players[seat];
    const n = v.event === "holiday" ? 3 : 2;
    const h = mine.hand!;
    return {
      seat,
      action: {
        type: "SUBMIT",
        luggage: h.slice(0, n).map((c) => c.id),
        bribe: h[n].id,
      },
    };
  }
  if (v.pendingDog !== null) {
    const seat = v.pendingDog;
    const bags = snaps[seat].view!.players[seat].luggage;
    const max = Math.max(...bags.map((c) => c!.bottles));
    return {
      seat,
      action: {
        type: "REVEAL_DOG",
        index: bags.findIndex((c) => c!.bottles === max),
      },
    };
  }
  const seat = v.guard;
  const candidates = v.players.flatMap((p, i) =>
    i !== seat && !p.settled ? [i] : [],
  );
  if (v.phase === "ROUND_END") return { seat, action: { type: "NEXT_ROUND" } };
  if (v.phase === "BRIBE") {
    if (
      v.event === "greedy" &&
      !v.history.some((a) => a.round === v.round && a.type === "ACCEPT")
    )
      return { seat, action: { type: "GREEDY" } };
    if (candidates.length && v.budget.bribe > 0)
      return { seat, action: { type: "ACCEPT", target: candidates[0] } };
    if (candidates.length && v.event === "night" && !v.eventUsed)
      return {
        seat,
        action: { type: "ACCEPT", target: candidates[0], useEvent: true },
      };
  }
  if (v.phase === "INSPECT") {
    const target = candidates.find((i) =>
      v.players[i].luggage.every((c) => c === null),
    );
    if (target !== undefined && v.event === "dog" && !v.eventUsed)
      return { seat, action: { type: "INSPECT", target, useEvent: true } };
    if (target !== undefined && v.budget.inspect > 0)
      return { seat, action: { type: "INSPECT", target, index: 0 } };
    if (candidates.length && v.event === "inspection" && !v.eventUsed) {
      const target = candidates[0];
      const index = v.players[target].luggage.findIndex((c) => c === null);
      if (index >= 0)
        return {
          seat,
          action: { type: "INSPECT", target, index, useEvent: true },
        };
    }
  }
  if (v.phase === "ARREST") {
    if (candidates.length && v.event === "impartial" && !v.eventUsed)
      return {
        seat,
        action: { type: "ARREST", target: candidates[0], useEvent: true },
      };
    if (candidates.length && v.budget.arrest > 0)
      return { seat, action: { type: "ARREST", target: candidates[0] } };
  }
  return { seat, action: { type: "ADVANCE" } };
}
