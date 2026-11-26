/** 原创结构层渲染；不含用户照片、原版插画或生成图的逻辑数据。 */
import {
  SECOND_WIND_MAPS,
  type SecondWindMapId,
} from "../packages/magical-athlete/src/second-wind-maps.ts";
import { mkdirSync, writeFileSync } from "node:fs";
const directory = "apps/web/public/assets/magical-athlete/boards/second-wind";
mkdirSync(directory, { recursive: true });
for (const map of Object.values(SECOND_WIND_MAPS)) {
  const center = (i: number) => {
    const s = map.spaces[i];
    return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  };
  const ringColors = [
    ["#db5cbc", "#659fda"],
    ["#e84b32", "#dd65bd"],
    ["#f0d152", "#54a43b"],
    ["#f5dd83", "#faf0c9"],
    ["#e95038", "#68ac45"],
    ["#6bad55", "#60a0d0"],
  ];
  let pipes = "";
  map.warpPairs.forEach(([a, b], i) => {
    const p = center(a),
      q = center(b),
      [outer, inner] = ringColors[i];
    const bend = a < 13 && b < 13 ? 170 : a < 13 ? 180 : 235;
    const d = `M ${p.x} ${p.y} C ${p.x} ${bend}, ${q.x} ${bend}, ${q.x} ${q.y}`;
    pipes += `<path d="${d}" fill="none" stroke="#16161a" stroke-width="22"/><path d="${d}" fill="none" stroke="${outer}" stroke-width="16"/><path d="${d}" fill="none" stroke="${inner}" stroke-width="16" stroke-dasharray="23 23"/>`;
  });
  let rings = "";
  map.warpPairs.forEach(([a, b], i) => {
    for (const n of [a, b]) {
      const p = center(n),
        [a, b] = ringColors[i];
      rings += `<ellipse cx="${p.x}" cy="${p.y}" rx="25" ry="31" fill="${a}" stroke="#292328" stroke-width="3"/><ellipse cx="${p.x}" cy="${p.y}" rx="14" ry="20" fill="${b}" stroke="#292328" stroke-width="3"/>`;
    }
  });
  const rectangles = map.spaces
    .map(
      (s) =>
        `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${s.color}" stroke="#212126" stroke-width="4"/>`,
    )
    .join("");
  const markers =
    map.id === "twisty-twirl"
      ? [5, 10, 15, 20, 25]
          .map((i) => {
            const p = center(i);
            return `<text x="${p.x}" y="${p.y + 12}" fill="${i < 15 ? "#ed492b" : "#6098d2"}" stroke="#222" stroke-width="1" font-size="39" font-weight="900" text-anchor="middle">${i}</text>`;
          })
          .join("")
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420" role="img" aria-label="${map.name}">
 <defs><clipPath id="track"><rect x="26" y="26" width="1148" height="368" rx="44"/></clipPath></defs>
 <rect x="4" y="4" width="1192" height="412" rx="65" fill="#15151b"/>
 <rect x="24" y="24" width="1152" height="372" rx="46" fill="#f5eee0"/>
 <g clip-path="url(#track)">${rectangles}</g>
 <path d="M 32 120 H 1092 V 300 H 32" fill="#17171c" stroke="#f2ecdf" stroke-width="4"/>
 <path d="M 255 279 Q 500 245 1040 275" fill="none" stroke="#de45a3" stroke-width="14"/>
 <text x="665" y="244" text-anchor="middle" fill="#f7f2e8" font-family="Impact,Arial Black,sans-serif" font-size="${map.id === "twisty-twirl" ? 91 : 87}" font-weight="900" letter-spacing="-3">${map.title}</text>
 <text x="134" y="90" text-anchor="middle" fill="#ed492b" stroke="#252128" stroke-width="2" font-family="Arial Black,sans-serif" font-weight="900" font-size="50">START</text>
 <rect x="32" y="136" width="94" height="148" rx="22" fill="#eadbba" stroke="#f5eee0" stroke-width="3"/>
 <path d="M 36 211 H 122" stroke="#29242a" stroke-width="4"/>
 <text x="79" y="190" font-size="42" fill="#a07813" font-weight="900" text-anchor="middle">1</text>
 <text x="79" y="265" font-size="42" fill="#427da8" font-weight="900" text-anchor="middle">2</text>
 ${rings}${pipes}${markers}
 ${map.id === "twisty-twirl" ? '<text x="1130" y="218" text-anchor="middle" fill="#eada31" stroke="#272329" stroke-width="2" font-size="25" font-weight="900" transform="rotate(-10 1130 218)">TWIST</text><path d="M 225 275 q -55 -80 -70 -20 q -10 36 40 17 M 1000 266 q -20 -80 45 -45" fill="none" stroke="#e768b0" stroke-width="11"/>' : ""}
 </svg>`;
  writeFileSync(`${directory}/${map.id}.svg`, svg.replace(/[ \t]+$/gm, ""));
  const debug = svg.replace(
    "</svg>",
    map.spaces
      .map(
        (s) =>
          `<g><rect x="${s.x + 2}" y="${s.y + 2}" width="${s.width - 4}" height="${s.height - 4}" fill="none" stroke="#fff" stroke-width="2"/><text x="${s.x + s.width / 2}" y="${s.y + s.height / 2 + 7}" font-family="Arial" font-size="24" font-weight="900" text-anchor="middle" fill="white" stroke="black" stroke-width="1">${s.index}</text></g>`,
      )
      .join("") + "</svg>",
  );
  mkdirSync("output/ma-tracks", { recursive: true });
  writeFileSync(`output/ma-tracks/${map.id}-debug.svg`, debug);
}
