export type Step={key:string;label:string;kind:"seat"|"card"|"two"|"aside"|"used";other?:boolean};
const T=(key="target",other=false,label="选择船员"):Step=>({key,label,kind:"seat",other});const D:Step={key:"discard",label:"选择要弃的牌",kind:"card"};
export const ABILITIES:Record<string,{name:string;cost:string;text:string;steps:Step[]}>={
bloodwork:{name:"抽血检验",cost:"1氧",text:"选一名船员公开一张手牌",steps:[T()]},first_aid:{name:"应急治疗",cost:"2氧",text:"选一名船员移除一处伤",steps:[T()]},veto:{name:"否决权",cost:"弃1",text:"本回合揭示时必须取消一张牌的费用和效果",steps:[D]},laser_pistol:{name:"雷射枪",cost:"2能",text:"选另一名船员受一处伤",steps:[T("target",true)]},delegate:{name:"委任工作",cost:"",text:"另一名船员必须立即额外执行一次台面上或台面下行动",steps:[T("target",true)]},commandeer:{name:"强制征收",cost:"1能",text:"从任一船员牌库抽一张",steps:[T()]},salvage:{name:"打捞作业",cost:"1氧+弃1",text:"从弃牌堆私下拿至多两张",steps:[D]},crunch:{name:"强势命令",cost:"1氧",text:"未受伤船员抽三张并受一处伤",steps:[T()]},strategize:{name:"运筹帷幄",cost:"",text:"盖放一张手牌，再决定打出全部盖放牌或全部保留；一次打出4张以上得2氧",steps:[{key:"aside",label:"选择盖放的牌",kind:"card"},{key:"play",label:"选择如何处理盖放牌",kind:"aside"}]},moxie:{name:"胆大作风",cost:"1氧",text:"回合结束时若有人受伤，得3氧",steps:[]},todays_special:{name:"今日特餐",cost:"1氧",text:"把一张手牌塞给别人，然后抽两张",steps:[T("target",true),{key:"card",label:"选择给出的牌",kind:"card"}]},helping_hand:{name:"热情帮手",cost:"",text:"本回合之后可免除一名玩家台面上行动的费用",steps:[]},mimic:{name:"有样学样",cost:"付原费用",text:"复制本回合已执行的台面上行动",steps:[{key:"ab",label:"选择要复制的能力",kind:"used"}]},deflect:{name:"弹射伤害",cost:"",text:"本回合下次有人受伤时可转给另一人",steps:[]},regenerate:{name:"自我修复",cost:"1氧",text:"移除自己一处伤",steps:[]},rewind:{name:"倒带",cost:"",text:"结算结束时从已结算牌中私下拿一张",steps:[]},efficiency:{name:"请求效率",cost:"",text:"本回合打出两张行动牌",steps:[{key:"cards",label:"选择两张牌",kind:"two"}]},formulate:{name:"拟定计划",cost:"1氧",text:"抽三张，再把一张手牌放到牌库底",steps:[]},system_refresh:{name:"系统重整",cost:"1能",text:"目标把手牌洗回牌库，再抽同样数量+1",steps:[T()]},synchronize:{name:"同步化",cost:"1氧",text:"两名船员各抽一张",steps:[T("a"),T("b")]},surveillance:{name:"安全检查",cost:"1能",text:"私下查看一名玩家场上未结算的牌",steps:[T()]},equip:{name:"整装备战",cost:"弃1",text:"抽两张牌",steps:[D]},resupply:{name:"额外补给",cost:"1氧",text:"另一名船员抽两张",steps:[T("target",true)]},rush:{name:"矫健身手",cost:"",text:"抽一张并立即盖着打出",steps:[]},restructure:{name:"重新构筑",cost:"1能",text:"揭示前查看本回合的牌，可用手牌换一张",steps:[]},damage_control:{name:"损害控管",cost:"1能",text:"回合末若揭示过气闸/外泄/爆炸/惊慌，得3能，无视上限",steps:[]},guard:{name:"安全卫士",cost:"",text:"取消本回合第一张背刺的效果",steps:[]},lockdown:{name:"状态锁定",cost:"1氧",text:"本回合剩余时间受伤者不能出牌也不再受伤",steps:[]}};
export const CARD_TEXT:Record<string,[string,string]>={basic_repair:["基础维修","费用1氧，+1能量"],advanced_repair:["进阶维修","费用1氧，+2能量"],raise_morale:["激励士气","+1氧气"],command:["上级指令","费用1氧，每名存活玩家抽一张"],replicate:["效果复制","复制下一张揭示的非复制牌效果；最后翻出时延续到下一轮；斗殴和背刺不可复制"],brawl:["群众斗殴","每回合首次，且不可复制：任务领袖选一人受伤"],backstab:["背刺","每回合首次：任务领袖受伤"],panic:["惊慌！","费用1氧，每名存活玩家随机弃一张"],airlock:["气闸裂损","-1氧气"],explosion:["反应炉爆炸","-2能量"],reactor:["反应炉外泄","本回合出过牌的未受伤船员受伤"]};
export const AGENDA_TEXT:Record<string,[string,string]>={contagion:["腐化者（内鬼）","氧气归零或船员全灭即胜。被杀且未被放逐时，可令一人弃光手牌。"],butcher:["屠夫（内鬼）","氧气归零或船员全灭即胜。被杀且未被放逐时，可令一人受伤。"],austere:["克难者（船员）","氧气首次将归零时，可公开并弃一张牌，得1氧1能。个人目标：结束时手牌多于左右相邻存活玩家。"],loyal:["忠诚者（船员）","无特殊能力，无个人目标。"],paragon:["模范生（船员）","他人将受致命伤时可公开并代受。个人目标：没有其他船员被杀。"],reckless:["鲁莽者（船员）","被杀且未被放逐时+2能量。个人目标：牌库不超过11张。"],resolute:["坚定者（船员）","首次将受致命伤时可公开并取消。个人目标：以公开状态获胜。"],saint:["圣人（船员）","受伤时公开并失去2氧。个人目标：氧气剩4格以上。"],vengeant:["复仇者（船员）","被杀时可令另一人受伤。个人目标：至少一名其他玩家被杀。"],coward:["胆小鬼（中立）","默认与船员同胜。有内鬼身份公开后，目标改为内鬼的目标；内鬼全死后改回。个人目标：未被放逐。"]};
export const CHAR_NAME:Record<string,string>={rotti:"罗提",malumil:"马鲁米尔",andrew:"安德鲁",shnn:"舷",dekka:"戴卡",martella:"玛提拉",tove:"托福",aerril:"艾瑞尔",moe:"莫莫",beepo:"哔啵",sigmund:"席格蒙",rhea:"莉亚",cecilia:"赛希亚",prillig:"切夫",azi:"阿琪",iza:"以萨",ruggine:"鲁吉",gurg:"哥吉"};
export const WOUND_TEXT:Record<string,string>={flesh:"皮肉伤：只是一处伤，没有额外惩罚。累计 2 处伤会在回合结束时死亡。",brain_damage:"脑部受损：轮到你时，只能做和上一位玩家同类的行动（他抽牌你就抽牌，他出牌你就出牌，他用能力你就用能力）。",broken_limbs:"断肢：本轮要有别的玩家先出过牌，你才能出牌。",concussion:"脑震荡：手牌上限从 4 张变成 2 张，获得时立即随机弃到 2 张，之后抽牌超限自行选择弃牌。",frenzied:"丧心病狂：手牌洗混放到牌库顶。之后每次抽牌，私下查看后必须暗置打出，牌面仅自己可见。",punctured_lung:"肺部穿刺：你每打出一张行动牌，还要额外弃掉牌库顶 2 张。回合开始时手牌和牌库都空才会死亡。",pulverized:"瘫痪：受伤时立刻弃掉牌库顶 5 张。",radiation_burns:"辐射灼伤：领袖收牌时，每张由存活玩家持有的辐射灼伤随机弃掉一张已出牌，再判断是否补艾玛。",severed:"骨折：选择自己的一个角色能力，持有这张伤害期间不能使用。",crushed_windpipe:"气管受损：持有期间你不能讨论游戏，只能解释规则。靠自觉遵守。",mental_breakdown:"精神崩溃：其他每位玩家牌库顶的牌都洗进你的牌库。"};
export const QUESTION:Record<string,string>={heal:"选择要移除的伤害",surveillance:"选择要查看的暗置牌",rush:"检视抽到的牌",discard_down:"手牌超限，弃一张",deflect:"有人将受伤，要转移吗？",paragon:"要公开模范生身份代受致命伤吗？",resolute:"要公开坚定者身份取消致命伤吗？",austere:"氧气将归零！公开克难者并弃一张牌？",severed:"选择被断掉的能力",bloodwork:"选择公开的手牌",veto:"使用否决？",brawl:"斗殴：选择受伤的船员",restructure:"重组",salvage:"从弃牌堆取牌",formulate:"选一张放到牌库底",assist:"要用援手免除费用吗？",rewind:"选一张拿回手牌",contagion:"选择弃光手牌的玩家",butcher:"选择受伤的玩家",vengeant:"选择受伤的玩家"};

const NAMES:Record<string,string>={...Object.fromEntries(Object.entries(ABILITIES).map(([k,v])=>[k,v.name])),...Object.fromEntries(Object.entries(CARD_TEXT).map(([k,v])=>[k,v[0]])),...Object.fromEntries(Object.entries(AGENDA_TEXT).map(([k,v])=>[k,v[0]])),...Object.fromEntries(Object.entries(WOUND_TEXT).map(([k,v])=>[k,v.split("：")[0]]))};
/** 把日志里的内部代号换成中文 */
export const zh=(t:string)=>t.replace(/[a-z_]{3,}/g,(m)=>NAMES[m]??m);

export const RULES:[string,string[]][]=[
["游戏目标",["飞船失去动力，氧气不断流失。大家暗中出牌修船，但内鬼混在其中破坏。身份在开局时秘密发放，只有自己知道。"]],
["胜利条件",["船员：回合结束时能量达到 100%，且氧气未归零；或全部内鬼死亡，且能量越过红色安全线（70%）。","内鬼：氧气归零，或全部船员死亡。","胆小鬼：中立，胜利条件以身份卡面为准。内鬼身份公开后，目标转向内鬼；内鬼全死后再变回。","进阶模式：除阵营获胜外，还要完成身份卡上的个人目标才算赢。"]],
["开局",["起始氧气：4 人 15、5 人 18、6 人 20、7 人 22、8 人 24。能量从 0 开始，共 20 格。","每人选 1 名角色。身份卡 13 张牌加角色 7 张牌组成 20 张个人牌库，起手 3 张，手牌上限 4 张。"]],
["每轮流程",["① 行动：从任务领袖开始依次选一项：抽 1 张牌；暗置 1 张行动牌；使用 1 个角色能力（每轮每个能力限一次）。","② 匿名结算：全部暗置牌洗混，任务领袖逐张揭开并结算。没人知道是谁出的。出牌数少于总人数的一半（向上取整）时，系统用 应急牌堆补足。","③ 讨论指控：大家语音讨论，任何人可以拿起手枪发起放逐投票。任务领袖也可以直接结束本轮。","结束后，任务领袖顺时针传给下一位。"]],
["重要限制",["一次结算阶段，能量最多上升 5 格，超出的不算，但氧气费用照扣。","维修也要消耗氧气，要靠激励士气补回来，所以不能只顾修船。"]],
["投票与放逐",["所有人同时投票，不能投自己，可以弃权。票数最多者被放逐；平票或弃权最多则无人被放逐。","被放逐者公开身份。放逐船员氧气 -3，放逐胆小鬼 -2，放逐内鬼 +2。","被放逐者不能投票、发起投票或用能力，但仍可抽牌和暗置牌。"]],
["死亡",["回合结束时有 2 处伤害的玩家死亡，并公开身份。船员死亡氧气 -2，胆小鬼 -1，内鬼无惩罚。","回合开始时手牌和牌库都空的玩家也会死亡。"]],
["卡牌和名词",[
"身份牌：开局秘密发给你，决定你是船员、内鬼还是胆小鬼，并写着你的能力和个人目标。只有你自己能看，点顶部“身份”查看。被放逐、死亡或主动使用能力时才会公开。",
"角色牌：你选的人物，公开给所有人。每个角色有 2 个“台面上行动”（角色能力），每个能力每轮最多用一次，有的要付氧气、能量或弃牌。角色和阵营无关，内鬼也可以选任何角色。",
"行动牌（台面下行动）：你手里的牌。暗置后和别人的牌洗在一起匿名翻开，谁也不知道是谁出的。好牌坏牌都可能出现在好人牌库里，翻出坏牌不等于有人是内鬼，这正是推理的乐趣。",
"个人牌库：20 张，由身份牌的 13 张和角色牌的 7 张组成。身份不同，牌的构成也不同。",
"应急牌堆：飞船的应急系统，共 20 张公共牌。出牌人数不够时，用它补牌，所以不出牌也可能翻出坏牌。",
"任务领袖：头像带 ★ 的玩家。本轮最先行动，负责逐张揭牌和结束回合，每轮顺时针换人。",
"氧气：全队共用。归零内鬼胜。能量：飞船动力，共 20 格，满格船员胜；第 14 格的红线是安全线。"]],
["受伤是什么",[
"受伤来源：背刺、群众斗殴、反应炉外泄、雷射枪、强势命令等。",
"受什么伤是随机的：全场共用一个洗好的伤害牌堆，每受一次伤就从牌堆顶抽 1 张。背刺不一定造成骨折，受伤原因和抽到的伤害无关。","抽到的伤害牌放在你面前，所有人都看得到。大多数带持续惩罚，直到被治疗移除才消失。不管抽到什么，都算 1 处伤。",
"有 1 处伤：继续正常游戏，但要承受那张牌的惩罚。",
"有 2 处伤：不会立刻死，你还能行动，到回合结束时才死亡。这段时间可以被治疗救回。",
"怎么治疗：应急治疗（选一名玩家移除 1 处伤）、自我修复（移除自己 1 处伤）。",
"死亡后：公开身份，弃掉手牌，不再参与行动和投票。船员死亡氧气 -2，胆小鬼 -1，内鬼无惩罚。部分身份死亡时还会触发能力。"]],
["伤害牌一览",Object.values(WOUND_TEXT)],
["行动牌一览",Object.values(CARD_TEXT).map(([a,b])=>a+"："+b)],
["身份牌一览",Object.values(AGENDA_TEXT).map(([a,b])=>a+"："+b)],
["角色能力一览",Object.values(ABILITIES).map(a=>a.name+(a.cost?"（"+a.cost+"）":"")+"："+a.text)],
["操作提示",["点手牌放大看说明，再点“暗置打出”。点座位看角色能力，顶部“身份”看自己的身份。","有玩家掉线时，房主可以代为操作。"]],
];
