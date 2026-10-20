import React, { useEffect, useRef } from "react";
import { racerName, TRACKS } from "../../../../packages/magical-athlete/src/index.ts";
import type { RaceState } from "../../../../packages/magical-athlete/src/types.ts";
import coords from "../../public/assets/magical-athlete/boards/coordinates.json" with { type: "json" };

export const PLAYER_COLORS = ["#e8443a", "#2f7fd8", "#f2b705", "#8a4fd6", "#1fa37a", "#f07c1e"];
export const ART = "/assets/magical-athlete";

interface Space {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface BoardCoords {
  id: string;
  canvas: [number, number];
  spaces: Space[];
  finish_podium: { x: number; y: number };
  assets: { webp: string; mobile: string };
}
const BOARDS = new Map((coords.boards as unknown as BoardCoords[]).map((b) => [b.id, b]));

/**
 * 原版棋盘（Codex 美术包）+ 格位坐标。棋子用原版透明立绘，脚下垫玩家颜色。
 * 规则一律来自引擎；这里只负责把 tokens[].pos 画到对应格子上。
 */
export function Track({
  race,
  colorOf,
  me,
}: {
  race: RaceState;
  colorOf: (playerId: string) => string;
  me: string | null;
}) {
  const track = TRACKS[race.track];
  const board = BOARDS.get(race.track)!;
  const [w, h] = board.canvas;
  const scroller = useRef<HTMLDivElement>(null);

  // 同格的棋子并排；冲线的站到领奖台
  const groups = new Map<number, string[]>();
  for (const t of race.tokens)
    if (!t.out) {
      const key = t.place !== null ? -1 : t.pos;
      groups.set(key, [...(groups.get(key) ?? []), t.racer]);
    }

  // 手机上棋盘比屏幕宽：自动滚到正在行动的选手附近
  const current = race.tokens.find((t) => t.owner === race.current);
  const focus = current && current.place === null ? board.spaces[current.pos] : null;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !focus || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: focus.x * el.scrollWidth - el.clientWidth / 2, behavior: "smooth" });
  }, [focus?.index, race.current]);

  return (
    <div className="ma-board-scroll" ref={scroller}>
      <div
        className="ma-board-art"
        style={{ aspectRatio: `${w} / ${h}` }}
        role="img"
        aria-label={`${track.zh}，第 ${race.index + 1} 场`}
      >
        <picture>
          <source media="(max-width: 760px)" srcSet={`${ART}/${board.assets.mobile}`} />
          <img src={`${ART}/${board.assets.webp}`} alt="" draggable={false} />
        </picture>
        {[...groups].map(([pos, racers]) => {
          const sp = pos === -1 ? null : board.spaces[pos];
          const cx = sp ? sp.x : board.finish_podium.x;
          const cy = sp ? sp.y : board.finish_podium.y;
          const cellW = board.spaces[1].width;
          return racers.map((rid, k) => {
            const t = race.tokens.find((x) => x.racer === rid)!;
            // 同格多人：横向错开，每人占格宽的一部分
            const spread = Math.min(cellW * 0.42, (cellW * 1.1) / racers.length);
            const dx = (k - (racers.length - 1) / 2) * spread;
            return (
              <div
                key={rid}
                className={
                  "ma-pawn" +
                  (t.owner === me ? " mine" : "") +
                  (race.current === t.owner && !race.over ? " turn" : "") +
                  (t.tripped ? " tripped" : "")
                }
                style={{
                  left: `${(cx + dx) * 100}%`,
                  top: `${cy * 100}%`,
                  ["--pc" as string]: colorOf(t.owner),
                  zIndex: 10 + k,
                }}
                title={`${racerName(rid)}${t.place ? ` · 第 ${t.place} 名` : ` · 第 ${t.pos} 格`}${t.tripped ? " · 摔倒" : ""}`}
              >
                <span className="ma-pawn-base" />
                <img src={`${ART}/tokens/${rid}.png`} alt={racerName(rid)} draggable={false} />
                {t.tripped && <img className="ma-pawn-trip" src={`${ART}/icons/trip.svg`} alt="摔倒" />}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
