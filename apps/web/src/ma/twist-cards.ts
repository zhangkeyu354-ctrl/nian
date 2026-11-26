/** 扭扭赛道 13 张 Twist 事件卡：给玩家看的名字和说明（规则以引擎为准，见 USER_SPEC_V1.md 第 6 节） */
export interface TwistCardInfo {
  id: number;
  zh: string;
  en: string;
  /** 一两句话说清楚效果 */
  text: string;
  /** 持续到本场结束的效果 */
  lasting?: boolean;
}

export const TWIST_CARDS: Record<number, TwistCardInfo> = {
  1: { id: 1, zh: "地上烤鸡！", en: "Roast Chicken on the Ground!", text: "现在排在最后的选手（并列的都算）向前移动 7 格。" },
  2: { id: 2, zh: "镜像世界生效！", en: "Mirror World Theory Confirmed!", text: "比赛方向反过来：大家原地不动，改为朝旧起点（第 0 格）冲线。前后、领先、末位都跟着反过来。", lasting: true },
  3: { id: 3, zh: "传送带启动！", en: "The Conveyor Belt Is On!", text: "所有还在比赛的选手传送回起点后一格；本场每个人的主移动都 +3 格。", lasting: true },
  4: { id: 4, zh: "禁跑水潭！", en: "No Running by the Scrying Pool!", text: "本场主移动要走 6 格或更多的选手直接淘汰（不走这一步）。走 5 格没事；技能移动不算。", lasting: true },
  5: { id: 5, zh: "终点虫潮！", en: "Bonkbug Infestation at the Finish Line!", text: "本场停在终点前最后两格的选手后退 5 格。路过不算，冲线不受影响。", lasting: true },
  6: { id: 6, zh: "随机性消失！", en: "Randomness Has Randomly Ceased!", text: "每位玩家各掷一次骰子，本场剩下的掷骰都固定用这个点数。", lasting: true },
  7: { id: 7, zh: "皮纳塔破了！", en: "The Piñata Is Leaking!", text: "第一个弯道之后每个空格都放 1 分筹码，停上去就捡起来 +1 分。" },
  8: { id: 8, zh: "人人诅咒魔杖！", en: "Curse Wands for Everyone!", text: "本场每个回合结束时掷骰，按点数跳过后面几个人的回合。", lasting: true },
  9: { id: 9, zh: "炼金实验室泄露！", en: "Alchemy Lab Containment Breach!", text: "怪物从起点出发，每回合结束掷骰往前追，被它超过的选手淘汰。", lasting: true },
  10: { id: 10, zh: "观众渴求混乱！", en: "The Fans Demand Chaos!", text: "再从牌堆抽两张事件卡，按顺序一张一张生效。" },
  11: { id: 11, zh: "交换大会！", en: "Swap Meet!", text: "每位玩家抽一名新选手，可以选择换下自己场上的选手（位置不变）。" },
  12: { id: 12, zh: "季终决战！", en: "Season Finale!", text: "比赛照常继续。前两名冲线后，两人从第二个弯道再比一场 1 对 1 决赛，赢的人拿两份奖杯分。" },
  13: { id: 13, zh: "踩到时之灵！", en: "You Tromped on a Time Imp!", text: "翻到这张卡的选手被淘汰，但下一场比赛会额外上场。" },
};

/** 从引擎日志「X 抽到 Twist 事件 N。」里取出卡号 */
export function twistCardFromLog(text: string): number | null {
  const m = /抽到 Twist 事件 (\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}
