import type { Topic } from "./topics.ts";
import { TOPIC_THEMES } from "./topic-themes.ts";
type Row = [string, string, string];
/** 来源说明：每行末尾为该术语的原始词典、机构科普或实物档案条目；中文题面和答案重新撰写。 */
const groups: Row[][] = [
  // 汉典字词条：采用该条现代/古汉语释义，不编造字源。
  [
    [
      "古书里说人‘觳觫’，他在做什么？",
      "形容因恐惧而身体发抖的样子，读作 hú sù；不是一种礼仪动作。",
      "https://www.zdic.net/hans/觳觫",
    ],
    [
      "粮铺门口的‘籴’字是做什么生意？",
      "籴读 dí，意思是买进粮食；与表示卖出粮食的‘粜’相对。",
      "https://www.zdic.net/hans/籴",
    ],
    [
      "‘鬯’这种古代饮品有什么特别？",
      "鬯读 chàng，是古代祭祀用的香酒，常用郁金等香草调制；不是普通饮水。",
      "https://www.zdic.net/hans/鬯",
    ],
    [
      "古人把‘赍’交给别人，通常在做什么？",
      "赍读 jī，有携带、拿东西给人等意思；这里指把钱物送给别人。",
      "https://www.zdic.net/hans/赍",
    ],
    [
      "古书中的‘欹器’是什么器物？",
      "一种倾斜着的器皿，传统描述是空时倾斜、适量水时端正、过满则倾覆，用来警戒自满。",
      "https://www.zdic.net/hans/欹器",
    ],
    [
      "古人说‘觥筹交错’，桌上交错着什么？",
      "觥是酒器，筹是行酒令用的筹码；合起来形容饮酒宴席的热闹景象。",
      "https://www.zdic.net/hans/觥筹交错",
    ],
    [
      "‘蘧庐’是哪一种古代建筑？",
      "蘧庐读 qú lú，指古代驿站附设、供旅人暂住休息的房舍，也可比喻暂时居停之所。",
      "https://www.zdic.net/hans/蘧庐",
    ],
    [
      "‘凫趋’是在模仿哪种走路方式？",
      "凫是野鸭，凫趋指像野鸭一样摇摆行走，也用来比喻欢快奔赴、欣喜向往的样子。",
      "https://www.zdic.net/hans/凫趋",
    ],
  ],
  // 动物园/植物园及NOAA原始物种科普，限定到具体物种，不扩展到整个类群。
  [
    [
      "鸭嘴兽潜水闭眼，靠什么找食物？",
      "它的喙有电感受器，能感知猎物肌肉活动产生的微弱电信号，也利用触觉寻找食物。",
      "https://oceanservice.noaa.gov/facts/platypus.html",
    ],
    [
      "裸鼹鼠为何被叫作‘社会性哺乳动物’？",
      "群体有明显繁殖分工，通常由一只繁殖雌兽和少数雄兽繁殖，其余成员承担群体工作。",
      "https://nationalzoo.si.edu/animals/naked-mole-rat",
    ],
    [
      "霍加狓身上的条纹像斑马，它近亲是谁？",
      "霍加狓属于长颈鹿科，是长颈鹿的现生近亲；腿上的条纹不表示它属于斑马一类。",
      "https://animals.sandiegozoo.org/animals/okapi",
    ],
    [
      "六角恐龙为什么成年了还像蝌蚪？",
      "俗称六角恐龙的墨西哥钝口螈保留幼体特征，通常成年仍有外鳃，在水中生活并繁殖。",
      "https://animals.sandiegozoo.org/animals/axolotl",
    ],
    [
      "鸭嘴兽宝宝喝奶，却找不到什么？",
      "母鸭嘴兽没有乳头，乳汁从皮肤的乳腺开口分泌出来，幼兽从母体腹部取食。",
      "https://animals.sandiegozoo.org/animals/platypus",
    ],
    [
      "穿山甲的鳞片，材料更接近什么？",
      "鳞片主要由角蛋白构成，材料与人的指甲相近；它们不是鱼鳞，也不是外露的骨片。",
      "https://www.zsl.org/what-we-do/species/pangolins",
    ],
    [
      "百岁兰活很久，正常一生长几片主叶？",
      "百岁兰通常只长两片持续生长的主叶；叶片会破裂成带状，看起来像有许多片。",
      "https://pza.sanbi.org/welwitschia-mirabilis",
    ],
    [
      "瓶子草的‘瓶子’到底是哪部分？",
      "捕虫的瓶状结构由叶片特化形成，昆虫落入后可被消化，帮助植物取得养分。",
      "https://www.kew.org/read-and-watch/carnivorous-plants",
    ],
  ],
  // UNESCO申报/说明及当地承办博物馆，描述文化实践，不把“怪”当价值判断。
  [
    [
      "土耳其黑海山区的‘鸟语’是什么？",
      "当地的口哨语言用哨声模拟和表达口语，便于隔着山谷远距离沟通，并非模仿鸟类求偶。",
      "https://ich.unesco.org/en/RL/whistled-language-00658",
    ],
    [
      "比利时、法国的‘巨人巡游’抬着什么？",
      "居民抬着巨型人物或动物模型巡游，它们代表当地传说、历史人物或社区身份。",
      "https://ich.unesco.org/doc/src/00010-EN.pdf",
    ],
    [
      "贝尔加的 La Patum，‘Plens’是什么角色？",
      "它们是节庆里配合烟火表演的恶魔角色，与巨人、鹰等角色一起参与街头庆典。",
      "https://ich.unesco.org/es/RL/la-patum-de-berga-00156",
    ],
    [
      "莫哈奇的 Busó 节，主角戴什么出门？",
      "参加者戴雕刻木面具、穿羊毛披装，作为送冬迎春的狂欢习俗的一部分。",
      "https://ich.unesco.org/en/RL/buso-festivities-at-mohacs-masked-end-of-winter-carnival-custom-00252",
    ],
    [
      "加泰罗尼亚的 Castells 是用什么搭塔？",
      "参与者用人的身体层层搭成人塔；底层队伍承担支撑和保护，塔顶通常是年幼成员。",
      "https://ich.unesco.org/en/RL/human-towers-00364",
    ],
    [
      "捷克‘国王骑行’的小国王嘴里含着什么？",
      "传统队伍中的男孩国王嘴里含一朵玫瑰，身着礼服骑马，由随从护送经过村庄。",
      "https://ich.unesco.org/en/RL/ride-of-the-kings-in-the-south-east-of-the-czech-republic-00564",
    ],
    [
      "秋田生剥鬼上门，传统身份究竟是什么？",
      "生剥鬼在当地传统中是来访的神灵，戴面具走访家庭，劝诫懒惰并祈求新年安康。",
      "https://namahage.co.jp/namahagekan/en/namahage/",
    ],
    [
      "塞尔维亚 Slava 主要庆祝谁的日子？",
      "它是家庭守护圣人的纪念日，由家庭传承，亲友相聚，共享特别制作的节庆面包等食物。",
      "https://ich.unesco.org/en/RL/slava-celebration-of-family-saint-patrons-day-01010",
    ],
  ],
  // 词典历史器物条目，取可核对用途，不渲染未经证实的逸闻。
  [
    [
      "古希腊的 ostracon 本来是件什么东西？",
      "它是一块可供书写的陶片；古代既能作便宜书写材料，也能在特定投票中使用。",
      "https://www.merriam-webster.com/dictionary/ostracon",
    ],
    [
      "古罗马的 strigil 是拿来做什么的？",
      "它是一种弯曲刮具，沐浴或运动后用来刮去皮肤上的油、汗和污物。",
      "https://www.merriam-webster.com/dictionary/strigil",
    ],
    [
      "老账房的‘对开筹木’为什么要劈成两半？",
      "在木条上刻记账目后纵向分开，交易双方各持一半，可拼合核验同一笔记录。",
      "https://www.londonmuseum.org.uk/collections/v/object-71971/tally-stick/",
    ],
    [
      "印加的 quipu 是怎样记录信息的？",
      "它由一组绳索和绳结构成，结的位置、形式等可记录数量等信息，并不是纸上的文字书。",
      "https://www.merriam-webster.com/dictionary/quipu",
    ],
    [
      "旧书里的 volvelle 为何能转？",
      "它是书页上可旋转的圆盘装置，改变各圈相对位置以查算或展示天文、历法等关系。",
      "https://www.merriam-webster.com/dictionary/volvelle",
    ],
    [
      "早期儿童读物 hornbook，为何叫‘角书’？",
      "字母等内容贴在小木板上，再覆以透明薄角片保护，常带手柄，并非整本用兽角雕成。",
      "https://www.merriam-webster.com/dictionary/hornbook",
    ],
    [
      "旧时腰间的 chatelaine 是什么？",
      "它是系在腰带上的装饰性挂件，垂下多条小链，用来携带钥匙、剪刀等日常小工具。",
      "https://www.merriam-webster.com/dictionary/chatelaine",
    ],
    [
      "古人随身带的 pomander 里面装什么？",
      "它指香料团或装香料的小容器，常被随身携带，用来散发香气。",
      "https://www.merriam-webster.com/dictionary/pomander",
    ],
  ],
  // MIT Lemelson发明者档案：不把专利授权等同于全球首创。
  [
    [
      "魔术贴的灵感来自什么黏人的东西？",
      "德梅斯特拉尔观察到附在衣物或动物毛上的苍耳状带钩果实，后来发展出钩面与环面扣合的设计。",
      "https://lemelson.mit.edu/resources/george-de-mestral",
    ],
    [
      "早期‘扣锁器’拉链原想替代什么？",
      "贾德森的扣锁器最初用于替代靴子上繁琐的鞋带，通过滑动装置让钩眼结合或分离。",
      "https://lemelson.mit.edu/resources/whitcomb-judson",
    ],
    [
      "亨特为什么没能靠安全别针持续收钱？",
      "他申请安全别针专利后，以400美元出售了相关权利；产品后来畅销，他却没有再从这项发明取得收益。",
      "https://lemelson.mit.edu/resources/walter-hunt",
    ],
    [
      "Slinky 弹簧玩具最初意外展示了什么动作？",
      "理查德·詹姆斯观察到弹簧掉落时会逐步翻行，后来把这种运动发展成会走台阶的弹簧玩具。",
      "https://lemelson.mit.edu/resources/richard-james",
    ],
    [
      "微波炉的灵感中，斯宾塞口袋里什么化了？",
      "档案记载他在磁控管附近工作时发现口袋里的糖果融化，随后进一步试验微波加热食物。",
      "https://lemelson.mit.edu/resources/percy-spencer",
    ],
    [
      "霍尔的水床专利为何往水里放泡沫塑料块？",
      "专利的一种方案让小块泡沫塑料浮在水面并相互贴靠，配合水对身体各部分提供较独立的支撑。",
      "https://patents.google.com/patent/US3585356A/en",
    ],
    [
      "‘液体纸’涂在打字稿上，解决什么麻烦？",
      "它是覆盖打字错误的修正液，干后可重新打字；贝蒂·内史密斯·格雷厄姆将其发展为产品。",
      "https://lemelson.mit.edu/resources/bette-graham",
    ],
    [
      "自动洗碗机的科克伦设计，主要让什么去冲餐具？",
      "她的设计让餐具固定在架上，用有压力的水冲洗，目的是机械清洁并减少餐具破损。",
      "https://lemelson.mit.edu/resources/josephine-cochrane",
    ],
  ],
  // 日本观光机构与辞典的生活文化释义；不声称所有店铺/家庭都如此。
  [
    [
      "日本店门口的‘暖帘’主要是什么？",
      "它是挂在门口或室内分隔处的布帘，也可标示店名与营业，分开的帘片方便人通行。",
      "https://www.gov-online.go.jp/eng/publicity/book/hlj/html/202009/202009_05_en.html",
    ],
    [
      "日式旅馆的‘床之间’是睡床的位置吗？",
      "床之间指和室中展示挂轴、花等物品的壁龛式空间，并非用来放睡床的角落。",
      "https://www.merriam-webster.com/dictionary/tokonoma",
    ],
    [
      "日式房屋的‘缘侧’是哪一段空间？",
      "它是沿屋外缘设置、连接室内与庭院之间的走廊或廊台，并不是屋顶的边缘。",
      "https://www.aisf.or.jp/~jaanus/deta/e/en.htm",
    ],
    [
      "御神签通常给人看什么？",
      "它是寺社抽取的签纸，写有运势和生活方面的提示；不同寺社的等级与做法不尽相同。",
      "https://faq.japan-travel.jnto.go.jp/en/japan-magazine/2007_omikuji/",
    ],
    [
      "‘鹿威’为什么隔一阵就咚一下？",
      "常见鹿威用流水注入竹筒，水重令竹筒翻转倒水，再回位敲击石头，形成间歇声响。",
      "https://www.tokyo-park.or.jp/teien/en/tonogayato/view.html",
    ],
    [
      "日本‘风吕敷’是拿来擦身体的吗？",
      "它通常是一块方形包袱布，可用包裹和打结的方式携带物品，虽名称含浴场字样却不等于浴巾。",
      "https://www.env.go.jp/en/focus/attach/060403-5.html",
    ],
    [
      "‘猪口’放上餐桌通常是什么？",
      "此处的猪口指饮清酒用的小杯，清酒可由德利酒壶倒入其中，并非用猪嘴制成的器皿。",
      "https://www.mlit.go.jp/tagengo-db/en/R1-01280.html",
    ],
    [
      "料理里的‘落盖’为何直接贴近食物？",
      "落盖是放入锅内、贴近食材的小盖子，帮助煮汁流动和食材均匀受热，也减少食物晃动。",
      "https://www.kikkoman.com/en/cookbook/glossary/otoshibuta.html",
    ],
  ],
  // 波士顿美术馆CAMEO材料辞典，对应织物结构；不把织法误当纤维种类。
  [
    [
      "泡泡纱的‘泡泡’主要怎么来的？",
      "它在织造时利用不同经纱张力形成凹凸起伏的布面，不是把气泡封进布里。",
      "https://cameo.mfa.org/wiki/Seersucker",
    ],
    [
      "灯芯绒的‘灯芯’是什么结构？",
      "它的表面绒毛形成一条条纵向凸起的绒条，名称描述外观，并非织进真正的灯芯。",
      "https://www.merriam-webster.com/dictionary/corduroy",
    ],
    [
      "欧根纱为什么能让裙摆看起来挺又透？",
      "它是一种轻薄、透明而较挺的平纹织物，可由丝或人造纤维制成；不专指某一种纤维。",
      "https://cameo.mfa.org/wiki/Organza",
    ],
    [
      "双面缎纹花布 damask，花纹为何若隐若现？",
      "它把花纹织进布的组织中，常以缎纹花样与底纹形成光泽对比，图案并非单纯印在表面。",
      "https://www.merriam-webster.com/dictionary/damask",
    ],
    [
      "华达呢表面为什么有清楚斜线？",
      "华达呢是结构较紧密的斜纹织物，通常经纱占优势，织物组织形成明显的斜向纹路。",
      "https://cameo.mfa.org/wiki/Gabardine",
    ],
    [
      "薄纱 tulle 的结构更像布还是网？",
      "它是一种细密的网眼织物，常用于头纱和裙装，特点来自网状结构而非唯一的纤维原料。",
      "https://www.merriam-webster.com/dictionary/tulle",
    ],
    [
      "提花机的 Jacquard 指的是哪种纤维？",
      "它不指一种纤维，而指能分别控制经纱形成复杂织纹的装置及相关织物技术。",
      "https://cameo.mfa.org/wiki/Jacquard",
    ],
    [
      "‘煮呢’或 fulling 是把毛织物做成什么样？",
      "通过水分、机械作用等使毛纤维毡缩交结，让织物更紧密、厚实；并非单纯把布煮熟。",
      "https://www.merriam-webster.com/dictionary/fulling",
    ],
  ],
  // MW词源/食品条目：只写可核实的词源和食物制作，不采用流传的名人故事。
  [
    [
      "marmalade 的名字原来跟哪种水果有关？",
      "它经葡萄牙语 marmelada 进入英语，源头与榅桲有关；现代英语中常指柑橘果酱。",
      "https://www.merriam-webster.com/dictionary/marmalade",
    ],
    [
      "食品工艺里的 isinglass，原料竟是什么？",
      "鱼胶这种材料可由鱼鳔制得，传统上用于澄清饮品等用途；它不是玻璃的碎末。",
      "https://www.merriam-webster.com/dictionary/isinglass",
    ],
    [
      "意式 biscotti 为什么常配咖啡蘸着吃？",
      "这类饼干通常经过两次烘烤，成品干脆而硬；词名本身也和两次烤制有关。",
      "https://www.merriam-webster.com/dictionary/biscotto",
    ],
    [
      "古罗马调味品 garum 的原料是什么？",
      "它是一类用鱼发酵制成的调味汁，可给食物增加咸鲜味；不是一种葡萄酒。",
      "https://www.britishmuseum.org/collection/object/G_1856-1226-337",
    ],
    [
      "verjuice 这种老调味汁，酸味从哪来？",
      "它通常由未成熟的葡萄或其他酸果榨汁而得，用其天然酸味调味，不等同于醋。",
      "https://www.merriam-webster.com/dictionary/verjuice",
    ],
    [
      "老食谱里的 posset 最初是什么饮品？",
      "它原指用酒或麦芽酒使热牛奶凝结的饮品；今天这个名称也用于一些奶油甜点。",
      "https://www.merriam-webster.com/dictionary/posset",
    ],
    [
      "厨房说先做 roux，锅里在炒什么？",
      "Roux 是把面粉和油脂一起加热制成的混合物，用于给酱汁、汤等增稠。",
      "https://www.merriam-webster.com/dictionary/roux",
    ],
    [
      "印尼食品 tempeh 的豆子为何黏成一块？",
      "天贝由大豆等原料经霉菌发酵制成，菌丝将豆粒连成较紧实的块状食品。",
      "https://www.merriam-webster.com/dictionary/tempeh",
    ],
  ],
  // 汉典俗语/方言释义，保留使用语境，不虚构地域起源。
  [
    [
      "旅人说先‘打尖’，打算做什么？",
      "在旅途中停下来吃饭或稍作休息，不是找人比武，也不专指住宿过夜。",
      "https://www.zdic.net/hans/打尖",
    ],
    [
      "无锡话里‘吃排头’是吃什么？",
      "无锡方言中，它指受到批评、指责，并不是吃一盘排在前头的菜。",
      "https://daj.wuxi.gov.cn/doc/2012/08/28/2426116.shtml",
    ],
    [
      "四川话里‘摆龙门阵’在做什么？",
      "通常指闲谈、聊天或讲故事，并非真的摆出阵法；语境往往是大家聚在一起说话。",
      "https://www.zdic.net/hans/摆龙门阵",
    ],
    [
      "无锡话说水‘浦策来’，锅里发生了什么？",
      "烧开的水等液体溢出了锅外；这个说法描述煮沸外溢，并不是把水倒进锅中。",
      "https://daj.wuxi.gov.cn/doc/2012/08/28/2426116.shtml",
    ],
    [
      "旧时无锡的‘荐头店’卖什么？",
      "它指职业介绍的机构，帮人找活或介绍用工；并不是出售人的头饰或荐草。",
      "https://daj.wuxi.gov.cn/doc/2012/08/28/2426116.shtml",
    ],
    [
      "无锡话说‘掼纱帽’，是在做什么决定？",
      "它指辞职、放弃职位的说法；不一定真的把一顶纱帽摔在地上。",
      "https://daj.wuxi.gov.cn/doc/2012/08/28/2426116.shtml",
    ],
    [
      "无锡话里的‘缸爿云’是什么样的云？",
      "它形容鱼鳞状的云，看起来有一片片排列的纹理，并不是一口水缸投出的影子。",
      "https://daj.wuxi.gov.cn/doc/2012/08/28/2426116.shtml",
    ],
    [
      "无锡人说睡着后‘牵昏’，在说什么声音？",
      "这里指睡眠时打呼噜的声音或行为，不是把人牵到昏暗地方，也不是在说梦话。",
      "https://daj.wuxi.gov.cn/doc/2012/08/28/2426116.shtml",
    ],
  ],
  // 国际项目管理组织规则/说明，避免依赖近期计分制变化的题。
  [
    [
      "冰壶里说拿到 hammer，是拿到了什么？",
      "它指一局最后一投的优势，拥有它的队伍可在对手投完后投该局最后一壶。",
      "https://worldcurling.org/about/curling/",
    ],
    [
      "冰壶赛道旁为什么有人大力刷冰？",
      "刷冰会影响冰壶行进的距离和弯曲程度，队员用刷冰来帮助控制壶最终停在哪里。",
      "https://worldcurling.org/about/curling/",
    ],
    [
      "击剑的 piste 指什么？",
      "它是击剑比赛进行的狭长剑道区域，并非剑尖上的按钮或选手的面罩。",
      "https://www.merriam-webster.com/dictionary/piste",
    ],
    [
      "国际象棋里的 en passant 是哪种吃法？",
      "对方兵从起始格一次走两格，经过己方兵可攻击的格时，己方可紧接下一步按经过格吃掉它。",
      "https://handbook.fide.com/chapter/E012023",
    ],
    [
      "国际象棋的 stalemate，为何没被将军也结束？",
      "轮到走棋的一方没有任何合法着法，且王没有被将军，称为逼和，结果为和棋。",
      "https://handbook.fide.com/chapter/E012023",
    ],
    [
      "围棋的‘打劫’为什么不能马上吃回来？",
      "劫规则阻止立即重现刚才的局面，通常须先在别处走一手，不能立刻循环提取同一子。",
      "https://www.nihonkiin.or.jp/match/kiyaku/zenbun.html",
    ],
    [
      "棒球的 foul pole，球碰到它算界外吗？",
      "界外标杆本身位于公平区域的边界，符合其他条件的飞球碰到它可判全垒打，并非因名称就算界外。",
      "https://www.mlb.com/glossary/standard-stats/home-run",
    ],
    [
      "网球的 let 通常表示这球怎样处理？",
      "它表示该次球或发球需要重来，常见例子是发球触网后仍落入正确发球区；不是自动输一分。",
      "https://www.itftennis.com/en/about-us/governance/rules-and-regulations/",
    ],
  ],
  // APA心理学辞典：描述现象定义，不作诊断或治疗建议。
  [
    [
      "‘舌尖现象’是舌头出了什么问题？",
      "它指明明觉得自己知道一个词，却一时想不起完整词形的提取困难，不是在描述舌头疾病。",
      "https://dictionary.apa.org/tip-of-the-tongue-phenomenon",
    ],
    [
      "Stroop 效应让人读颜色时卡在哪？",
      "当词义与字的墨色冲突时，命名墨色会受到自动阅读词义的干扰，反应可能变慢或出错。",
      "https://dictionary.apa.org/stroop-effect",
    ],
    [
      "‘变化盲视’会漏掉什么？",
      "它指人没有注意到视觉场景中的变化，尤其变化被中断或其他干扰遮掩时，并非眼睛完全看不见。",
      "https://dictionary.apa.org/change-blindness",
    ],
    [
      "‘非注意盲视’和没睁眼有何不同？",
      "注意力投入其他任务时，人可能没觉察到明显但未预期的物体，即使它处在视野里。",
      "https://dictionary.apa.org/inattentional-blindness",
    ],
    [
      "McGurk 效应说明看嘴形会影响什么？",
      "看到的口型与听到的语音不一致时，视觉信息可能改变人所感知的语音，是视听整合现象。",
      "https://www.nature.com/articles/264746a0",
    ],
    [
      "‘橡胶手错觉’会让人错认什么？",
      "在特定的同步视觉和触觉刺激下，人可能产生假手属于自己身体的感觉；并非真的长出一只手。",
      "https://www.lancaster.ac.uk/fas/psych/glossary/rubber_hand_illusion/",
    ],
    [
      "黑暗中静止光点看似乱跑，叫什么现象？",
      "这称为自运动现象；缺少外部参照时，静止的小光点可能被感知为在移动。",
      "https://dictionary.apa.org/autokinetic-effect",
    ],
    [
      "‘负后像’为何颜色会反过来？",
      "持续注视一种颜色后转看中性背景，视觉适应可能让人看到近似互补色的后像。",
      "https://dictionary.apa.org/afterimage",
    ],
  ],
  // Cambridge职业术语条目，对应影视制作工作语义。
  [
    [
      "电影片场的 gaffer 是干什么的？",
      "在影视制作中，它通常指负责灯光电工团队的主管，协调灯光布置，并不是电影导演的别称。",
      "https://dictionary.cambridge.org/dictionary/english/gaffer",
    ],
    [
      "片场的 best boy 为什么不一定是男孩？",
      "这是灯光或器材部门主要助手的传统职位名，指工作职责而非年龄或性别。",
      "https://dictionary.cambridge.org/dictionary/english/best-boy",
    ],
    [
      "电影里的 foley 声音是怎么来的？",
      "拟音人员配合画面重新表演和录制脚步、衣物摩擦等动作声，让声音与动作同步。",
      "https://www.screenskills.com/job-profiles/browse/post-production/sound-studios/foley-artist-post-production/",
    ],
    [
      "剪辑师说先看 rushes，是要看快进片吗？",
      "它指拍摄后尚未剪辑的原始影像，供制作人员查看当天等阶段的拍摄成果。",
      "https://dictionary.cambridge.org/dictionary/english/rushes",
    ],
    [
      "片场的 grip 不是什么手势？",
      "在电影制作里，grip 是负责搬动、搭建或操作摄影及相关支撑器材的工作人员职位。",
      "https://dictionary.cambridge.org/dictionary/english/grip",
    ],
    [
      "导演说先做 blocking，是要堵住谁？",
      "这里指安排演员在场景中的位置和移动路线，让表演、摄影与调度能够配合。",
      "https://www.screenskills.com/online-learning/glossary",
    ],
    [
      "片场说推 dolly，是要推什么？",
      "它指承载摄影机的移动平台或小车，用来让摄影机平稳移动，而非让演员抱洋娃娃。",
      "https://dictionary.cambridge.org/dictionary/english/dolly",
    ],
    [
      "片场开拍前啪一下的 clapperboard 有何用途？",
      "场记板标记镜头信息，合板的画面与清晰响声还可为后期匹配图像和声音提供同步点。",
      "https://dictionary.cambridge.org/dictionary/english/clapperboard",
    ],
  ],
];
// 新题47易41中8难，加原库17/23/24 = 总库64/64/32（4:4:2）。难度仅编辑分档。
export const V2_TOPICS: Topic[] = groups.flatMap((rows, g) =>
  rows.map(([question, answer, source], i) => ({
    id: `xb-v2-${g + 1}-${i + 1}`,
    question,
    answer,
    source,
    theme: TOPIC_THEMES[g],
    sourceNote: `来源说明：核对所附机构或词典条目中与「${question}」对应的定义、用途或制作方式；释义为本项目原创中文改写。`,
    difficulty: (i < 4
      ? g === 0 && i === 3
        ? 3
        : 1
      : i === 7 && g < 7
        ? 3
        : 2) as 1 | 2 | 3,
  })),
);
