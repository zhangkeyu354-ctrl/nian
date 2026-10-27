import type {
  EventId,
  PublicAction,
} from "../../../../packages/soda-smugglers/src/index.ts";
export const eventCopy: Record<
  EventId,
  { title: string; summary: string; text: string }
> = {
  inspection: {
    title: "领导视察",
    summary: "警长多一次检查，可检查同一旅客的第二个手提箱。",
    text: "警长可把此卡当作 1 个额外的检查指示物，此卡可以检查同一名玩家的第二个手提箱。",
  },
  birthday: {
    title: "生日礼物",
    summary: "警长获得 2 瓶盖，本轮每名旅客最多可带 2 瓶。",
    text: "警长从公共区拿 2 分瓶盖。本轮每名旅客最多可带 2 瓶汽水。",
  },
  holiday: {
    title: "假日狂欢",
    summary: "旅客本轮使用 3 个手提箱。",
    text: "本轮所有旅客用 3 个手提箱（暗置 3 张牌作为行李牌）。",
  },
  desperate: {
    title: "破釜沉舟",
    summary: "警长按逮捕指示物数量付瓶盖；本轮不能带汽水。",
    text: "警长每有 1 个逮捕指示物，就弃置 1 分瓶盖。本轮旅客行李里可带的汽水数量减为 0。",
  },
  greedy: {
    title: "贪得无厌",
    summary: "警长可选择接受所有旅客的贿赂并全部放行。",
    text: "警长可以选择接受所有旅客的贿赂并全部放行；不这么做，就按正常流程进行本轮。",
  },
  impartial: {
    title: "铁面无私",
    summary: "多一次逮捕；用此卡误捕时警长不赔。",
    text: "警长可把此卡当作 1 个额外的逮捕指示物；用此卡逮捕失败时，警长不用付旅客瓶盖。",
  },
  night: {
    title: "起早贪黑",
    summary: "警长多一次受贿机会。",
    text: "警长可把此卡当作 1 个额外的受贿指示物。",
  },
  dog: {
    title: "缉私犬长",
    summary: "额外检查：旅客须翻开汽水最多的手提箱。",
    text: "警长可把此卡当作 1 个额外的检查指示物；被犬长检查的旅客，必须自己翻开携带汽水最多的那张手提箱牌。",
  },
};
export function arrestText(a: Partial<PublicAction>) {
  if (a.type === "CONFISCATE")
    return {
      title: "抓到了！",
      detail: `抓到走私，警长从公共区获得 ${a.amount ?? 0} 瓶盖。`,
      tone: "caught",
    };
  if (a.type === "WRONGFUL" && a.useEvent)
    return {
      title: "铁面无私 · 误捕",
      detail: `这次误捕警长不赔；旅客从公共区获得 ${a.amount ?? 0} 瓶盖。`,
      tone: "clear",
    };
  if (a.type === "WRONGFUL")
    return {
      title: "误捕 · 放行",
      detail: `警长应赔 2 瓶盖${a.penalty !== 2 ? `（实际赔 ${a.penalty ?? 0}）` : ""}；旅客另从公共区获得 ${a.amount ?? 0} 瓶盖。`,
      tone: "clear",
    };
  return {
    title: "放行",
    detail: `旅客从公共区获得 ${a.amount ?? 0} 瓶盖。`,
    tone: "clear",
  };
}
export interface Selection {
  luggage: string[];
  bribe: string;
}
export function selectionAfterDrop(
  current: Selection,
  id: string,
  zone: "luggage" | "bribe",
  limit: number,
): Selection {
  if (
    zone === "luggage" &&
    !current.luggage.includes(id) &&
    current.luggage.length >= limit
  )
    return current;
  if (zone === "bribe")
    return { luggage: current.luggage.filter((x) => x !== id), bribe: id };
  return {
    luggage: current.luggage.includes(id)
      ? current.luggage
      : [...current.luggage, id],
    bribe: current.bribe === id ? "" : current.bribe,
  };
}
export function recapByRound(history: PublicAction[]) {
  const by = new Map<number, PublicAction[]>();
  for (const a of history) {
    if (!by.has(a.round)) by.set(a.round, []);
    by.get(a.round)!.push(a);
  }
  return [...by].map(([round, actions]) => ({ round, actions }));
}
interface StatPlayer {
  name: string;
  caps: number;
  stats: {
    delivered: number;
    confiscated: number;
    wrongful: number;
    bribesPaid: number;
    bribesReceived: number;
  };
}
export function winnerTitles(players: StatPlayer[]) {
  const metrics = [
    { key: "delivered" as const, label: "汽水运输王" },
    { key: "confiscated" as const, label: "缉私能手" },
  ];
  return metrics.flatMap(({ key, label }) => {
    const max = Math.max(...players.map((p) => p.stats[key]));
    return max > 0
      ? players
          .filter((p) => p.stats[key] === max)
          .map((p) => ({ name: p.name, label, value: max }))
      : [];
  });
}
