// 《魔王试炼：码上开战》网页版 —— 规则引擎类型定义
// 规则依据：design/05_修订与规则引擎.md；卡牌：global_research/JP_CARDS_ZH.md v2（逐页核对）

export type DamageType = 'melee' | 'ranged' | 'magic';
export const DAMAGE_TYPES: DamageType[] = ['melee', 'ranged', 'magic'];

export type Difficulty = 'beginner' | 'advanced' | 'pro' | 'insane';
export type StatusKind = 'poison' | 'panic' | 'paralysis' | 'fire';
export type Value = number | 'round' | 'vengeance';

/** 卡牌效果原语（04 第 3 节，按全部卡牌扩充） */
export type Effect =
  | { kind: 'attack'; type: DamageType; value: Value; noShieldEffect?: boolean }
  | { kind: 'support'; type: DamageType; value: number }
  | { kind: 'protect'; value: number | 'round'; cancelEffects?: boolean }
  | { kind: 'heal'; value: number; target: 'self' | 'choose' | 'all' | 'two' }
  | { kind: 'draw'; n: number; target: 'self' | 'choose' | 'chosen' | 'all' }
  | { kind: 'lightning'; n?: number }
  | { kind: 'immediateAction'; target: 'chosen' }
  | { kind: 'bossPoison'; n: number }
  | { kind: 'selfDamage'; value: number }
  | { kind: 'removeStatus'; n: number; target: 'self' | 'choose' | 'all' }
  | { kind: 'takeStatus'; n: number }
  | { kind: 'ifHealthAtLeast'; n: number; then: Effect[] }
  | { kind: 'nextBuff'; match: 'attack' | 'magic' | 'ranged' | 'protect'; mode: 'plus' | 'repeat' | 'lightning' | 'healEqual'; n?: number }
  | { kind: 'shieldReduce'; n: number; noShieldEffect?: boolean; poisonIfBroken?: number }
  | { kind: 'bossLoseHp'; n: number }
  | { kind: 'bossLosePerPoison'; per: number; clear?: boolean }
  | { kind: 'exileSelf' }
  | { kind: 'exileForever' }
  | { kind: 'playTop'; n: number }
  | { kind: 'replayDiscard' }
  | { kind: 'peekTop3' }
  | { kind: 'redirect' }
  | { kind: 'preventNextRound' }
  | { kind: 'ward'; against: 'trap' | 'hpLoss' }
  | { kind: 'repeatLastAttack' }
  | { kind: 'bossAttackMinusNext'; n: number }
  | { kind: 'allDrawThenTop'; n: number }
  | { kind: 'discardCurse' }
  | { kind: 'meteor' }
  | { kind: 'putHandOnTop' }
  | { kind: 'slime' };

export type CardCategory = 'initial' | 'advanced' | 'loot' | 'slime';

export interface CardDef {
  id: string;
  name: string;
  owner: string; // 种族/职业 id；战利品为 'loot'
  category: CardCategory;
  stars?: number; // 战利品星级
  effects: Effect[];
  source: 'official' | 'observed' | 'tentative';
}

export type CurseTrigger = 'playAny' | 'playAttack' | 'playSupport' | 'playProtect' | 'bossHit';
export interface CurseDef {
  id: string;
  name: string;
  batch: 1 | 2 | 3; // 1★ 中毒 / 2★ 惊恐 / 3★ 麻痹
  duration: 'phase' | 'instant' | 'permanent';
  text: string;
  trigger?: CurseTrigger;
  /** 触发或即时：获得状态 / 失去生命 / 额外弃牌 / 随机出牌 / 手牌上限 */
  status?: { kind: StatusKind; n: number };
  loseHp?: number;
  discardExtra?: boolean;
  randomPlay?: boolean;
  handMinus?: number;
}

export type ItemId = 'backpack' | 'potion' | 'medkit' | 'waterskin' | 'glassEye' | 'luckyCharm';

export interface IdentityDef {
  id: string;
  name: string;
  kind: 'race' | 'class';
  /** 1/2/3 级 [手牌, 生命]；2 级不加生命（官方） */
  levels: [number, number][];
  levelNames: string[];
  ability: string; // 2 级起能力文字
  cards: string[];
  advanced: string[]; // 4 张进阶卡（第 1 关起加入）
}

export interface AttackExtra {
  poison?: number;
  panic?: number;
  paralysis?: number;
  fire?: number;
  curse?: number;
  slime?: number;
  lost?: number;
  discard?: number;
  drain?: boolean; // 造成伤害时魔王回血
}

export interface PlannedAttack {
  id: string;
  nameKey: string;
  name: string;
  target: number;
  value: number;
  extra: AttackExtra;
  reducedBy: number;
  hidden?: boolean; // 被墨汁遮盖
  cancelExtra?: boolean;
}

export interface CurseInPlay {
  id: string;
  state: 'down' | 'active';
}

export interface Hero {
  seat: number;
  name: string;
  race: string;
  cls: string;
  raceLevel: number;
  clsLevel: number;
  classAbility: boolean; // 第 7 关前解锁职业能力
  maxHealth: number;
  health: number;
  handLimit: number;
  deck: string[]; // 顶在末尾
  hand: string[];
  discard: string[];
  play: string[];
  lost: string[];
  exiled: string[];
  curses: CurseInPlay[];
  wards: { card: string; against: 'trap' | 'hpLoss' }[];
  status: Record<StatusKind, number>;
  actionsLeft: number;
  items: Partial<Record<ItemId, number>>; // 剩余次数，Infinity 为不限
  discardDone: boolean;
  /** 本回合记录（能力判定用） */
  turn: { attackedTypes: DamageType[]; firstHitDone: boolean; firstShieldHit: boolean; firstProtect: boolean };
  nextBuffs: Extract<Effect, { kind: 'nextBuff' }>[];
  carriesBomb?: boolean;
  carriesDoll?: boolean;
}

export type Phase = 'chooseStarter' | 'action' | 'decision' | 'discard' | 'won' | 'lost';

export interface LogEntry {
  round: number;
  text: string;
  kind?: 'boss' | 'hero' | 'system' | 'ability';
}

/** 魔王的可攻击部位：本体、手下、触手、食人妖的头等 */
export interface BossPart {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  slot?: DamageType; // 位置（只吃这种属性）
  tag?: string; // 插件自用
}

export interface BossState {
  id: string;
  name: string;
  maxHp: number;
  hp: number;
  shields: Record<DamageType, number>;
  spikedShields: DamageType[];
  poison: number;
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  attackBonus: number;
  shieldBonus: number;
  parts: BossPart[];
  immune: DamageType[];
  phase2: boolean;
}

export interface Decision {
  seat: number;
  kind: 'fire' | 'target';
  card?: string;
  prompt: string;
}

export interface GameEvent {
  round: number;
  kind: string;
  title: string;
  text: string;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  bossId: string;
  difficulty: Difficulty;
  round: number;
  phase: Phase;
  heroes: Hero[];
  boss: BossState;
  planned: PlannedAttack[];
  attackedTypes: Record<DamageType, boolean>;
  starter: number | null;
  current: number | null;
  interrupts: number[];
  pendingLightning: number;
  curseDeck: string[];
  curseDiscard: string[];
  slimePile: number;
  preventNextRound: boolean;
  lastAttackCard: string | null;
  bossAttackMinus: number;
  decisions: Decision[];
  /** 炸弹克精的时间（其他魔王为 null） */
  time: number | null;
  log: LogEntry[];
  events: GameEvent[];
}

export type Command =
  | { type: 'CHOOSE_STARTER'; seat: number; by: number }
  | { type: 'PLAY_CARD'; seat: number; card: string; target?: number }
  | { type: 'USE_ITEM'; seat: number; item: ItemId; target?: number }
  | { type: 'END_ACTIONS'; seat: number }
  | { type: 'DISCARD'; seat: number; cards: string[] }
  | { type: 'DECIDE'; seat: number; choice: 'exile' | 'burn' }
  | { type: 'GIVE_UP'; seat: number };

export interface SetupHero {
  name: string;
  race: string;
  cls: string;
  raceLevel?: number;
  clsLevel?: number;
  classAbility?: boolean;
  /** 本场额外加入牌组的卡（进阶卡、战利品） */
  extraCards?: string[];
  /** 从牌组移除的初始/进阶卡 */
  removed?: string[];
}

export interface SetupOptions {
  bossId: string;
  difficulty: Difficulty;
  heroes: SetupHero[];
  seed: number;
  items?: ItemId[];
  curseBatches?: (1 | 2 | 3)[];
}
