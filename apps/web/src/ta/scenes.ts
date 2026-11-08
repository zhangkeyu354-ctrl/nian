import { ABILITIES, CARD_TEXT } from "./text.ts";

type Event =
  | { kind: "reveal"; card: string }
  | { kind: "wound"; seat: number; wound: string }
  | { kind: "death" | "exile"; seat: number }
  | { kind: "ending"; win: boolean }
  | { kind: "vote" }
  | { kind: "private"; label: string; card: string }
  | { kind: "notice"; label: string; seat?: number; ab?: string; effects?: string[] }
  | { kind: "agenda"; label: string; effects?: string[] }
  | { kind: "resource"; label: string };
export type Scene = Event & { id: number };
type View = {
  phase: string; winner: string | null; you: number; oxygen: number; energy: number;
  log: string[]; logCount?: number; notes?: string[]; hand?: { id: number; type: string }[];
  question?: { q: string; data: { type?: string } } | null;
  players?: { seat: number; hand: number; wounds: string[]; killed: boolean; exiled: boolean }[];
};
let sequence = 0;

export function collectScenes(previous: View | null, next: View): Scene[] {
  const events: Event[] = [];
  const card = (label: string, type: string | undefined) => {
    if (type && Object.hasOwn(CARD_TEXT, type)) events.push({ kind: "private", label, card: type });
  };
  if (previous) {
    const length = next.logCount ?? next.log.length;
    const oldLength = previous.logCount ?? previous.log.length;
    const entries = next.log.slice(Math.max(0, next.log.length - Math.max(0, length - oldLength)));
    for (const entry of entries) {
      const reveal = /^揭示：([a-z_]+)$/.exec(entry);
      if (reveal) events.push({ kind: "reveal", card: reveal[1] });
    }
    const delta = (label: string, difference: number) => difference ? `${label} ${difference > 0 ? "+" : ""}${difference}` : "";
    const resources = [delta("氧气", next.oxygen - previous.oxygen), delta("能量", next.energy - previous.energy)].filter(Boolean);
    if (resources.length) events.push({ kind: "resource", label: resources.join("　") });
    const effects: string[] = [];
    for (const p of next.players ?? []) {
      const o = previous.players?.find(x => x.seat === p.seat); if (!o) continue;
      const who = `座位${p.seat + 1}`;
      if (p.hand !== o.hand) effects.push(`${who} 手牌 ${p.hand > o.hand ? "+" : ""}${p.hand - o.hand}`);
      if (p.wounds.length > o.wounds.length) effects.push(`${who} 受到 ${p.wounds.length - o.wounds.length} 处伤`);
      if (p.wounds.length < o.wounds.length) effects.push(`${who} 治愈 ${o.wounds.length - p.wounds.length} 处伤`);
      if (p.killed && !o.killed) effects.push(`${who} 阵亡`);
    }
    effects.push(...resources);
    let ownCommandeered = false;
    for (const entry of entries) {
      const agenda = /^身份发动：(.*)$/.exec(entry);
      if (agenda) events.push({ kind: "agenda", label: agenda[1], effects });
      const wound = /^座位(\d+) 受伤：([a-z_]+)$/.exec(entry);
      if (wound) events.push({ kind: "wound", seat: Number(wound[1]) - 1, wound: wound[2] });
      const removed = /^座位(\d+) (死亡|被放逐)，/.exec(entry);
      if (removed) events.push({ kind: removed[2] === "死亡" ? "death" : "exile", seat: Number(removed[1]) - 1 });
      const bloodwork = /^座位(\d+) 公开手牌：([a-z_]+)$/.exec(entry);
      if (bloodwork) card("抽血检验 · 公开手牌", bloodwork[2]);
      const ability = /^座位(\d+) 使用 ([a-z_]+)$/.exec(entry);
      if (ability) {
        const seat = Number(ability[1]) - 1;
        const details = ABILITIES[ability[2]];
        if (ability[2] === "commandeer" && seat === next.you) ownCommandeered = true;
        if (details && (ability[2] !== "rush" || seat !== next.you)) {
          events.push({ kind: "notice", seat, ab: ability[2], label: details.name, effects: effects.length ? effects : [details.text] });
        }
      }
    }
    const finishedQuestion = previous.question?.q !== next.question?.q ? previous.question?.q : undefined;
    const taken = ownCommandeered ? "强制征收" : finishedQuestion === "salvage" ? "打捞作业"
      : finishedQuestion === "rewind" ? "倒带" : finishedQuestion === "restructure" ? "重新构筑" : null;
    if (taken) {
      const previousIds = new Set(previous.hand?.map(item => item.id));
      for (const item of next.hand ?? []) {
        if (!previousIds.has(item.id)) card(`${taken} · 仅你可见`, item.type);
      }
    }
    for (const note of (next.notes ?? []).slice(previous.notes?.length ?? 0)) {
      const scan = /^监控：座位\d+ 的牌是 ([a-z_]+)$/.exec(note);
      if (scan) card("安全检查 · 仅你可见", scan[1]);
      const forced = /^丧心病狂：你暗置打出了 ([a-z_]+)$/.exec(note);
      if (forced) card("丧心病狂 · 仅你可见", forced[1]);
    }
    if (previous.question?.q === "rush" && next.question?.q !== "rush") {
      events.push({ kind: "notice", label: "矫健身手 · 已将牌暗置打出" });
    }
  }
  if (next.question?.q === "rush" && previous?.question?.q !== "rush") {
    card("矫健身手 · 仅你可见", next.question.data.type);
  }
  if (next.phase === "vote" && previous && previous.phase !== "vote") events.push({ kind: "vote" });
  if (next.phase === "over" && previous?.phase !== "over") events.push({ kind: "ending", win: next.winner === "crew" });
  return events.map(event => ({ ...event, id: ++sequence }));
}
