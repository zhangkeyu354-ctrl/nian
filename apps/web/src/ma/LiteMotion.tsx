import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { DiceHandle } from "./dice3d.ts";
import { motionMs, reduced } from "./motion-clock.ts";
import { diePose, skillFlightFrames } from "./lite-motion.ts";
import { ART, PLAYER_COLORS } from "./Track.tsx";
import { dicePaintColors } from "./dice-paint-colors.ts";

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

/** 备用的 CSS 骰子（3D 引擎加载中或设备不支持 WebGL 时使用）：面和点都用 CSS 画，带倒角、高光和落地阴影；落定面只取服务器结果。 */
function CssCubeDie({
  value,
  rolling,
  seat,
}: {
  value: number;
  rolling: boolean;
  seat: number;
}) {
  const pose = diePose(value);
  const color = PLAYER_COLORS[(Math.max(1, seat) - 1) % PLAYER_COLORS.length];
  const paint = dicePaintColors(color);
  return (
    <div
      className={"ma-bigdie ma-cube-scene" + (rolling ? " rolling" : " landed")}
      role="img"
      aria-label={rolling ? "骰子转动中" : `${value} 点`}
      data-value={rolling ? undefined : value}
      style={{
        ["--die-color" as string]: color,
        ["--paint-a" as string]: paint[0],
        ["--paint-b" as string]: paint[1],
        ["--paint-c" as string]: paint[2],
      }}
    >
      <i className="ma-die-floor" aria-hidden="true" />
      <div className="ma-die-hop">
        <div
          className="ma-cube"
          style={{
            ["--ma-die-x" as string]: `${pose.x}deg`,
            ["--ma-die-y" as string]: `${pose.y}deg`,
          }}
        >
          <i className="ma-die-core x" aria-hidden="true" />
          <i className="ma-die-core y" aria-hidden="true" />
          <i className="ma-die-core z" aria-hidden="true" />
          {[1, 2, 3, 4, 5, 6].map((face) => (
            <span
              key={face}
              className={"ma-die-face face-" + face}
              data-pips={face}
              aria-hidden="true"
            >
              {PIPS[face].map((cell) => (
                <b key={cell} style={{ gridArea: `c${cell}` }} />
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

let dice3d: Promise<typeof import("./dice3d.ts")> | null = null;
const loadDice = () =>
  (dice3d ??= import("./dice3d.ts").catch((error) => {
    dice3d = null;
    throw error;
  }));
// 进入游戏后空闲时提前加载 3D 骰子，第一次掷骰就是 3D 版
if (typeof window !== "undefined")
  setTimeout(() => void loadDice().catch(() => {}), 2500);

/** 骰子：优先用真 3D（three.js），不可用时退回 CSS 版。点数只取服务器结果。 */
export function CubeDie({
  value,
  rolling,
  seat,
  animationWeight = 1,
}: {
  value: number;
  rolling: boolean;
  seat: number;
  animationWeight?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<DiceHandle | null>(null);
  const [readyColor, setReadyColor] = useState<string | null>(null);
  const [failedColor, setFailedColor] = useState<string | null>(null);
  const color = PLAYER_COLORS[(Math.max(1, seat) - 1) % PLAYER_COLORS.length];
  const ready = readyColor === color && failedColor !== color;
  const [clockVersion, setClockVersion] = useState(0);
  const current = useRef({ value, rolling, animationWeight });
  current.current = { value, rolling, animationWeight };
  const sync = () =>
    handle.current?.setState(
      current.current.value,
      current.current.rolling,
      motionMs(620, current.current.animationWeight),
      reduced(),
      motionMs(750, current.current.animationWeight),
    );
  useEffect(() => {
    let alive = true;
    const node = canvas.current;
    const lost = (e: Event) => {
      e.preventDefault();
      if (!alive) return;
      setReadyColor(null);
      setFailedColor(color);
      handle.current?.dispose();
      handle.current = null;
    };
    node?.addEventListener("webglcontextlost", lost);
    loadDice()
      .then((m) => {
        if (!alive || !node) return;
        handle.current = m.createDice(node, color);
        sync();
        setFailedColor(null);
        setReadyColor(color);
      })
      .catch(() => {
        if (alive) {
          setReadyColor(null);
          setFailedColor(color);
        }
      });
    return () => {
      alive = false;
      node?.removeEventListener("webglcontextlost", lost);
      handle.current?.dispose();
      handle.current = null;
    };
  }, [color]);
  useEffect(() => {
    sync();
  }, [value, rolling, ready, animationWeight, clockVersion]);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      sync();
      setClockVersion((v) => v + 1);
    };
    query.addEventListener?.("change", changed);
    window.addEventListener("ma-motion-speed", changed);
    window.addEventListener("storage", changed);
    return () => {
      query.removeEventListener?.("change", changed);
      window.removeEventListener("ma-motion-speed", changed);
      window.removeEventListener("storage", changed);
    };
  }, []);
  return (
    <div
      className={
        "ma-bigdie ma-dice3d" +
        (rolling ? " rolling" : " landed") +
        (ready ? " is-ready" : "") +
        (!rolling && value === 6 ? " is-six" : "")
      }
      role="img"
      aria-label={rolling ? "骰子转动中" : `${value} 点`}
      data-value={rolling ? undefined : value}
      data-renderer={ready ? "webgl" : "css"}
      style={{
        ["--ma-dice-ms" as string]: `${motionMs(750, animationWeight)}ms`,
        ["--ma-dice-settle-ms" as string]: `${motionMs(620, animationWeight)}ms`,
      }}
    >
      <canvas
        key={color}
        ref={canvas}
        aria-hidden="true"
        style={{ opacity: ready ? 1 : 0 }}
      />
      <div className="ma-dice3d-wait" aria-hidden="true">
        <CssCubeDie value={value} rolling={rolling} seat={seat} />
      </div>
    </div>
  );
}

export const HandDie = memo(function HandDie({
  holding,
}: {
  holding: boolean;
}) {
  return (
    <span className="ma-hand-die">
      <CssCubeDie value={1} rolling={holding} seat={1} />
    </span>
  );
});

export function FlyingSkill({
  racer,
  duration,
  children,
}: {
  racer: string;
  duration: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || reduced() || duration <= 0 || !node.animate) return;
    const pawn = document.querySelector<HTMLElement>(
      `[data-ma-racer="${racer}"]`,
    );
    const r = node.getBoundingClientRect(),
      p = pawn?.getBoundingClientRect();
    const origin = {
      x: Math.max(
        24,
        Math.min(innerWidth - 24, p ? p.left + p.width / 2 : innerWidth / 2),
      ),
      y: Math.max(
        24,
        Math.min(
          innerHeight - 24,
          p ? p.top + p.height / 2 : innerHeight * 0.8,
        ),
      ),
    };
    const animation = node.animate(
      skillFlightFrames(origin, {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      }),
      { duration, easing: "cubic-bezier(.2,.7,.25,1)" },
    );
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (query.matches) animation.cancel();
    };
    query.addEventListener?.("change", stop);
    return () => {
      animation.cancel();
      query.removeEventListener?.("change", stop);
    };
  }, [racer, duration]);
  return (
    <div ref={ref} className="ma-skill-flight">
      {children}
    </div>
  );
}

export const RollingScore = memo(function RollingScore({
  value,
}: {
  value: number;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    previous = useRef(value);
  useLayoutEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (reduced()) return;
    const nodes = ref.current?.children;
    if (!nodes) return;
    const options = {
      duration: motionMs(240),
      easing: "cubic-bezier(.2,.7,.25,1)",
    };
    const old = (nodes[0] as HTMLElement).animate?.(
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: "translateY(-100%)", opacity: 0 },
      ],
      options,
    );
    const next = (nodes[1] as HTMLElement).animate?.(
      [
        { transform: "translateY(100%)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      options,
    );
    return () => {
      old?.cancel();
      next?.cancel();
    };
  }, [value]);
  return (
    <span ref={ref} className="ma-score-roll">
      <span className="ma-score-before" aria-hidden="true">
        {previous.current}
      </span>
      <span>{value}</span>
    </span>
  );
});

export function useWindowFade(
  ref: React.RefObject<HTMLDivElement | null>,
  duration: number,
) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node?.animate || duration <= 0 || reduced()) return;
    const edge = Math.min(0.2, motionMs(120) / duration);
    const animation = node.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: edge },
        { opacity: 1, offset: 1 - edge },
        { opacity: 0, offset: 1 },
      ],
      { duration, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [duration]);
}
