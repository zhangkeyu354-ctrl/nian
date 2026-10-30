import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {PawnMotion} from "./PawnMotion.tsx";
import {useRaceCamera} from "./camera.ts";
import type {TravelCue} from "./travel.ts";
import {layoutFloats} from "./float-layout.ts";
import { racerName, TRACKS } from "../../../../packages/magical-athlete/src/index.ts";
import type { RaceState } from "../../../../packages/magical-athlete/src/types.ts";
import type { Special } from "../../../../packages/magical-athlete/src/tracks.ts";
import { racerArtId } from "../../../../packages/magical-athlete/src/second-wind-preview.ts";
import coords from "../../public/assets/magical-athlete/boards/coordinates.json" with { type: "json" };

// 第 7、8 位玩家：粉色、青色（骰子图沿用 1、2 号的样式）
export const PLAYER_COLORS = ["#e8443a", "#2f7fd8", "#f2b705", "#8a4fd6", "#1fa37a", "#f07c1e", "#e05aa8", "#20b2c8"];
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
/** 手机竖屏：把横长棋盘顺时针转 90°，格子变大、上下滑动 */
const VERTICAL_QUERY = "(max-width: 760px) and (orientation: portrait)";
export function useVerticalBoard() {
  const mq = typeof matchMedia === "function" ? matchMedia(VERTICAL_QUERY) : null;
  const [v, setV] = useState(() => !!mq?.matches);
  useEffect(() => {
    if (!mq) return;
    const on = () => setV(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return v;
}

const BOARDS = new Map((coords.boards as unknown as BoardCoords[]).map((b) => [b.id, b]));

/** 手机「清晰棋盘」：5 列，0–14 从左到右、15–29 从右到左（和原版两条长边方向一致，箭头格的箭头方向不会反） */
export const GRID_COLS = 5;
export const GRID_ROWS = 7; // 6 行格子 + 1 行终点领奖台
export function gridCell(pos: number) {
  if (pos <= 14) return { col: pos % 5, row: Math.floor(pos / 5) };
  const q = pos - 15;
  return { col: 4 - (q % 5), row: 3 + Math.floor(q / 5) };
}

type Tok = RaceState["tokens"][number];

/** 同一格多人时：每人的偏移（单位：格宽 / 格高）和缩放 */
function crowd(k: number, n: number): { dx: number; dy: number; scale: number } {
  if (n <= 1) return { dx: 0, dy: 0, scale: 1 };
  if (n === 2) return { dx: (k - 0.5) * 0.46, dy: 0, scale: 0.8 };
  if (n <= 4) return { dx: ((k % 2) - 0.5) * 0.46, dy: (Math.floor(k / 2) - 0.5) * 0.3, scale: 0.64 };
  if (n <= 6) return { dx: ((k % 3) - 1) * 0.3, dy: (Math.floor(k / 3) - 0.5) * 0.3, scale: 0.5 };
  // 7–8 人挤在同一格（起点）：4 列 2 排，再小一点
  return { dx: ((k % 4) - 1.5) * 0.23, dy: (Math.floor(k / 4) - 0.5) * 0.32, scale: 0.42 };
}

/**
 * 赛道。规则一律来自引擎；这里只负责把 tokens[].pos 画到对应格子上。
 * - layout="art"：原版棋盘（Codex 美术包）+ 格位坐标；手机竖屏时整张转成竖版。
 * - layout="grid"：手机用的清晰棋盘——每格从原版棋盘图上裁下来，5 列排开，一屏放得下且格子大。
 */
export function Track({
  race: raceIn,
  colorOf,
  me,
  shown,
  moving = [],
  travel,
  onPawn,
  fit = true,
  layout = "art",
  center,
  floats,
  link,
  spot,
  hit,
  target,
}: {
  race: RaceState;
  colorOf: (playerId: string) => string;
  me: string | null;
  /** 动画中的位置（覆盖服务器状态） */
  shown?: Map<string, { pos: number; tripped: boolean; out: boolean; place: number | null }> | null;
  /** 正在走的选手：镜头跟着它，棋子有走路动画 */
  moving?: string[];
  travel?: Map<string,TravelCue>;
  onPawn?: (racer: string) => void;
  /** 原版棋盘：true 整条赛道缩放到一屏内；false 放大，可滑动 */
  fit?: boolean;
  layout?: "art" | "grid";
  /** 手机竖版原版棋盘：放在赛道中间空白处的操作卡（跟着页面滚动停在屏幕中间） */
  center?: React.ReactNode;
  /** 小人头顶飘字 */
  floats?: Map<string, { id: number; text: string; tone: string }>;
  /** 技能连线：from 的技能影响了 to */
  link?: { id: number; from: string; to: string } | null;
  /** 正在发动技能的选手 */
  spot?: string | null;
  /** 被技能命中的特效 */
  hit?: { id: number; racer: string; kind: string; duration?:number } | null;
  /** 正在走的选手要停的格子 */
  target?: number | null;
}) {
  const race: RaceState = shown
    ? { ...raceIn, tokens: raceIn.tokens.map((t) => ({ ...t, ...(shown.get(t.racer) ?? {}) })) }
    : raceIn;
  const track = TRACKS[race.track];
  const board = BOARDS.get(race.track)!;
  const [w, h] = board.canvas;
  const scroller = useRef<HTMLDivElement>(null);
  const vertical = useVerticalBoard() && layout === "art";
  const surface=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({w:0,h:0});
  useLayoutEffect(()=>{
    const el=surface.current;if(!el)return;
    const read=()=>{const w=el.clientWidth,h=el.clientHeight;setSize(old=>old.w===w&&old.h===h?old:{w,h});};
    read();
    if(typeof ResizeObserver==="undefined"){window.addEventListener("resize",read);return()=>window.removeEventListener("resize",read);}
    const observer=new ResizeObserver(read);observer.observe(el);
    return()=>observer.disconnect();
  },[layout,vertical,race.track,fit]);

  // 同格的棋子分组；冲线的站到领奖台（按名次）
  const groups = new Map<number, string[]>();
  for (const t of race.tokens)
    if (!t.out) {
      const key = t.place !== null ? -1 : t.pos;
      groups.set(key, [...(groups.get(key) ?? []), t.racer]);
    }
  const podium = (groups.get(-1) ?? [])
    .map((r) => race.tokens.find((t) => t.racer === r)!)
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0))
    .map((t) => t.racer);
  if (podium.length) groups.set(-1, podium);

  // 自动滚到正在行动的选手附近（只有原版棋盘放大时需要）
  const followed=useRef<string|null>(null);
  if(moving.length)followed.current=moving[0];
  else if(spot)followed.current=spot;
  else if(!shown)followed.current=null;
  const current = race.tokens.find(t=>t.racer===followed.current) ?? race.tokens.find((t) => t.owner === race.current);

  /** 每个棋子画在哪（相对容器的 0–1 坐标）和缩放 */
  const place = (pos: number, k: number, n: number) => {
    if (layout === "grid") {
      if (pos === -1) {
        // 领奖台一行：奖杯在左，冲线的人按名次往右站
        return { x: 0.36 + k * 0.15, y: (GRID_ROWS - 1 + 0.5) / GRID_ROWS + 0.2 / GRID_ROWS, scale: n > 3 ? 0.75 : 0.9 };
      }
      const { col, row } = gridCell(pos);
      const c = crowd(k, n);
      return {
        x: (col + 0.5 + c.dx) / GRID_COLS,
        // 脚踩在格子中间偏下一点
        y: (row + 0.5 + 0.2 + c.dy) / GRID_ROWS,
        scale: c.scale,
      };
    }
    const sp = pos === -1 ? null : board.spaces[pos];
    const cellW = board.spaces[1].width;
    const cellH = board.spaces[1].height;
    if (!sp) {
      // 原版领奖台：冲线的人在奖杯区上下排开
      return { x: board.finish_podium.x + (k % 2 ? 0.012 : -0.012), y: board.finish_podium.y - 0.1 + k * 0.2, scale: 0.68 };
    }
    const c = crowd(k, n);
    // 竖版时棋盘转了 90°：屏幕上的横向 = 原图的纵向，所以把错开方向对调
    return vertical
      ? { x: sp.x + c.dy * cellW, y: sp.y - c.dx * cellH, scale: c.scale }
      : { x: sp.x + c.dx * cellW, y: sp.y + c.dy * cellH, scale: c.scale };
  };

  const focused=current&&!current.out&&current.place===null?groups.get(current.pos):undefined;
  const focus=current&&focused?place(current.pos,focused.indexOf(current.racer),focused.length):null;
  useRaceCamera(scroller,surface,focus,vertical,layout==="grid");
  const spots = new Map<string, { x: number; y: number }>();
  const pawns = [...groups].flatMap(([pos, racers]) =>
    racers.map((rid, k) => {
      const t: Tok = race.tokens.find((x) => x.racer === rid)!;
      const at = place(pos, k, racers.length);
      spots.set(rid, at);
      const fl = floats?.get(rid);
      // 2.5D：越靠近屏幕下方（竖版是原图越往右）的小人越在前面
      const depth = Math.round((vertical ? at.x : at.y) * 100);
      return (
        <PawnMotion key={rid} pose={{x:at.x*size.w,y:at.y*size.h,pos:t.pos,scale:at.scale,board:`${race.index}:${race.track}:${layout}:${vertical}`,w:size.w,h:size.h}}
          cue={travel?.get(rid)} vertical={vertical} zIndex={10+depth+(spot===rid?300:0)}>
        <div
          className={
            "ma-pawn" +
            (t.owner === me ? " mine" : "") +
            (race.current === t.owner && !race.over ? " turn" : "") +
            (t.tripped ? " tripped" : "") +
            (moving.includes(rid) ? " walking" : "") +
            (fl ? " has-float" : "") +
            (spot === rid ? " spot" : "") +
            (hit?.racer === rid ? " fx-" + hit.kind : "") +
            (link && (link.from === rid || link.to === rid) ? (link.from === rid ? " link-from" : " link-to") : "")
          }
          role={onPawn ? "button" : undefined}
          data-ma-racer={rid}
          onClick={onPawn ? () => onPawn(rid) : undefined}
          style={{
            left: 0,
            top: 0,
            width: size.w*(layout==="grid"?.1:vertical?(fit?.042:.036):.044),
            height: size.w*(layout==="grid"?.1:vertical?(fit?.042:.036):.044)*2,
            ["--pc" as string]: colorOf(t.owner),
            ["--ps" as string]: at.scale,
            ["--ma-impact-ms" as string]: hit?.racer===rid&&hit.duration!==undefined?`${hit.duration}ms`:undefined,
            zIndex: 10 + depth + (spot === rid ? 300 : 0),
          }}
          title={`${racerName(rid)}${t.place ? ` · 第 ${t.place} 名` : ` · 第 ${t.pos} 格`}${t.tripped ? " · 摔倒" : ""}`}
        >
          {t.owner === me && <span className="ma-halo" aria-hidden="true" />}
          {t.owner === me && <span className="ma-me-tag">我</span>}
          {race.hogs?.some((h) => h.rider === rid) && (
            <span className="ma-me-tag" style={{ top: "42%", left: "100%" }} title="持有野猪坐骑">🐗</span>
          )}
          <span className="ma-pawn-base" />
          <img src={`${ART}/tokens/${racerArtId(t)}.png`} alt={racerName(rid)} draggable={false} />
          {t.tripped && <img className="ma-pawn-trip" src={`${ART}/icons/trip.svg`} alt="摔倒" />}
          {hit?.racer === rid && hit.kind === "trip" && (
            <span key={"s" + hit.id} className="ma-dizzy" aria-hidden="true">
              💫
            </span>
          )}
          {hit?.racer === rid && hit.kind === "knock" && <span key={"k" + hit.id} className="ma-impact" aria-hidden="true" />}
        </div></PawnMotion>
      );
    }),
  );

  const screenW=vertical?size.h:size.w,screenH=vertical?size.w:size.h;
  const floatItems=[...(floats??[])].filter(([rid])=>spots.has(rid)).map(([rid,f])=>{
    const at=spots.get(rid)!,token=race.tokens.find(t=>t.racer===rid)!,group=groups.get(token.place!==null?-1:token.pos)??[rid],scale=place(token.place!==null?-1:token.pos,group.indexOf(rid),group.length).scale;
    const figureH=size.w*(layout==="grid"?.1:vertical?(fit?.042:.036):.044)*2*scale;
    return{id:rid,x:(vertical?1-at.y:at.x)*screenW,y:(vertical?at.x:at.y)*screenH-figureH*.9-8,width:Math.min(170,Array.from(f.text).length*14+22)};
  });
  const placedFloats=layoutFloats(floatItems,screenW,screenH);
  const floatLayer=<div className="ma-float-layer" aria-hidden="true">{[...(floats??[])].map(([rid,f])=>{const box=placedFloats.get(rid);if(!box)return null;const x=vertical?box.y:box.x,y=vertical?size.h-box.x:box.y;return <span className="ma-float-anchor" key={rid} style={{transform:`translate3d(${x}px,${y}px,0)${vertical?" rotate(-90deg)":""}`}}><span key={f.id} className={"ma-float "+f.tone} style={{width:box.width}} title={`${racerName(rid)}：${f.text}`}>{f.text}</span></span>;})}</div>;

  const a = link ? spots.get(link.from) : undefined;
  const b = link ? spots.get(link.to) : undefined;
  const linkLayer =
    link && a && b ? (
      <>
        <svg key={link.id} className="ma-link" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path
            d={`M ${a.x * 100} ${a.y * 100} Q ${((a.x + b.x) / 2) * 100} ${Math.min(a.y, b.y) * 100 - 6} ${b.x * 100} ${b.y * 100}`}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span key={"r" + link.id} className="ma-link-ring from" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }} />
        <span key={"t" + link.id} className="ma-link-ring to" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%` }} />
      </>
    ) : null;

  if (layout === "grid") {
    const img = `url(${ART}/${board.assets.webp})`;
    const crop = (cx: number, cy: number, cw: number, ch: number): React.CSSProperties => ({
      backgroundImage: img,
      backgroundSize: `${100 / cw}% ${100 / ch}%`,
      backgroundPosition: `${((cx - cw / 2) / (1 - cw)) * 100}% ${((cy - ch / 2) / (1 - ch)) * 100}%`,
    });
    const active = new Set(race.tokens.filter((t) => !t.out && t.place === null).map((t) => t.pos));
    const fp = board.finish_podium;
    return (
      <div className="ma-board-scroll grid">
        <div
          ref={surface}
          className="ma-grid"
          role="img"
          aria-label={`${track.zh}，第 ${race.index + 1} 场`}
          style={{ aspectRatio: `${GRID_COLS} / ${GRID_ROWS}` }}
        >
          {board.spaces.map((sp) => {
            const { col, row } = gridCell(sp.index);
            const special = track.specials[sp.index];
            return (
              <div
                key={sp.index}
                className={"ma-cell" + (active.has(sp.index) ? " occupied" : "") + (target === sp.index ? " target" : "")}
                style={{
                  left: `${(col / GRID_COLS) * 100}%`,
                  top: `${(row / GRID_ROWS) * 100}%`,
                  width: `${100 / GRID_COLS}%`,
                  height: `${100 / GRID_ROWS}%`,
                }}
              >
                {sp.index === 0 ? (
                  <div className="ma-cell-art start">起点</div>
                ) : (
                  <div className="ma-cell-art" style={crop(sp.x, sp.y, sp.width * 0.97, sp.height * 0.97)} />
                )}
                <span className="ma-cell-no">{sp.index}</span>
                {special && <span className={"ma-cell-tag " + special.kind}>{specialLabel(special)}</span>}
              </div>
            );
          })}
          <div
            className="ma-cell finish"
            style={{ left: 0, top: `${((GRID_ROWS - 1) / GRID_ROWS) * 100}%`, width: "100%", height: `${100 / GRID_ROWS}%` }}
          >
            <div className="ma-cell-art podium">
              <span className="ma-cell-trophy" style={crop(fp.x, 0.5, 0.075, 0.42)} />
              <b>终点 · 领奖台</b>
            </div>
          </div>
          {linkLayer}
          {pawns}
          {floatLayer}
        </div>
      </div>
    );
  }

  const art = (
    <div
      ref={surface}
      className="ma-board-art"
      style={
        vertical
          ? { width: `${(w / h) * 100}%`, aspectRatio: `${w} / ${h}` }
          : fit
            ? { aspectRatio: `${w} / ${h}`, width: `min(100%, calc(var(--ma-board-h) * ${(w / h).toFixed(4)}))`, margin: "0 auto" }
            : { aspectRatio: `${w} / ${h}` }
      }
      role="img"
      aria-label={`${track.zh}，第 ${race.index + 1} 场`}
    >
      {vertical ? (
        // 竖版放大后需要清晰的原图
        <img className="ma-board-img" src={`${ART}/${board.assets.webp}`} alt="" draggable={false} />
      ) : (
        <picture>
          <source media="(max-width: 760px)" srcSet={`${ART}/${board.assets.mobile}`} />
          <img className="ma-board-img" src={`${ART}/${board.assets.webp}`} alt="" draggable={false} />
        </picture>
      )}
      {target !== null && target !== undefined && board.spaces[target] && (
        <span
          className="ma-target-ring"
          style={{
            left: `${board.spaces[target].x * 100}%`,
            top: `${board.spaces[target].y * 100}%`,
            width: `${board.spaces[target].width * 100}%`,
            height: `${board.spaces[target].height * 100}%`,
          }}
        />
      )}
      {linkLayer}
      {pawns}
      {floatLayer}
    </div>
  );
  return (
    <div className={"ma-board-scroll" + (vertical ? " vertical" : "") + (fit ? " fit" : " zoomed")} ref={scroller}>
      {vertical ? (
        <div
          className="ma-board-rot"
          style={{
            aspectRatio: `${h} / ${w}`,
            ...(fit ? { width: `min(100%, calc(var(--ma-board-h) * ${(h / w).toFixed(4)}))` } : {}),
          }}
        >
          {art}
          {center && (
            <div className="ma-center-lane">
              <div className="ma-center-card">{center}</div>
            </div>
          )}
        </div>
      ) : (
        art
      )}
    </div>
  );
}

function specialLabel(sp: Special) {
  if (sp.kind === "star") return "★+1分";
  if (sp.kind === "rock") return "摔倒";
  return sp.steps > 0 ? `前进${sp.steps}` : `后退${-sp.steps}`;
}
