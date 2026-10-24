/** 服务端专用：禁止从浏览器代码导入。瞎掰王原版玩法题库：题面是一个冷门词，背面是真实解释。
 * 来源：用户第一轮保留49条、第二轮16条、Claude第三轮补充95条（2026-10-24）。 */
export interface Topic {
  id: string;
  question: string;
  answer: string;
  difficulty: 1 | 2 | 3;
  source: string;
  theme?: string;
  sourceNote?: string;
}
export const TOPICS: Topic[] = [
  {
    "id": "xb-review-007",
    "question": "橡皮鸭调试",
    "answer": "把程序逐行解释给橡皮鸭等无生命对象听，借着把思路说清楚来发现错误的方法。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Rubber_duck_debugging",
    "theme": "冷门汉字或词语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-008",
    "question": "汉堡菜单",
    "answer": "用三条横线表示、点开后才展开导航选项的一种界面按钮。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Hamburger_button",
    "theme": "冷门汉字或词语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-009",
    "question": "面包屑导航",
    "answer": "网页中按层级列出当前位置和上级页面的一串导航链接。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Breadcrumb_navigation",
    "theme": "冷门汉字或词语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-010",
    "question": "蜂蜜罐",
    "answer": "在计算机安全中故意放置的诱饵系统或资源，用来吸引并观察攻击者。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Honeypot_%28computing%29",
    "theme": "冷门汉字或词语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-011",
    "question": "袋鼠词",
    "answer": "一个词内部按原有字母顺序藏着一个意思相近的短词，就像大词肚子里装着小词。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Kangaroo_word",
    "theme": "冷门汉字或词语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-012",
    "question": "雪克隆",
    "answer": "保留固定句式、替换少数词语，就能反复套用的流行表达模板。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Snowclone",
    "theme": "冷门汉字或词语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-013",
    "question": "蓝月亮",
    "answer": "历法中的一种说法，可指同一公历月份里出现的第二次满月，并不表示月面真的变蓝。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Blue_moon",
    "theme": "冷门汉字或词语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-014",
    "question": "花园路径句",
    "answer": "开头让读者按一种结构理解，读到后面却必须回头重新分析语法的句子。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Garden-path_sentence",
    "theme": "冷门汉字或词语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-015",
    "question": "蚁浴",
    "answer": "鸟把蚂蚁放到羽毛上，或趴在蚁群附近让蚂蚁爬上身体的一类行为。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Anting_%28behavior%29",
    "theme": "奇怪的动植物",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-016",
    "question": "海猪",
    "answer": "生活在深海海底的一类海参，外形圆鼓鼓，靠多对管足在软泥上移动。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Scotoplanes",
    "theme": "奇怪的动植物",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-021",
    "question": "尸花",
    "answer": "巨魔芋的通俗名称之一，开花时会散发类似腐肉的气味来吸引传粉昆虫。",
    "difficulty": 2,
    "source": "https://zh.wikipedia.org/wiki/%E5%B7%A8%E8%8A%B1%E9%AD%94%E8%8A%8B",
    "theme": "奇怪的动植物",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-023",
    "question": "巧克力秋英",
    "answer": "原产墨西哥的一种深红褐色花卉，花有类似巧克力的香气。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Cosmos_atrosanguineus",
    "theme": "奇怪的动植物",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-029",
    "question": "拉耳朵深蹲",
    "answer": "印度部分文化情境中的一种动作，双手捏着耳朵做蹲起，可用于认错、求谅解等场合，也曾被当作惩戒。",
    "difficulty": 1,
    "source": "https://news.gamme.com.tw/1734674",
    "theme": "世界各地的怪习俗",
    "sourceNote": "文化报道：抓耳蹲起与道歉动作"
  },
  {
    "id": "xb-review-030",
    "question": "滚奶酪",
    "answer": "英国库珀山的传统活动，参加者追着滚下陡坡的圆形奶酪往山下跑。",
    "difficulty": 1,
    "source": "https://www.visitdeanwye.co.uk/events/gloucestershire-cheese-rolling",
    "theme": "世界各地的怪习俗",
    "sourceNote": "当地旅游机构：库珀山滚奶酪活动介绍"
  },
  {
    "id": "xb-review-031",
    "question": "婚前砸瓷",
    "answer": "德国部分地区的婚前习俗，亲友打碎瓷器，新人一起清理碎片。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Polterabend",
    "theme": "世界各地的怪习俗",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-032",
    "question": "红酒大战",
    "answer": "西班牙哈罗的节庆活动，参加者在特定庆典中互相泼洒红酒。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Haro_Wine_Festival",
    "theme": "世界各地的怪习俗",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-033",
    "question": "五月柱",
    "answer": "欧洲一些地区节庆中竖起的装饰柱，有时配合绕柱和编织彩带的舞蹈。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Maypole",
    "theme": "世界各地的怪习俗",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-040",
    "question": "猴子自助餐",
    "answer": "泰国华富里为当地猴群摆设果蔬等食物的节庆活动。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Monkey_Buffet_Festival",
    "theme": "世界各地的怪习俗",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-043",
    "question": "虎子",
    "answer": "中国古代一种容器的名称，常见解释为男子用的便器，部分实物做成虎形。",
    "difficulty": 1,
    "source": "https://zdic.net/hans/%E8%99%8E%E5%AD%90",
    "theme": "历史冷知识",
    "sourceNote": "汉典：对应词语义项"
  },
  {
    "id": "xb-review-044",
    "question": "警枕",
    "answer": "古人用来警醒、避免睡得太熟的枕具，常见形式是容易滚动的圆木枕。",
    "difficulty": 1,
    "source": "https://zdic.net/hans/%E8%AD%A6%E6%9E%95",
    "theme": "历史冷知识",
    "sourceNote": "汉典：对应词语义项"
  },
  {
    "id": "xb-review-046",
    "question": "鸭形玻璃注",
    "answer": "北燕墓葬出土的一件鸟形玻璃容器，口像鸭嘴、身体细长；有研究认为它是盛放香料的器具，确切用途仍有讨论。",
    "difficulty": 1,
    "source": "https://epaper.lnd.com.cn/lnrbepaper/pc/con/202201/05/content_138800.html",
    "theme": "历史冷知识",
    "sourceNote": "辽宁日报：博物馆人员对鸭形玻璃注的介绍"
  },
  {
    "id": "xb-review-047",
    "question": "空心十二面体",
    "answer": "古罗马遗址出土的中空十二面青铜器，面上开孔、角上带球，确切用途尚无定论。",
    "difficulty": 3,
    "source": "https://zh.wikipedia.org/wiki/%E7%BE%85%E9%A6%AC%E5%8D%81%E4%BA%8C%E9%9D%A2%E9%AB%94",
    "theme": "历史冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-054",
    "question": "奇普",
    "answer": "安第斯地区用绳结、绳色与位置记录信息的装置，曾用于人口和物资等管理。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Quipu",
    "theme": "历史冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-057",
    "question": "珍道具",
    "answer": "一种追求解决日常问题、却因过于古怪或不便而难以真正实用的发明类别，并不只是普通废品的统称。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Chind%C5%8Dgu",
    "theme": "奇葩发明或专利",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-058",
    "question": "鸽子相机",
    "answer": "固定在鸽子身上的微型相机，可让鸽子飞行时按定时机构拍摄照片，是早期航空摄影的一种尝试。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Pigeon_photography",
    "theme": "奇葩发明或专利",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-059",
    "question": "耳朵喇叭",
    "answer": "电子助听器普及前使用的集音器具，靠漏斗或喇叭状管体把声音引向耳道。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Ear_trumpet",
    "theme": "奇葩发明或专利",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-060",
    "question": "黄油棒",
    "answer": "把黄油装进可旋出的管状容器，像涂固体胶一样涂抹的工具，已有相应实用新型专利。",
    "difficulty": 1,
    "source": "https://patents.google.com/patent/CN202542147U/zh",
    "theme": "奇葩发明或专利",
    "sourceNote": "专利 CN202542147U：黄油棒结构与用途"
  },
  {
    "id": "xb-review-062",
    "question": "滚动桥",
    "answer": "英国伦敦一座可通过液压装置卷成八角形的步行桥，展开时可供人通行。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/The_Rolling_Bridge",
    "theme": "奇葩发明或专利",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-063",
    "question": "风力仿生兽",
    "answer": "艺术家泰奥扬森制作的一类多足步行机械，利用连杆把风力等动力转成行走动作，也被称为海滩怪兽。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Strandbeest",
    "theme": "奇葩发明或专利",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-067",
    "question": "佩珀尔幻象",
    "answer": "利用倾斜透明面反射隐藏影像，使观众看到仿佛出现在舞台上的半透明人影的幻术。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Pepper%27s_ghost",
    "theme": "奇葩发明或专利",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-072",
    "question": "狐狸嫁女",
    "answer": "日语民间表达，可指晴天同时下雨的太阳雨，也与狐狸婚礼的传说有关。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Kitsune_no_yomeiri",
    "theme": "世界各地的怪习俗",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-109",
    "question": "打冷",
    "answer": "在香港等地吃潮州式小菜、夜粥等的一种说法，不是把食物打到冰冷。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Daa_Laang",
    "theme": "方言和俗语",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-110",
    "question": "打平伙",
    "answer": "几个人共同出钱或出食材，凑在一起吃一顿饭的说法。",
    "difficulty": 1,
    "source": "https://zdic.net/hans/%E6%89%93%E5%B9%B3%E4%BC%99",
    "theme": "方言和俗语",
    "sourceNote": "汉典：对应词语义项"
  },
  {
    "id": "xb-review-112",
    "question": "食死猫",
    "answer": "粤语俗语，指自己没有犯错，却被迫替别人承担过失和责怪。",
    "difficulty": 1,
    "source": "https://words.hk/zidin/%E9%A3%9F%E6%AD%BB%E8%B2%93",
    "theme": "方言和俗语",
    "sourceNote": "粤典：粤语义项"
  },
  {
    "id": "xb-review-116",
    "question": "白相",
    "answer": "吴语中玩耍、游玩的说法，不是指脸色发白。",
    "difficulty": 1,
    "source": "https://zdic.net/hans/%E7%99%BD%E7%9B%B8",
    "theme": "方言和俗语",
    "sourceNote": "汉典：对应词语义项"
  },
  {
    "id": "xb-review-119",
    "question": "车大炮",
    "answer": "粤语俗语，表示吹牛、夸大其词。",
    "difficulty": 1,
    "source": "https://zdic.net/hans/%E8%BD%A6%E5%A4%A7%E7%82%AE",
    "theme": "方言和俗语",
    "sourceNote": "汉典：对应词语义项"
  },
  {
    "id": "xb-review-121",
    "question": "猪笼入水",
    "answer": "粤语中祝愿财源广进的吉利话，利用竹笼下水后四面进水的意象。",
    "difficulty": 2,
    "source": "https://words.hk/zidin/%E8%B1%AC%E7%B1%A0%E5%85%A5%E6%B0%B4",
    "theme": "方言和俗语",
    "sourceNote": "粤典：粤语义项"
  },
  {
    "id": "xb-review-123",
    "question": "金鸭子",
    "answer": "板球中击球手面对的第一球就出局、且没有得分的情况。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Duck_%28cricket%29",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-124",
    "question": "火鸡",
    "answer": "保龄球里连续投出三次全中的俗称，并不是保龄球场里的动物。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Turkey_%28bowling%29",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-125",
    "question": "射月",
    "answer": "红心大战的一种特殊结果：同一玩家收齐所有罚分牌后，按采用的规则改由其他人加罚分或自己减分。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Hearts_%28card_game%29",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-126",
    "question": "打入",
    "answer": "将棋中把先前吃到、现为己方持有的棋子重新放到棋盘上成为己方棋子的走法。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Shogi",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-127",
    "question": "千日手",
    "answer": "将棋中同一局面连同轮到哪方行棋反复出现达到规则次数的情况，通常需要重新对局，连续将军等情形另有规定。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Sennichite",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-129",
    "question": "倒脱靴",
    "answer": "围棋的一种吃子手段，先让对方吃掉己方部分棋子，再利用对方形成的气紧局面回吃。",
    "difficulty": 3,
    "source": "https://zh.wikipedia.org/wiki/%E5%80%92%E8%84%AB%E9%9D%B4",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-130",
    "question": "黄金盘",
    "answer": "网球中某位选手在一盘里赢下全部得分、对手连一分也没拿到的罕见成绩。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Golden_set",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-135",
    "question": "耳虫",
    "answer": "一小段旋律在脑中反复自动响起的现象，并不是耳内真的有虫。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Earworm",
    "theme": "身体与心理学小现象",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-140",
    "question": "橡胶手错觉",
    "answer": "把假手和被遮住的真手同步触碰时，有些人会产生假手像自己身体一部分的感觉。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Body_transfer_illusion",
    "theme": "身体与心理学小现象",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-146",
    "question": "皮肤兔错觉",
    "answer": "在皮肤相距一定距离的位置快速敲击，人有时会感觉触碰点像在两处之间跳过。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Cutaneous_rabbit_illusion",
    "theme": "身体与心理学小现象",
    "sourceNote": "百科条目：对应名称及定义"
  },
  {
    "id": "xb-review-150",
    "question": "飞白",
    "answer": "书法中笔画中露出丝状白痕的一种效果，印刷或设计语境也可能借用这个词。",
    "difficulty": 1,
    "source": "https://zdic.net/hans/%E9%A3%9E%E7%99%BD",
    "theme": "职业黑话",
    "sourceNote": "汉典：对应词语义项"
  },
  {
    "id": "xb-review-160",
    "question": "叼口",
    "answer": "印刷机送纸时由叼牙夹持的纸边区域，该区域一般不能像普通版面一样印刷。",
    "difficulty": 3,
    "source": "https://www.deity.org.tw/deity/article/zh-tw/subpage/406",
    "theme": "职业黑话",
    "sourceNote": "印刷企业术语表：叼口定义"
  },
  {
    "id": "xb-r2-001",
    "question": "美人鱼的钱包",
    "answer": "某些鲨鱼和鳐类包裹胚胎的革质卵鞘，空卵鞘有时会被海浪冲到岸边。",
    "difficulty": 1,
    "source": "https://marinedimensions.ie/home_page/",
    "theme": "奇怪的动植物",
    "sourceNote": "海洋研究教育机构：鲨鱼、鳐类卵鞘的俗称"
  },
  {
    "id": "xb-r2-002",
    "question": "水手的眼球",
    "answer": "一种圆鼓鼓、像绿色弹珠的海洋绿藻，叫球法囊藻；一个球体可以是含有多个细胞核的巨大细胞。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Valonia_ventricosa",
    "theme": "奇怪的动植物",
    "sourceNote": "百科条目：球法囊藻的俗名、形态与细胞结构"
  },
  {
    "id": "xb-r2-003",
    "question": "维纳斯的花篮",
    "answer": "一种生活在海中的玻璃海绵，骨架由硅质骨针交织成精细的网笼状，是动物而非植物或编织品。",
    "difficulty": 2,
    "source": "https://mbl.sjtu.edu.cn/yjty1.php?idh=96&upid=242",
    "theme": "奇怪的动植物",
    "sourceNote": "上海交通大学海洋生物资料：海绵形态及俗名"
  },
  {
    "id": "xb-r2-004",
    "question": "死人的手指",
    "answer": "多形炭角菌的俗称，常在腐木附近长出一簇深色棒状菌体，看起来像从木头里伸出的手指。",
    "difficulty": 1,
    "source": "https://www.horniman.ac.uk/story/dead-mans-fingers-and-late-ladybirds/",
    "theme": "奇怪的动植物",
    "sourceNote": "霍尼曼博物馆：对应真菌的形态与名称"
  },
  {
    "id": "xb-r2-005",
    "question": "女巫的扫帚",
    "answer": "植物某一处异常密集地长出一团细枝、外形像扫帚的现象，可以由病原生物、昆虫或其他因素引起。",
    "difficulty": 2,
    "source": "https://www.rhs.org.uk/biodiversity/witches-brooms",
    "theme": "奇怪的动植物",
    "sourceNote": "英国皇家园艺学会：异常枝条增生及不同成因"
  },
  {
    "id": "xb-r2-006",
    "question": "女巫黄油",
    "answer": "一种黄色胶质真菌的俗称，常见于枯木上，菌体皱皱软软，看起来像一团黄色果冻。",
    "difficulty": 1,
    "source": "https://mdc.mo.gov/discover-nature/field-guide/witches-butter",
    "theme": "奇怪的动植物",
    "sourceNote": "美国密苏里州自然保护部门：黄色胶质真菌图鉴"
  },
  {
    "id": "xb-r2-007",
    "question": "恶魔雪茄",
    "answer": "一种未展开时像深褐色雪茄的真菌，成熟后会裂成星形，并释放出烟雾般的孢子。",
    "difficulty": 2,
    "source": "https://fwbg.org/2021/06/07/texas-star-mushroom/",
    "theme": "奇怪的动植物",
    "sourceNote": "沃思堡植物园：星形真菌的外形及雪茄俗名"
  },
  {
    "id": "xb-r2-008",
    "question": "雅各布天梯",
    "answer": "一种高压放电演示装置，电弧沿两根向上逐渐分开的电极爬升，熄灭后又从底部出现。",
    "difficulty": 3,
    "source": "https://phydemo.fudan.edu.cn/c6/8d/c46593a706189/page.htm",
    "theme": "奇葩发明或专利",
    "sourceNote": "复旦大学物理演示实验：雅各布天梯"
  },
  {
    "id": "xb-r2-009",
    "question": "圣艾尔摩之火",
    "answer": "强电场下在船桅、飞机等物体突出部位附近出现蓝紫色辉光的电晕放电现象，并非物体在燃烧。",
    "difficulty": 3,
    "source": "https://www.weather.gov.hk/sc/education/aviation-and-marine/aviation/00534-st-elmos-fire-as-seen-from-aircraft.html",
    "theme": "自然现象与地貌",
    "sourceNote": "香港天文台：尖端附近的大气放电现象"
  },
  {
    "id": "xb-r2-010",
    "question": "布罗肯幽灵",
    "answer": "太阳从身后照来时，观察者自己的影子投到前方云雾上，有时还被彩色光环围住，看起来像云中的巨大人影。",
    "difficulty": 2,
    "source": "https://www.hko.gov.hk/sc/education/earth-science/optical-phenomena/00348-the-mysterious-glory.html",
    "theme": "自然现象与地貌",
    "sourceNote": "香港天文台：投在云雾中的影子与彩光环"
  },
  {
    "id": "xb-r2-011",
    "question": "看不见的大猩猩",
    "answer": "一个注意力实验的名称：观看者忙着数篮球传球次数，有些人竟没注意到画面里走过一个穿大猩猩服装的人。",
    "difficulty": 2,
    "source": "https://www.whstm.org.cn/shownews/detail/1882",
    "theme": "身体与心理学小现象",
    "sourceNote": "武汉科学技术馆：选择性注意实验；不采用固定漏看比例"
  },
  {
    "id": "xb-r2-012",
    "question": "天使的份额",
    "answer": "酿酒行当中对酒液在木桶熟成期间自然蒸发、逐渐减少的那一部分的称呼。",
    "difficulty": 1,
    "source": "https://www.chateau-de-sales.com/zh-hans/%E4%BD%A0%E4%BB%AC%E6%98%AF%E5%90%A6%E5%90%AC%E8%AF%B4%E8%BF%87%E5%A4%A9%E4%BD%BF%E7%9A%84%E4%BB%BD%E9%A2%9D%EF%BC%9F/",
    "theme": "职业黑话",
    "sourceNote": "酒庄自身说明：木桶陈酿中的蒸发损失"
  },
  {
    "id": "xb-r2-013",
    "question": "猫的摇篮",
    "answer": "一种把环形绳套在手指之间，通过挑、勾和交接变换图案的翻绳游戏的名称；本题采用游戏这一义。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Cat%27s_cradle",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "百科条目：翻绳游戏；与同名小说区分"
  },
  {
    "id": "xb-r2-014",
    "question": "魔鬼的高尔夫球场",
    "answer": "美国死亡谷的一片嶙峋盐地，盐层被风雨侵蚀成尖锐突起，因此得到这个像运动场的地名。",
    "difficulty": 2,
    "source": "https://www.nps.gov/thingstodo/check-out-devils-golf-course.htm",
    "theme": "自然现象与地貌",
    "sourceNote": "美国国家公园管理局：盐岩地貌及地名来源"
  },
  {
    "id": "xb-r2-015",
    "question": "撒哈拉之眼",
    "answer": "毛里塔尼亚沙漠里一处巨大的同心环状地质构造，正式名称为理查特结构，从高空看很像眼睛。",
    "difficulty": 2,
    "source": "https://www.nasa.gov/image-article/eye-of-sahara-mauritania-2/",
    "theme": "自然现象与地貌",
    "sourceNote": "美国航空航天局：理查特结构的环状地貌"
  },
  {
    "id": "xb-r2-016",
    "question": "死亡螺旋",
    "answer": "双人花样滑冰动作，一位搭档作支点并牵住另一位的手，后者身体靠近冰面、绕着支点滑行旋转。",
    "difficulty": 3,
    "source": "https://www.usfigureskating.org/sites/default/files/media-files/TP%20Handbook%20Pair%20Skating%202024-25.pdf",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "美国花样滑冰协会技术手册：双人滑死亡螺旋定义"
  },
  {
    "id": "xb-r3-001",
    "question": "鲁珀特之泪",
    "answer": "熔融玻璃滴进冷水形成的蝌蚪状玻璃珠，头部锤子都砸不碎，尾巴一掐整颗瞬间炸成粉末。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Prince_Rupert%27s_drop",
    "theme": "奇葩发明或专利",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-002",
    "question": "木乃伊褐",
    "answer": "欧洲画家曾用过的一种棕色颜料，原料真的是磨碎的古埃及木乃伊。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Mummy_brown",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-003",
    "question": "印度黄",
    "answer": "一种历史上的黄色颜料，据记载是用吃芒果叶的牛的尿液熬制提取的。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Indian_yellow",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-004",
    "question": "巴黎绿",
    "answer": "19世纪流行的一种鲜绿色颜料，含砷有剧毒，后来还被当作杀虫剂和灭鼠药。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Paris_green",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-005",
    "question": "陷阱街",
    "answer": "地图公司故意画进地图里的一条不存在的街道，用来抓别人抄袭自己的地图。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Trap_street",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-006",
    "question": "纸上小镇",
    "answer": "地图上故意虚构出来防抄袭的小镇；美国的阿格洛镇后来甚至真的有人在那里开了店。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Agloe,_New_York",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-007",
    "question": "眼镜蛇效应",
    "answer": "为了消灭眼镜蛇而悬赏收购，结果有人专门养蛇换赏金，取消悬赏后蛇反而更多。指政策适得其反。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Perverse_incentive",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-008",
    "question": "史翠珊效应",
    "answer": "越想删掉、压下某条信息，它反而传得越广。源自一位明星起诉要求删除自家豪宅照片。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Streisand_effect",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-009",
    "question": "自行车棚效应",
    "answer": "开会时大家对难懂的大事一笔带过，却对自行车棚刷什么颜色这种小事争论不休。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Law_of_triviality",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-010",
    "question": "波将金村",
    "answer": "专门搭给上级参观的假门面村庄，泛指弄虚作假的形象工程。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Potemkin_village",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-011",
    "question": "皮洛士式胜利",
    "answer": "虽然打赢了，但付出的代价大到跟输了差不多的胜利。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Pyrrhic_victory",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-012",
    "question": "戈尔迪之结",
    "answer": "传说中谁都解不开的绳结，亚历山大大帝直接一剑砍断。比喻用非常规手段解决难题。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Gordian_Knot",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-013",
    "question": "普罗克拉斯提斯之床",
    "answer": "希腊神话里的强盗把旅客按在床上，太长就砍、太短就硬拉。比喻削足适履、强求一致。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Procrustes",
    "theme": "冷门汉字或词语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-014",
    "question": "布里丹的驴",
    "answer": "一头驴站在两堆一样好的干草中间，因为选不出吃哪堆，最后活活饿死。一个关于选择困难的哲学寓言。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Buridan%27s_ass",
    "theme": "冷门汉字或词语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-015",
    "question": "毛球定理",
    "answer": "一条数学定理：一个长满毛的球，不可能把毛全部梳平，总会留下至少一个“发旋”。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Hairy_ball_theorem",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-016",
    "question": "火腿三明治定理",
    "answer": "一条数学定理：面包、火腿、面包三块不管怎么摆放，总能一刀把三样都各切成相等的两半。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Ham_sandwich_theorem",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-017",
    "question": "中国邮递员问题",
    "answer": "一道图论题：怎样走最短的路线，把每条街都至少走一遍，再回到起点。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Chinese_postman_problem",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-018",
    "question": "哲学家就餐问题",
    "answer": "计算机经典问题：五位哲学家围桌吃饭，只有五根筷子，怎样分配才不会所有人互相卡死。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Dining_philosophers_problem",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-019",
    "question": "拜占庭将军问题",
    "answer": "计算机经典问题：部分将军可能是叛徒、信使可能撒谎时，大家怎样才能达成一致的作战决定。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Byzantine_fault",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-020",
    "question": "睡美人问题",
    "answer": "一道概率谜题：被弄睡后醒来、不知道自己已经被叫醒过几次，该怎么估计抛硬币是正面的概率。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Sleeping_Beauty_problem",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-021",
    "question": "金发姑娘原则",
    "answer": "不太多也不太少、刚刚好的状态；天文学里指适合生命存在的“宜居带”。名字来自三只熊的童话。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Goldilocks_principle",
    "theme": "冷门汉字或词语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-022",
    "question": "红皇后假说",
    "answer": "进化论观点：物种必须不停进化，才能在和天敌、对手的竞争中勉强维持原地不被淘汰。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Red_Queen_hypothesis",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-023",
    "question": "绿胡子效应",
    "answer": "进化论设想：某个基因能让携带它的个体认出彼此并互相帮忙，就好像大家都长着显眼的绿胡子。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Green-beard_effect",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-024",
    "question": "拉撒路物种",
    "answer": "曾被认为已经灭绝、后来又被重新发现还活着的物种。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Lazarus_taxon",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-025",
    "question": "巴德尔-迈因霍夫现象",
    "answer": "刚学会一个词或刚注意到一样东西，接下来好像到处都能看到它的错觉。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Frequency_illusion",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-026",
    "question": "鲁布·戈德堡机械",
    "answer": "用一长串夸张复杂的连锁机关，去完成一件很简单的小事的装置。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Rube_Goldberg_machine",
    "theme": "奇葩发明或专利",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-027",
    "question": "臭鼬工厂",
    "answer": "美国洛克希德公司秘密研发先进飞机的部门外号，后来泛指公司里独立的秘密攻关小组。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Skunk_Works",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-028",
    "question": "吃自己的狗粮",
    "answer": "公司内部员工先用自家产品，用来发现问题、也表明对产品有信心。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Eating_your_own_dog_food",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-029",
    "question": "金丝雀发布",
    "answer": "软件新版本先只推送给一小部分用户试用，没问题再全面上线。得名于矿工带金丝雀下井探测毒气。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Feature_toggle",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-030",
    "question": "精灵环",
    "answer": "草地上蘑菇长成的一个大圆圈，由地下真菌一圈圈向外扩散造成。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Fairy_ring",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-031",
    "question": "恶魔的脚趾甲",
    "answer": "一种古代牡蛎化石的俗称，弯曲厚重的外壳形状像变形的脚趾甲。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Gryphaea",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-032",
    "question": "法塔莫甘娜",
    "answer": "一种复杂的海市蜃楼，远处的船或海岸看起来像悬在空中的城堡。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Fata_Morgana_(mirage)",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-033",
    "question": "血瀑布",
    "answer": "南极冰川里流出的一道红色瀑布，颜色来自含铁的盐水接触空气后氧化。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Blood_Falls",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-034",
    "question": "地狱之门",
    "answer": "土库曼斯坦沙漠里一个已经连续燃烧了几十年的天然气大坑。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Darvaza_gas_crater",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-035",
    "question": "冰淇淋头痛",
    "answer": "吃冰太快导致的短暂剧烈头痛，学名叫蝶腭神经节痛。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Ice-cream_headache",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-036",
    "question": "忒修斯之船",
    "answer": "一艘船的木板被一块块全部换掉以后，它还算不算原来那艘船的哲学问题。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Ship_of_Theseus",
    "theme": "冷门汉字或词语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-037",
    "question": "无限猴子定理",
    "answer": "让猴子在打字机上无限久地随机乱敲，几乎必然能打出一部完整的莎士比亚全集。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Infinite_monkey_theorem",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-038",
    "question": "古德哈特定律",
    "answer": "一个指标一旦被当成考核目标，它就不再是一个好指标了。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Goodhart%27s_law",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-039",
    "question": "鸡尾酒会效应",
    "answer": "在嘈杂的聚会里，人能只听清一个人说话，而远处有人提到自己名字也会立刻注意到。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Cocktail_party_effect",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-040",
    "question": "宜家效应",
    "answer": "人会特别看重自己亲手组装的东西，哪怕做得并不怎么样。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/IKEA_effect",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-041",
    "question": "卡珊德拉情结",
    "answer": "预言准确却没有人相信的处境。源自希腊神话里被诅咒的女预言家。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Cassandra_(metaphor)",
    "theme": "冷门汉字或词语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-042",
    "question": "煎饼定理",
    "answer": "一条数学定理：桌上两张任意形状的煎饼，总能用一刀直线把两张都各自平分。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Ham_sandwich_theorem",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-043",
    "question": "蘑菇管理法",
    "answer": "戏称一种管理方式：把员工关在“黑屋”里只喂肥料，什么信息都不告诉他们。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Mushroom_management",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-044",
    "question": "飞天意大利面神",
    "answer": "为了讽刺在学校里教“智慧设计论”而虚构出来的恶搞宗教神明。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Flying_Spaghetti_Monster",
    "theme": "世界各地的怪习俗",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-045",
    "question": "威尔士兔子",
    "answer": "一道英国菜，其实是浇上热奶酪酱烤的面包，里面根本没有兔肉。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Welsh_rarebit",
    "theme": "食物的由来",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-046",
    "question": "洞里的蟾蜍",
    "answer": "一道英国菜，把香肠放进约克郡布丁面糊里一起烤，跟蟾蜍毫无关系。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Toad_in_the_hole",
    "theme": "食物的由来",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-047",
    "question": "修女的屁",
    "answer": "一种法国小点心，是油炸的小泡芙，口感轻得像空气。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Pets_de_nonne",
    "theme": "食物的由来",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-048",
    "question": "穷骑士",
    "answer": "德国等地对法式吐司的叫法：把隔夜面包蘸上蛋奶液煎成的点心。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/French_toast",
    "theme": "食物的由来",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-049",
    "question": "魔鬼蛋",
    "answer": "把水煮蛋的蛋黄挖出来调味后，再填回蛋白里的一道冷盘。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Deviled_egg",
    "theme": "食物的由来",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-050",
    "question": "苏格兰蛋",
    "answer": "用香肠肉把整颗水煮蛋包起来，再裹上面包屑油炸的小吃。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Scotch_egg",
    "theme": "食物的由来",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-051",
    "question": "卡苏马苏",
    "answer": "意大利撒丁岛的一种传统奶酪，里面故意养着活的苍蝇幼虫。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Casu_martzu",
    "theme": "食物的由来",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-052",
    "question": "婴儿的呼吸",
    "answer": "满天星这种花在英文里的名字。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Gypsophila",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-053",
    "question": "猴谜树",
    "answer": "智利南洋杉，枝叶上长满硬刺，俗称连猴子都爬不上去。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Araucaria_araucana",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-054",
    "question": "屠夫的扫帚",
    "answer": "一种叫假叶树的植物，过去欧洲屠夫用它的枝条清扫肉案。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Ruscus_aculeatus",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-055",
    "question": "香肠树",
    "answer": "吊灯树，果实又长又粗地垂挂下来，像一根根挂着的香肠。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Kigelia",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-056",
    "question": "魔鬼的爪子",
    "answer": "一种非洲植物，果实带着弯钩刺，会钩住路过动物的蹄子跟着走。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Harpagophytum",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-057",
    "question": "海兔",
    "answer": "一类海蛞蝓，头上两根触角像兔子耳朵，受惊时会喷出紫色墨汁。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Sea_hare",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-058",
    "question": "海苹果",
    "answer": "一种颜色鲜艳、圆鼓鼓的海参。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Pseudocolochirus",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-059",
    "question": "吸血乌贼",
    "answer": "深海里的一种头足类动物，名字吓人，其实吃的是海里漂落的有机碎屑，并不吸血。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Vampire_squid",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-060",
    "question": "水熊虫",
    "answer": "一种不到1毫米长的缓步动物，能在极冷、极干，甚至太空环境里存活。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Tardigrade",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-061",
    "question": "鳞角腹足蜗牛",
    "answer": "深海热泉里的一种蜗牛，脚上长着含铁的鳞片，就像穿了一身铁甲。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Scaly-foot_gastropod",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-062",
    "question": "僵尸蚂蚁",
    "answer": "被一种真菌寄生后，会爬到高处咬住叶子死去、让真菌从身上长出来散播孢子的蚂蚁。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Ophiocordyceps_unilateralis",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-063",
    "question": "毛冰",
    "answer": "潮湿的枯木上长出的一丝丝像白头发一样的冰，形成和木头里的真菌有关。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Hair_ice",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-064",
    "question": "钻石星尘",
    "answer": "极冷晴天里空气中悬浮的细小冰晶，在阳光下一闪一闪地发光。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Diamond_dust",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-065",
    "question": "绿闪",
    "answer": "太阳刚落下或刚升起的一瞬间，太阳边缘闪出的一抹绿光。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Green_flash",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-066",
    "question": "耶稣光",
    "answer": "阳光从云缝里一束束射下来的景象，学名叫曙暮辉。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Crepuscular_rays",
    "theme": "方言和俗语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-067",
    "question": "魔幻时刻",
    "answer": "摄影行话，指日出后、日落前一小段光线柔和发金的时间。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Golden_hour_(photography)",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-068",
    "question": "生日悖论",
    "answer": "一屋子只要有23个人，就有超过一半的概率出现两个人同一天生日。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Birthday_problem",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-069",
    "question": "费米悖论",
    "answer": "宇宙这么大、这么老，按理应该有很多外星文明，可人类为什么一个都没发现。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Fermi_paradox",
    "theme": "冷门汉字或词语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-070",
    "question": "奥伯斯佯谬",
    "answer": "如果宇宙无限大又布满星星，夜空应该处处都是亮的，那夜晚为什么是黑的。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Olbers%27s_paradox",
    "theme": "冷门汉字或词语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-071",
    "question": "布雷斯悖论",
    "answer": "给道路网多修一条新路，有时反而会让所有人都更堵。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Braess%27s_paradox",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-072",
    "question": "杰文斯悖论",
    "answer": "某种资源用得越省，反而因为变便宜了大家用得更多，总消耗不降反升。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Jevons_paradox",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-073",
    "question": "辛普森悖论",
    "answer": "每个小组数据里都成立的趋势，把数据合在一起看却完全反过来了。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Simpson%27s_paradox",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-074",
    "question": "海岸线悖论",
    "answer": "一条海岸线的长度取决于拿多长的尺子去量，尺子越短，量出来越长。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Coastline_paradox",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-075",
    "question": "圣彼得堡悖论",
    "answer": "一个按抛硬币翻倍给钱的赌局，理论期望收益无限大，可几乎没人愿意花大钱去玩。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/St._Petersburg_paradox",
    "theme": "体育或游戏规则的冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-076",
    "question": "本福特定律",
    "answer": "很多真实数据里，首位数字是1的最多，约占三成，查账时可以用来揪出假账。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Benford%27s_law",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-077",
    "question": "帕金森定律",
    "answer": "工作会自动膨胀，直到填满所有可以用的时间。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Parkinson%27s_law",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-078",
    "question": "彼得原理",
    "answer": "在层级组织里，人会一直被提拔，直到升到自己不能胜任的职位为止。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Peter_principle",
    "theme": "职业黑话",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-079",
    "question": "邓巴数",
    "answer": "一个人能维持稳定社交关系的人数上限，大约是150人。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Dunbar%27s_number",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-080",
    "question": "香蕉等效剂量",
    "answer": "拿吃一根香蕉受到的天然辐射量当单位，通俗地比较各种辐射剂量。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Banana_equivalent_dose",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-081",
    "question": "恐怖谷",
    "answer": "机器人或假人越像人越讨喜，但像到“几乎一样又不太对”时，反而让人毛骨悚然。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Uncanny_valley",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-082",
    "question": "普鲁斯特效应",
    "answer": "某种气味一下子勾起很久以前的回忆。名字来自一部小说里的玛德琳蛋糕情节。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Involuntary_memory",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-083",
    "question": "蔡格尼克效应",
    "answer": "没做完的事，往往比已经做完的事记得更牢。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Zeigarnik_effect",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-084",
    "question": "巴纳姆效应",
    "answer": "人会觉得一段笼统、谁都适用的性格描述“说得太准了”，算命和星座常靠这一点。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Barnum_effect",
    "theme": "身体与心理学小现象",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-085",
    "question": "莱顿瓶",
    "answer": "18世纪发明的最早的电容器：一个内外贴着金属箔的玻璃瓶，能把静电存起来。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Leyden_jar",
    "theme": "奇葩发明或专利",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-086",
    "question": "法拉第笼",
    "answer": "用金属网做的笼子，能挡住外面的电场，人坐在里面就算被雷击也没事。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Faraday_cage",
    "theme": "奇葩发明或专利",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-087",
    "question": "机械土耳其人",
    "answer": "18世纪一台号称会自己下棋的机器，其实里面藏着一个真人棋手在操作。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Mechanical_Turk",
    "theme": "奇葩发明或专利",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-088",
    "question": "安提基特拉机械",
    "answer": "从古希腊沉船里打捞出的青铜齿轮装置，用来推算天体运行，被称为最早的“计算机”。",
    "difficulty": 3,
    "source": "https://en.wikipedia.org/wiki/Antikythera_mechanism",
    "theme": "奇葩发明或专利",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-089",
    "question": "巴格达电池",
    "answer": "伊拉克出土的古代陶罐，里面有铜筒和铁棒，有人猜它是古代电池，至今仍有争议。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Baghdad_Battery",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-090",
    "question": "跳舞瘟疫",
    "answer": "1518年法国斯特拉斯堡有上百人连续多天不停跳舞、怎么也停不下来的怪事。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Dancing_plague_of_1518",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-091",
    "question": "糖蜜大洪水",
    "answer": "1919年美国波士顿一个巨型储罐破裂，糖浆像海啸一样冲进街道的事故。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Great_Molasses_Flood",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-092",
    "question": "鸸鹋战争",
    "answer": "1932年澳大利亚派军人带机枪去对付毁坏庄稼的鸸鹋，结果基本没打赢。",
    "difficulty": 1,
    "source": "https://en.wikipedia.org/wiki/Emu_War",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-093",
    "question": "大恶臭",
    "answer": "1858年夏天伦敦泰晤士河臭到议会都开不下去，伦敦因此修建了现代下水道系统。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Great_Stink",
    "theme": "历史冷知识",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-094",
    "question": "蓝筹",
    "answer": "原本指扑克牌局里面值最高的蓝色筹码，后来用来称呼最稳健的大公司股票。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Blue_chip_(stock_market)",
    "theme": "方言和俗语",
    "sourceNote": "维基百科条目：名称与定义"
  },
  {
    "id": "xb-r3-095",
    "question": "鸽子的奶",
    "answer": "鸽子嗉囊分泌的一种乳状物，亲鸟用它喂养刚孵出的雏鸽，公鸽母鸽都会分泌。",
    "difficulty": 2,
    "source": "https://en.wikipedia.org/wiki/Crop_milk",
    "theme": "奇怪的动植物",
    "sourceNote": "维基百科条目：名称与定义"
  }
];
