/**
 * 棋盘排布（2026-11-05 改版）：房间拼合成一整块，相邻两房间之间的路画成「色边门洞」，
 * 连不到一起的路画成带色边的小路。连接关系完全来自 MAP_DATA（这里只决定画在哪里）。
 *
 * 输出与旧 layout.json 同样的结构（rooms 房间卡原点 / paths 路线折线 / markers 路线图标位置），
 * 另附 scale（房间卡缩放）和 floor（门、小路的装饰数据），Board / BoardFx / BoardMotion 共用。
 */
type Box = { L: number; T: number; R: number; B: number; s: number };
export type Door = {
  pathId: string; cx: number; cy: number; horiz: boolean; e1: number; e2: number; span: number; from?: string;
};
export type Corridor = { pathId: string; pts: number[][]; icon: [number, number]; arrow?: [number, number, number, number] };
export type FloorLayout = {
  rooms: Record<string, number[]>;
  paths: Record<string, string[]>;
  markers: Record<string, number[]>;
  scale: Record<string, number>;
  boxes: Record<string, Box>;
  doors: Door[];
  corridors: Corridor[];
};

const G = 28;
type RoomSpec = Record<string, [number, number, number]>; // 左上角 L、T 与缩放 s（卡片 260×200）
type DoorSpec = [string, string, string, number?, number?, string?]; // 房间A, 房间B, 路线id, 段起, 段止, 单向起点
type CorridorFn = (b: (id: string) => Box) => Corridor[];

function build(rooms: RoomSpec, doorSpecs: DoorSpec[], corridors: CorridorFn, width: number, height: number): FloorLayout {
  const raw = (id: string): Box => {
    const [L, T, s] = rooms[id];
    return { L, T, R: L + 260 * s, B: T + 200 * s, s };
  };
  const cor = corridors(raw);
  // 居中到棋盘画布（宽 1540，高按地图）
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of Object.keys(rooms)) {
    const b = raw(id);
    x0 = Math.min(x0, b.L); y0 = Math.min(y0, b.T); x1 = Math.max(x1, b.R); y1 = Math.max(y1, b.B + 32 * b.s);
  }
  for (const c of cor) for (const [x, y] of c.pts) { x0 = Math.min(x0, x - 40); y0 = Math.min(y0, y - 40); x1 = Math.max(x1, x + 40); y1 = Math.max(y1, y + 40); }
  const ox = Math.round((width - (x1 - x0)) / 2 - x0), oy = Math.round((height - (y1 - y0)) / 2 - y0);
  const box = (id: string): Box => { const b = raw(id); return { L: b.L + ox, T: b.T + oy, R: b.R + ox, B: b.B + oy, s: b.s }; };
  const out: FloorLayout = { rooms: {}, paths: {}, markers: {}, scale: {}, boxes: {}, doors: [], corridors: [] };
  for (const id of Object.keys(rooms)) {
    const b = box(id);
    out.boxes[id] = b;
    out.rooms[id] = [b.L + 130 * b.s, b.T + 82 * b.s];
    out.scale[id] = b.s;
  }
  for (const [a, bb, pathId, f0 = 0, f1 = 1, from] of doorSpecs) {
    const A = box(a), B = box(bb);
    const ox0 = Math.max(A.L, B.L), ox1 = Math.min(A.R, B.R), oy0 = Math.max(A.T, B.T), oy1 = Math.min(A.B, B.B);
    let d: Door;
    if (ox1 - ox0 > oy1 - oy0) {
      const top = A.B <= B.T ? A : B, bot = top === A ? B : A;
      const s0 = ox0 + (ox1 - ox0) * f0, s1 = ox0 + (ox1 - ox0) * f1;
      d = { pathId, horiz: true, e1: top.B, e2: bot.T, cx: (s0 + s1) / 2, cy: (top.B + bot.T) / 2, span: Math.min(140, (s1 - s0) * 0.8), from };
    } else {
      const lf = A.R <= B.L ? A : B, rt = lf === A ? B : A;
      const s0 = oy0 + (oy1 - oy0) * f0, s1 = oy0 + (oy1 - oy0) * f1;
      d = { pathId, horiz: false, e1: lf.R, e2: rt.L, cx: (lf.R + rt.L) / 2, cy: (s0 + s1) / 2, span: Math.min(140, (s1 - s0) * 0.8), from };
    }
    out.doors.push(d);
    // 同一路线（多房间路口）可能有几扇门：路线图标放第一扇，折线连起所有门
    out.markers[pathId] ??= [d.cx, d.cy];
    (out.paths[pathId] ??= []).push(`${d.cx - 1},${d.cy} ${d.cx + 1},${d.cy}`);
  }
  for (const c of cor) {
    const pts = c.pts.map(([x, y]) => [x + ox, y + oy]);
    const corr: Corridor = { pathId: c.pathId, pts, icon: [c.icon[0] + ox, c.icon[1] + oy], arrow: c.arrow && [c.arrow[0] + ox, c.arrow[1] + oy, c.arrow[2], c.arrow[3]] };
    out.corridors.push(corr);
    if (c.icon[0] || c.icon[1]) out.markers[c.pathId] = corr.icon;
    (out.paths[c.pathId] ??= []).push(pts.map((q) => q.join(",")).join(" "));
  }
  return out;
}

const autohaven = build(
  {
    wreckers_garage_north: [0, -260, 1.3], maze: [366, -250, 1.25], scrap_pile: [719, -230, 1.15],
    wreckers_garage_south: [0, 52, 0.85], diner: [249, G, 1], main_garage: [537, G, 1.1], barn: [851, G, 1],
    old_cabin: [0, 256, 1.25], gas_pump: [353, 276, 1.05], cottage: [900, 256, 0.85],
  },
  [
    ["wreckers_garage_north", "maze", "ah_p01", 0.1, 0.48, "wreckers_garage_north"],
    ["wreckers_garage_north", "maze", "ah_p02", 0.52, 0.9],
    ["wreckers_garage_north", "diner", "ah_p02"],
    ["maze", "diner", "ah_p02"],
    ["wreckers_garage_north", "wreckers_garage_south", "ah_p05"],
    ["wreckers_garage_south", "diner", "ah_p06"],
    ["diner", "main_garage", "ah_p07"],
    ["maze", "main_garage", "ah_p08"],
    ["maze", "scrap_pile", "ah_p09"],
    ["scrap_pile", "main_garage", "ah_p10"],
    ["main_garage", "barn", "ah_p11"],
    ["scrap_pile", "barn", "ah_p12"],
    ["main_garage", "gas_pump", "ah_p13"],
    ["barn", "cottage", "ah_p15"],
    ["diner", "gas_pump", "ah_p16"],
    ["old_cabin", "gas_pump", "ah_p17"],
    ["wreckers_garage_south", "old_cabin", "ah_p18"],
    ["old_cabin", "diner", "ah_p19", 0, 1, "old_cabin"],
  ],
  (box) => {
    const mz = box("maze"), gs = box("wreckers_garage_south"), gp = box("gas_pump"), ct = box("cottage"), bn = box("barn"), oc = box("old_cabin");
    const by = Math.max(oc.B, gp.B, ct.B) + 60;
    return [
      { pathId: "ah_p03", pts: [[mz.L + 70, mz.T], [mz.L + 70, mz.T - 60], [-56, mz.T - 60], [-56, gs.T + 60], [gs.L, gs.T + 60]], icon: [-56, -120] },
      { pathId: "ah_p04", pts: [[gs.L, gs.B - 30], [-56, gs.B - 30], [-56, by], [ct.L + 110, by], [ct.L + 110, ct.B]], icon: [gp.L + 130, by] },
      { pathId: "ah_p04", pts: [[gp.L + 130, by], [gp.L + 130, gp.B]], icon: [0, 0] },
      { pathId: "ah_p14", pts: [[gp.R, gp.T + 70], [bn.L + 25, gp.T + 70], [bn.L + 25, bn.B]], icon: [(gp.R + bn.L + 25) / 2 + 20, gp.T + 70], arrow: [bn.L + 25, bn.B + 34, 0, -1] },
    ];
  },
  1540, 1320,
);

const macmillan = build(
  {
    mine_depths: [0, -190, 0.95], mine_entrance: [275, -200, 1.0], foundry_upper_floor: [563, -240, 1.2], coal_tower_upper: [903, -200, 1.0],
    ancient_tree: [100, G, 1.15], foundry_lower_floor: [427, G, 1.35], coal_tower_ground: [806, G, 1.1],
    shack: [0, 286, 1.0], scrapyard: [288, 326, 1.0], foundry_basement: [576, 326, 0.9], backlot: [838, 276, 1.15],
  },
  [
    ["mine_depths", "mine_entrance", "mm_p01"],
    ["foundry_upper_floor", "mine_entrance", "mm_p02", 0, 1, "foundry_upper_floor"],
    ["mine_depths", "ancient_tree", "mm_p03"],
    ["mine_entrance", "ancient_tree", "mm_p04"],
    ["mine_entrance", "foundry_lower_floor", "mm_p06"],
    ["foundry_upper_floor", "foundry_lower_floor", "mm_p07"],
    ["foundry_upper_floor", "coal_tower_ground", "mm_p08"],
    ["foundry_upper_floor", "coal_tower_upper", "mm_p09"],
    ["coal_tower_upper", "coal_tower_ground", "mm_p10"],
    ["coal_tower_ground", "foundry_lower_floor", "mm_p11", 0, 1, "coal_tower_ground"],
    ["coal_tower_ground", "backlot", "mm_p13"],
    ["foundry_lower_floor", "scrapyard", "mm_p14"],
    ["ancient_tree", "scrapyard", "mm_p15"],
    ["ancient_tree", "shack", "mm_p16"],
    ["scrapyard", "shack", "mm_p17"],
    ["foundry_lower_floor", "foundry_basement", "mm_p18"],
    ["foundry_basement", "backlot", "mm_p20"],
  ],
  (box) => {
    const md = box("mine_depths"), sh = box("shack"), cu = box("coal_tower_upper"), bl = box("backlot"), fl = box("foundry_lower_floor"), fb = box("foundry_basement");
    const y1 = Math.max(sh.B, fb.B, bl.B) + 56, y2 = y1 + 74;
    return [
      { pathId: "mm_p05", pts: [[50, md.B], [50, sh.T]], icon: [50, (md.B + sh.T) / 2 - 40] },
      { pathId: "mm_p21", pts: [[sh.L + 90, sh.B], [sh.L + 90, y1], [fb.L + 117, y1], [fb.L + 117, fb.B]], icon: [(sh.L + fb.L + 207) / 2, y1] },
      { pathId: "mm_p22", pts: [[sh.L + 190, sh.B], [sh.L + 190, y2], [bl.L + 150, y2], [bl.L + 150, bl.B]], icon: [(sh.L + bl.L + 340) / 2, y2], arrow: [bl.L + 150, bl.B + 34, 0, -1] },
      { pathId: "mm_p12", pts: [[cu.R, cu.T + 100], [cu.R + 70, cu.T + 100], [cu.R + 70, bl.T + 130], [bl.R, bl.T + 130]], icon: [cu.R + 70, (cu.T + bl.T) / 2 + 160], arrow: [bl.R + 34, bl.T + 130, -1, 0] },
      { pathId: "mm_p19", pts: [[fl.R, fl.B - 40], [bl.L + 40, fl.B - 40], [bl.L + 40, bl.T]], icon: [(fl.R + bl.L + 40) / 2 + 10, fl.B - 40] },
    ];
  },
  1540, 1520,
);

export const BOARD_LAYOUT: Record<string, FloorLayout> = {
  autohaven_wreckers: autohaven,
  macmillan_estate: macmillan,
};
