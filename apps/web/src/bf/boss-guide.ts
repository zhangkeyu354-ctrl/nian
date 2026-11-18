// 魔王能力说明：能力发动后在播报里补一句大白话（只解释已发生的事，不预告何时发动）。
// 周期数字直接取自引擎平衡表，改数值时这里自动跟着变。
import {
  AETHER_DRAGON as AD, JELLY as JL, MAGMAROS as MG, OGRE, PRINCE, PUPPET, SOUL_HUNTRESS as SH, STONE_GOLEM as SG, VOODOO as VD,
} from "../../../../packages/boss-fighters/src/defs/balance.ts";

export interface BossAbility {
  name: string;
  /** 什么时候发动（一句话） */
  when: string;
  text: string;
  /** 每 N 回合发动一次：界面据此算“下次第几回合” */
  every?: number;
}
export interface BossGuide {
  /** 这个魔王和别人不一样的地方：攻击会打到哪里、护盾怎么来 */
  core: string[];
  abilities: BossAbility[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const BOSS_GUIDE: Record<string, BossGuide> = {
  puppet: {
    core: ["教学关。第 1 回合没有护盾，之后每回合立起三种护盾，越打越少。"],
    abilities: [
      { name: "毒螺旋", when: "第 2 回合起的攻击", text: "每人挨一下，并获得 1 个中毒标记。" },
      { name: "虚耗", when: `第 ${PUPPET.tiredFrom} 回合起`, text: "木偶累了，之后每回合攻击越来越弱。" },
    ],
  },
  prince: {
    core: ["每回合都有三种护盾。被打到一半生命后会“膨胀”，攻击和护盾都变强。"],
    abilities: [
      { name: "舌鞭", when: `每 ${PRINCE.tongueEvery} 回合，攻击之后`, every: PRINCE.tongueEvery, text: "生命最高的英雄掉血，并获得中毒标记。" },
      { name: "蹂躏", when: `每 ${PRINCE.overrunEvery} 回合，攻击之后`, every: PRINCE.overrunEvery, text: "每位英雄都掉血。" },
      { name: "剧毒喷吐", when: "你打出数值很大的攻击或助攻时", text: "出牌的人获得 1 个中毒标记。" },
      { name: "发怒", when: `第 ${PRINCE.rageRound} 回合起`, text: "之后所有攻击都更强。" },
      { name: "膨胀", when: "生命掉到一半时", text: "攻击和护盾都增加。" },
      { name: "抗毒", when: "每回合结束", text: "他身上的中毒会自己减少 1。" },
    ],
  },
  soulHuntress: {
    core: ["每回合都有三种护盾。第一次被打倒后会复活，并且护盾更厚。"],
    abilities: [
      { name: "吸收生命", when: "她的攻击打伤你时", text: "她按造成的伤害给自己回血。保护挡掉的伤害她就吸不到。" },
      { name: "噩梦", when: `每 ${SH.nightmareEvery} 回合，攻击之后`, every: SH.nightmareEvery, text: `每人掉 ${SH.nightmareDamage} 血，牌库顶 ${SH.nightmareMill} 张牌直接进弃牌堆。` },
      { name: "猎魂", when: `每 ${SH.huntEvery} 回合，攻击之后`, every: SH.huntEvery, text: "生命最高的英雄掉血，并抽 1 张诅咒。" },
      { name: "复活", when: "第一次被打倒时", text: "满血回来，护盾变厚；每人抽诅咒并随机弃手牌。" },
    ],
  },
  aetherDragon: {
    core: [
      "在天上时：只有远程盾和魔法盾，近战完全打不到它；其中一块盾被打到会让你惊恐。",
      "一回合内对它造成足够伤害，回合结束时它会落地。落地后三种攻击都能打，但护盾可能带尖刺。",
      `在地上待久了会再飞起来；第 ${AD.forceLandRound} 回合前后会被迫落地。`,
    ],
    abilities: [
      { name: "拍翼攻击", when: `在天上时，每 ${AD.wingEvery} 回合`, every: AD.wingEvery, text: "每人手里每有 1 张牌就掉血，手牌越多掉得越多。" },
      { name: "穿刺龙吟", when: `在地上时，每 ${AD.roarEvery} 回合`, every: AD.roarEvery, text: "生命最高的英雄掉血，并获得惊恐。" },
      { name: "尖刺护盾", when: "落地后", text: "打到带尖刺的那块盾，出牌的人掉血。" },
      { name: "放手一搏", when: "生命很低时", text: "再也不能飞起，但攻击变强，还会对生命最高的人放大招。" },
    ],
  },
  stoneGolem: {
    core: ["每回合三种护盾中有一块带“危险碎片”：把它打碎的人会掉血。", "回合结束时，没打掉的护盾会变成它的回血。"],
    abilities: [
      { name: "岩石精华", when: `每 ${SG.essenceEvery} 回合，攻击之后`, every: SG.essenceEvery, text: "剩下几点护盾，它就回几点血。" },
      { name: "冻结", when: `每 ${SG.freezeEvery} 回合，攻击之后`, every: SG.freezeEvery, text: "每人获得麻痹，身上每有 1 个麻痹掉 1 血。" },
      { name: "充能", when: "大家打出带闪电的牌时", text: "闪电牌会给它充能。充满后升级，之后每打一张闪电牌，出牌的人都会被石精打。" },
      { name: "石甲", when: "每隔几回合、每次充满能", text: "护盾总量永久增加。" },
      { name: "石化", when: "生命掉到一半时", text: "每人获得 1 个麻痹。" },
    ],
  },
  ogre: {
    core: [
      "没有护盾。三个头各只吃一种攻击：口水怪吃魔法，尖突怪吃远程，长毛怪吃近战。打死了某个头，那种攻击就打不出伤害。",
      `每回合有一个头“主导”，这回合的攻击都是它出的。主导的头这回合挨够伤害就会被击晕，回合末的大招会变弱。第 ${OGRE.meleeAnyFrom} 回合起近战可以打任意一个头。`,
    ],
    abilities: [
      { name: "口水怪主导", when: "它主导的回合", text: "开局每人中毒；回合末再喷毒，没被击晕的话中毒伤害永久 +1。" },
      { name: "尖突怪主导", when: "它主导的回合", text: "开局每人抽诅咒并立即生效；回合末移除牌库的牌并抽诅咒，没被击晕时更狠。" },
      { name: "长毛怪主导", when: "它主导的回合", text: "这回合攻击更强；回合末没被击晕的话攻击永久变强，被击晕的话之后更难击晕。" },
    ],
  },
  tentacolossus: {
    core: [
      "本体被六条触手护着：近战、远程、魔法各有一条“攻击触手”和一条“助攻触手”。你的攻击会先打到对应的触手，本体只吃到一小部分。",
      "只有这回合攻击过它的人，才会挨它的攻击。",
      "打残触手有奖励：残 1 条它变弱，残 2 条下回合攻击值被墨汁遮住，残 4 条你的伤害更大。",
    ],
    abilities: [
      { name: "触手反击", when: "每回合第一个打某条触手的人", text: "按触手不同：中毒、抽诅咒，或被吸血。" },
      { name: "轮转大招", when: "每 2 回合，攻击之后", every: 2, text: "依次是：触手乱舞（每条活着的触手让每人弃 1 张牌或掉血）→ 停滞（麻痹）→ 腐烂（中毒）→ 黑暗（惊恐）。" },
      { name: "抗毒", when: "一直", text: "中毒对它只有一半效果。" },
    ],
  },
  magmaros: {
    core: [
      "本体没有护盾，由三个手下挡着：岩浆手下吃近战，灰烬手下吃远程，火焰手下吃魔法。打倒的手下下回合满血回来。",
      "某种攻击对应的手下倒下了，这种攻击就能直接打到本体。",
      `生命掉到 1/3 时，手下消失，换成三块带火的岩浆护盾。`,
    ],
    abilities: [
      { name: "手下反击", when: "你打到手下时", text: "岩浆手下让你弃一张保护牌；灰烬手下让魔王打你更狠；火焰手下给你着火。" },
      { name: "手下回合", when: "每回合行动结束，活着的手下各出一招", text: "岩浆打生命最高的人，灰烬给魔王回血，火焰让每人着火。" },
      { name: "热力 / 燃烧吧", when: `一个人一回合打出第 ${MG.heatAt} 张攻击起`, text: "这回合你的攻击和助攻 -1；再多打还会着火。" },
      { name: "火浪", when: `每 ${MG.fireWaveEvery} 回合`, every: MG.fireWaveEvery, text: "每人着火。" },
      { name: "焚烧", when: `每 ${MG.burnEvery} 回合`, every: MG.burnEvery, text: "身上每有 1 个着火掉 1 血。" },
      { name: "灰烬雨", when: `每 ${MG.ashRainEvery} 回合`, every: MG.ashRainEvery, text: "每人出牌区的牌全部进弃牌堆。" },
      { name: "闷烧", when: "生命掉到一半时", text: "攻击变强，每人着火。" },
    ],
  },
  bombossa: {
    core: [
      "这关比的是时间：每做一个普通行动，剩余时间减 1，时间用完就输。闪电带来的额外行动不扣时间。",
      "她身边会放下炸弹，每个炸弹占一种攻击类型，打那种攻击就是在拆它。炸弹倒数到 0 会爆炸。",
      "她不按回合攻击，而是每掉一截血就反击一次。",
    ],
    abilities: [
      { name: "拆除炸弹", when: "炸弹被打掉时", text: "每人抽 1 张牌。" },
      { name: "炸弹爆炸", when: "倒数到 0", text: "按炸弹种类：中毒、惊恐、掉血、着火、弃牌、扣时间或给她回血。" },
      { name: "计时炸弹", when: "时间过去 1/3、2/3 时", text: "手牌最少的人拿到计时炸弹；打出闪电牌可以把它传给下一位。爆炸时持有者弃牌并掉血。" },
      { name: "引线轰击", when: "她每被打掉一截血，隔一次", text: "每人掉血并着火，之后她的引线变短、攻击变弱。" },
    ],
  },
  jelly: {
    core: [
      "本体没有护盾，被三只黏液精护着，每只占一种攻击类型（每局位置随机）。你的攻击会先打到对应的黏液精。",
      "三只全倒下的那一回合，直接打本体伤害 ×3；回合结束时它分裂出新的三只。",
      "它被打得越多越生气，攻击越来越强；分裂后消气。",
    ],
    abilities: [
      { name: "黏液精反击", when: "你打到黏液精时", text: "滑溜的塞给你一张没用的黏液牌，诅咒的让你抽诅咒，麻痹的给你 2 个麻痹。" },
      { name: "迷失黏液中", when: `每 ${JL.lostEvery} 回合`, every: JL.lostEvery, text: "每人牌库顶 2 张牌进失物堆。" },
      { name: "腐蚀", when: `每 ${JL.corrodeEvery} 回合`, every: JL.corrodeEvery, text: "失物堆里随机 1 张牌本场移除。" },
      { name: "腐蚀黏液精", when: `每 ${JL.causticEvery} 回合`, every: JL.causticEvery, text: "手里每有 1 张黏液牌就掉血。" },
      { name: "果冻泡泡", when: `生命掉到 ${pct(JL.bubbleAt)} 时`, text: "攻击变强；之后保护牌用完会掉进失物堆，中毒反而会给它回血。" },
    ],
  },
  madameVoodoo: {
    core: [
      `第一阶段：每回合三个亡灵手下随机出场，各占一种攻击类型，攻击会先打到手下。同一种攻击一回合打超过 ${VD.boringAt} 次会被她无视。前 ${VD.soulCutRounds} 回合每人只有 2 个行动。`,
      "每回合第一张直接伤到她的牌，结算后本场移除。",
      "第二阶段（复活后）：有三种护盾，其中骸骨盾被打到她回血，巫毒盾被打到拿着巫毒人偶的人掉血。她挨了哪种攻击，就对那种攻击免疫，直到挨了别的类型。",
    ],
    abilities: [
      { name: "亡灵手下", when: "第一阶段，每回合", text: "不同手下各有招：中毒、麻痹、惊恐、着火、抽诅咒、遮住攻击值、让攻击吸血……打倒它就停。" },
      { name: "亡灵计时炸弹", when: `第 ${VD.bombRounds.join("、")} 回合`, text: `随机一人拿到炸弹，${VD.bombFuse} 回合后爆炸：弃牌并掉血。` },
      { name: "吉他独奏", when: `第二阶段，每 ${VD.guitarEvery} 回合`, every: VD.guitarEvery, text: "三种护盾都变厚。" },
      { name: "死亡之歌", when: `第二阶段生命掉到 ${pct(VD.deathSongAt)} 时`, text: "每人立刻失去一半生命。" },
    ],
  },
};

/** 能力发动后的补充说明（只在播报里、能力已经发生之后显示，不做预告） */
export function abilityHelp(bossId: string, title: string): string | null {
  const g = BOSS_GUIDE[bossId];
  if (!g) return null;
  const a = g.abilities.find((x) => title === x.name || title.startsWith(x.name) || x.name.split(" / ").some((n) => title.startsWith(n)));
  return a ? a.text : null;
}

/** 状态标记说明（攻击附加效果、英雄头像上的标记都用这一份） */
export const STATUS_HELP: Record<string, string> = {
  poison: "中毒：每回合结束时，每个标记掉 1 血。",
  panic: "惊恐：每个标记让你下一次出牌变成随机打出一张手牌。",
  paralysis: "麻痹：手牌上限变少。",
  fire: "着火：每回合翻开牌库顶的牌，选择本场移除它或弃掉并掉 2 血。",
  curse: "诅咒：抽一张诅咒牌，下回合起生效。",
  drain: "吸血：这次攻击造成的伤害会给魔王回血。",
  slime: "黏液：塞给你一张没用的黏液牌，占手牌位置。",
  lost: "失物：牌库顶的牌掉进失物堆，暂时拿不回来。",
  discard: "弃牌：随机弃掉手牌。",
};
