import type { AttackExtra, BossPart, CardDef, DamageType, GameState, Hero, PlannedAttack } from '../types.ts';

export interface CardInfo {
  card: CardDef;
  maxValue: number; // 本张卡单个攻击/助攻的最大数值
  attack: boolean;
  support: boolean;
  protect: boolean;
  lightning: boolean;
  types: DamageType[];
  damagedBoss: boolean;
}

export interface DamageRoute {
  part?: BossPart; // 由手下/触手/头等承受
  partMult?: number; // 部位承受倍率（巨触手替换触手 0.5）
  bodyShare?: number; // 本体同时承受的伤害（巨触手"极少伤害"）
  mult?: number; // 本体伤害倍率（果冻怪软弱 ×3）
  blocked?: string; // 无效（以太龙空中近战、免疫）
}

/** 魔王插件接口（04 第 1 节：通用触发器 + 插件）。每个钩子都可选。 */
export interface BossModule {
  id: string;
  name: string;
  /** 战役顺序：0=教学、1–10 */
  order: number;
  setup(s: GameState): void;
  /** 护盾阶段。返回 null = 本回合没有护盾 */
  shields(s: GameState): Record<DamageType, number> | null;
  plan(s: GameState): PlannedAttack[];
  actionPhaseStart?(s: GameState): void;
  routeDamage?(s: GameState, h: Hero, type: DamageType, kind: 'attack' | 'support'): DamageRoute;
  onPartHit?(s: GameState, h: Hero, part: BossPart, dealt: number, type: DamageType): void;
  onPartDefeated?(s: GameState, h: Hero, part: BossPart): void;
  onShieldHit?(s: GameState, h: Hero, type: DamageType): void;
  onShieldBroken?(s: GameState, h: Hero, type: DamageType): void;
  onCardResolved?(s: GameState, h: Hero, info: CardInfo): void;
  onProtect?(s: GameState, h: Hero): void;
  onItemUsed?(s: GameState, h: Hero): void;
  onBossDamaged?(s: GameState, h: Hero | null): void;
  /** 魔王生命归零时调用；返回 true 表示复活/进入下一阶段，不算胜利 */
  onDefeated?(s: GameState): boolean;
  actionPhaseEnd?(s: GameState): void;
  /** [round] 周期能力：攻击阶段之后、状态阶段之前 */
  afterAttack?(s: GameState): void;
  /** 状态阶段魔王自身处理 */
  statusPhase?(s: GameState): void;
  /** 魔王中毒伤害倍率（抗毒 0.5 等） */
  poisonMult?(s: GameState): number;
  /** 本回合魔王攻击被造成伤害时（吸血等） */
  onHeroHit?(s: GameState, h: Hero, dmg: number, a: PlannedAttack): void;
  /** 炸弹克精：每次正常行动后（时间制） */
  afterAnyAction?(s: GameState, h: Hero, consumed: 'lightning' | 'interrupt' | 'normal'): void;
  /** 攻击/助攻数值修正（熔岩王高热 -1 等） */
  modifyValue?(s: GameState, h: Hero, type: DamageType, kind: 'attack' | 'support', v: number): number;
  /** 每回合每人行动数（巫毒天后割魂） */
  actionsFor?(s: GameState, h: Hero): number;
  /** 战术提示：机器人和界面用（避开/优先打哪种属性） */
  hint?(s: GameState): { avoid?: DamageType[]; prefer?: DamageType[] };
  /** 时间制魔王：接管回合结束判定 */
  timeMode?: boolean;
}

let idc = 0;
export function attack(s: GameState, target: number, key: string, name: string, value: number, extra: AttackExtra = {}): PlannedAttack {
  return { id: `a${s.round}_${idc++}`, nameKey: key, name, target, value, extra, reducedBy: 0 };
}
