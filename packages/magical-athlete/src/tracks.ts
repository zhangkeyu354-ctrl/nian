/**
 * 赛道数据。格子编号 0 = 起点格（起点也算一格），最后一格之后是终点线。
 *
 * 来源：
 * - 每面 30 格：GeekDad 评测（https://geekdad.com/2025/11/wacky-racing-in-magical-athlete/），D 级。
 * - 狂野赛道格子种类（箭头/石头/星星）：MA-B01 规则书，D 级转录。
 * - 狂野赛道每种格子的位置、箭头数值与方向、两面的「第二个弯道」位置：只印在赛道实物上，
 *   目前没有找到文字资料 → CHECK_REQUIRED（见 docs/magical-athlete/RULE_QUESTIONS.md MA-Q02/Q03）。
 */
export type TrackId = "mild" | "wild";

export type Special =
  | { kind: "arrow"; steps: number } // 正数向前、负数向后
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
}

export const TRACKS: Record<TrackId, Track> = {
  mild: {
    id: "mild",
    zh: "温和赛道",
    en: "Mild Mile",
    length: 30,
    secondCorner: null,
    specials: {},
    status: "CONFIRMED",
  },
  wild: {
    id: "wild",
    zh: "狂野赛道",
    en: "Wild Wilds",
    length: 30,
    secondCorner: null,
    specials: {},
    status: "CHECK_REQUIRED",
    missing: "箭头、石头、星星的格子位置与箭头数值未确认",
  },
};

/** 能用于比赛的赛道 */
export const PLAYABLE_TRACKS = (Object.keys(TRACKS) as TrackId[]).filter(
  (t) => TRACKS[t].status === "CONFIRMED",
);
