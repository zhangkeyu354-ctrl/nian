import type { CardDef, Effect } from '../types.ts';

type T = 'melee' | 'ranged' | 'magic';
const atk = (type: T, value: number | 'round' | 'vengeance', noShieldEffect = false): Effect => ({ kind: 'attack', type, value, ...(noShieldEffect ? { noShieldEffect } : {}) });
const sup = (type: T, value: number): Effect => ({ kind: 'support', type, value });
const prot = (value: number | 'round', cancelEffects = false): Effect => ({ kind: 'protect', value, ...(cancelEffects ? { cancelEffects } : {}) });
const L: Effect = { kind: 'lightning' };
const heal = (value: number, target: 'self' | 'choose' | 'all' | 'two' = 'choose'): Effect => ({ kind: 'heal', value, target });
const draw = (n: number, target: 'self' | 'choose' | 'chosen' | 'all' = 'self'): Effect => ({ kind: 'draw', n, target });

function card(id: string, name: string, owner: string, category: CardDef['category'], source: CardDef['source'], effects: Effect[], stars?: number): CardDef {
  return { id, name, owner, category, source, effects, ...(stars ? { stars } : {}) };
}
const I = (id: string, name: string, owner: string, src: CardDef['source'], e: Effect[]) => card(id, name, owner, 'initial', src, e);
const A = (id: string, name: string, owner: string, src: CardDef['source'], e: Effect[]) => card(id, name, owner, 'advanced', src, e);
const Lt = (stars: number, id: string, name: string, e: Effect[], src: CardDef['source'] = 'official') => card(id, name, 'loot', 'loot', src, e, stars);

// ———— 48 张初始卡（official=规则书/日本贴纸；observed=实拍或视频；tentative=暂定）————
export const INITIAL: CardDef[] = [
  I('troll_axe', '飞斧', 'troll', 'observed', [atk('ranged', 2)]),
  I('troll_belt', '祖传腰带', 'troll', 'tentative', [prot(4)]),
  I('troll_smoothie', '蟾蜍饮料', 'troll', 'official', [heal(3), draw(2, 'chosen')]),
  I('troll_spear', '幽魂长矛', 'troll', 'observed', [atk('magic', 3)]),
  I('troll_horn', '酋长号角', 'troll', 'official', [draw(3, 'choose'), { kind: 'immediateAction', target: 'chosen' }]),
  I('troll_stone', '先祖石', 'troll', 'tentative', [atk('melee', 3)]),
  I('hal_blinky', '闪石', 'halfling', 'tentative', [sup('magic', 2), L]),
  I('hal_stone', '先祖石', 'halfling', 'tentative', [atk('magic', 3)]),
  I('hal_dent', '石弹', 'halfling', 'tentative', [atk('ranged', 3)]),
  I('hal_dagger', '华丽匕首', 'halfling', 'observed', [atk('melee', 2)]),
  I('hal_cloak', '耳语斗篷', 'halfling', 'observed', [prot(3)]), // 视频：防护 3（正文被挡）
  I('hal_pebbles', '卵石袋', 'halfling', 'tentative', [sup('ranged', 3)]),
  I('dw_cleaver', '石砍斧', 'dwarf', 'observed', [atk('melee', 4)]), // 视频：近战攻击 4
  I('dw_blaster', '坑道爆弹', 'dwarf', 'observed', [atk('ranged', 2)]),
  I('dw_chest', '胸甲', 'dwarf', 'observed', [prot(4)]),
  I('dw_knuckles', '铜指虎', 'dwarf', 'tentative', [sup('melee', 3), L]),
  I('dw_morningstar', '流星锤', 'dwarf', 'observed', [sup('melee', 5), { kind: 'selfDamage', value: 2 }]), // 视频：近战助攻 5、自损 2
  I('dw_bracers', '钛腕甲', 'dwarf', 'tentative', [prot(3)]),
  I('elf_starblade', '星刃', 'elf', 'official', [atk('melee', 3)]),
  I('elf_volley', '齐射', 'elf', 'official', [sup('ranged', 4)]),
  I('elf_sunfire', '阳火', 'elf', 'official', [atk('magic', 4)]),
  I('elf_flurry', '魔法乱箭', 'elf', 'official', [sup('magic', 3)]),
  I('elf_shield', '光明盾', 'elf', 'official', [prot(3)]),
  I('elf_bow', '盖亚之弓', 'elf', 'official', [atk('ranged', 4), draw(1, 'choose')]),
  I('war_amulet', '猛熊护符', 'warrior', 'tentative', [heal(4)]),
  I('war_crossbow', '手弩', 'warrior', 'observed', [atk('ranged', 3)]),
  I('war_daggers', '飞刀', 'warrior', 'tentative', [sup('ranged', 3)]),
  I('war_blade', '闪电刃', 'warrior', 'observed', [atk('magic', 3)]),
  I('war_mail', '锁子甲', 'warrior', 'tentative', [prot(4)]),
  I('war_sword', '红石护卫剑', 'warrior', 'tentative', [atk('melee', 4)]),
  I('mag_fireball', '火球', 'mage', 'tentative', [atk('magic', 4)]),
  I('mag_explosion', '魔法爆炸', 'mage', 'observed', [sup('magic', 4)]), // 视频：魔法助攻 4
  I('mag_dagger', '仪式匕首', 'mage', 'observed', [atk('melee', 3)]), // 视频正文：近战攻击 3
  I('mag_flameshield', '炎盾', 'mage', 'observed', [sup('magic', 2), prot(2)]), // 视频：魔法助攻 2、防护 2
  I('mag_obsidian', '黑曜碎石', 'mage', 'observed', [atk('ranged', 3)]),
  I('mag_drain', '吸收能量', 'mage', 'official', [atk('magic', 2), heal(2)]),
  I('rog_shadowblade', '暗影刀', 'rogue', 'tentative', [atk('melee', 3)]),
  I('rog_trap', '尖刺陷阱', 'rogue', 'tentative', [sup('melee', 3)]),
  I('rog_crossbow', '手弩', 'rogue', 'observed', [atk('ranged', 3)]),
  I('rog_kunai', '苦无', 'rogue', 'tentative', [sup('ranged', 2), L]),
  I('rog_robe', '幽影斗篷', 'rogue', 'tentative', [prot(3)]),
  I('rog_sting', '黄蜂刺', 'rogue', 'official', [atk('ranged', 2), L]),
  I('dru_staff', '蓝刺李手杖', 'druid', 'observed', [atk('magic', 3)]), // 视频正文：魔法攻击 3
  I('dru_explosion', '魔法爆炸', 'druid', 'observed', [sup('magic', 4)]), // 与法师同名卡，视频：魔法助攻 4
  I('dru_wall', '根藤铁壁', 'druid', 'observed', [prot(3)]),
  I('dru_fang', '龙牙刀', 'druid', 'observed', [atk('melee', 3)]),
  I('dru_crows', '群鸦杀', 'druid', 'observed', [atk('ranged', 4)]),
  I('dru_vortex', '魔旋风', 'druid', 'official', [atk('magic', 2), L]),
];

// ———— 32 张进阶行动卡（铜箱，教学关后加入；JP_CARDS_ZH 第二节逐张核对）————
export const ADVANCED: CardDef[] = [
  A('adv_runestone', '符文石', 'dwarf', 'official', [atk('magic', 'round'), L]),
  A('adv_antiboss', '要你命3000', 'dwarf', 'official', [{ kind: 'preventNextRound' }, { kind: 'exileSelf' }]),
  A('adv_guard_helmet', '守卫头盔', 'dwarf', 'official', [prot(2), { kind: 'removeStatus', n: 1, target: 'choose' }]),
  A('adv_rune_king', '王者符文', 'dwarf', 'official', [draw(1, 'all'), L]),
  A('adv_dejavu', '既视感', 'mage', 'official', [{ kind: 'replayDiscard' }]),
  A('adv_demonic_pact', '恶魔契约', 'mage', 'official', [prot(5), { kind: 'selfDamage', value: 2 }]),
  A('adv_meteor', '流星雨', 'mage', 'official', [{ kind: 'meteor' }, { kind: 'selfDamage', value: 2 }]),
  A('adv_arcane_overload', '奥术超负荷', 'mage', 'official', [atk('magic', 2), L]),
  A('adv_protection_spell', '护身咒', 'elf', 'official', [prot(2), L]),
  A('adv_lyria_ring', '莉莉亚之戒', 'elf', 'official', [heal(2, 'all'), L]),
  A('adv_precision_shot', '精准射击', 'elf', 'official', [atk('ranged', 'round'), L]),
  A('adv_diadem', '隐身之冕', 'elf', 'official', [{ kind: 'nextBuff', match: 'attack', mode: 'plus', n: 3 }, L]),
  A('adv_mask', '透视面具', 'druid', 'official', [{ kind: 'peekTop3' }]),
  A('adv_phoenix_owl', '凤凰鸮', 'druid', 'official', [{ kind: 'nextBuff', match: 'attack', mode: 'healEqual' }, L]),
  A('adv_antidote', '解药', 'druid', 'official', [{ kind: 'removeStatus', n: 2, target: 'choose' }, L]),
  A('adv_mushroom', '磨菇粉', 'druid', 'official', [heal(5), { kind: 'immediateAction', target: 'chosen' }]),
  A('adv_poison_blade', '淬毒之刃', 'rogue', 'official', [atk('melee', 2), { kind: 'bossPoison', n: 1 }]),
  A('adv_raven', '黑鸦诅咒', 'rogue', 'official', [{ kind: 'bossLoseHp', n: 2 }, { kind: 'ward', against: 'trap' }]),
  A('adv_smoke_bomb', '烟雾弹', 'rogue', 'official', [prot(2, true), L]),
  A('adv_viper', '蝰蛇牙', 'rogue', 'official', [atk('ranged', 2), { kind: 'bossPoison', n: 1 }]),
  A('adv_grandma_helmet', '家传头盔', 'troll', 'official', [prot(4), { kind: 'ifHealthAtLeast', n: 15, then: [{ kind: 'removeStatus', n: 2, target: 'self' }] }]),
  A('adv_bone_club', '骨杖', 'troll', 'official', [atk('melee', 4), { kind: 'ifHealthAtLeast', n: 15, then: [draw(2)] }]),
  A('adv_whack', '当头猛敲！', 'troll', 'official', [atk('melee', 'round'), L]),
  A('adv_shoulder_ram', '肩槌', 'troll', 'official', [sup('melee', 3), { kind: 'ifHealthAtLeast', n: 15, then: [heal(3, 'self')] }]),
  A('adv_feint', '佯攻', 'warrior', 'official', [sup('melee', 2), L]),
  A('adv_vengeance', '复仇符文', 'warrior', 'official', [atk('ranged', 'vengeance')]),
  A('adv_chivalrous', '义气相挺', 'warrior', 'official', [{ kind: 'redirect' }]),
  A('adv_war_unknown', '守卫重击', 'warrior', 'original', [atk('melee', 5)]),
  A('adv_improvise', '随机应变', 'halfling', 'official', [{ kind: 'playTop', n: 2 }]),
  A('adv_lucky_brooch', '幸运胸针', 'halfling', 'official', [prot(2), L]),
  A('adv_snarlroot', '咆根', 'halfling', 'official', [heal(3, 'self'), { kind: 'lightning', n: 2 }]),
  A('adv_hal_unknown', '疾行投石', 'halfling', 'original', [atk('ranged', 4)]),
];

// ———— 战利品（左下星级；道具类战利品见 ITEMS_BY_STAR）————
export const LOOT: CardDef[] = [
  Lt(1, 'loot_original_1', '冒险短剑', [atk('melee', 4)], 'original'),
  Lt(2, 'loot_original_2a', '远行长弓', [atk('ranged', 5)], 'original'),
  Lt(2, 'loot_original_2b', '守护披风', [prot(4)], 'original'),
  Lt(3, 'loot_original_3', '秘法光束', [atk('magic', 5)], 'original'),
  Lt(4, 'loot_original_4', '破阵战斧', [atk('melee', 5)], 'original'),
  Lt(7, 'loot_original_7', '裂空之矢', [atk('ranged', 6)], 'original'),
  Lt(8, 'loot_original_8', '星辉壁垒', [prot(6)], 'original'),
  Lt(9, 'loot_original_9', '苍穹雷击', [atk('magic', 7)], 'original'),
  Lt(10, 'loot_original_10', '终焉巨刃', [atk('melee', 8)], 'original'),
  Lt(1, 'loot_blade_wind', '风刃', [atk('melee', 3), L]),
  Lt(1, 'loot_banner', '勇气旌旗', [{ kind: 'immediateAction', target: 'chosen' }, L]),
  Lt(1, 'loot_cursebreaker', '破咒吊坠', [{ kind: 'discardCurse' }]),
  Lt(1, 'loot_living_boots', '神靴', [prot(1), draw(1, 'choose'), L]),
  Lt(2, 'loot_inspire', '激励', [draw(3, 'choose'), { kind: 'immediateAction', target: 'chosen' }]),
  Lt(2, 'loot_celestial_rune', '天空符文', [atk('magic', 4), draw(1, 'choose')]),
  Lt(2, 'loot_poison_weapon', '淬毒武器', [{ kind: 'shieldReduce', n: 2, poisonIfBroken: 2 }]),
  Lt(3, 'loot_shoulder_plates', '神圣肩甲', [prot(4, true)]),
  Lt(3, 'loot_elixir', '粗心灵药', [{ kind: 'removeStatus', n: 1, target: 'choose' }, { kind: 'removeStatus', n: 1, target: 'all' }]),
  Lt(3, 'loot_fairy_cocoon', '精灵茧', [heal(3, 'all'), L]),
  Lt(3, 'loot_pyro_trap', '烟火陷阱', [{ kind: 'shieldReduce', n: 4, noShieldEffect: true }]),
  Lt(4, 'loot_magic_skin', '魔法皮肤', [prot('round'), L]),
  Lt(4, 'loot_teamwork', '合作无间', [{ kind: 'allDrawThenTop', n: 2 }, L]),
  Lt(4, 'loot_ornithopter', '扑翼机', [{ kind: 'bossLoseHp', n: 3 }, L]),
  Lt(4, 'loot_plague', '瘟疫信使', [{ kind: 'putHandOnTop' }, { kind: 'bossPoison', n: 2 }]),
  Lt(5, 'loot_magic_lamp', '神灯', [{ kind: 'playTop', n: 3 }, { kind: 'exileForever' }]),
  Lt(5, 'loot_hypernova', '极新星', [sup('magic', 7), { kind: 'selfDamage', value: 2 }]),
  Lt(5, 'loot_borax', '波雷克斯战槌', [atk('melee', 4), { kind: 'removeStatus', n: 1, target: 'choose' }]),
  Lt(5, 'loot_amulet_time', '时间护符', [{ kind: 'repeatLastAttack' }]),
  Lt(5, 'loot_spirit_armor', '幽灵护甲', [prot(3), prot(3), { kind: 'takeStatus', n: 1 }]),
  Lt(6, 'loot_drum', '祖先战鼓', [{ kind: 'removeStatus', n: 2, target: 'all' }]),
  Lt(6, 'loot_helmet_wind', '疾风头盔', [prot(3), L]),
  Lt(6, 'loot_chain_lightning', '连环闪电', [atk('magic', 4), { kind: 'nextBuff', match: 'magic', mode: 'plus', n: 3 }]),
  Lt(6, 'loot_smoldering_mace', '隐焰战锤', [atk('melee', 4), { kind: 'nextBuff', match: 'protect', mode: 'plus', n: 3 }]),
  Lt(6, 'loot_arrows_light', '光箭', [{ kind: 'nextBuff', match: 'ranged', mode: 'lightning' }]),
  Lt(7, 'loot_dragon_saliva', '龙涎', [heal(6, 'two')]),
  Lt(7, 'loot_lava_axe', '熔岩斧', [atk('melee', 6), { kind: 'selfDamage', value: 2 }]),
  Lt(7, 'loot_gaia_quiver', '盖亚箭袋', [atk('ranged', 4), { kind: 'bossPoison', n: 1 }]),
  Lt(7, 'loot_staff_poison', '五毒手杖', [{ kind: 'bossLosePerPoison', per: 1 }, L]),
  Lt(8, 'loot_thunder_spear', '雷矛', [atk('ranged', 8), { kind: 'exileSelf' }]),
  Lt(8, 'loot_magic_eruption', '魔法喷发', [{ kind: 'bossAttackMinusNext', n: 3 }, draw(2, 'choose')]),
  Lt(8, 'loot_arcane_moth', '魔蛾', [atk('magic', 3, true), L]),
  Lt(8, 'loot_poison_explosion', '毒液爆发', [{ kind: 'bossLosePerPoison', per: 3, clear: true }]),
  Lt(9, 'loot_vampiric', '吸血接触', [atk('magic', 4), heal(4)]),
  Lt(9, 'loot_winged_shield', '天翼盾牌', [prot(4), L]),
  Lt(9, 'loot_spiked_bola', '激突流星锤', [{ kind: 'nextBuff', match: 'ranged', mode: 'repeat' }, L]),
  Lt(9, 'loot_explosive_crystal', '易爆水晶', [{ kind: 'shieldReduce', n: 7, noShieldEffect: true }]),
  Lt(10, 'loot_astral_lens', '星空镜', [{ kind: 'nextBuff', match: 'magic', mode: 'repeat' }, L]),
  Lt(10, 'loot_tears', '怜悯之泪', [{ kind: 'ward', against: 'hpLoss' }]),
  Lt(10, 'loot_toxic', '蛊毒幻象', [{ kind: 'bossLosePerPoison', per: 1 }, { kind: 'exileSelf' }]),
  Lt(10, 'loot_frost_scorpion', '霜蝎螫击', [{ kind: 'bossLoseHp', n: 3 }, { kind: 'bossPoison', n: 2 }]),
];

export const SLIME: CardDef = card('slime', '黏液', 'slime', 'slime', 'official', [{ kind: 'slime' }]);

/** 道具类战利品与解锁时机（规则书 + 贴纸星级） */
export const ITEMS_BY_STAR: Record<number, ('luckyCharm' | 'medkit' | 'waterskin' | 'glassEye')[]> = {
  1: ['luckyCharm'],
  2: ['medkit'],
  3: ['waterskin', 'glassEye'],
};

export const CARDS: Record<string, CardDef> = Object.fromEntries(
  [...INITIAL, ...ADVANCED, ...LOOT, SLIME].map((c) => [c.id, c]),
);
