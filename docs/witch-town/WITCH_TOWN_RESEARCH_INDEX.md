# Salem 1692 官方标准版研究交付索引
日期2026-10-22；项目基线salem1692-standard-15th-printing-4to12-2026-10-22。
**当前采用官方标准第15次印刷，旧中文《女巫镇》只作历史对照。当前未开始产品实现或部署。**

## 本轮成果
- [中文版规则矩阵与24页核查日志](WITCH_TOWN_RULE_MATRIX.md)
- [15类行动目录](WITCH_TOWN_CARD_CATALOG.md)、[数量核实](WITCH_TOWN_CARD_COUNTS.md)
- [15人物能力矩阵](WITCH_TOWN_CHARACTER_MATRIX.md)
- [C01～C25冲突审计](WITCH_TOWN_RULE_CONFLICTS.md)
- [卡牌数据规范](WITCH_TOWN_CARD_DATA_SPEC.md)、[声明式JSON资料](research/official/salem-standard-data.json)
- [自动化测试清单](WITCH_TOWN_AUTOMATED_TEST_CHECKLIST.md)
- [线上交互改编提案](WITCH_TOWN_ONLINE_ADAPTATION.md)
- [仍缺证据与官方来源](WITCH_TOWN_MISSING_EVIDENCE.md)
- [资料验证实际结果](research/official/verification.json)

## 主文件快照
| 文件 | 印次/页数/字节 | SHA256 |
| --- | --- | --- |
| [标准PDF本地](research/official/salem-standard.pdf) | 15th Printing；24页；6515074字节 | 4BB77986E4438106A836B03576E3D9EC98E019049EA94283ECED9E67B880BAC5 |
| [豪华PDF本地](research/official/salem-deluxe.pdf) | 1st Deluxe Printing；24页；5618734字节 | 4D0B18963DD4C4AD1E2BA17B7D241529378A83BDC5A0A94E6F2530922AF22F3C |

[官网标准源](https://www.facadegames.com/files/rulebooks/salem-1692-rulebook-english.pdf)、[官网豪华源](https://www.facadegames.com/files/rulebooks/salem-1692-deluxe-rulebook-english.pdf)；后续URL内容更新时先比较hash，不能无记录改规则。
原始提取文本salem-standard.txt/salem-deluxe.txt、24页PNG、官网10图与两张核查联系表保存在research/official；不是游戏美术资产。本次已实际查看24页PNG，组件表/牌面图片中的文字另人工核实，未假称单纯文字提取足够。

## 对全部既有报告的审查与迁移
| 旧文件 | 本轮审查发现 | 处理 |
| --- | --- | --- |
| WITCH_TOWN_CARD_CATALOG.md | CN禁红、情侣叠弃、旧夜晚洗牌、残局全清蓝不符新基线 | 全文替换为STD版，逐类来源/未定状态保留 |
| WITCH_TOWN_CARD_COUNTS.md | 先前59只有二手证据，61混印次 | 用STD P2确证59；逐类候选未升格 |
| WITCH_TOWN_CHARACTER_MATRIX.md | 15英文原卡曾未核；John等旧CN优先 | 用官网图06重核15，PDF覆盖交互，John差异不掩盖 |
| WITCH_TOWN_RULE_CONFLICTS.md | 25行多数以坚持CN为结论 | 全部重审，有页码者关闭；剩余分支转X台账 |
| WITCH_TOWN_MISSING_EVIDENCE.md | 主来源和缺口状态已过时 | 重写已关/未关，不索取用户未知资料 |
| docs/女巫镇-规则研究.md | 多女巫揭即死、固定底牌等不再适用，另有早期误读 | 历史全文归档，原路径转迁移提示 |
| docs/女巫镇-开发与全人数测试方案.md | REQ-008限制当前持牌者袭击、REQ-009任一女巫即死失效 | 历史全文归档；配置/保密/手机动态目标保留到新规范，运行测试未实施 |
| docs/女巫镇-范围压力测试.md | 产品目标与规则主证据已改变 | 历史归档；不把旧Proceed视为本轮开发授权或已完成对齐 |

旧全文保存research/legacy-cn-v1/，包含旧文件路径结构；不删除原始研究。以后只从本索引进入现行规范，不能同时加载历史档做规则合并。

## 交付判断
本轮24页核查、基线切换、全部旧冲突重审、九人数静态核对与研究文档交付已完成。C01～C25按主问题统计为16项关闭、9项部分关闭；未解分支另列X01～X12，不把旁支当通过。
规则数据尚未全部冻结：逐类数量与X事项仍需更强官方证据；不把它们标成开发者自由裁定，也不以删卡/角色避开。
本轮没有游戏测试通过结论；真实随机模拟九个人数均0局。后续产品实现仍需当前范围对齐、design baseline及用户明确实施指令。
