/**
 * 赛道数据。格子编号 0 = 起点格（起点也算一格），1–29 是赛道格，越过第 29 格即冲过终点（阈值 30）。
 *
 * 来源（2026-10-20 核对）：
 * - MA-B03：CMYK 规则书 PDF 内嵌的两面原版棋盘图（gamers-hq.de 供应商镜像，SHA-256 6a14158f…；
 *   见 assets/magical-athlete-production-v1/SOURCE_MANIFEST.json、TRACK_EVIDENCE.json）。
 *   Codex 读图提取格位与特殊格，Claude 逐格放大复核箭头数值与方向（绿色前进、红色后退）。
 * - 第二个弯道：原版棋盘上带圆角的弯道格是第 12 格（右上）与第 15 格（右下），选手在 12→13 第一次转弯、
 *   15→16 第二次转弯 → 第二个弯道 = 第 15 格（MA-Q03，Claude 读图判定，用户可改）。
 *   Codex 交接写的是 13，与棋盘图不符，未采用。
 * - 坐标见 apps/web/public/assets/magical-athlete/boards/coordinates.json（仅用于显示）。
 */
export type TrackId = "mild" | "wild";

export type Special =
  | { kind: "arrow"; steps: number } // 按前进方向：正数向前、负数向后
  | { kind: "rock" }
  | { kind: "star" };

export interface Track {
  id: TrackId;
  zh: string;
  en: string;
  /** 格子数（含起点格） */
  length: number;
  /** 第二个弯道所在格；未确认为 null */
  secondCorner: number | null;
  specials: Record<number, Special>;
  status: "CONFIRMED" | "CHECK_REQUIRED";
  missing?: string;
  source_ref: string;
}

export const TRACKS: Record<TrackId, Track> = {
  mild: {
    id: "mild",
    zh: "温和赛道",
    en: "Mild Mile",
    length: 30,
    secondCorner: 15,
    specials: {},
    status: "CONFIRMED",
    source_ref: "MA-B03 规则书 p10–11 棋盘图",
  },
  wild: {
    id: "wild",
    zh: "狂野赛道",
    en: "Wild Wilds",
    length: 30,
    secondCorner: 15,
    specials: {
      1: { kind: "star" },
      5: { kind: "rock" },
      7: { kind: "arrow", steps: 3 },
      11: { kind: "arrow", steps: 1 },
      13: { kind: "star" },
      16: { kind: "arrow", steps: -3 },
      18: { kind: "rock" },
      23: { kind: "arrow", steps: 2 },
      24: { kind: "arrow", steps: -3 },
      26: { kind: "rock" },
    },
    status: "CONFIRMED",
    source_ref: "MA-B03 规则书棋盘图（狂野面）",
  },
};

/** 能用于比赛的赛道 */
export const PLAYABLE_TRACKS = (Object.keys(TRACKS) as TrackId[]).filter(
  (t) => TRACKS[t].status === "CONFIRMED",
);
