import type { TrackId } from "./tracks.ts";

export interface Chip {
  kind: "gold" | "silver" | "bronze";
  value: number;
  /** 第几场（0 起）获得 */
  race: number;
}

export interface MAPlayer {
  id: string;
  name: string;
  /** 选秀得到的角色 */
  hand: string[];
  /** 已经出场过的角色 */
  used: string[];
  chips: Chip[];
  /** 本场秘密选择（隐藏信息）；标准 1 名，双选手变体 2 名；未选为空数组 */
  choices: string[];
}

export interface Token {
  racer: string;
  owner: string;
  pos: number;
  tripped: boolean;
  /** 冲线名次（1 起），未冲线为 null */
  place: number | null;
  out: boolean;
  /** 能力来源：通常是自己；神秘蛋/双胞胎赛前选定的角色 */
  base: string;
  /** 山寨猫并列领先时选的目标 */
  copyPick: string | null;
  /** 第一回合是否已开始（军师） */
  started: boolean;
  /** New-racer per-race memory; omitted from legacy tokens and snapshots. */
  secondWind?: { krakenUsed?: boolean; soulmate?: string; wereMouth?: boolean };
}

export interface RaceState {
  /** Physical mounts are shared by every racer; rider ids are racer ids. */
  hogs?: Array<{ source: string; rider: string | null; pos: number }>;
  championIntercepted?: boolean;
  /** Cancellation preserves finish history, but awards no medals. */
  cancelledBy?: string;
  /** Hotel payments funded from earlier-race chips, for this race's net score. */
  priorRaceSpending?: Record<string, number>;
  index: number;
  track: TrackId;
  tokens: Token[];
  /** 顺时针玩家顺序（从本场先手开始） */
  order: string[];
  /** 当前行动玩家 */
  current: string;
  finishers: string[];
  eliminated: string[];
  mastermindPick: string | null;
  /** 本回合骰子（显示用） */
  lastRoll: {
    player: string;
    racer: string;
    value: number;
    seq: number;
  } | null;
  over: boolean;
  /** 赛前能力（神秘蛋、双胞胎、西西弗斯）是否已结算 */
  setup: boolean;
  /** 2 人变体：已经进行过第一回合的玩家（第一回合只用一名选手） */
  firstTurnDone: string[];
}

export interface Decision {
  player: string;
  /** 正在为哪名选手决定 */
  racer: string | null;
  kind: string;
  prompt: string;
  options: Array<{ value: string; label: string }>;
}

/** 给界面播放动画用的结构化事件（掷骰、技能发动、移动路径……）；text 为空的条目只用于动画，不显示在记录里 */
export type Fx =
  | { kind: "control"; racer: string; target: string; owner: string; targetOwner: string }
  | {
      kind: "roll";
      player: string;
      racer: string;
      value: number;
      reroll?: boolean;
    }
  | {
      kind: "duel";
      a: { racer: string; value: number };
      b: { racer: string; value: number };
    }
  | { kind: "power"; racer: string; power: string }
  | {
      kind: "move";
      racers: string[];
      from: number;
      to: number;
      /** 移动原因（主移动 / 箭头 / 技能名），给界面飘字用 */ why?: string;
    }
  | { kind: "warp"; racer: string; from: number; to: number }
  | { kind: "trip"; racer: string }
  | { kind: "finish"; racer: string; place: number }
  | { kind: "out"; racer: string }
  | { kind: "chip"; player: string; value: number }
  | { kind: "start"; race: number; track: string; owners?: Record<string, string> }
  /** 每场结束的领奖台：第 1、2 名（冲线，拿奖牌）＋第 3 名（场上最靠前的未冲线选手，不计分） */
  | {
      kind: "podium";
      race: number;
      places: Array<{
        racer: string;
        owner: string;
        place: number;
        points: number;
      }>;
    }
  /** 全部比赛结束：总冠军（可能并列）与所有人总分 */
  | {
      kind: "champion";
      winners: string[];
      totals: Array<{ player: string; total: number }>;
    };

export interface LogEntry {
  text: string;
  race: number | null;
  fx?: Fx;
}

export interface Settings {
  /** Server/development opt-in only. Existing rooms omit this and keep base36. */
  secondWindPreview?: boolean;
  races: number;
  /** standard：每人每场 1 名；double：2 人局 / 3 人双选手变体，每人每场 2 名 */
  variant: "standard" | "double";
  /** draft：蛇形选秀（规则书）；random：随机模式，每人直接随机发 4 名，全场不重复 */
  deal?: "draft" | "random";
  schedule: TrackId[];
  /** 每场金牌、银牌分值（待核对，房主可改） */
  points: Array<{ gold: number; silver: number }>;
}

export interface MAState {
  /** Extra racers registered for future races, separate from secret selections. */
  returningRacers?: Array<{ racer: string; owner: string; base: string }>;
  game: "magical-athlete";
  phase: "draft" | "choose" | "race" | "over";
  rng: number;
  players: MAPlayer[];
  /** 座位顺时针 */
  seats: string[];
  settings: Settings;
  /** 尚未翻开的角色牌堆（隐藏） */
  deck: string[];
  draft: {
    round: number;
    /** 本轮场上可选 */
    pool: string[];
    /** 本轮选秀顺序（玩家 id，一次一张） */
    order: string[];
    step: number;
    startPlayer: string;
  } | null;
  race: RaceState | null;
  /** 历届冠军角色（双胞胎用） */
  winners: string[];
  /** 下一场先手玩家 */
  nextFirst: string | null;
  pending: Decision | null;
  /** 本回合开始时的快照与已给出的回答（确定性重放用；隐藏） */
  turn: { snapshot: string; answers: string[] } | null;
  log: LogEntry[];
  /** 仅测试：预设的骰子点数，用完后恢复随机 */
  forcedRolls?: number[];
  /** 每次执行命令 +1 */
  version: number;
}

export type MACommand =
  | { type: "DRAFT"; player: string; racer: string }
  | { type: "CHOOSE"; player: string; racer?: string; racers?: string[] }
  | { type: "ANSWER"; player: string; value: string };

export interface CreateMAOptions {
  players: Array<{ id: string; name: string }>;
  seed: number;
  settings?: Partial<Settings>;
}
