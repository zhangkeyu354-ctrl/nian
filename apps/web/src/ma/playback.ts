import { useEffect, useRef, useState } from "react";
import type { Fx, LogEntry, Token } from "../../../../packages/magical-athlete/src/types.ts";
import { RACER_BY_ID, type MAView } from "../../../../packages/magical-athlete/src/index.ts";
import { sfxCount, sfxCheer, sfxFanfare, sfxFinish, sfxLand, sfxOops, sfxPower, sfxRoll, sfxStep } from "./sfx.ts";

/** 屏幕上正在播放的东西 */
export type Show =
  | { kind: "roll"; player: string; racer: string; value: number; reroll?: boolean; rolling: boolean }
  | { kind: "duel"; a: { racer: string; value: number }; b: { racer: string; value: number }; rolling: boolean }
  | { kind: "power"; racer: string; power: string; text: string }
  | { kind: "finish"; racer: string; place: number; text: string }
  | { kind: "start"; race: number; track: string; text: string }
  | { kind: "note"; racer: string; text: string }
  | { kind: "count"; n: number }
  | { kind: "stats"; race: number; rows: RacerStat[] }
  | { kind: "podium"; race: number; places: Array<{ racer: string; owner: string; place: number; points: number }> }
  | { kind: "champion"; winners: string[]; totals: Array<{ player: string; total: number }> };

/** 一场比赛里每名选手的数据（从比赛记录的 fx 统计，只用于展示） */
export interface RacerStat {
  racer: string;
  owner: string;
  /** 往前走的总格数（主移动 + 技能 + 箭头 + 向前传送） */
  forward: number;
  /** 被往后打退 / 后退的总格数 */
  back: number;
  trips: number;
  powers: number;
}
export function raceStats(log: LogEntry[], race: number, owners: Map<string, string>): RacerStat[] {
  const m = new Map<string, RacerStat>();
  const get = (racer: string) => {
    let s = m.get(racer);
    if (!s) m.set(racer, (s = { racer, owner: owners.get(racer) ?? "", forward: 0, back: 0, trips: 0, powers: 0 }));
    return s;
  };
  for (const r of owners.keys()) get(r);
  for (const e of log) {
    if (e.race !== race || !e.fx) continue;
    const fx = e.fx;
    if (fx.kind === "move" || fx.kind === "warp") {
      const d = fx.to - fx.from;
      for (const r of fx.kind === "move" ? fx.racers : [fx.racer]) {
        if (d > 0) get(r).forward += d;
        else get(r).back += -d;
      }
    } else if (fx.kind === "trip") get(fx.racer).trips++;
    else if (fx.kind === "power") get(fx.racer).powers++;
  }
  return [...m.values()];
}

/** 小人头顶飘出的字（「🎲 +5」「箭头 +3」「摔倒！」…） */
export interface Float {
  id: number;
  text: string;
  tone: "roll" | "power" | "good" | "bad" | "info";
}
/** 技能连线：谁的技能影响了谁 */
export interface Link {
  id: number;
  from: string;
  to: string;
}

export interface ShownToken {
  racer: string;
  pos: number;
  tripped: boolean;
  out: boolean;
  place: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 动画速度（每台手机自己选，存在本机）：慢 1.5 倍时长 / 正常 / 快 0.5 倍 */
export type Speed = "slow" | "normal" | "fast";
const SPEED_KEY = "ma-speed";
const FACTOR: Record<Speed, number> = { slow: 1.5, normal: 1, fast: 0.5 };
export function getSpeed(): Speed {
  try {
    const v = localStorage.getItem(SPEED_KEY);
    return v === "slow" || v === "fast" ? v : "normal";
  } catch {
    return "normal";
  }
}
export function setSpeed(s: Speed) {
  try {
    localStorage.setItem(SPEED_KEY, s);
  } catch {
    /* 忽略 */
  }
}
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 把服务器发来的新记录（带 fx 的条目）依次播放成动画：大骰子、技能弹出、逐格走路……
 * 播放期间棋盘显示「动画里的位置」，播放完再对齐服务器的真实状态。
 * 中途刷新页面不会重播历史，只播放之后新发生的事。
 */
export function usePlayback(view: MAView) {
  const seen = useRef<number | null>(null);
  /** 和 seen 一样，但放在 state 里：更新后会重新渲染（否则「还没播放」的判断会停在旧值，界面卡在「动画播放中」） */
  const [seenLen, setSeenLen] = useState<number | null>(null);
  const queue = useRef<LogEntry[]>([]);
  const running = useRef(false);
  const skip = useRef(false);
  const wakers = useRef(new Set<() => void>());
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<Show | null>(null);
  const [moving, setMoving] = useState<string[]>([]);
  const [floats, setFloats] = useState<Map<string, Float>>(new Map());
  const [link, setLink] = useState<Link | null>(null);
  /** 被技能命中的特效（摔倒 / 被击退 / 淘汰飞出） */
  const [hit, setHit] = useState<{ id: number; racer: string; kind: "trip" | "knock" | "out" } | null>(null);
  /** 棋盘震动：非 0 时震一下（约半秒后归零） */
  const [shake, setShake] = useState(0);
  /** 正在发动技能的选手：棋盘上放大发光 */
  const [spot, setSpot] = useState<string | null>(null);
  /** 正在走的选手要停的格子（棋盘上提前亮起来） */
  const [target, setTarget] = useState<number | null>(null);
  const fxId = useRef(0);
  const [shown, setShown] = useState<Map<string, ShownToken> | null>(null);
  /** 动画里的当前位置；不播放时等于上一段动画结束时（= 当时服务器）的位置 */
  const shownRef = useRef<Map<string, ShownToken> | null>(null);
  const latest = useRef(view);
  latest.current = view;

  const fromRace = (tokens: Token[]) =>
    new Map(
      tokens.map((t) => [t.racer, { racer: t.racer, pos: t.pos, tripped: t.tripped, out: t.out, place: t.place }]),
    );

  useEffect(() => {
    const log = view.log;
    if (seen.current === null) {
      seen.current = log.length; // 第一次打开：不重播历史
      setSeenLen(log.length);
      shownRef.current = view.race ? fromRace(view.race.tokens) : null;
      return;
    }
    if (log.length <= seen.current) return;
    const fresh = log.slice(seen.current);
    seen.current = log.length;
    setSeenLen(log.length);
    queue.current.push(...fresh);
    if (!running.current) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.log.length]);

  async function run() {
    running.current = true;
    setBusy(true);
    // 先把棋盘「冻结」在动画开始前的位置：骰子转完、真正走的时候才动
    if (shownRef.current) setShown(shownRef.current);
    // 播放起点：上一次播放结束时的位置（或当前比赛开始时）
    let cur = shownRef.current ?? null;
    /** 最近发动技能的选手：之后别人被移动 / 传送 / 绊倒，就从它拉一条线过去 */
    let lastPower: string | null = null;
    const float = (racer: string, text: string, tone: Float["tone"]) => {
      const f = { id: ++fxId.current, text, tone };
      setFloats((m) => new Map(m).set(racer, f));
      setTimeout(() => setFloats((m) => (m.get(racer)?.id === f.id ? (m.delete(racer), new Map(m)) : m)), 2600);
    };
    const linkTo = (racer: string) => {
      if (!lastPower || lastPower === racer) return;
      const l = { id: ++fxId.current, from: lastPower, to: racer };
      setLink(l);
      setTimeout(() => setLink((x) => (x?.id === l.id ? null : x)), 2800);
    };
    const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    const hitFx = (racer: string, kind: "trip" | "knock" | "out", big = false) => {
      const h = { id: ++fxId.current, racer, kind };
      setHit(h);
      if (big) {
        setShake(h.id);
        setTimeout(() => setShake((x) => (x === h.id ? 0 : x)), 480);
      }
      setTimeout(() => setHit((x) => (x?.id === h.id ? null : x)), 1300);
    };
    while (queue.current.length) {
      const e = queue.current.shift()!;
      const fx = e.fx;
      if (!fx) continue;
      // 点屏幕只跳过「当前这一段」动画；领奖台、总冠军不会被之前的点击连带跳过
      skip.current = false;
      /** 这一段有没有弹窗：有的话结束后留一点空档，免得弹窗一个接一个闪 */
      let popped = false;
      const showIt = (v: Show) => {
        popped = true;
        setShow(v);
      };
      // 用户反馈（2026-10-22）：连锁触发太快、眼花缭乱 → 不再因为排队多而加速（只有特别长的连锁才稍快一点）
      const k = reduced() ? 0 : queue.current.length > 30 ? 0.8 : 1;
      const wait = (ms: number) =>
        k === 0 || skip.current
          ? Promise.resolve()
          : new Promise<void>((res) => {
              const done = () => {
                clearTimeout(id);
                wakers.current.delete(done);
                res();
              };
              const id = setTimeout(done, ms * k * FACTOR[getSpeed()]);
              wakers.current.add(done);
            });
      /** 快进（点屏幕跳过 / 积压太多）时不出声 */
      const play = (f: () => void) => {
        if (k > 0.6 && !skip.current) f();
      };
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
          cur = r
            ? new Map(
                r.tokens.map((t) => [t.racer, { racer: t.racer, pos: 0, tripped: false, out: false, place: null }]),
              )
            : null;
          shownRef.current = cur;
          setShown(cur);
          showIt({ kind: "start", race: fx.race, track: fx.track, text: e.text });
          await wait(2200);
          // 3、2、1、开跑！
          for (const n of [3, 2, 1, 0]) {
            showIt({ kind: "count", n });
            play(() => sfxCount(n === 0));
            await wait(n === 0 ? 700 : 600);
          }
          break;
        }
        case "roll":
          lastPower = null;
          showIt({ ...fx, rolling: true });
          play(sfxRoll);
          await wait(750);
          showIt({ ...fx, rolling: false });
          play(() => sfxLand(fx.value));
          await wait(1500);
          break;
        case "duel":
          showIt({ ...fx, rolling: true });
          play(sfxRoll);
          await wait(750);
          showIt({ ...fx, rolling: false });
          play(() => sfxLand());
          await wait(1300);
          break;
        case "power":
          showIt({ kind: "power", racer: fx.racer, power: fx.power, text: e.text });
          play(sfxPower);
          lastPower = fx.racer;
          float(fx.racer, `✨${RACER_BY_ID.get(fx.power)?.powerZh ?? "技能"}`, "power");
          setSpot(fx.racer);
          await wait(2600);
          setSpot(null);
          break;
        case "move": {
          if (!cur) cur = fromRace(latest.current.race?.tokens ?? []);
          const dir = fx.to >= fx.from ? 1 : -1;
          setMoving(fx.racers);
          {
            const d = signed(fx.to - fx.from);
            const why = fx.why ?? "";
            const label = why === "主移动" ? `🎲 ${d}` : why ? `${why} ${d}` : d;
            const tone: Float["tone"] = why === "主移动" ? "roll" : fx.to >= fx.from ? "good" : "bad";
            for (const r of fx.racers) {
              float(r, label, tone);
              linkTo(r);
            }
            // 被技能往后打退：先播「被击退」特效再往回走
            if (fx.to < fx.from && why !== "主移动") {
              for (const r of fx.racers) hitFx(r, "knock", true);
              play(sfxOops);
              await wait(700);
            }
          }
          setTarget(fx.to);
          for (let p = fx.from + dir; dir > 0 ? p <= fx.to : p >= fx.to; p += dir) {
            for (const r of fx.racers) setPos(r, { pos: p });
            play(sfxStep);
            await wait(480);
          }
          setMoving([]);
          await wait(380);
          setTarget(null);
          break;
        }
        case "warp":
          if (!cur) cur = fromRace(latest.current.race?.tokens ?? []);
          setMoving([fx.racer]);
          float(fx.racer, `传送 → 第 ${fx.to} 格`, "info");
          linkTo(fx.racer);
          setPos(fx.racer, { pos: fx.to });
          await wait(900);
          setMoving([]);
          break;
        case "trip":
          hitFx(fx.racer, "trip", true);
          setPos(fx.racer, { tripped: true });
          float(fx.racer, "摔倒！下回合不动", "bad");
          linkTo(fx.racer);
          play(sfxOops);
          await wait(1400);
          break;
        case "out":
          float(fx.racer, "淘汰！", "bad");
          linkTo(fx.racer);
          // 先播飞出棋盘的动画，再把它从棋盘上拿掉
          hitFx(fx.racer, "out", true);
          play(sfxOops);
          await wait(1000);
          setPos(fx.racer, { out: true });
          play(sfxOops);
          await wait(1600);
          break;
        case "finish":
          setPos(fx.racer, { place: fx.place });
          showIt({ kind: "finish", racer: fx.racer, place: fx.place, text: e.text });
          play(sfxFinish);
          await wait(2500);
          break;
        case "chip": {
          const tok = latest.current.race?.tokens.find((x) => x.owner === fx.player && !x.out);
          if (tok) float(tok.racer, `★ ${fx.value < 0 ? "" : "+"}${fx.value} 分`, fx.value < 0 ? "bad" : "good");
          await wait(300);
          break;
        }
        case "podium":
          // 领奖台：3、2、1 依次登台（CSS 里按名次延迟），号角 + 一小段欢呼
          showIt({ kind: "podium", race: fx.race, places: fx.places });
          play(() => {
            sfxFanfare();
            setTimeout(() => sfxCheer(2.2), 900);
          });
          await wait(4800);
          {
            // 本场数据榜：跑最远、技能王、倒退王、摔跤王
            const r = latest.current.race;
            const owners = new Map((r && r.index === fx.race ? r.tokens : []).map((x) => [x.racer, x.owner] as const));
            for (const p of fx.places) owners.set(p.racer, p.owner);
            const rows = raceStats(latest.current.log, fx.race, owners);
            if (rows.length) {
              showIt({ kind: "stats", race: fx.race, rows });
              await wait(6500);
            }
          }
          break;
        case "champion":
          // 总冠军：大号角 + 长欢呼；画面停留到有人点一下（或 9 秒后）
          showIt({ kind: "champion", winners: fx.winners, totals: fx.totals });
          play(() => {
            sfxFanfare(true);
            setTimeout(() => sfxCheer(5), 700);
          });
          await wait(9000);
          break;
      }
      setShow(null);
      // 用户反馈（2026-10-23）：弹窗太快一个接一个会眼花 → 每个弹窗之后停 0.6 秒再出下一个
      if (popped && queue.current.length && !skip.current && !reduced()) await sleep(600 * FACTOR[getSpeed()]);
    }
    // 播放完：对齐服务器的真实状态
    const r = latest.current.race;
    shownRef.current = r ? fromRace(r.tokens) : null;
    setShown(null);
    running.current = false;
    setBusy(false);
  }

  // 服务器的新状态刚到、动画还没开始的那一瞬间，也继续显示旧位置（否则会先闪一下终点位置）
  const unplayed = seenLen !== null && view.log.length > seenLen;
  const frozen = shown ?? (running.current || unplayed ? shownRef.current : null);
  return {
    busy: busy || unplayed,
    show,
    moving,
    shown: frozen,
    floats,
    link,
    spot,
    hit,
    shake,
    target,
    skip: () => {
      skip.current = true;
      [...wakers.current].forEach((f) => f());
    },
  };
}

export type { Fx };
