/** 用户Final V1 §2：固定物理坐标。图像参考与网站规则分开登记。 */
export type SecondWindMapId = "twisty-twirl" | "whirly-world";
export type Direction = 1 | -1;
export interface MapSpace {
  index: number;
  edge: "start" | "top" | "right" | "bottom";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}
export interface SecondWindMap {
  id: SecondWindMapId;
  name: string;
  title: string;
  generation: 2;
  canvas: readonly [number, number];
  spaces: MapSpace[];
  start: 0;
  finishBoundary: 30;
  corners: readonly [12, 15];
  warpPairs: ReadonlyArray<readonly [number, number]>;
  twistBoundary: readonly [13, 14] | null;
  source: "USER_SPEC_V1 §2";
  evidence: "PLAYER_REQUEST";
  release: "CHECK_REQUIRED";
}
const palette = {
  blue: "#6098d2",
  green: "#69a62e",
  yellow: "#f4c62b",
  red: "#ed492b",
  pink: "#d557b2",
};
const twistColors = [
  "blue",
  ...Array.from({ length: 12 }, (_, i) => (i % 2 ? "blue" : "green")),
  "green",
  "red",
  ...Array.from({ length: 15 }, (_, i) => (i % 2 ? "red" : "yellow")),
] as Array<keyof typeof palette>;
const whirlColors: Array<keyof typeof palette> = [
  "blue",
  "pink",
  "yellow",
  "green",
  "blue",
  "red",
  "blue",
  "yellow",
  "red",
  "blue",
  "red",
  "yellow",
  "red",
  "green",
  "blue",
  "yellow",
  "pink",
  "yellow",
  "green",
  "blue",
  "red",
  "pink",
  "yellow",
  "red",
  "blue",
  "red",
  "pink",
  "yellow",
  "blue",
  "blue",
];
function spaces(colors: Array<keyof typeof palette>): MapSpace[] {
  // 原图两条长边格宽不同：上方12格、下方15格。全部坐标共用此结构层。
  const result: MapSpace[] = [
    {
      index: 0,
      edge: "start",
      x: 30,
      y: 30,
      width: 210,
      height: 90,
      color: palette.blue,
    },
  ];
  for (let i = 1; i <= 12; i++)
    result.push({
      index: i,
      edge: "top",
      x: 240 + (i - 1) * 77.5,
      y: 30,
      width: 77.5,
      height: 90,
      color: palette[colors[i]],
    });
  for (let i = 13; i <= 14; i++)
    result.push({
      index: i,
      edge: "right",
      x: 1092.5,
      y: 120 + (i - 13) * 90,
      width: 77.5,
      height: 90,
      color: palette[colors[i]],
    });
  for (let i = 15; i <= 29; i++)
    result.push({
      index: i,
      edge: "bottom",
      x: 30 + (29 - i) * 76,
      y: 300,
      width: 76,
      height: 90,
      color: palette[colors[i]],
    });
  return result;
}
const common = {
  generation: 2,
  canvas: [1200, 420],
  start: 0,
  finishBoundary: 30,
  corners: [12, 15],
  source: "USER_SPEC_V1 §2",
  evidence: "PLAYER_REQUEST",
  release: "CHECK_REQUIRED",
} as const;
export const SECOND_WIND_MAPS: Record<SecondWindMapId, SecondWindMap> = {
  "twisty-twirl": {
    ...common,
    id: "twisty-twirl",
    name: "扭扭赛道",
    title: "TWISTY TWIRL",
    spaces: spaces(twistColors),
    warpPairs: [],
    twistBoundary: [13, 14],
  },
  "whirly-world": {
    ...common,
    id: "whirly-world",
    name: "螺旋世界",
    title: "WHIRLY WORLD",
    spaces: spaces(whirlColors),
    warpPairs: [
      [4, 6],
      [8, 12],
      [11, 15],
      [17, 22],
      [20, 23],
      [24, 28],
    ],
    twistBoundary: null,
  },
};
/** 30是正向虚拟终点，0是反向虚拟终点；完成状态另由Token.place记录。 */
export function physicalProgress(
  position: number,
  direction: Direction,
): number {
  return direction === 1 ? position : 30 - position;
}
/** 只描述落点传送；经过/摆放是否调用由权威引擎决定。访问集属于本次落点链。 */
export function warpDestination(
  track: string,
  position: number,
  visited: readonly string[],
): { to: number; pair: string } | null {
  if (track !== "whirly-world") return null;
  for (const [a, b] of SECOND_WIND_MAPS[track].warpPairs) {
    const pair = `${a}:${b}`;
    if (!visited.includes(pair) && (position === a || position === b))
      return { to: position === a ? b : a, pair };
  }
  return null;
}
