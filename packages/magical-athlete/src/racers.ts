/**
 * 魔法运动员（Magical Athlete，CMYK 2025 版）36 名基础角色。
 *
 * 来源：
 * - MA-B01：RulesPal 规则书文字版 Racer Info（https://www.rulespal.com/magical-athlete/rulebook），
 *   D 级辅助转录；与 tesera.ru 上的官方 PDF（MA-B02，文字层部分乱序）交叉核对。
 * - MA-D01：no2ooo/magical-athlete-gallery 中文图鉴（第三方中文译名，D 级）。
 * 中文名与说明为草稿（translation_status: DRAFT），由用户确认后改为 APPROVED。
 * 规则引擎只依赖 id，不依赖文字。
 */
export interface RacerInfo {
  id: string;
  en: string;
  zh: string;
  /** 技能名（英文原文 / 中文） */
  powerEn: string;
  powerZh: string;
  /** 能力说明（中文转述，非逐字翻译） */
  text: string;
  /** 补充判定（中文转述） */
  notes?: string;
  status: "CONFIRMED" | "CHECK_REQUIRED";
  /** CHECK_REQUIRED 时说明缺什么 */
  missing?: string;
  source_level: "D";
  source_ref: string;
  translation_status: "DRAFT";
}

const R = (
  id: string,
  en: string,
  zh: string,
  powerEn: string,
  powerZh: string,
  text: string,
  notes?: string,
  missing?: string,
): RacerInfo => ({
  id,
  en,
  zh,
  powerEn,
  powerZh,
  text,
  ...(notes ? { notes } : {}),
  status: missing ? "CHECK_REQUIRED" : "CONFIRMED",
  ...(missing ? { missing } : {}),
  source_level: "D",
  source_ref: "MA-B01 Racer Info；中文名 MA-D01",
  translation_status: "DRAFT",
});

export const RACERS: RacerInfo[] = [
  R("alchemist", "Alchemist", "炼金术士", "Transmute 'N' Scoot", "点石成金",
    "主移动掷出 1 或 2 时，可以改为移动 4 格。"),
  R("baba_yaga", "Baba Yaga", "芭芭雅嘎", "Leg It", "鸡脚小屋",
    "任何停到我格子上的选手摔倒；我停到别人的格子上时，他们也摔倒。",
    "被传送到她格子上的选手同样摔倒（例如催眠师把她拉过去）。"),
  R("banana", "Banana", "香蕉", "The Slip", "香蕉皮",
    "任何经过我的选手摔倒。"),
  R("blimp", "Blimp", "飞艇", "Blow It", "冲劲",
    "回合开始时若在赛道第二个弯道之前，主移动 +3；在该弯道或之后，主移动 −1。",
    undefined,
    "缺赛道「第二个弯道」的格子位置（赛道实物上才有），未确认前不进入选秀"),
  R("centaur", "Centaur", "半人马", "Hoofwhack", "尥蹶子",
    "我经过一名选手时，对方移动 −2。",
    "不会被推到起点之后。"),
  R("cheerleader", "Cheerleader", "啦啦队长", "Rah Rah", "加油打气",
    "主移动前，我可以让最后一名的选手移动 2 格；若这样做，我移动 1 格。",
    "并列最后一名时全部移动 2，我仍只移动 1；我自己是最后一名时，先移动 2 再移动 1，是两次移动。"),
  R("coach", "Coach", "教练", "Good Hustle", "团队激励",
    "与我同格的所有选手主移动 +1，包括我自己。"),
  R("copycat", "Copycat", "山寨猫", "Copy That", "抄作业",
    "我拥有当前领先选手的能力；并列领先时由我选。",
    "随时生效，不只在自己回合；与自身规则冲突时以复制来的能力为准；从不复制「赛前」能力。"),
  R("dicemonger", "Dicemonger", "骰贩子", "Dicey Deals", "开放重掷",
    "任何人每回合都可以重掷一次主移动的骰子；别人这样做时，我移动 1 格。"),
  R("duelist", "Duelist", "决斗者", "Duel!", "单挑",
    "每当有选手与我同格，我可以喊「决斗」：双方各掷一次骰，点数高者移动 2 格，平局算我赢。",
    "一回合可决斗多次，也可在别人回合决斗；不能打断进行中的动作（例如掷骰与移动之间）。"),
  R("egg", "Egg", "神秘蛋", "Scramble", "开盲盒",
    "赛前从牌堆抽 3 名新选手，选其中一名，我拥有它的能力。",
    "仍使用自己的棋子；仍会获得所选角色的「赛前」能力。"),
  R("flip_flop", "Flip Flop", "人字拖", "Flop Flip", "瞬间换位",
    "主移动时可以不掷骰，改为与另一名选手交换位置。",
    "交换是传送，不算移动，也不掷骰；交换后不会与对方同格。"),
  R("genius", "Genius", "天才", "Think Good", "预判自己",
    "可以预测自己主移动会掷出的点数；猜对时，本回合结束后再进行一个回合。"),
  R("gunk", "Gunk", "黏黏怪", "Goop 'Em", "全场减速",
    "其他选手的主移动 −1。",
    "减少的是移动格数，不改骰子点数：掷出 6 只走 5，但对跟班仍算掷出 6。"),
  R("hare", "Hare", "兔子", "Hubris", "骄兵必败",
    "主移动 +2；回合开始时若我独自领先，则跳过这次主移动。"),
  R("heckler", "Heckler", "毒舌喷子", "Schadenfreude", "幸灾乐祸",
    "一名选手结束回合时若离回合开始位置不超过 1 格，我移动 2 格。",
    "摔倒后起身的选手也算。"),
  R("huge_baby", "Huge Baby", "巨婴", "Really Huge", "块头太大",
    "除起点外，任何人都不能与我同格；将要发生时，改为把那名选手放到我身后一格。",
    "被放到身后不算移动，只是停在那一格。"),
  R("hypnotist", "Hypnotist", "催眠师", "Hssssst", "招之即来",
    "主移动前，我可以把一名选手传送到我的格子。"),
  R("inchworm", "Inchworm", "尺蠖", "Wriggle", "雁过拔毛",
    "其他选手主移动掷出 1 时，他们跳过这次移动，我移动 1 格。",
    "与船长同场时：我先移动 1，然后船长行动。"),
  R("lackey", "Lackey", "跟班", "Very Good Sire", "点头哈腰",
    "其他选手主移动掷出 6 时，我在他们移动前先移动 2 格。"),
  R("leaptoad", "Leaptoad", "跳跳蟾", "Jumpfrog", "踩头过河",
    "移动时跳过有其他选手的格子（不计步数）。"),
  R("legs", "Legs", "大长腿", "Jog", "稳定输出",
    "主移动可以不掷骰，直接移动 5 格。",
    "仍算主移动：会被黏黏怪减速，也能拿到教练加成。"),
  R("lovable_loser", "Lovable Loser", "可爱废柴", "D'Aww", "惨兮兮",
    "主移动前，若我独自垫底，获得 1 个分数筹码。"),
  R("magician", "Magician", "魔术师", "Poof", "变两次",
    "主移动最多可以重掷两次，必须使用最后一次的结果。"),
  R("mastermind", "Mastermind", "军师", "Know-It-All", "开局下注",
    "第一回合开始时预测哪名选手会赢；猜对时比赛立刻结束，我获得第 2 名。",
    "预测自己时，可以同时拿第 1 和第 2 名。"),
  R("mouth", "M.O.U.T.H.", "血盆大口", "Chomp", "一口吞人",
    "我停到恰好有另一名选手的格子时，对方被淘汰出本场比赛。",
    "若吞掉太多人导致没人第二个冲线，没人得第二名的分数。"),
  R("party_animal", "Party Animal", "派对咖", "Animal Magnetism", "人气磁铁",
    "主移动前，所有选手向我移动 1 格；与我同格的每名其他选手使我主移动 +1。",
    "巨婴被吸到我的格子时，格子上其他人都被放到后一格。"),
  R("rocket_scientist", "Rocket Scientist", "火箭科学家", "Kablooey", "一键加速",
    "主移动掷骰后，可以移动两倍点数；这样做时，移动后摔倒。"),
  R("romantic", "Romantic", "浪漫者", "Ah, Love!", "见不得成双",
    "任何人停到恰好还有另一名选手的格子时，我移动 2 格。",
    "两名选手一起移动（如吸盘鱼）时，各触发一次。"),
  R("scoocher", "Scoocher", "挪挪", "Scooch Scooch", "蹭局王",
    "其他选手的能力每发生一次，我移动 1 格。",
    "黏黏怪每 −1 算一次；骰贩子每次重掷算一次；跳跳蟾每跳过一格算一次；魔术师每次重掷都算（即使没用）。"),
  R("sisyphus", "Sisyphus", "西西弗斯", "Keep Rollin'", "推石头",
    "赛前获得 4 个分数筹码；主移动掷出 6 时，不移动，改为传送回起点并失去 1 个分数筹码。"),
  R("skipper", "Skipper", "船长", "Salty Dog", "插队上",
    "任何人主移动掷出 1 时，我成为下一个行动者；我行动后，从我的左手边继续。",
    "我自己掷出 1 时会再行动一次。"),
  R("stickler", "Stickler", "较真怪", "Actually...", "分毫不差",
    "其他选手只能以恰好的格数越过终点；会走过头时，干脆不移动。",
    "包括主移动和能力造成的所有移动。"),
  R("suckerfish", "Suckerfish", "吸盘鱼", "Sucker!", "吸附蹭车",
    "与我同格的选手移动时，我可以跟着移动到他的新格子。",
    "跟随时必须走完对方整段移动；可以借此冲过终点。"),
  R("third_wheel", "Third Wheel", "电灯泡", "Roll Through", "插足小情侣",
    "主移动前，我可以传送到恰好有 2 名选手的格子。",
    "传送后仍进行主移动。"),
  R("twin", "Twin", "双胞胎", "Double Dip", "复刻冠军",
    "赛前可以选一名在之前比赛中赢过的选手，用它的能力比赛。",
    "仍使用自己的棋子；仍获得所选角色的「赛前」能力。"),
];

export const RACER_BY_ID = new Map(RACERS.map((r) => [r.id, r]));
export const racerName = (id: string) => RACER_BY_ID.get(id)?.zh ?? id;
/** 可以进入选秀的角色（缺资料的 CHECK_REQUIRED 角色暂不进入） */
export const DRAFTABLE = RACERS.filter((r) => r.status === "CONFIRMED").map((r) => r.id);
/** 「赛前」能力：山寨猫不复制 */
export const BEFORE_RACE = new Set(["egg", "twin", "sisyphus"]);
