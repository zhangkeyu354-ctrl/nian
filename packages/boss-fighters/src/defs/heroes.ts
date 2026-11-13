import type { IdentityDef } from '../types.ts';

// 英雄/职业：手牌/生命 1 级=2 级（2 级只加能力），3 级加生命（05 N 节、JP_CARDS_ZH 第六节）
// 进阶卡归属：日本贴纸 PDF 中卡框花纹与初始卡一致（符文=矮人、火焰=法师、藤蔓=精灵、利爪=德鲁伊、尖刺=盗贼、荆棘=巨魔、几何=战士、烟雾=半身人）
export const IDENTITIES: Record<string, IdentityDef> = {
  troll: {
    id: 'troll', name: '丛林巨魔', kind: 'race', levels: [[4, 16], [4, 16], [4, 22]], levelNames: ['丛林巨魔', '老练巨魔', '巨魔酋长'],
    ability: '你的回合中首次用攻击伤到魔王时，打出你的牌库顶牌（或使用祖传玻璃眼）。',
    cards: ['troll_axe', 'troll_belt', 'troll_smoothie', 'troll_spear', 'troll_horn', 'troll_stone'],
    advanced: ['adv_grandma_helmet', 'adv_bone_club', 'adv_whack', 'adv_shoulder_ram'],
  },
  halfling: {
    id: 'halfling', name: '丘陵半身人', kind: 'race', levels: [[6, 11], [6, 11], [6, 15]], levelNames: ['丘陵半身人', '老练半身人', '半身人运势大师'],
    ability: '你破坏魔王护盾时，魔王立即失去 4 生命。',
    cards: ['hal_blinky', 'hal_stone', 'hal_dent', 'hal_dagger', 'hal_cloak', 'hal_pebbles'],
    advanced: ['adv_improvise', 'adv_lucky_brooch', 'adv_snarlroot'], // 第 4 张为纯数值卡，资料未收录，暂不放入
  },
  dwarf: {
    id: 'dwarf', name: '铜矮人', kind: 'race', levels: [[5, 14], [5, 14], [5, 19]], levelNames: ['铜矮人', '老练矮人', '矮人宝物守护者'],
    ability: '你用保护把魔王攻击减到 0 时，可立即再行动 1 次（打出攻击或使用皮水袋）。',
    cards: ['dw_cleaver', 'dw_blaster', 'dw_chest', 'dw_knuckles', 'dw_morningstar', 'dw_bracers'],
    advanced: ['adv_runestone', 'adv_antiboss', 'adv_guard_helmet', 'adv_rune_king'],
  },
  elf: {
    id: 'elf', name: '木精灵', kind: 'race', levels: [[5, 14], [5, 14], [5, 19]], levelNames: ['木精灵', '老练精灵', '木精灵看护人'],
    ability: '本回合你已打出同属性攻击时，你的助攻 +2。',
    cards: ['elf_starblade', 'elf_volley', 'elf_sunfire', 'elf_flurry', 'elf_shield', 'elf_bow'],
    advanced: ['adv_protection_spell', 'adv_lyria_ring', 'adv_precision_shot', 'adv_diadem'],
  },
  warrior: {
    id: 'warrior', name: '战士', kind: 'class', levels: [[1, 10], [1, 10], [1, 15]], levelNames: ['战士', '资深战士', '精英战士'],
    ability: '每回合你第一次攻击打中魔王护盾时，护盾效果无效。',
    cards: ['war_amulet', 'war_crossbow', 'war_daggers', 'war_blade', 'war_mail', 'war_sword'],
    advanced: ['adv_feint', 'adv_vengeance', 'adv_chivalrous'], // 第 4 张为纯数值卡，资料未收录，暂不放入
  },
  mage: {
    id: 'mage', name: '法师', kind: 'class', levels: [[2, 7], [2, 7], [2, 11]], levelNames: ['法师', '资深法师', '大法师'],
    ability: '你每失去 ≥1 生命，可抽 1 张。',
    cards: ['mag_fireball', 'mag_explosion', 'mag_dagger', 'mag_flameshield', 'mag_obsidian', 'mag_drain'],
    advanced: ['adv_dejavu', 'adv_demonic_pact', 'adv_meteor', 'adv_arcane_overload'],
  },
  rogue: {
    id: 'rogue', name: '盗贼', kind: 'class', levels: [[1, 10], [1, 10], [1, 15]], levelNames: ['盗贼', '资深盗贼', '盗贼王'],
    ability: '即使本回合没人打出同属性攻击，你也能打出有效助攻。',
    cards: ['rog_shadowblade', 'rog_trap', 'rog_crossbow', 'rog_kunai', 'rog_robe', 'rog_sting'],
    advanced: ['adv_poison_blade', 'adv_raven', 'adv_smoke_bomb', 'adv_viper'],
  },
  druid: {
    id: 'druid', name: '德鲁伊', kind: 'class', levels: [[2, 7], [2, 7], [2, 11]], levelNames: ['德鲁伊', '资深德鲁伊', '高级德鲁伊'],
    ability: '每回合你打出的第一张保护获得闪电。',
    cards: ['dru_staff', 'dru_explosion', 'dru_wall', 'dru_fang', 'dru_crows', 'dru_vortex'],
    advanced: ['adv_mask', 'adv_phoenix_owl', 'adv_antidote', 'adv_mushroom'],
  },
};

export const RACES = ['troll', 'halfling', 'dwarf', 'elf'];
export const CLASSES = ['warrior', 'mage', 'rogue', 'druid'];
