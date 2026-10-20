import { useEffect, useRef, useState } from "react";
import type { Fx, LogEntry, Token } from "../../../../packages/magical-athlete/src/types.ts";
import type { MAView } from "../../../../packages/magical-athlete/src/index.ts";

/** 屏幕上正在播放的东西 */
export type Show =
  | { kind: "roll"; player: string; racer: string; value: number; reroll?: boolean; rolling: boolean }
  | { kind: "duel"; a: { racer: string; value: number }; b: { racer: string; value: number }; rolling: boolean }
  | { kind: "power"; racer: string; power: string; text: string }
  | { kind: "finish"; racer: string; place: number; text: string }
  | { kind: "start"; race: number; track: string; text: string }
  | { kind: "note"; racer: string; text: string };

export interface ShownToken {
  racer: string;
  pos: number;
  tripped: boolean;
  out: boolean;
  place: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 把服务器发来的新记录（带 fx 的条目）依次播放成动画：大骰子、技能弹出、逐格走路……
 * 播放期间棋盘显示「动画里的位置」，播放完再对齐服务器的真实状态。
 * 中途刷新页面不会重播历史，只播放之后新发生的事。
 */
export function usePlayback(view: MAView) {
  const seen = useRef<number | null>(null);
  const queue = useRef<LogEntry[]>([]);
  const running = useRef(false);
  const skip = useRef(false);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<Show | null>(null);
  const [moving, setMoving] = useState<string[]>([]);
  const [shown, setShown] = useState<Map<string, ShownToken> | null>(null);
  /** 动画里的当前位置；不播放时等于上一段动画结束时（= 当时服务器）的位置 */
  const shownRef = useRef<Map<string, ShownToken> | null>(null);
  const latest = useRef(view);
  latest.current = view;

  const fromRace = (tokens: Token[]) =>
    new Map(tokens.map((t) => [t.racer, { racer: t.racer, pos: t.pos, tripped: t.tripped, out: t.out, place: t.place }]));

  useEffect(() => {
    const log = view.log;
    if (seen.current === null) {
      seen.current = log.length; // 第一次打开：不重播历史
      shownRef.current = view.race ? fromRace(view.race.tokens) : null;
      return;
    }
    if (log.length <= seen.current) return;
    const fresh = log.slice(seen.current);
    seen.current = log.length;
    queue.current.push(...fresh);
    if (!running.current) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.log.length]);

  async function run() {
    running.current = true;
    setBusy(true);
    skip.current = false;
    // 播放起点：上一次播放结束时的位置（或当前比赛开始时）
    let cur = shownRef.current ?? null;
    while (queue.current.length) {
      const e = queue.current.shift()!;
      const fx = e.fx;
      if (!fx) continue;
      const fast = skip.current || reduced();
      const k = fast ? 0 : queue.current.length > 12 ? 0.45 : queue.current.length > 6 ? 0.7 : 1;
      const wait = (ms: number) => (k === 0 ? Promise.resolve() : sleep(ms * k));
      const setPos = (racer: string, patch: Partial<ShownToken>) => {
        if (!cur) return;
        const t = cur.get(racer);
        if (!t) return;
        cur = new Map(cur);
        cur.set(racer, { ...t, ...patch });
        shownRef.current = cur;
        setShown(cur);
      };
      switch (fx.kind) {
        case "start": {
          const r = latest.current.race;
          cur = r ? new Map(r.tokens.map((t) => [t.racer, { racer: t.racer, pos: 0, tripped: false, out: false, place: null }])) : null;
          shownRef.current = cur;
          setShown(cur);
          setShow({ kind: "start", race: fx.race, track: fx.track, text: e.text });
          await wait(2200);
          break;
        }
        case "roll":
          setShow({ ...fx, rolling: true });
          await wait(750);
          setShow({ ...fx, rolling: false });
          await wait(1100);
          break;
        case "duel":
          setShow({ ...fx, rolling: true });
          await wait(750);
          setShow({ ...fx, rolling: false });
          await wait(1300);
          break;
        case "power":
          setShow({ kind: "power", racer: fx.racer, power: fx.power, text: e.text });
          await wait(1700);
          break;
        case "move": {
          if (!cur) cur = fromRace(latest.current.race?.tokens ?? []);
          const dir = fx.to >= fx.from ? 1 : -1;
          setMoving(fx.racers);
          for (let p = fx.from + dir; dir > 0 ? p <= fx.to : p >= fx.to; p += dir) {
            for (const r of fx.racers) setPos(r, { pos: p });
            await wait(230);
          }
          setMoving([]);
          await wait(120);
          break;
        }
        case "warp":
          if (!cur) cur = fromRace(latest.current.race?.tokens ?? []);
          setMoving([fx.racer]);
          setPos(fx.racer, { pos: fx.to });
          await wait(450);
          setMoving([]);
          break;
        case "trip":
          setPos(fx.racer, { tripped: true });
          setShow({ kind: "note", racer: fx.racer, text: "摔倒了！下次主移动跳过" });
          await wait(900);
          break;
        case "out":
          setPos(fx.racer, { out: true });
          setShow({ kind: "note", racer: fx.racer, text: "被淘汰出本场比赛！" });
          await wait(1100);
          break;
        case "finish":
          setPos(fx.racer, { place: fx.place });
          setShow({ kind: "finish", racer: fx.racer, place: fx.place, text: e.text });
          await wait(1800);
          break;
        case "chip":
          await wait(300);
          break;
      }
      setShow(null);
    }
    // 播放完：对齐服务器的真实状态
    const r = latest.current.race;
    shownRef.current = r ? fromRace(r.tokens) : null;
    setShown(null);
    running.current = false;
    setBusy(false);
  }

  return {
    busy,
    show,
    moving,
    shown,
    skip: () => {
      skip.current = true;
    },
  };
}

export type { Fx };
