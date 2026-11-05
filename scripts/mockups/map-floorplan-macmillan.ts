/**
 * 地图改版效果图：麦克米伦庄园「房间拼合 + 色边门洞」整张样品。
 * 只生成截图，不改游戏代码。用真实的房间卡（克隆棋盘 SVG），保留 2.5D 倾斜。
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { startUI, drainUI } from "../hotseat-driver.ts";
const SP = process.env.OUT ?? "/tmp/claude-0/-home-claude/0a870597-12c0-57a6-95e3-7ad188679444/scratchpad/";
const r = JSON.parse(readFileSync(`docs/phase1/games/1701.replay.json`, "utf8"));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(process.env.W ?? 1200), height: Number(process.env.H ?? 1100) }, deviceScaleFactor: 2 });
await p.addInitScript("window.__name = (f) => f;");
await startUI(p, r.options);
await drainUI(p);
await p.evaluate(() => {
  const NS = "http://www.w3.org/2000/svg";
  const orig = document.querySelector('[data-testid="board"]') as SVGSVGElement;
  const svg = orig.cloneNode(true) as SVGSVGElement;
  svg.removeAttribute("data-testid"); svg.removeAttribute("data-full"); svg.setAttribute("data-zoom", "near");
  orig.style.display = "none"; orig.parentElement!.appendChild(svg);
  const G = 28;
  // 房间：左上角 L,T + 缩放 s（卡片 260×200，原点在卡片 (130,82)）
  const R: Record<string, [number, number, number]> = {
    mine_depths: [0, -190, 0.95], mine_entrance: [275, -200, 1.0], foundry_upper_floor: [563, -240, 1.2], coal_tower_upper: [903, -200, 1.0],
    ancient_tree: [100, G, 1.15], foundry_lower_floor: [427, G, 1.35], coal_tower_ground: [806, G, 1.1],
    shack: [0, 286, 1.0], scrapyard: [288, 326, 1.0], foundry_basement: [576, 326, 0.9], backlot: [838, 276, 1.15],
  };

  const box = (id: string) => { const [L, T, s] = R[id]; return { L, T, R: L + 260 * s, B: T + 200 * s, s }; };
  for (const el of [...svg.children]) {
    const id = el.getAttribute("data-room-container");
    if (el.tagName === "defs") continue;
    if (id && R[id]) { const [L, T, s] = R[id]; el.setAttribute("transform", `translate(${L + 130 * s} ${T + 82 * s}) scale(${s})`); continue; }
    if ((el as Element).getAttribute("fill") === "url(#board-floor)") continue;
    (el as SVGElement).style.display = "none";
  }
  svg.querySelectorAll("[data-actor], [data-spawn]").forEach((e) => ((e as SVGElement).style.display = "none"));
  for (const id of Object.keys(R)) {
    const g = svg.querySelector(`[data-room-container="${id}"]`)!;
    const main = g.querySelector("[data-room] > rect")!;
    main.setAttribute("stroke", "#6b5a3e"); main.setAttribute("stroke-width", "5");
    (g.querySelectorAll(".room-extrude rect")[1] as Element | undefined)?.setAttribute("fill", "#3a3026");
    g.querySelectorAll('rect[height="33"]').forEach((t) => { t.setAttribute("fill", "#1c1813"); t.setAttribute("opacity", ".88"); });
    g.querySelectorAll(".room-label").forEach((t) => { const st = (t as SVGElement).style; st.setProperty("fill", "#f1e4c2", "important"); st.setProperty("stroke", "#000", "important"); st.setProperty("stroke-width", "3px", "important"); st.setProperty("paint-order", "stroke"); });
  }
  const C: Record<string, string> = { red: "#ff3b30", blue: "#33a8ff", green: "#34d058", yellow: "#ffd23a" };
  const route = (rid: string, x: number, y: number, sc = 1.05) => {
    const bd = svg.querySelector(`[data-route-icon="${rid}"]`)?.cloneNode(true) as SVGGElement | undefined;
    if (!bd) return "";
    bd.style.display = ""; bd.setAttribute("transform", `translate(${x} ${y}) scale(${sc})`); return bd.outerHTML;
  };
  const wallImg = (x: number, y: number) => `<image href="/assets/mobile/wall.webp" x="${x - 22}" y="${y - 22}" width="44" height="44"/>`;
  const arrow = (x: number, y: number, dx: number, dy: number, c: string) => {
    const a = Math.atan2(dy, dx) * 180 / Math.PI;
    return `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M-8 -15 L14 0 L-8 15 L-2 0 Z" fill="${c}" stroke="#120d08" stroke-width="3" stroke-linejoin="round"/></g>`;
  };
  let html = `<defs>
    <filter id="brush" filterUnits="userSpaceOnUse" x="-500" y="-560" width="2200" height="1600"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="3" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.25" result="ga"/><feComposite in="d" in2="ga" operator="in"/></filter>
    <filter id="glow" filterUnits="userSpaceOnUse" x="-500" y="-560" width="2200" height="1600"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="dirt" filterUnits="userSpaceOnUse" x="-500" y="-560" width="2200" height="1600"><feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="12" result="d"/><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 .10  0 0 0 0 .08  0 0 0 0 .06  0 0 0 .55 0" result="tc"/><feComposite in="tc" in2="d" operator="in" result="tex"/><feMerge><feMergeNode in="d"/><feMergeNode in="tex"/></feMerge></filter>
    <linearGradient id="doorDark" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".95"/><stop offset="1" stop-color="#0b0d0e" stop-opacity=".85"/></linearGradient>
  </defs>`;
  // ---------- 小路（连不到一起的路线）：泥石小道 + 两侧手涂色边 ----------
  const paths: Array<{ pts: number[][]; col: string; rid: string; icon: number[]; wall?: number[]; arrow?: number[] }> = [];
  const md = box("mine_depths"), sh = box("shack"), cu = box("coal_tower_upper"), bl = box("backlot"), fl = box("foundry_lower_floor"), fb = box("foundry_basement");
  paths.push({ pts: [[50, md.B], [50, sh.T]], col: "blue", rid: "mm_p05", icon: [50, (md.B + sh.T) / 2 - 40], wall: [50, (md.B + sh.T) / 2 + 40] });
  const y1 = Math.max(sh.B, fb.B, bl.B) + 56, y2 = y1 + 74;
  paths.push({ pts: [[sh.L + 90, sh.B], [sh.L + 90, y1], [fb.L + 117, y1], [fb.L + 117, fb.B]], col: "green", rid: "mm_p21", icon: [(sh.L + fb.L + 207) / 2, y1], wall: [(sh.L + fb.L + 207) / 2 + 60, y1] });
  paths.push({ pts: [[sh.L + 190, sh.B], [sh.L + 190, y2], [bl.L + 150, y2], [bl.L + 150, bl.B]], col: "yellow", rid: "mm_p22", icon: [(sh.L + bl.L + 340) / 2, y2], wall: [(sh.L + bl.L + 340) / 2 + 60, y2], arrow: [bl.L + 150, bl.B + 34, 0, -1] });
  paths.push({ pts: [[cu.R, cu.T + 100], [cu.R + 70, cu.T + 100], [cu.R + 70, bl.T + 130], [bl.R, bl.T + 130]], col: "yellow", rid: "mm_p12", icon: [cu.R + 70, (cu.T + bl.T) / 2 + 160], arrow: [bl.R + 34, bl.T + 130, -1, 0] });
  paths.push({ pts: [[fl.R, fl.B - 40], [bl.L + 40, fl.B - 40], [bl.L + 40, bl.T]], col: "green", rid: "mm_p19", icon: [(fl.R + bl.L + 40) / 2 + 10, fl.B - 40] });
  for (const pa of paths) {
    const d = "M" + pa.pts.map((q) => q.join(",")).join(" L");
    html += `<path d="${d}" fill="none" stroke="${C[pa.col]}" stroke-width="62" stroke-linejoin="round" stroke-linecap="butt" opacity=".9" filter="url(#brush)"/>`;
    html += `<path d="${d}" fill="none" stroke="${C[pa.col]}" stroke-width="76" stroke-linejoin="round" opacity=".1" filter="url(#glow)"/>`;
    html += `<path d="${d}" fill="none" stroke="#3b3226" stroke-width="44" stroke-linejoin="round" stroke-linecap="butt" filter="url(#dirt)"/>`;
    html += `<path d="${d}" fill="none" stroke="#5a4c38" stroke-width="16" stroke-dasharray="3 22" stroke-linecap="round" opacity=".7"/>`;
  }
  // ---------- 门：两个相邻房间之间 ----------
  type Door = [string, string, string, string, number?, number?, string?];
  const doors: Door[] = [
    ["mine_depths", "mine_entrance", "red", "mm_p01"],
    ["foundry_upper_floor", "mine_entrance", "yellow", "mm_p02", 0, 1, "foundry_upper_floor"],
    ["mine_depths", "ancient_tree", "green", "mm_p03"],
    ["mine_entrance", "ancient_tree", "blue", "mm_p04"],
    ["mine_entrance", "foundry_lower_floor", "green", "mm_p06"],
    ["foundry_upper_floor", "foundry_lower_floor", "blue", "mm_p07"],
    ["foundry_upper_floor", "coal_tower_ground", "red", "mm_p08"],
    ["foundry_upper_floor", "coal_tower_upper", "green", "mm_p09"],
    ["coal_tower_upper", "coal_tower_ground", "blue", "mm_p10"],
    ["coal_tower_ground", "foundry_lower_floor", "yellow", "mm_p11", 0, 1, "coal_tower_ground"],
    ["coal_tower_ground", "backlot", "red", "mm_p13"],
    ["foundry_lower_floor", "scrapyard", "red", "mm_p14"],
    ["ancient_tree", "scrapyard", "blue", "mm_p15"],
    ["ancient_tree", "shack", "red", "mm_p16"],
    ["scrapyard", "shack", "green", "mm_p17"],
    ["foundry_lower_floor", "foundry_basement", "blue", "mm_p18"],
    ["foundry_basement", "backlot", "green", "mm_p20"],
  ];

  const walls = new Set(["mm_p11"]);
  for (const [a, bb, col, rid, f0 = 0, f1 = 1, from] of doors) {
    const A = box(a), B = box(bb), c = C[col];
    let horiz: boolean, cx: number, cy: number, span: number, gap: number, e1: number, e2: number;
    const ox0 = Math.max(A.L, B.L), ox1 = Math.min(A.R, B.R), oy0 = Math.max(A.T, B.T), oy1 = Math.min(A.B, B.B);
    if (ox1 - ox0 > oy1 - oy0) { // 上下相邻：横向门
      horiz = true; const top = A.B <= B.T ? A : B, bot = top === A ? B : A;
      e1 = top.B; e2 = bot.T; gap = e2 - e1; const s0 = ox0 + (ox1 - ox0) * f0, s1 = ox0 + (ox1 - ox0) * f1;
      span = Math.min(140, (s1 - s0) * 0.8); cx = (s0 + s1) / 2; cy = (e1 + e2) / 2;
    } else {
      horiz = false; const lf = A.R <= B.L ? A : B, rt = lf === A ? B : A;
      e1 = lf.R; e2 = rt.L; gap = e2 - e1; const s0 = oy0 + (oy1 - oy0) * f0, s1 = oy0 + (oy1 - oy0) * f1;
      span = Math.min(140, (s1 - s0) * 0.8); cy = (s0 + s1) / 2; cx = (e1 + e2) / 2;
    }
    const half = span / 2;
    html += `<ellipse cx="${cx}" cy="${cy}" rx="${horiz ? half * 1.5 : 60 + gap / 2}" ry="${horiz ? 50 + gap / 2 : half * 1.4}" fill="${c}" opacity=".12" filter="url(#glow)" style="mix-blend-mode:screen"/>`;
    if (horiz) {
      for (const y of [e1 + 4, e2 - 4]) html += `<path d="M${cx - half - 12} ${y} L${cx + half + 12} ${y}" stroke="${c}" stroke-width="13" stroke-linecap="round" filter="url(#brush)"/>`;
      html += `<rect x="${cx - half}" y="${e1 + 10}" width="${span}" height="${Math.max(14, gap - 20)}" rx="3" fill="url(#doorDark)" stroke="${c}" stroke-opacity=".5" stroke-width="2"/>`;
    } else {
      for (const x of [e1 + 4, e2 - 4]) html += `<path d="M${x} ${cy - half - 12} L${x} ${cy + half + 12}" stroke="${c}" stroke-width="12" stroke-linecap="round" filter="url(#brush)"/>`;
      html += `<rect x="${e1 + 10}" y="${cy - half}" width="${Math.max(10, gap - 20)}" height="${span}" rx="3" fill="url(#doorDark)" stroke="${c}" stroke-opacity=".5" stroke-width="2"/>`;
    }
    html += route(rid, cx, cy);
    if (from) {
      const F = box(from), fx = (F.L + F.R) / 2, fy = (F.T + F.B) / 2;
      const dx = horiz ? 0 : Math.sign(cx - fx), dy = horiz ? Math.sign(cy - fy) : 0;
      html += arrow(cx + (horiz ? 44 : dx * 0) + (horiz ? 0 : 0), cy + (horiz ? 0 : 40), dx || 0.0001, dy, c);
    }
    if (walls.has(rid)) html += wallImg(cx + (horiz ? 46 : 0), cy + (horiz ? 0 : 46));
  }
  for (const pa of paths) {
    if (pa.rid) html += route(pa.rid, pa.icon[0], pa.icon[1]);
    if (pa.wall) html += wallImg(pa.wall[0], pa.wall[1]);
    if (pa.arrow) html += arrow(pa.arrow[0], pa.arrow[1], pa.arrow[2], pa.arrow[3], C[pa.col]);
  }
  const layer = document.createElementNS(NS, "g");
  layer.innerHTML = html;
  // 小路放在房间下面，门放在房间上面
  const firstRoom = svg.querySelector("[data-room-container]")!;
  const under = document.createElementNS(NS, "g"); const over = document.createElementNS(NS, "g");
  const tmp = document.createElementNS(NS, "g"); tmp.innerHTML = html;
  // 简单起见：defs + 小路在下，其余在上
  const kids = [...tmp.childNodes];
  for (const k of kids) { const el = k as Element; const isPath = el.tagName === "path" && (el.getAttribute("stroke-width") === "62" || el.getAttribute("stroke-width") === "80" || el.getAttribute("stroke-width") === "44" || el.getAttribute("stroke-width") === "16"); (el.tagName === "defs" || isPath ? under : over).appendChild(el); }
  svg.insertBefore(under, firstRoom); svg.appendChild(over);
  svg.setAttribute("viewBox", "-110 -290 1400 1050");
  document.documentElement.dataset.tilt = "on";
  document.querySelectorAll(".action-callouts,.major-notice,.phone-latest,.zoom-controls").forEach((e) => ((e as HTMLElement).style.display = "none"));
});
await p.waitForTimeout(800);
await p.locator(".map-viewport").screenshot({ path: SP + "map_macmillan.png" });
await b.close();
