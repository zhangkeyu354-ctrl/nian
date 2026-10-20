import React, { useEffect, useRef, useState } from "react";
import type { Event } from "../../../packages/shared/src/types.ts";
import { actorName } from "../../../packages/game-engine/src/index.ts";
import { itemInfo } from "./labels.ts";
import { Illustration } from "./Illustration.tsx";
export function ItemUseNotice({ events }: { events: Event[] }) {
  const seen = useRef(events.length),
    [notice, setNotice] = useState<Event | null>(null);
  useEffect(() => {
    const fresh = events
      .slice(seen.current)
      .filter((e) => e.type === "ITEM_USED");
    seen.current = events.length;
    if (fresh.length) setNotice(fresh.at(-1)!);
  }, [events]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  const item = String(notice.data.item);
  return (
    <aside
      className="item-use-notice"
      role="status"
      data-testid="item-used-feedback"
    >
      <Illustration id={item} />
      <div>
        <small>{actorName(String(notice.data.actorId))}打出物品</small>
        <strong>{itemInfo(item)?.name_zh ?? "物品"}</strong>
      </div>
    </aside>
  );
}
