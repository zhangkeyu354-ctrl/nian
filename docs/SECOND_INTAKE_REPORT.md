> 历史入库报告：来源优先级、采用状态及待核项已由 U02 用户裁定和 PHASE_1_REPORT.md 更新；本文中的日文优先不再有效。

# 第二批资料入库报告

2026-10-19；项目 `E:\DBD-BoardGame-Web`。执行 AGENTS.md、用户Q05/Q07/Q06裁定及 CLAUDE_INTAKE_2026-10-19_b.md 第3节。本次只更新研究数据与核验脚本，没有游戏功能实现，报告后停止。

## 用户决定已登记

- **Q05关闭**：煤矿废塔上层出生骰面采用3。来源按要求写“用户裁定 + 零售照 P1”；MAP_DATA中保留旧3/4候选和裁定依据，不把D照改成A/B。用户关于1–5各一、宣传旧版重复4的理由已写HOUSE_RULES，作为用户理由记录。
- **Q07关闭**：28+24=52技能卡；68是误含16物品。清单与数据仍为52技能+16物品。
- **Q06保持CHECK_REQUIRED，不影响开发**：熔炉下层英文原名不填猜测，后续可用稳定ID。
- 用户另外明确继续**日文实物优先，中文照片和英文规则辅助**；未改为中文版优先。

## 入库结果

|对象|此次录入|可信度/限制|
|---|---|---|
|Autohaven 奥托海文废车场|10房间、44槽位、19路线图标；4墙、3单向|全部D/CHECK_REQUIRED；Asobition原图只有麦克米伦，不能核对这一面|
|物品|10种中文正文，照片16张逐行位置与副本分配|全部新中文/副本D/CHECK_REQUIRED；保留已有Flashlight官方英文效果证据|
|基础角色|7逃生者+6杀手，名称、难度、板载能力、力量/被动|新增照片内容均D/CHECK_REQUIRED，不覆盖已有身份来源|
|板载技能|39条，on_board=true|PERK_DATA.board_perks单独命名；原perks仍52卡组槽，不能混数|
|非基础角色|20名及60板载技能，另10力量|out-of-scope/COLLECTOR_CHARACTERS.json，scope_status=OUT_OF_SCOPE_BASE；不进入基础版名单|
|交互参考|30项逐条比对，28一致、1省略条款、1冲突|D级“中文版原文佐证”附到相应英文规则；详见REFERENCE_SHEET_COMPARISON|
|结构化草案|39基础板载技能、10物品、6基础力量、3基础被动|每条有触发、条件、效果；全部CHECK_REQUIRED、NOT_IMPLEMENTED，供Phase4审阅|

隔离的20名角色另附逐句分栏的60技能/10力量/其非空被动初稿，触发/语义未逐项审阅，保留UNRESOLVED_LITERAL。不会冒充与基础版48条能力相同审阅程度。英文ID/部分英文名称来自草稿时没有当作英文印刷原文；物品新英文名留空，Autohaven英文房名全部留空。

## 废车场逐项记录

照片P3=D36；程序ID只是稳定标识，非经核实英文标题。字段均D级待核。标题下小图标逐房计数如下：

|ID|中文标题|Y/R/B/G|照片出生骰面|
|---|---|---|---|
|wreckers_garage_north|废旧车库北|1/1/1/1|1|
|maze|迷宫|1/1/0/2|无标记|
|scrap_pile|废料堆|1/1/1/1|2|
|main_garage|主车库|1/1/2/1|无标记|
|wreckers_garage_south|废旧车库南|1/1/1/1|无标记|
|diner|小吃店|1/1/2/2|5|
|barn|谷仓|1/1/2/1|无标记|
|gas_pump|油泵|1/1/1/1|0|
|old_cabin|老木屋|1/1/1/1|4|
|cottage|村舍|1/1/1/1|3|

|路线图标|房间端点|颜色|方向|初始墙|
|---|---|---|---|---|
|ah_p01|wreckers_garage_north / maze|yellow|a_to_b|无|
|ah_p02|wreckers_garage_north / maze / diner|green|both|无|
|ah_p03|maze / wreckers_garage_south|green|both|有|
|ah_p04|wreckers_garage_south / gas_pump / cottage|green|both|无|
|ah_p05|wreckers_garage_north / wreckers_garage_south|blue|both|无|
|ah_p06|wreckers_garage_south / diner|blue|both|有|
|ah_p07|diner / main_garage|red|both|无|
|ah_p08|maze / main_garage|blue|both|无|
|ah_p09|maze / scrap_pile|red|both|无|
|ah_p10|scrap_pile / main_garage|blue|both|有|
|ah_p11|main_garage / barn|red|both|无|
|ah_p12|scrap_pile / barn|blue|both|无|
|ah_p13|main_garage / gas_pump|red|both|有|
|ah_p14|gas_pump / barn|yellow|a_to_b|无|
|ah_p15|barn / cottage|blue|both|无|
|ah_p16|diner / gas_pump|red|both|无|
|ah_p17|old_cabin / gas_pump|blue|both|无|
|ah_p18|wreckers_garage_south / old_cabin|red|both|无|
|ah_p19|old_cabin / diner|yellow|a_to_b|无|

**ah_p02、ah_p04是三端共用图标**：edges中增加rooms与endpoint_kind字段；多端项from/to=null，traversal_semantics=CHECK_REQUIRED，pairwise_edges=[]。因此**19是印刷图标数，不是已确定的二端边数**；未把图标虚构成第11/12个房间，也没默认展开23条边。照片放大ah_p06没有见到上接北车库的线，仍待A级/官方图确认。

B01 p5/8/10/16只有一般相连房间/匹配路线说明；全文未找到共用图标三端间移动与分支障碍的明确裁定。官方资料检索亦未取得可以采用的基础版答复，社区解释未作为正式规则。见Q09。

## 物品与角色审阅范围

物品以照片从上到下、从左到右映射16个内部slot，位置存photo_position；不是官方卡号。副本数同时按照片重复卡计数核验，不因总和16而反推各类数量。

|物品|照片副本|触发时机草案|
|---|---|---|
|工具箱|2|DURING_OWN_TURN|
|宽敞工具箱|1|DURING_ANY_SURVIVOR_TURN|
|鞭炮|2|ANY_TIME|
|地图|1|DURING_ANY_SURVIVOR_TURN|
|彩虹地图|1|DURING_ANY_SURVIVOR_TURN|
|手电筒|3|DURING_KILLER_TURN|
|急救箱|3|DURING_ANY_SURVIVOR_TURN|
|破损钥匙|1|ANY_TIME|
|晦暗钥匙|1|ANY_TIME|
|万能钥匙|1|ANY_TIME|

|基础角色|板载技能|力量/被动转录|
|---|---|---|
|德怀特·费菲尔德 (dwight)|证明自己、领袖群雄、携手合作|不适用|
|梅格·托马斯 (meg)|冲刺爆发、肾上腺素、急速静谧|不适用|
|克劳黛特·莫莱 (claudette)|精研百草、心灵共鸣、自我疗愈|不适用|
|杰克·朴 (jake)|钢铁意志、安抚生灵、破坏手|不适用|
|妮娅·卡尔森 (nea)|平稳着陆、暴走族、都市生存|不适用|
|埃斯·维斯孔蒂 (ace)|稳操胜券、锦囊妙计、好运会传染|不适用|
|凤敏 (feng_min)|轻盈敏捷、警戒、技术员|不适用|
|设陷者 (trapper)|所向无敌、恐慌降临、欣喜若狂|力量 + 被动|
|幽灵 (wraith)|暗夜之睛、血气追踪、穷追不舍|力量；无被动文字|
|农场主 (hillbilly)|光明之眼、耐力持久、工匠|力量；无被动文字|
|护士 (nurse)|喘鸣感知、死亡恐惧、护士的呼唤|力量；无被动文字|
|妖巫 (hag)|第三封印、吞噬希望、毁灭|力量 + 被动|
|医生 (doctor)|行监坐守、电量超载、压迫性气场|力量 + 被动|

已对13名基础角色对应照片进行视觉对照；幽灵第三技能原草稿MEDIUM保留MEDIUM，未按“全部已放大”总述升成HIGH。HIGH仅是转录清晰度，仍D级。20名隔离角色没有声称逐一完成同等视觉核验。卡组未拍，板上技能不能直接绑定某张卡组槽；英文通用技能名没有从电子游戏Wiki补入。

紫/绿框已保留观察值，框色是否限制技能归属/替换方式仍CHECK_REQUIRED；B01 p19支持Adept仅用板载技能，但不证明“紫专属、绿通用”的草稿推断。

## 交互核对与冲突

完整30项表在REFERENCE_SHEET_COMPARISON.md/.json，R029–R053等附“中文版原文佐证”。中文参考省略恶灵所在钩不可交互，没有据此删除B01条款。

**Q08：搬运翻道具冲突。** 中文原图明写搬运期间不翻面朝下道具，英文官方PDF p18 FAQ明确问到pick up moves并回答翻开；p10还给进入空间翻道具的一般规则。本轮已询问用户，截至本报告未收到对此项的裁定，因此R064=CONFLICT、adopted_reveal_props_during_carry=null，两版均保留，不擅自选择。

Q01搬运颜色/单向、Q02多失败血点未被中文参考解决。新增Q09三端路线；Q10鞭炮“相连空间里的墙”的目标范围；Q11“其它路线”“本回合”等结构化语义及反光文字。上述待核不阻止资料入库，但相关功能实现不能猜。

## 用语、版本与资料保护

- AGENTS、glossary和当前基础数据统一“杀手”“厄咒图腾”“出口大门”“箱子”；参考用语含“恶灵指示物”，保留中文印刷D证据。历史报告与用户原始草稿不篡改；印刷转录不等于APPROVED。
- 日文实物优先已按用户回复登记，不再提议自动更改优先级。中文规则书正文、日文原文、实际印次和随盒勘误仍待补。
- 黑骰各面重复数量/本盒六面尚缺；红色危险骰4失败/2大成功已由B01 p16确认，不把已有事实重新列缺失。若本盒不同再核对差异。
- 新登记17份第三方照片和1条用户裁定，来源总数75；本地原始资料共25份参与哈希审计。没有将第三方照片评级为A级，没有下载下架TTS素材，没有采用电子游戏Wiki数值。
- reference/保持Git忽略，未创建远端或跟踪原始素材；交付包不含原始图片/PDF。

## 实际检查

- verify_batch2.py：28项资料检查。候选二端路线本身已能让任意10个起点到达10房，不依赖三端图标的猜测；这只是结构一致性，不是游戏通行规则确认。
- 按第一批四项要求检查：定向可达、每房可离开、4墙图标、槽位44且10/10/12/12全部通过；Autohaven仍D级，不据检查通过升级CONFIRMED。
- verify_phase0.py：30项；verify_phase0_supplement.py：25项；verify_macmillan.py：原四项及来源保障检查通过，已改为核验Q05明确裁定、Autohaven新增候选而非强制维持旧空表。
- 全部实际stdout/退出码保存在SECOND_INTAKE_VALIDATION.txt；未运行游戏单元/联机/E2E测试，因为本轮未实现游戏功能。
- 已生成autohaven_graph.svg/PNG并视觉核对；另更新macmillan_graph.svg/PNG的Q05=3*注记。坐标仅用于图示，没有写入正式网页地图坐标。

缺失清单已更新：地图/中文板载文本和物品照片不再记为“完全缺失”；重点转为52张卡组、Q08/Q09等差异、日文原文与版本核验。至此停止，不进入功能开发。

