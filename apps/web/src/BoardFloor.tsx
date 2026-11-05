import type { FloorLayout } from "./boardLayout.ts";

/**
 * 改版地图的地面层（2026-11-05）：
 * - FloorUnder：连不到一起的路 → 带手涂色边的泥石小路（画在房间下面）
 * - FloorDoors：相邻房间之间 → 两侧手涂色边 + 凹进去的门洞 + 同色透光（画在房间上面、路线图标下面）
 * 纯装饰，不接收点击；路线是否可走、图标、道具仍由原来的路线层负责。
 */
const FILTERS = (
  <defs>
    <filter id="fl-brush" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1940" height="1920">
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="3" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" result="d" />
      <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="3" result="g" />
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.25" result="ga" />
      <feComposite in="d" in2="ga" operator="in" />
    </filter>
    <filter id="fl-glow" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1940" height="1920">
      <feGaussianBlur stdDeviation="10" />
    </filter>
    <filter id="fl-dirt" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1940" height="1920">
      <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" seed="11" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="12" result="d" />
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="t" />
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 .10  0 0 0 0 .08  0 0 0 0 .06  0 0 0 .55 0" result="tc" />
      <feComposite in="tc" in2="d" operator="in" result="tex" />
      <feMerge><feMergeNode in="d" /><feMergeNode in="tex" /></feMerge>
    </filter>
    <linearGradient id="fl-door" x2="0" y2="1">
      <stop offset="0" stopColor="#000" stopOpacity=".95" />
      <stop offset="1" stopColor="#0b0d0e" stopOpacity=".85" />
    </linearGradient>
  </defs>
);

export function FloorUnder({ layout, colors, edges }: { layout: FloorLayout; colors: Record<string, string>; edges: Array<{ id: string; color: string }> }) {
  for (const e of edges) pathColor[e.id] = e.color;
  return (
    <g className="floor-under" pointerEvents="none" aria-hidden="true">
      {FILTERS}
      {layout.corridors.map((c, i) => {
        const d = "M" + c.pts.map((q) => q.join(",")).join(" L");
        const col = colors[colorOf(layout, c.pathId)] ?? "#888";
        return (
          <g key={i} data-corridor={c.pathId}>
            <path d={d} fill="none" stroke={col} strokeWidth="76" strokeLinejoin="round" opacity=".1" filter="url(#fl-glow)" />
            <path d={d} fill="none" stroke={col} strokeWidth="62" strokeLinejoin="round" opacity=".9" filter="url(#fl-brush)" />
            <path d={d} fill="none" stroke="#3b3226" strokeWidth="44" strokeLinejoin="round" filter="url(#fl-dirt)" />
            <path d={d} fill="none" stroke="#5a4c38" strokeWidth="16" strokeDasharray="3 22" strokeLinecap="round" opacity=".7" />
          </g>
        );
      })}
    </g>
  );
}

// 路线颜色：由 Board 传入的 edges 决定；这里给小路用的查找表在 FloorDoors 首次渲染时填好
const pathColor: Record<string, string> = {};
function colorOf(_l: FloorLayout, pathId: string) {
  return pathColor[pathId] ?? "";
}

export function FloorDoors({
  layout,
  colors,
  edges,
  lit,
}: {
  layout: FloorLayout;
  colors: Record<string, string>;
  edges: Array<{ id: string; color: string }>;
  lit: string[];
}) {
  for (const e of edges) pathColor[e.id] = e.color;
  const litSet = new Set(lit);
  const arrow = (x: number, y: number, dx: number, dy: number, c: string, key: string) => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})`}>
      <path d="M-8 -15 L14 0 L-8 15 L-2 0 Z" fill={c} stroke="#120d08" strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
  return (
    <g className="floor-doors" pointerEvents="none" aria-hidden="true">
      {layout.doors.map((d, i) => {
        const c = colors[pathColor[d.pathId]] ?? "#888";
        const on = litSet.has(d.pathId);
        const half = d.span / 2, gap = d.e2 - d.e1;
        const out = [];
        out.push(
          <ellipse
            key="g"
            className={on ? "floor-door-lit" : undefined}
            cx={d.cx}
            cy={d.cy}
            rx={d.horiz ? half * 1.5 : 60 + gap / 2}
            ry={d.horiz ? 50 + gap / 2 : half * 1.4}
            fill={c}
            opacity={on ? 0.45 : 0.12}
            filter="url(#fl-glow)"
          />,
        );
        if (d.horiz) {
          for (const y of [d.e1 + 4, d.e2 - 4])
            out.push(<path key={"e" + y} d={`M${d.cx - half - 12} ${y} L${d.cx + half + 12} ${y}`} stroke={c} strokeWidth="13" strokeLinecap="round" filter="url(#fl-brush)" />);
          out.push(<rect key="r" x={d.cx - half} y={d.e1 + 10} width={d.span} height={Math.max(14, gap - 20)} rx="3" fill="url(#fl-door)" stroke={c} strokeOpacity=".5" strokeWidth="2" />);
        } else {
          for (const x of [d.e1 + 4, d.e2 - 4])
            out.push(<path key={"e" + x} d={`M${x} ${d.cy - half - 12} L${x} ${d.cy + half + 12}`} stroke={c} strokeWidth="12" strokeLinecap="round" filter="url(#fl-brush)" />);
          out.push(<rect key="r" x={d.e1 + 10} y={d.cy - half} width={Math.max(10, gap - 20)} height={d.span} rx="3" fill="url(#fl-door)" stroke={c} strokeOpacity=".5" strokeWidth="2" />);
        }
        if (d.from) {
          const b = layout.boxes[d.from];
          const fx = (b.L + b.R) / 2, fy = (b.T + b.B) / 2;
          const dx = d.horiz ? 0 : Math.sign(d.cx - fx), dy = d.horiz ? Math.sign(d.cy - fy) : 0;
          out.push(arrow(d.cx + (d.horiz ? 44 : 0), d.cy + (d.horiz ? 0 : 40), dx || 0.0001, dy, c, "a"));
        }
        return (
          <g key={i} data-door={d.pathId}>
            {out}
          </g>
        );
      })}
      {layout.corridors.map((c, i) =>
        c.arrow ? arrow(c.arrow[0], c.arrow[1], c.arrow[2], c.arrow[3], colors[pathColor[c.pathId]] ?? "#888", "ca" + i) : null,
      )}
    </g>
  );
}
