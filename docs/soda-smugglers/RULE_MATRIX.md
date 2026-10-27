# 汽水走私犯：阶段 1 规则矩阵

日期：2026-10-27。范围：Bitewing Games 英文原版；无旧版 Heisse Ware、无房规。阶段2更新：纯函数引擎与测试已实现。下表测试标签对应实际测试文件中的用例标题/覆盖索引；阶段3房间和阶段4界面尚未实现。

## 来源与证据边界

- S1：[出版社游戏页](https://bitewinggames.com/soda-smugglers/)，本机 HTTP 200；明确 3–8 人与检查者轮数，网页「Download the Rulebook Here」链接到 S2。
- S2：[出版社指定的 BGG 官方英文规则条目](https://boardgamegeek.com/filepage/232221/soda-smugglers-official-rulebook)，搜索索引显示上传者 Murraculous、2021-12-07、文件名 Soda Smugglers Rules Small；直接访问 HTTP 403，未取得 BGG 原文件，未验证字节一致。
- S3：[同名规则 PDF 的零售商镜像](https://gamers-hq.de/media/pdf/6c/4e/7b/Soda_Smugglers_Rules_Small.pdf)，HTTP 200，18,550,333 字节，8 页；页脚为 ©2021 Bitewing Games，封面和配件与官网成品照片一致。**官方出版物内容、第三方托管，暂用主证据，来源链仍 CHECK_REQUIRED Q01**。不是把零售商观点当作官方裁定。
- S3 SHA256：`29f33e388463f9b1718c2266632d1ad3a18b1b5556c935badec2638354ea13e9`。页码使用 PDF 物理页，等于印刷页；封面算第 1 页。
- S4：[出版社成品卡照片](https://bitewinggames.com/wp-content/uploads/2022/06/CCC-Final-Production-10-scaled.jpg)，清楚显示 Night Shift 卡文；其他官网图片见 ASSETS。
- 搜索了 BGG 中贿赂、瓶盖不足、事件牌相关问题，没有取得可核实身份的设计师/出版社规则裁定；不引用普通玩家评论补规则。
- 本地原 PDF、页面渲染、官网 HTML 留在 `tmp/ss-research/`，不提交原始 PDF。规则正文 p2–p7 均已提取文字并逐页看图；p1 看封面，p8 提取版权文字。

## 基础版矩阵

状态：CONFIRMED表示英文已核来源；USER_ACCEPTED表示用户已批准；ZH_PHOTO表示本轮中文照片/转录；HR-SS-01是明确用户房规。源码packages/soda-smugglers/src/index.ts，测试packages/soda-smugglers/test/，下面函数和测试列已按实际入口更新。

| ID | 要点（自己的话） | 来源/页码 | 状态 | 引擎函数 | 实际测试覆盖 |
|---|---|---|---|---|---|
| R01 | 3–8 人；每轮一名检查者，其他人为旅客 | S1、S3 p1,3 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R02 | 行李牌共36：0瓶12张、1瓶12张、2瓶7张、3瓶5张；背面不是额外牌 | S3 p2 图；12+12+7+5=36 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R03 | 瓶盖80枚：1×32、3×20、5×12、10×8、20×5、30×3；总面值422 | S3 p2 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R04 | 动作标记7：收贿赂2、检查2、逮捕3；事件牌8张为可选 | S3 p2 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R05 | 每人初始10：两个1、一个3、一个5；其余属公共库存 | S3 p3 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R06 | 每人瓶盖公开，可随时换零；分数按面值，不按枚数 | S3 p3 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R07 | 3/4人动作数1/1/1；5人1/1/2；6人1/2/2；7人2/2/2；8人2/2/3（收/查/捕） | S3 p3 表 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R08 | 最近喝汽水的人第一轮当检查者；以后沿座位顺时针轮换 | S3 p3 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R09 | 每轮重新洗全部行李牌，给每名旅客5张；检查者不发；余牌盖放 | S3 p4 步2、p6 步6 | CONFIRMED | createSS / assertInvariants | creation.test.ts: R01-R09 |
| R10 | 每名旅客从5张中选有位置的2张行李，另选1张贿赂；余2张盖弃 | S3 p4 步3 | CONFIRMED | reduceSS:SUBMIT | engine.test.ts: R10-R12,R30-R33 |
| R11 | 所有人选好才同时翻开贿赂牌；行李仍盖着 | S3 p4 步3iii | CONFIRMED | reduceSS:SUBMIT | engine.test.ts: R10-R12,R30-R33 |
| R12 | 线上草稿私有，提交锁定，最后一人提交才公开贿赂；不可因他人先提交取得牌值 | S3 p4；MASTER §1 | USER_ACCEPTED | reduceSS:SUBMIT / viewForSS | engine.test.ts: R10-R12,R30-R33 |
| R13 | 没有强制数量声明或独立身份牌；可语音自由讨论，不建立额外声明判真/假系统 | S3 p2–6无此步骤；Q02 | USER_ACCEPTED | createSS / reduceSS | creation.test.ts；engine.test.ts（只有SUBMIT后BRIBE，无虚构角色/声明命令） |
| R14 | 动作逐个执行，先收贿赂，再检查，再逮捕；均可不用完，前进后不能回退 | S3 p4 步4、p5 | CONFIRMED | reduceSS:ADVANCE | engine.test.ts: R14-R26 |
| R15 | 一个收贿赂标记选择一名仍待处理旅客；接受金额固定等于已公开贿赂牌瓶数 | S3 p5 i | CONFIRMED | reduceSS:ACCEPT | engine.test.ts: R14-R26 |
| R16 | 接受贿赂后旅客从自己瓶盖支付检查者；不是库存付钱、也不是交出行李 | S3 p5 i | CONFIRMED | reduceSS:ACCEPT | engine.test.ts: R14-R26 |
| R17 | 被接受者立即放行，公开两张行李，库存付其行李总瓶数，所有牌盖弃，不再查捕 | S3 p5 i | CONFIRMED | reduceSS:ACCEPT | engine.test.ts: R14-R26 |
| R18 | 贿赂为0也能被接受，仍消耗动作并放行 | S3 p2,5（依牌值推论） | CONFIRMED | reduceSS:ACCEPT | engine.test.ts:R18,R22,R24 |
| R19 | 一个检查标记只翻指定旅客指定的一只箱子，公开给所有人；检查本身不结算得分 | S3 p5 ii | CONFIRMED | reduceSS:INSPECT | engine.test.ts: R14-R26 |
| R20 | 每名旅客每轮至多被检查一只；多个检查标记必须用于不同旅客 | S3 p5 ii 星号 | CONFIRMED | reduceSS:INSPECT | engine.test.ts: R14-R26 |
| R21 | 每个逮捕标记用于一名未结算旅客，可逮捕已检查者或没检查者；公开两只箱子 | S3 p5 iii | CONFIRMED | reduceSS:ARREST | engine.test.ts:R14-R26 / R18,R22,R24 / R27-R29 |
| R22 | 行李总瓶数≥2即走私，库存付检查者全部行李瓶数；旅客不获这笔钱，无另加罚金 | S3 p6 A | CONFIRMED | reduceSS:ARREST | engine.test.ts:R18,R22,R24 |
| R23 | 行李0或1瓶是误捕：检查者自付2给旅客；若1瓶库存再付旅客1 | S3 p6 B | CONFIRMED | reduceSS:ARREST | engine.test.ts: R14-R26 |
| R24 | 贿赂牌绝不计入走私阈值、没收收益或放行收益 | S3 p6 星号 | CONFIRMED | reduceSS:ARREST/ADVANCE | engine.test.ts:R18,R22,R24 |
| R25 | 逮捕者结算后全部牌盖弃；每位旅客每轮只能结算一次 | S3 p6 | CONFIRMED | reduceSS:ARREST | engine.test.ts: R14-R26 |
| R26 | 检查者不再行动后，剩余旅客全部放行、公开行李；库存付各自行李总瓶数，不收贿赂 | S3 p6 步5 | CONFIRMED | reduceSS:ADVANCE | engine.test.ts:R14-R26 / R18,R22,R24 / R27-R29 |
| R27 | 每轮结束收回全部行李牌并顺时针换检查者，无跨轮保留手牌 | S3 p6 步6、p4 步2 | CONFIRMED | reduceSS:NEXT_ROUND | engine.test.ts: R27-R29 |
| R28 | 3/4人每人当检查者2次，共6/8轮；5–8人各1次，共5/6/7/8轮 | S3 p7 | CONFIRMED | reduceSS:ADVANCE | engine.test.ts: R27-R29 |
| R29 | 最终瓶盖面值最高获胜；所有最高分平局者共同获胜，不增加破平机制 | S3 p7 | CONFIRMED | reduceSS:ADVANCE | engine.test.ts: R27-R29 |
| R30 | 他人手牌、未翻行李、盖弃牌、未揭贿赂、牌堆顺序不发到客户端；已检查一只不等于两只都可见 | S3 p4–6；MASTER §0.4 | USER_ACCEPTED | viewForSS / assertInvariants | privacy.test.ts（逐阶段与各座位）；simulate-ss.ts |
| R31 | 结算后可保留本轮已公开行李和金额回顾；未公开弃牌永不进入回顾或日志 | S3 p4–6；MASTER §0.4 | USER_ACCEPTED | viewForSS | privacy.test.ts（逐阶段与各座位）；simulate-ss.ts |
| R32 | 所有命令验证行动者/阶段/seq；随机种子只留服务器；序号重复不二次付钱 | MASTER §2 | USER_ACCEPTED | reduceSS | privacy.test.ts（逐阶段与各座位）；simulate-ss.ts |
| R33 | 牌唯一ID、位置守恒；固定80枚面值库存清单，总值422；线上按价值找零记账，付款不得负数（见HR-SS-01/Q11） | S3 p2–3；MASTER §2；Q05 | USER_ACCEPTED | assertInvariants / CAP_STOCK | privacy.test.ts（逐阶段与各座位）；simulate-ss.ts |
| R34 | 超时与掉线默认见Q06，既有提交保留；线上计时不伪称官方规则 | 规则书未规定；Q06 | USER_ACCEPTED | reduceSS:TIMEOUT | engine.test.ts:R34；privacy.test.ts:timeout |

## 可选事件：八张完整效果与测试（阶段2更新）

S5为用户2026-10-27上传照片2（八张事件卡，未提供对应规则书页码）及Claude中文转录；已逐张看图核对。事件开关events默认false，可启用完整八张；此用户新指令取代阶段1关闭整个模式的默认。英文只有三项FAQ和Night Shift卡文可交叉核对，其余不冒称已取得英文全文。

| ID | 卡名/要点（自己的话） | 来源/页码 | 状态 | 引擎函数 | 实际测试覆盖 |
|---|---|---|---|---|---|
| E00 | 开局洗8张，每轮开一张，只本轮生效、用完弃；不重复抽，默认事件开关关 | S3 p7；用户批准 | USER_ACCEPTED | createSS / reduceSS:NEXT_ROUND | events.test.ts:E00 all 8 events drawn once |
| E01 | 生日礼物：警长从库存得2；本轮行李总瓶数≤2合法。误捕仍赔2，库存另付实际瓶数 | S5第2张；S3 p7 Birthday FAQ | ZH_PHOTO+CONFIRMED | createSS / reduceSS:ARREST | events.test.ts:E01 生日礼物 |
| E02 | 假日狂欢：每旅客从5牌选3张行李、1张贿赂、余1张盖弃；合法总瓶数仍≤1 | S5第3张；S3 p7 Holiday Season FAQ | ZH_PHOTO+CONFIRMED | reduceSS:SUBMIT/ARREST | events.test.ts:E02 假日狂欢 |
| E03 | 领导视察：可当1枚额外检查指示物；允许同一旅客的第二箱，不能重复翻已公开箱 | S5第1张 | ZH_PHOTO | reduceSS:INSPECT(useEvent) | events.test.ts:E03 领导视察 |
| E04 | 破釜沉舟：警长按普通逮捕标记数付库存相应瓶盖；本轮合法行李总瓶数降为0 | S5第4张 | ZH_PHOTO | createSS / reduceSS:ARREST | events.test.ts:E04 破釜沉舟 |
| E05 | 贪得无厌：受贿阶段开始可选择接受所有旅客贿赂并全部放行；否则普通动作流程，不允许部分受贿后反悔 | S5第5张；默认Q10 | ZH_PHOTO | reduceSS:GREEDY | events.test.ts:E05 贪得无厌 |
| E06 | 铁面无私：可当1枚额外逮捕指示物；仅用该卡误捕时免警长自付赔款，旅客正常库存行李收益不免 | S5第6张 | ZH_PHOTO | reduceSS:ARREST(useEvent) | events.test.ts:E06 铁面无私 |
| E07 | 起早贪黑：可当1枚额外受贿指示物，沿用正常接受即转账放行结算 | S5第7张；S4 Night Shift卡面 | ZH_PHOTO+CONFIRMED | reduceSS:ACCEPT(useEvent) | events.test.ts:E07 起早贪黑 |
| E08 | 缉私犬长：可当1枚额外检查指示物；旅客亲自翻最多瓶的一箱，同值任选且不宣布相等；没写可查第二次，默认沿用普通一次限制 | S5第8张；S3 p7 Sniffer Dog FAQ；Q09 | ZH_PHOTO+CONFIRMED | reduceSS:INSPECT/REVEAL_DOG | events.test.ts:E08 缉私犬长；privacy.test.ts:dog timeout |

## 已裁定的线上边界

- HR-SS-01：所有付款按付款方现有余额截断，最低0，不负分、不欠款。英文p5–6未给付不起处理，明确为用户房规；engine.test.ts:HR-SS-01、privacy.test.ts:HR-SS-01 bank payouts。
- 首位警长支持指定座位和种子随机；「随机指定」按钮后续接入。privacy.test.ts:random first guard。
- TIMEOUT只接受server、必须到deadline；装包保留既有提交，假日狂欢自动选3张行李；犬长等待超时选第一只最大值箱，不宣布并列。engine.test.ts:R34；privacy.test.ts:dog timeout/timeout skips。
- 面值记账自动找零，CAP_STOCK登记80枚物理组成但不分配每枚物理所有权；守恒断言核对36张牌、全部事件8张和422总价值。不是另加虚拟瓶盖来源。

## 后续接入与验收边界

已有房间token/快照/逐连接投影参考 dm-rooms.ts、rk-rooms.ts；计时服务器deadline参考rk；ActionDock、阶段横幅与计时环参考dm/Polish.tsx；视觉作用域参考dm/polish.css；反馈用drawing/feel.ts。阶段2也不修改这些已有游戏代码。

阶段2模拟人数3/5/8，每种人数事件关/开各200局，共1200局，种子均1..200，逐步检查每座位及旁观者投影。后续浏览器隐私验收要在装包草稿、部分提交、贿赂公开、单箱检查、结算、重连和回顾逐阶段查DOM与Socket包。两台不同座位须互相检查；不要只测UI隐藏元素。题设的「发身份」仅作本轮职务展示，检查者身份公开，不能添加秘密角色。
