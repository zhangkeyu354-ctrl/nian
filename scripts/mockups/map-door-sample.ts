import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { startUI, drainUI } from "../hotseat-driver.ts";
const SP = "/tmp/claude-0/-home-claude/0a870597-12c0-57a6-95e3-7ad188679444/scratchpad/";
const r = JSON.parse(readFileSync(`docs/phase1/games/4111.replay.json`, "utf8"));
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(process.env.W ?? 1100), height: Number(process.env.H ?? 900) }, deviceScaleFactor: 2 });
await startUI(p, r.options); await drainUI(p);
await p.evaluate(() => {
  const orig = document.querySelector('[data-testid="board"]') as SVGSVGElement;
  const svg = orig.cloneNode(true) as SVGSVGElement;
  svg.removeAttribute("data-testid"); svg.removeAttribute("data-full"); svg.setAttribute("data-zoom", "near");
  orig.style.display = "none";
  orig.parentElement!.appendChild(svg);
  const NS = "http://www.w3.org/2000/svg";
  const keep: Record<string, [number, number]> = { maze: [0, 0], diner: [-142, 244], main_garage: [142, 244] };
  for (const el of [...svg.children]) {
    const id = el.getAttribute("data-room-container");
    if (el.tagName === "defs" || el.classList.contains("board-fx")) continue;
    if (id && keep[id]) { (el as SVGGElement).setAttribute("transform", `translate(${keep[id][0]} ${keep[id][1]})`); continue; }
    (el as SVGElement).style.display = "none";
  }
  // 去掉房间各自的彩色边框/标题条：统一成旧木框 + 深色铭牌
  for (const id of Object.keys(keep)) {
    const g = svg.querySelector(`[data-room-container="${id}"]`)!;
    const main = g.querySelector("[data-room] > rect") as SVGRectElement;
    main.setAttribute("stroke", "#6b5a3e"); main.setAttribute("stroke-width", "5");
    const wall = g.querySelectorAll(".room-extrude rect")[1] as SVGRectElement | undefined; wall?.setAttribute("fill", "#3a3026");
    g.querySelectorAll('rect[height="33"]').forEach((t) => { t.setAttribute("fill", "#1c1813"); t.setAttribute("opacity", ".88"); });
    g.querySelectorAll(".room-label").forEach((t) => { (t as SVGElement).style.setProperty("fill", "#f1e4c2", "important"); (t as SVGElement).style.setProperty("stroke", "#000", "important"); (t as SVGElement).style.setProperty("paint-order", "stroke"); (t as SVGElement).style.setProperty("stroke-width", "3px", "important"); });
  }
  // hide tokens & spawn so the sample stays clean
  svg.querySelectorAll("[data-actor], [data-spawn]").forEach((e) => ((e as SVGElement).style.display = "none"));
  const C: Record<string, string> = { red: "#ff3b30", blue: "#33a8ff", green: "#34d058", yellow: "#ffd23a" };
  const defs = document.createElementNS(NS, "g");
  defs.innerHTML = `<defs>
    <filter id="brush" filterUnits="userSpaceOnUse" x="-600" y="-400" width="1200" height="1000"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="3" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.25" result="ga"/><feComposite in="d" in2="ga" operator="in"/></filter>
    <filter id="glow" filterUnits="userSpaceOnUse" x="-600" y="-400" width="1200" height="1000"><feGaussianBlur stdDeviation="10"/></filter>
    <linearGradient id="doorDark" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".95"/><stop offset="1" stop-color="#0b0d0e" stop-opacity=".85"/></linearGradient>
  </defs>`;
  svg.appendChild(defs);
  const doors = document.createElementNS(NS, "g");
  // door(kind, cx, cy, span, color, routeId)
  const list: Array<[string, number, number, number, string, string]> = [
    ["h", -71, 138, 96, "green", "ah_p02"], ["h", 71, 138, 96, "blue", "ah_p08"], ["v", 0, 262, 120, "red", "ah_p07"],
  ];
  let html = "";
  for (const [k, cx, cy, span, col, rid] of list) {
    const c = C[col];
    const horiz = k === "h";
    const w = horiz ? span : 30, h = horiz ? 44 : span;
    // light spill into both rooms
    html += `<ellipse cx="${cx}" cy="${cy}" rx="${horiz ? span * 0.75 : 70}" ry="${horiz ? 60 : span * 0.7}" fill="${c}" opacity=".32" filter="url(#glow)" style="mix-blend-mode:screen"/>`;
    // painted edge on both rooms (the user's "厚涂"线)
    if (horiz) {
      for (const y of [cy - 22, cy + 22]) html += `<path d="M${cx - span / 2 - 14} ${y} L${cx + span / 2 + 14} ${y}" stroke="${c}" stroke-width="13" stroke-linecap="round" filter="url(#brush)"/>`;
    } else {
      for (const x of [cx - 13, cx + 13]) html += `<path d="M${x} ${cy - span / 2 - 14} L${x} ${cy + span / 2 + 14}" stroke="${c}" stroke-width="12" stroke-linecap="round" filter="url(#brush)"/>`;
    }
    // recessed doorway between the two rooms
    html += `<rect x="${cx - w / 2 + 6}" y="${cy - h / 2 + 6}" width="${w - 12}" height="${h - 12}" rx="3" fill="url(#doorDark)"/>`;
    html += `<rect x="${cx - w / 2 + 6}" y="${cy - h / 2 + 6}" width="${w - 12}" height="${h - 12}" rx="3" fill="none" stroke="${c}" stroke-opacity=".55" stroke-width="2"/>`;
    // route medallion: clone the game's own icon
    const badge = svg.querySelector(`[data-route-icon="${rid}"]`)?.cloneNode(true) as SVGGElement | undefined;
    if (badge) { badge.style.display = ""; badge.setAttribute("transform", `translate(${cx} ${cy}) scale(1.05)`); html += badge.outerHTML; }
  }
  doors.innerHTML = html;
  svg.appendChild(doors);
  svg.setAttribute("viewBox", "-330 -140 660 560");
  document.documentElement.dataset.tilt = "on";
  document.querySelectorAll(".action-callouts,.major-notice,.phone-latest,.zoom-controls").forEach((e) => ((e as HTMLElement).style.display = "none"));
});
await p.waitForTimeout(600);
await p.locator(".map-viewport").screenshot({ path: SP + "map_sample.png" });
await b.close();
