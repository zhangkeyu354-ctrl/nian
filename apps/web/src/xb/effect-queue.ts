import type { XBEffect } from "../../../../packages/shared/src/xb-protocol.ts";
export interface EffectBatch {
  id: number;
  items: XBEffect[];
}
export const enqueueEffects = (
  queue: EffectBatch[],
  id: number,
  items: XBEffect[],
): EffectBatch[] => [...queue, { id, items }].slice(-32);
export const ackEffects = (queue: EffectBatch[], through: number) =>
  queue.filter((batch) => batch.id > through);
export function coalesceEffects(queue: EffectBatch[]) {
  const targets = new Map<string, XBEffect>();
  for (const batch of queue)
    for (const event of batch.items) {
      const previous = targets.get(event.target);
      targets.set(event.target, {
        ...event,
        count: (previous?.count ?? 0) + event.count,
      });
    }
  return [...targets.values()];
}
