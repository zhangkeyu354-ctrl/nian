import { racerName, TRACKS } from "../../../../packages/magical-athlete/src/index.ts";
import type { RaceState } from "../../../../packages/magical-athlete/src/types.ts";

export const PLAYER_COLORS = ["#e8443a", "#2f7fd8", "#f2b705", "#8a4fd6", "#1fa37a", "#f07c1e"];

/** 体育场椭圆跑道：30 格沿跑道排开，起点在下方直道左端，终点线紧接最后一格 */
const W = 360,
  H = 520,
  R = 120, // 弯道半径
  CX = W / 2,
  TOP = 60 + R,
  BOT = H - 60 - R;
const STRAIGHT = BOT - TOP;
const PERIM = 2 * STRAIGHT + 2 * Math.PI * R;

/** 沿跑道的点（t ∈ [0,1)，从右侧直道底部开始逆时针……这里改为从下弯道左侧起点出发顺时针） */
function pointAt(t: number) {
  let d = ((t % 1) + 1) % 1 * PERIM;
  // 左直道（自下而上）
  if (d < STRAIGHT) return { x: CX - R, y: BOT - d, a: -90 };
  d -= STRAIGHT;
  const arc = Math.PI * R;
  if (d < arc) {
    const th = Math.PI + d / R; // 上弯道
    return { x: CX + R * Math.cos(th), y: TOP + R * Math.sin(th), a: (th * 180) / Math.PI + 90 };
  }
  d -= arc;
  if (d < STRAIGHT) return { x: CX + R, y: TOP + d, a: 90 };
  d -= STRAIGHT;
  const th = d / R; // 下弯道
  return { x: CX + R * Math.cos(th), y: BOT + R * Math.sin(th), a: (th * 180) / Math.PI + 90 };
}

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
  const n = track.length;
  // 留出终点线的一小段空隙
  const at = (i: number) => pointAt(0.02 + (i / n) * 0.96);
  const finish = pointAt(0.995);
  const stacks = new Map<number, string[]>();
  for (const t of race.tokens)
    if (t.place === null && !t.out) stacks.set(t.pos, [...(stacks.get(t.pos) ?? []), t.racer]);
  return (
    <svg className="ma-track" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${track.zh}，共 ${n} 格`}>
      <rect className="ma-infield" x={CX - R + 24} y={TOP - R + 24} width={2 * R - 48} height={STRAIGHT + 2 * R - 48} rx={R - 24} />
      <path
        className="ma-lane"
        d={`M ${CX - R} ${BOT} V ${TOP} A ${R} ${R} 0 0 1 ${CX + R} ${TOP} V ${BOT} A ${R} ${R} 0 0 1 ${CX - R} ${BOT} Z`}
      />
      <text className="ma-infield-title" x={CX} y={H / 2 - 8} textAnchor="middle">
        {track.zh}
      </text>
      <text className="ma-infield-sub" x={CX} y={H / 2 + 16} textAnchor="middle">
        第 {race.index + 1} 场
      </text>
      {Array.from({ length: n }, (_, i) => {
        const p = at(i);
        const sp = track.specials[i];
        return (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.a})`}>
            <rect className={"ma-cell" + (i === 0 ? " start" : "")} x={-17} y={-11} width={34} height={22} rx={3} />
            <text className="ma-cell-num" transform={`rotate(${-p.a})`} textAnchor="middle" dy="4">
              {i === 0 ? "起" : i}
            </text>
            {sp && <text className="ma-cell-sp">{sp.kind === "star" ? "★" : sp.kind === "rock" ? "▲" : sp.kind === "arrow" ? (sp.steps > 0 ? "»" : "«") : ""}</text>}
          </g>
        );
      })}
      <g transform={`translate(${finish.x} ${finish.y}) rotate(${finish.a})`}>
        <rect className="ma-finish" x={-26} y={-4} width={52} height={8} />
      </g>
      {[...stacks].map(([pos, racers]) => {
        const p = at(pos);
        return racers.map((rid, k) => {
          const t = race.tokens.find((x) => x.racer === rid)!;
          const off = (k - (racers.length - 1) / 2) * 15;
          // 堆叠的棋子朝跑道内侧排开
          const dx = p.x < CX ? 26 + k * 6 : -26 - k * 6;
          return (
            <g
              key={rid}
              className={"ma-pawn" + (t.owner === me ? " mine" : "") + (race.current === t.owner ? " turn" : "")}
              style={{ transform: `translate(${p.x + dx * 0.9}px, ${p.y + off}px)` }}
            >
              <circle r={13} fill={colorOf(t.owner)} />
              {t.tripped && <circle r={15.5} className="ma-tripped" />}
              <text textAnchor="middle" dy="4.5">
                {racerName(rid).slice(0, 1)}
              </text>
            </g>
          );
        });
      })}
    </svg>
  );
}
