# 麦克米伦庄园数据入库核验报告

> 历史快照。Q05/Q07已获用户裁定，第二批当前结果见 SECOND_INTAKE_REPORT.md 与 MISSING_RESOURCES.md；旧文中的“Autohaven缺整面图”等不再是当前状态。

2026-10-19；项目 `E:\DBD-BoardGame-Web`。按 AGENTS.md 与 CLAUDE_INTAKE_2026-10-19.md 第3节处理；本轮只更新研究数据、文档和检查，完成后停止。

## 结果与适用范围

- 合并 **11个房间、22条路线**，拓扑 `CONFIRMED`；包含 **4条单向黄色路线、4条初始墙路线**。
- **44个初始道具槽位，黄/红/蓝/绿=10/10/12/12**。10个房间的标题图标直接对照 B11；煤矿废塔上层被棋子遮挡，另用 B01 p7 四色摆放示例 Y/B/B/G 核对数量。不是用总数反推缺失房间。
- **mm_p22 确认为黄色，木屋→露天场地，开局有墙**。B11底部完整可见，解决P1裁切与草稿的 yellow?。
- 整面地图仍为 **待最终核对 / CHECK_REQUIRED**：煤矿废塔上层出生骰面、部分英文原名及用户本盒日文印次尚未解决。拓扑完整不等于可直接初始化对局。
- 原有5个节点的来源引用、地图字段与第二面地图对象保留；新增字段提供逐字段证据。原始 intake 与草稿未覆盖。

## 来源与评级

- B01：英文官方规则书，20页。本次重读p3/5/6/8/11/12/13/16，并视觉核对p3/7；p14已登记墙通行规则。页码为PDF/印刷页码。
- C02：Asobition原图原C级登记、路径与SHA-256保留。
- B11：同一原图的本次地图专用B级别名。用户明确回复「按入库说明，本次指定为 B 级例外」。不扩展到其他发行商资料或被遮挡部分。
- D28=P1中文第三方照；D29=P2旧宣传图转载；D30=刻痕放大。截图原帖链接未提供，已登记本地文件哈希，不误记为用户本盒A级证据。
- D31扩展地图已登记排除，没有导入基础版。D32移动卡、D33开局截图仅作线索。

预览原图：[Asobition图片](https://static.wixstatic.com/media/ac6530_103b12ec59c84ef6906815c9bd84e46a~mv2.png)，发行页：[Asobition](https://www.asobition.com/deadbydaylight)。所有照片/PDF留在忽略的本地 reference/，交付资料包不含原始素材。

## 逐房间结果

房间记录的 CONFIRMED 只覆盖房间身份与拓扑，字段状态以 field_evidence 为准。中文按P1转录标 OFFICIAL_ZH_PRINT，证据仍D级、授权/版次待核，并非用户 APPROVED。未确认的新增英文名仍D级；熔炉下层推断英文值不入库。

|房间ID|P1中文印刷转录|槽位Y/R/B/G|出生骰面|核对结果|
|---|---|---|---|---|
|mine_depths|矿井深处|1/1/0/1|无标记|B11房间/槽位/标记一致；中文D28|
|mine_entrance|矿井入口|1/1/0/2|2|B11房间/槽位/标记一致；中文D28|
|foundry_upper_floor|熔炉上层|1/1/1/1|1|B11房间/槽位/标记一致；中文D28|
|coal_tower_upper|煤矿废塔上层|1/0/2/1|CONFLICT：P1=3 / P2=4；正式值空|B11房间位置一致；槽位另由B01 p7核对；出生刻痕被遮挡|
|foundry_lower_floor|熔炉下层|1/1/1/2|无标记|B11房间/槽位/标记一致；中文D28|
|ancient_tree|古树|1/1/0/2|5|B11房间/槽位/标记一致；中文D28|
|coal_tower_ground|煤矿废塔下层|0/1/2/1|无标记|B11房间/槽位/标记一致；中文D28|
|scrapyard|废品场|1/1/2/0|4|B11房间/槽位/标记一致；中文D28|
|foundry_basement|熔炉地下室|1/1/1/1|无标记|B11房间/槽位/标记一致；中文D28|
|shack|木屋|1/1/2/0|无标记|B11房间/槽位/标记一致；中文D28|
|backlot|露天场地|1/1/1/1|0|B11房间/槽位/标记一致；中文D28|

## 逐路线结果

全22条端点、颜色、方向、墙位置沿B11连续色线核对；P1/P2仅佐证。箭头方向按 from→to，both 为双向。墙可被杀人鬼通行摧毁，不等于永久禁行。

|ID|from → to|颜色|方向|开局墙|证据/观察|
|---|---|---|---|---|---|
|mm_p01|mine_depths → mine_entrance|red|both|无|B11；上排红色蹲伏图标清晰，补 P1 反光处。|
|mm_p02|foundry_upper_floor → mine_entrance|yellow|a_to_b|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p03|mine_depths → ancient_tree|green|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p04|mine_entrance → ancient_tree|blue|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p05|mine_depths → shack|blue|both|有|B11；左外侧蓝线；白色墙道具的破损边框可见。|
|mm_p06|mine_entrance → foundry_lower_floor|green|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p07|foundry_upper_floor → foundry_lower_floor|blue|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p08|foundry_upper_floor → coal_tower_ground|red|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p09|foundry_upper_floor → coal_tower_upper|green|both|无|B11；上排绿色奔跑图标清晰，补 P1 反光处。|
|mm_p10|coal_tower_upper → coal_tower_ground|blue|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p11|coal_tower_ground → foundry_lower_floor|yellow|a_to_b|有|B11；右侧中层黄线左箭头及破损边框墙道具。|
|mm_p12|coal_tower_upper → backlot|yellow|a_to_b|无|B11；右外侧黄线向下箭头。|
|mm_p13|coal_tower_ground → backlot|red|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p14|foundry_lower_floor → scrapyard|red|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p15|ancient_tree → scrapyard|blue|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p16|ancient_tree → shack|red|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p17|scrapyard → shack|green|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p18|foundry_lower_floor → foundry_basement|blue|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p19|foundry_lower_floor → backlot|green|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p20|foundry_basement → backlot|green|both|无|B11；B11可沿连续色线核对两端；无箭头，非初始墙。|
|mm_p21|shack → foundry_basement|green|both|有|B11；底部绿色横线及破损边框墙道具。|
|mm_p22|shack → backlot|yellow|a_to_b|有|B11；最底部黄色横线向右箭头，破损边框墙道具；补 P1 裁切处。|

## 规则书核对及草稿修正

|事项|结论|定位|
|---|---|---|
|起点|双方每个角色都掷技能检定骰；可同房。头像/0是骰面，露天场地不是杀人鬼专属起点。|B01 p5、p6步骤11、p16；R078|
|破损边框|开局放可破坏墙；逃生者通常不能通过，杀人鬼通过移除墙。|B01 p5/6/13/14；R079|
|黄色箭头|常规移动必须沿箭头，单向两端仍视为相连。搬运特殊适用边界Q01未裁定。|B01 p8/16；R080|
|顶部轨道|红轨8格献祭；黄轨4发电机+1出口，共5格；完成4发电机才能操作出口。|B01 p5/8/11/12/13；R081|
|颜色类别|黄色目标、红色勇气、蓝色生存、绿色协作，由官方组件图例/道具配色核对，非单靠总数推断。|B01 p3/5；R082|

四项程序检查考虑单向边，按杀人鬼可破坏初始墙的结构图检查；不模拟计划牌、动态木板、恶灵或搬运。使用露天场地为草稿指定检查起点，另加强为全部11个房间分别作起点检查；没有将它定义为杀人鬼专属出生点。

## 待核对、差异与未擅自采用的数据

- **Q05 / CONFLICT**：煤矿废塔上层P1/D30为3、P2为4；B11被棋子遮挡。正式 spawn_faces=[]，候选分列；不能因第三方照片清晰就升级。需以后核对本盒该标题局部或最终官方无遮挡图。
- **Q06 / CHECK_REQUIRED**：P2中央重复印 Foundry Upper Floor；Lower Floor 为草稿推断，正式 name_en=null。其余新增房间英文名也未伪称得到官方最终文字确认。
- **Q07 / CONFLICT**：intake第4节的68技能卡与基础版52（28+24）不同。保持基础版52槽、16物品槽；未因该数字扩大范围。68恰等于52+16只是可能原因，不作为已确认解释。
- 原有Q01搬运箭头边界、Q02多失败血点、Q03印次、Q04黑骰分布均保持待核；本次未决定自订规则。
- 中文印刷照片不能独立证明授权；不把繁中典藏版、旧宣传原型、扩展地图等同于用户日文基础版。

## 中文版发行方/规则书补查

- [游民星空中文预售报道](https://www.gamersky.com/news/202208/1510264.shtml)（D34）说明存在中文典藏版预售，未给简中发行商明确名称。
- [挖贝FAQ](https://wabay.tw/projects/day-by-daylight-board-game/faq?locale=zh-TW)（C10）搜索摘要可读，繁中项目为彌生、港澳由808代理；直接正文打开失败。[彌生商城](https://yayoithedreamerbg.cashier.ecpay.com.tw/product/000000000664636)（C11）页脚为彌生戲夢桌上遊戲出版社，商品正文为动态模板。
- [摩点项目索引](https://zhongchou.modian.com/tablegames/top_time/all/21)（D35）将光明使者扩展与香蕉桌游关联，不能确认P1基础版的发行商。**本轮未取得本作官方中文规则书PDF，也未核实P1具体印次/授权。**
- 个人旧TTS翻译等命中已排除，未下载下架模组素材，未使用电子游戏Wiki数值。检索词与访问范围已写入 SEARCH_LOG.md。

## 实际验证与交付

- `python tests/verify_macmillan.py`：四项要求全部通过；所有11个起点均能到达11房，每房最小出度3；4初始墙；44槽位配色10/10/12/12。另检来源、4单向路线、保留引用、Autohaven未变与未裁定字段。
- `python tests/verify_phase0.py`：30项通过，8份本地原始资料哈希通过；来源57条、规则78/82条已确认；无功能代码、Git远端或受跟踪原始素材。
- `python tests/verify_phase0_supplement.py`：25项通过。旧检查中“所有地图边为空”的基线约束改成有逐边B11证据的已合并地图，未将原本的证据要求删除。
- 完整实际输出另存 `MACMILLAN_VALIDATION.txt`。这些是数据研究检查，不是游戏单元/联机/E2E测试。
- 示意图：`macmillan_graph.svg` 和 PNG，线标p01–p22、方向箭头、颜色字母和W墙标；不使用官方美术、不写入正式节点网页坐标。所有交叉线均只在命名房间处连接。
- `MISSING_RESOURCES.md` 已把 **Autohaven整面地图列第一优先**，麦克米伦降为待最终核对并只列残余缺口。

按指令到此停止，不进入下一阶段。

