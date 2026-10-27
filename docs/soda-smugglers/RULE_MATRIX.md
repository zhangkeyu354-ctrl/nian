# 汽水走私犯：阶段 1 规则矩阵

日期：2026-10-27。范围：Bitewing Games 英文原版；无旧版 Heisse Ware、无房规。本阶段只写文档。函数和测试名均为阶段 2 的计划，尚未实现或执行。

## 来源与证据边界

- S1：[出版社游戏页](https://bitewinggames.com/soda-smugglers/)，本机 HTTP 200；明确 3–8 人与检查者轮数，网页「Download the Rulebook Here」链接到 S2。
- S2：[出版社指定的 BGG 官方英文规则条目](https://boardgamegeek.com/filepage/232221/soda-smugglers-official-rulebook)，搜索索引显示上传者 Murraculous、2021-12-07、文件名 Soda Smugglers Rules Small；直接访问 HTTP 403，未取得 BGG 原文件，未验证字节一致。
- S3：[同名规则 PDF 的零售商镜像](https://gamers-hq.de/media/pdf/6c/4e/7b/Soda_Smugglers_Rules_Small.pdf)，HTTP 200，18,550,333 字节，8 页；页脚为 ©2021 Bitewing Games，封面和配件与官网成品照片一致。**官方出版物内容、第三方托管，暂用主证据，来源链仍 CHECK_REQUIRED Q01**。不是把零售商观点当作官方裁定。
- S3 SHA256：`29f33e388463f9b1718c2266632d1ad3a18b1b5556c935badec2638354ea13e9`。页码使用 PDF 物理页，等于印刷页；封面算第 1 页。
- S4：[出版社成品卡照片](https://bitewinggames.com/wp-content/uploads/2022/06/CCC-Final-Production-10-scaled.jpg)，清楚显示 Night Shift 卡文；其他官网图片见 ASSETS。
- 搜索了 BGG 中贿赂、瓶盖不足、事件牌相关问题，没有取得可核实身份的设计师/出版社规则裁定；不引用普通玩家评论补规则。
- 本地原 PDF、页面渲染、官网 HTML 留在 `tmp/ss-research/`，不提交原始 PDF。规则正文 p2–p7 均已提取文字并逐页看图；p1 看封面，p8 提取版权文字。

## 基础版矩阵

状态：CONFIRMED 表示 S3 明文或明确流程推论；ADAPTATION 表示线上主持默认；CHECK_REQUIRED 表示证据缺口。所有行的测试均为待写。

| ID | 要点（自己的话） | 来源/页码 | 状态 | 计划引擎函数 | 计划测试名 |
|---|---|---|---|---|---|
| R01 | 3–8 人；每轮一名检查者，其他人为旅客 | S1、S3 p1,3 | CONFIRMED | createSS | players_3_to_8 |
| R02 | 行李牌共36：0瓶12张、1瓶12张、2瓶7张、3瓶5张；背面不是额外牌 | S3 p2 图；12+12+7+5=36 | CONFIRMED | createDeckSS | deck_distribution_36 |
| R03 | 瓶盖80枚：1×32、3×20、5×12、10×8、20×5、30×3；总面值422 | S3 p2 | CONFIRMED | createBankSS | bank_80_tokens_422_value |
| R04 | 动作标记7：收贿赂2、检查2、逮捕3；事件牌8张为可选 | S3 p2 | CONFIRMED | createSS | component_inventory |
| R05 | 每人初始10：两个1、一个3、一个5；其余属公共库存 | S3 p3 | CONFIRMED | createSS | initial_caps_10 |
| R06 | 每人瓶盖公开，可随时换零；分数按面值，不按枚数 | S3 p3 | CONFIRMED | exchangeCapsSS,viewForSS | public_caps_and_change |
| R07 | 3/4人动作数1/1/1；5人1/1/2；6人1/2/2；7人2/2/2；8人2/2/3（收/查/捕） | S3 p3 表 | CONFIRMED | actionBudgetSS | budget_all_player_counts |
| R08 | 最近喝汽水的人第一轮当检查者；以后沿座位顺时针轮换 | S3 p3 | CONFIRMED | selectFirstGuardSS,nextRoundSS | latest_soda_then_clockwise |
| R09 | 每轮重新洗全部行李牌，给每名旅客5张；检查者不发；余牌盖放 | S3 p4 步2、p6 步6 | CONFIRMED | dealRoundSS | deal_5_only_travelers_reshuffle |
| R10 | 每名旅客从5张中选有位置的2张行李，另选1张贿赂；余2张盖弃 | S3 p4 步3 | CONFIRMED | submitLuggageSS | partition_5_into_2_1_2 |
| R11 | 所有人选好才同时翻开贿赂牌；行李仍盖着 | S3 p4 步3iii | CONFIRMED | revealBribesSS | bribes_reveal_together |
| R12 | 线上草稿私有，提交锁定，最后一人提交才公开贿赂；不可因他人先提交取得牌值 | S3 p4；MASTER §1 | ADAPTATION | reduceSS,viewForSS | locked_submission_no_early_leak |
| R13 | 没有强制数量声明或独立身份牌；可语音自由讨论，不建立额外声明判真/假系统 | S3 p2–6无此步骤；Q02 | ADAPTATION | phaseSS | no_invented_declaration_or_role |
| R14 | 动作逐个执行，先收贿赂，再检查，再逮捕；均可不用完，前进后不能回退 | S3 p4 步4、p5 | CONFIRMED | advanceGuardPhaseSS | ordered_optional_actions |
| R15 | 一个收贿赂标记选择一名仍待处理旅客；接受金额固定等于已公开贿赂牌瓶数 | S3 p5 i | CONFIRMED | acceptBribeSS | bribe_fixed_to_card_value |
| R16 | 接受贿赂后旅客从自己瓶盖支付检查者；不是库存付钱、也不是交出行李 | S3 p5 i | CONFIRMED | transferCapsSS | bribe_player_to_guard |
| R17 | 被接受者立即放行，公开两张行李，库存付其行李总瓶数，所有牌盖弃，不再查捕 | S3 p5 i | CONFIRMED | settleTravelerSS | accepted_bribe_reveal_pay_remove |
| R18 | 贿赂为0也能被接受，仍消耗动作并放行 | S3 p2,5（依牌值推论） | CONFIRMED | acceptBribeSS | accept_zero_bribe |
| R19 | 一个检查标记只翻指定旅客指定的一只箱子，公开给所有人；检查本身不结算得分 | S3 p5 ii | CONFIRMED | inspectSS,viewForSS | inspect_one_public_no_payout |
| R20 | 每名旅客每轮至多被检查一只；多个检查标记必须用于不同旅客 | S3 p5 ii 星号 | CONFIRMED | inspectSS | cannot_inspect_same_traveler_twice |
| R21 | 每个逮捕标记用于一名未结算旅客，可逮捕已检查者或没检查者；公开两只箱子 | S3 p5 iii | CONFIRMED | arrestSS | arrest_inspected_or_uninspected |
| R22 | 行李总瓶数≥2即走私，库存付检查者全部行李瓶数；旅客不获这笔钱，无另加罚金 | S3 p6 A | CONFIRMED | settleArrestSS | smuggling_pays_guard_all_luggage |
| R23 | 行李0或1瓶是误捕：检查者自付2给旅客；若1瓶库存再付旅客1 | S3 p6 B | CONFIRMED | settleArrestSS | wrongful_arrest_zero_or_one |
| R24 | 贿赂牌绝不计入走私阈值、没收收益或放行收益 | S3 p6 星号 | CONFIRMED | luggageTotalSS | bribe_excluded_from_luggage |
| R25 | 逮捕者结算后全部牌盖弃；每位旅客每轮只能结算一次 | S3 p6 | CONFIRMED | settleTravelerSS | settlement_once_only |
| R26 | 检查者不再行动后，剩余旅客全部放行、公开行李；库存付各自行李总瓶数，不收贿赂 | S3 p6 步5 | CONFIRMED | releaseRemainingSS | release_without_bribe |
| R27 | 每轮结束收回全部行李牌并顺时针换检查者，无跨轮保留手牌 | S3 p6 步6、p4 步2 | CONFIRMED | nextRoundSS | collect_all_36_each_round |
| R28 | 3/4人每人当检查者2次，共6/8轮；5–8人各1次，共5/6/7/8轮 | S3 p7 | CONFIRMED | isFinishedSS | rounds_6_8_5_6_7_8 |
| R29 | 最终瓶盖面值最高获胜；所有最高分平局者共同获胜，不增加破平机制 | S3 p7 | CONFIRMED | scoreSS | tied_players_share_victory |
| R30 | 他人手牌、未翻行李、盖弃牌、未揭贿赂、牌堆顺序不发到客户端；已检查一只不等于两只都可见 | S3 p4–6；MASTER §0.4 | ADAPTATION | viewForSS | privacy_every_phase_and_seat |
| R31 | 结算后可保留本轮已公开行李和金额回顾；未公开弃牌永不进入回顾或日志 | S3 p4–6；MASTER §0.4 | ADAPTATION | publicHistorySS | recap_only_public_facts |
| R32 | 所有命令验证行动者/阶段/seq；随机种子只留服务器；序号重复不二次付钱 | MASTER §2 | ADAPTATION | reduceSS | authority_seq_idempotent |
| R33 | 牌唯一ID与位置守恒；瓶盖在库存和玩家间转移；找零须保持总面值422 | S3 p2–3；MASTER §2；Q05 | ADAPTATION | assertSS | conservation_every_reduce |
| R34 | 超时与掉线默认见Q06，既有提交保留；线上计时不伪称官方规则 | 规则书未规定；Q06 | CHECK_REQUIRED | timeoutSS | timeout_preserves_locked_choice |

## 可选事件：逐张登记（尚未取得完整八张卡文）

S3 p7只给启用方法和三项FAQ，不是八张卡的完整文本。禁止猜出其余卡名和效果，也禁止只抽已知4张充当完整模式。默认全体事件关闭；以下不是已实现功能。

| ID | 卡名/要点 | 来源/页码 | 状态 | 计划函数 | 计划测试名 |
|---|---|---|---|---|---|
| E00 | 启用时开局洗8张，每轮开始公开顶张，仅本轮生效，轮末弃置；最多8轮恰够 | S3 p7 | CONFIRMED | revealEventSS | events_once_per_round |
| E01 | Birthday：FAQ确认行李≤2瓶误捕，仍由检查者赔2，库存按行李瓶数付旅客；完整卡文待核 | S3 p7 FAQ | CHECK_REQUIRED | applyBirthdaySS | birthday_two_bottles_legal |
| E02 | Holiday Season：FAQ确认所有行李合计仍只能合法携带≤1瓶；改变几张行李等细节待卡文 | S3 p7 FAQ | CHECK_REQUIRED | applyHolidaySS | holiday_total_limit_one |
| E03 | Sniffer Dog：FAQ确认两箱瓶数相同时旅客自行选择翻哪只且不宣布相等；其余完整触发待卡文 | S3 p7 FAQ | CHECK_REQUIRED | applySnifferSS | dog_equal_hidden_owner_choice |
| E04 | Night Shift：检查者可把该事件卡当额外一个收贿赂标记，仍遵循收贿赂阶段 | S4官网成品卡面，无PDF页码 | CONFIRMED | applyNightShiftSS | night_shift_extra_accept |
| E05 | 第5张：卡名及卡文未获得，保持未知 | S3 p2确认共8张 | CHECK_REQUIRED | applyEventSS | unknown_event_05_explicit_error |
| E06 | 第6张：卡名及卡文未获得，保持未知 | S3 p2 | CHECK_REQUIRED | applyEventSS | unknown_event_06_explicit_error |
| E07 | 第7张：卡名及卡文未获得，保持未知 | S3 p2 | CHECK_REQUIRED | applyEventSS | unknown_event_07_explicit_error |
| E08 | 第8张：卡名及卡文未获得，保持未知 | S3 p2 | CHECK_REQUIRED | applyEventSS | unknown_event_08_explicit_error |

## 后续接入与验收边界

已有房间token/快照/逐连接投影参考 dm-rooms.ts、rk-rooms.ts；计时服务器deadline参考rk；ActionDock、阶段横幅与计时环参考dm/Polish.tsx；视觉作用域参考dm/polish.css；反馈用drawing/feel.ts。阶段1不修改这些代码。

阶段2模拟人数3/5/8，各200局；事件未确认时只模拟基础模式并明确报告覆盖缺口。后续浏览器隐私验收要在装包草稿、部分提交、贿赂公开、单箱检查、结算、重连和回顾逐阶段查DOM与Socket包。两台不同座位须互相检查；不要只测UI隐藏元素。题设的「发身份」仅作本轮职务展示，检查者身份公开，不能添加秘密角色。
