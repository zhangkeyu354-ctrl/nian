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
  width: number;
  height: number;
  doors: Door[];
  corridors: Corridor[];
};

const G = 28;
type RoomSpec = Record<string, [number, number, number]>; // 左上角 L、T 与缩放 s（卡片 260×200）
type DoorSpec = [string, string, string, number?, number?, string?]; // 房间A, 房间B, 路线id, 段起, 段止, 单向起点
type CorridorFn = (b: (id: string) => Box) => Corridor[];

// 放宽排布（2026-11-20）：按行整体往下错开（竖向间距加大，手机竖屏更舒展），横向整体略拉开
const ROW_GAP = 70, SPREAD_X = 1.08;
function build(rooms: RoomSpec, doorSpecs: DoorSpec[], corridors: CorridorFn): FloorLayout {
  const rowOf = (T: number) => (T < 0 ? 0 : T < 200 ? 1 : 2);
  const raw = (id: string): Box => {
    const [L0, T0, s] = rooms[id];
    const L = L0 * SPREAD_X, T = T0 + rowOf(T0) * ROW_GAP;
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
  // 画布 = 内容大小 + 一圈留白：全图时内容尽量占满屏幕
  const M = 30, width = Math.ceil(x1 - x0 + 2 * M), height = Math.ceil(y1 - y0 + 2 * M);
  const ox = Math.round(M - x0), oy = Math.round(M - y0);
  const box = (id: string): Box => { const b = raw(id); return { L: b.L + ox, T: b.T + oy, R: b.R + ox, B: b.B + oy, s: b.s }; };
  const out: FloorLayout = { rooms: {}, paths: {}, markers: {}, scale: {}, boxes: {}, width, height, doors: [], corridors: [] };
  for (const id of Object.keys(rooms)) {
    const b = box(id);
    out.boxes[id] = b;
    out.rooms[id] = [b.L + 130 * b.s, b.T + 82 * b.s];
    out.scale[id] = b.s;
  }
  for (const [a, bb, pathId, f0 = 0, f1 = 1, from] of doorSpecs) {
    const A = box(a), B = box(bb);
    const ox0 = Math.max(A.L, B.L), ox1 = Math.min(A.R, B.R), oy0 = Math.max(A.T, B.T), oy1 = Math.min(A.B, B.B);
    if (Math.max(ox1 - ox0, oy1 - oy0) < 50) console.warn("[boardLayout] 门太窄", a, bb, pathId);
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
);

const macmillan = build(
  {
    mine_depths: [0, -190, 0.95], mine_entrance: [275, -200, 1.0], foundry_upper_floor: [563, -240, 1.2], coal_tower_upper: [903, -200, 1.0],
    ancient_tree: [100, G, 1.15], foundry_lower_floor: [427, G, 1.35], coal_tower_ground: [786, G, 1.1],
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
);

// 克洛普瑞恩疯人院（2026-11-23）：按复刻图的连线转录，三行拼合
const crotus = build(
  {
    crotus_shack: [0, -200, 1.0], crotus_dark_wood: [288, -220, 1.1], crotus_courtyard: [580, -220, 1.1],
    crotus_treatment_hall: [100, G, 1.0], crotus_hallway: [388, G, 1.05], crotus_receiving_desk: [689, G, 1.0],
    crotus_ruins: [0, 266, 0.9], crotus_greenhouse: [262, 266, 1.0], crotus_outer_garden: [550, 266, 1.0], crotus_carnival_entrance: [838, 266, 1.0],
  },
  [
    ["crotus_shack", "crotus_dark_wood", "cp_p01"],
    ["crotus_dark_wood", "crotus_courtyard", "cp_p03"],
    ["crotus_shack", "crotus_treatment_hall", "cp_p05"],
    ["crotus_dark_wood", "crotus_treatment_hall", "cp_p02"],
    ["crotus_dark_wood", "crotus_hallway", "cp_p04"],
    ["crotus_treatment_hall", "crotus_hallway", "cp_p06"],
    ["crotus_hallway", "crotus_courtyard", "cp_p07", 0, 1, "crotus_hallway"],
    ["crotus_receiving_desk", "crotus_courtyard", "cp_p12", 0, 1, "crotus_receiving_desk"],
    ["crotus_treatment_hall", "crotus_greenhouse", "cp_p10"],
    ["crotus_hallway", "crotus_receiving_desk", "cp_p11"],
    ["crotus_greenhouse", "crotus_ruins", "cp_p13"],
    ["crotus_greenhouse", "crotus_outer_garden", "cp_p17"],
    ["crotus_receiving_desk", "crotus_carnival_entrance", "cp_p15", 0, 0.45],
    ["crotus_receiving_desk", "crotus_carnival_entrance", "cp_p16", 0.55, 1],
    ["crotus_receiving_desk", "crotus_outer_garden", "cp_p16", 0.4, 1],
    ["crotus_outer_garden", "crotus_carnival_entrance", "cp_p16"],
  ],
  (box) => {
    const sh = box("crotus_shack"), ru = box("crotus_ruins"), gr = box("crotus_greenhouse"), rd = box("crotus_receiving_desk"),
      og = box("crotus_outer_garden"), ct = box("crotus_courtyard"), ce = box("crotus_carnival_entrance");
    const y1 = Math.max(ru.B, og.B, ce.B) + 56, gy = (rd.B + gr.T) / 2, X = Math.max(ct.R, rd.R) + 50;
    return [
      { pathId: "cp_p09", pts: [[sh.L, sh.T + 60], [-56, sh.T + 60], [-56, ru.T + 60], [ru.L, ru.T + 60]], icon: [-56, (sh.B + ru.T) / 2] },
      { pathId: "cp_p14", pts: [[gr.R - 30, gr.T], [gr.R - 30, gy], [rd.L + 20, gy], [rd.L + 20, rd.B]], icon: [(gr.R + rd.L) / 2 - 5, gy] },
      { pathId: "cp_p18", pts: [[ru.L + 110, ru.B], [ru.L + 110, y1], [og.L + 130, y1], [og.L + 130, og.B]], icon: [(ru.L + og.L + 240) / 2, y1] },
      { pathId: "cp_p08", pts: [[ct.R, ct.T + 100], [X, ct.T + 100], [X, ce.T]], icon: [X, (ct.T + ce.T) / 2 + 80] },
    ];
  },
);

// 奥蒙德（2026-11-23）：按复刻图的连线转录，三行拼合
const ormond = build(
  {
    ormond_picnic_area: [0, -200, 1.0], ormond_guest_rooms: [288, -200, 1.0], ormond_balcony: [560, -210, 1.05], ormond_storage: [877, -200, 1.0],
    ormond_ski_shack: [0, G, 0.9], ormond_chalet: [262, G, 1.5], ormond_rentals: [654, G, 1.2], ormond_wooded_area: [968, G, 0.9],
    ormond_basement: [300, 336, 1.6], ormond_entryway: [708, 336, 1.4],
  },
  [
    ["ormond_picnic_area", "ormond_guest_rooms", "or_p02"],
    ["ormond_guest_rooms", "ormond_balcony", "or_p03"],
    ["ormond_balcony", "ormond_storage", "or_p04", 0, 1, "ormond_balcony"],
    ["ormond_picnic_area", "ormond_ski_shack", "or_p10"],
    ["ormond_guest_rooms", "ormond_chalet", "or_p07"],
    ["ormond_balcony", "ormond_chalet", "or_p08"],
    ["ormond_balcony", "ormond_rentals", "or_p05", 0, 1, "ormond_balcony"],
    ["ormond_storage", "ormond_rentals", "or_p06"],
    ["ormond_storage", "ormond_wooded_area", "or_p13"],
    ["ormond_ski_shack", "ormond_chalet", "or_p14"],
    ["ormond_chalet", "ormond_rentals", "or_p11", 0, 0.45],
    ["ormond_chalet", "ormond_rentals", "or_p15", 0.55, 1],
    ["ormond_rentals", "ormond_wooded_area", "or_p12"],
    ["ormond_chalet", "ormond_basement", "or_p17"],
    ["ormond_basement", "ormond_entryway", "or_p21"],
    ["ormond_rentals", "ormond_entryway", "or_p18"],
    ["ormond_wooded_area", "ormond_entryway", "or_p20"],
  ],
  (box) => {
    const pa = box("ormond_picnic_area"), ch = box("ormond_chalet"), st = box("ormond_storage"), wa = box("ormond_wooded_area"),
      en = box("ormond_entryway"), sk = box("ormond_ski_shack"), bs = box("ormond_basement"), ba = box("ormond_balcony");
    const gy = (pa.B + ch.T) / 2, X = Math.max(st.R, wa.R) + 50, y1 = Math.max(bs.B, en.B) + 56;
    return [
      { pathId: "or_p01", pts: [[pa.L + 60, pa.T], [pa.L + 60, pa.T - 60], [ba.L + 60, pa.T - 60], [ba.L + 60, ba.T]], icon: [(pa.L + ba.L) / 2 + 60, pa.T - 60] },
      { pathId: "or_p09", pts: [[ch.L + 30, ch.T], [ch.L + 30, gy], [pa.R - 40, gy], [pa.R - 40, pa.B]], icon: [(ch.L + pa.R) / 2, gy], arrow: [pa.R - 40, pa.B + 34, 0, -1] },
      { pathId: "or_p16", pts: [[st.R, st.T + 100], [X, st.T + 100], [X, en.T + 100], [en.R, en.T + 100]], icon: [X, (wa.T + wa.B) / 2] },
      { pathId: "or_p19", pts: [[sk.L + 170, sk.B], [sk.L + 170, bs.T + 90], [bs.L, bs.T + 90]], icon: [sk.L + 170, (sk.B + bs.T + 90) / 2 + 10] },
      { pathId: "or_p22", pts: [[sk.L + 60, sk.B], [sk.L + 60, y1], [en.L + 120, y1], [en.L + 120, en.B]], icon: [(sk.L + en.L) / 2 + 90, y1] },
    ];
  },
);

export const BOARD_LAYOUT: Record<string, FloorLayout> = {
  autohaven_wreckers: autohaven,
  macmillan_estate: macmillan,
  crotus_prenn_asylum: crotus,
  ormond: ormond,
};
