import React, { createContext, useEffect, useRef, useState } from "react";
import {
  racerName,
  type MAView,
} from "../../../../packages/magical-athlete/src/index.ts";
import type { Show } from "./playback.ts";
import { CubeDie } from "./LiteMotion.tsx";
import { PLAYER_COLORS } from "./Track.tsx";
import { motionMs } from "./motion-clock.ts";

export type DiceShow = Extract<Show, { kind: "roll" | "duel" }>;
export const DiceReadyContext = createContext(true);
/** Two persistent GPU canvases are prepared while players choose their racers.
 * Seat/face changes update uniforms and poses; they never recreate the renderer. */
export function DiceStage({
  show,
  view,
  name,
  colorOf,
  me,
  onSkip,
  onPrepared,
}: {
  show: DiceShow | null;
  view: MAView;
  name: (id: string) => string;
  colorOf: (id: string) => string;
  me: string | null;
  onSkip: () => void;
  onPrepared?: () => void;
}) {
  const prepared = useRef([false, false]);
  const [visibleReady, setVisibleReady] = useState(false);
  const ready = (i: number) => {
    prepared.current[i] = true;
    if (prepared.current.every(Boolean)) {
      setVisibleReady(true);
      onPrepared?.();
    }
  };
  // 保险：骰子资源万一加载太久，4 秒后照样放开掷骰按钮（会用备用骰子）
  useEffect(() => {
    const t = setTimeout(() => {
      prepared.current = [true, true];
      setVisibleReady(true);
      onPrepared?.();
    }, 4000);
    return () => clearTimeout(t);
  }, []);
  const duel = show?.kind === "duel",
    rolling = show?.rolling ?? false;
  const owner = (racer: string) =>
    view.race?.tokens.find((t) => t.racer === racer)?.owner ?? view.seats[0];
  const first =
    show?.kind === "roll"
      ? { player: show.player, value: show.value, racer: show.racer }
      : show?.kind === "duel"
        ? {
            player: owner(show.a.racer),
            value: show.a.value,
            racer: show.a.racer,
          }
        : { player: view.seats[0], value: 1, racer: "banana" };
  const second =
    show?.kind === "duel"
      ? {
          player: owner(show.b.racer),
          value: show.b.value,
          racer: show.b.racer,
        }
      : { player: view.seats[1], value: 1, racer: "banana" };
  const seat = (id: string) => Math.max(0, view.seats.indexOf(id)) + 1;
  const base = rolling ? 750 : duel ? 1300 : 1500;
  const weight =
    show?.duration === undefined ? 1 : show.duration / (motionMs(base) || 1);
  return (
    <div
      className={show ? "ma-overlay ov-" + show.kind : "ma-dice-standby"}
      aria-hidden={!show || undefined}
      role={show ? "status" : undefined}
      aria-live={show ? "polite" : undefined}
      data-dice-prepared={visibleReady ? "true" : "false"}
      onClick={show ? onSkip : undefined}
      title={show ? "点一下跳过动画" : undefined}
    >
      <div
        className="ma-ov-roll"
        style={{
          ["--ma-dice-weight" as string]: weight,
          visibility: visibleReady ? undefined : "hidden",
        }}
      >
        <p>
          {duel ? (
            "⚔️ 决斗！"
          ) : show?.kind === "roll" ? (
            <>
              <span
                className="ma-dot"
                style={{ background: colorOf(first.player) }}
              />
              {first.player === me ? "你" : name(first.player)} 为{" "}
              {racerName(first.racer)}
              {show.reroll ? " 重掷" : " 掷骰"}
            </>
          ) : null}
        </p>
        <div className={duel ? "ma-duel" : "ma-single-die"}>
          <div>
            <CubeDie
              value={first.value}
              rolling={rolling}
              seat={seat(first.player)}
              animationWeight={weight}
              onReady={() => ready(0)}
            />
            <small hidden={!duel}>{racerName(first.racer)}</small>
          </div>
          <div className={duel ? undefined : "ma-dice-spare"}>
            <CubeDie
              value={second.value}
              rolling={duel && rolling}
              seat={seat(second.player)}
              animationWeight={weight}
              onReady={() => ready(1)}
            />
            <small hidden={!duel}>{racerName(second.racer)}</small>
          </div>
        </div>
        {show && !rolling && (
          <p className="ma-ov-big">
            {duel ? `${first.value} : ${second.value}` : `掷出 ${first.value}`}
          </p>
        )}
      </div>
      {show && !visibleReady && <p className="ma-dice-loading">准备骰子…</p>}
      {show && <span className="ma-ov-skip">点屏幕跳过动画</span>}
    </div>
  );
}
