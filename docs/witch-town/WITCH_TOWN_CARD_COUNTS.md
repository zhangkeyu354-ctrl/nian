# Salem 1692 标准版：卡牌数量审计
基线：官方标准版15th Printing；日期2026-10-22。
**总量已核实为59张行动牌**：[PDF第2页组件表](https://www.facadegames.com/files/rulebooks/salem-1692-rulebook-english.pdf#page=2)。该表位于图片内，本轮实际看图取得；上轮只靠正文提取而未核出，现关闭59/61总量争议。

| 组件 | 标准数量 | 一手依据 | 是否属于59行动 |
| --- | ---: | --- | --- |
| Town Hall人物 | 15 | STD P2 | 否 |
| Salem行动 | 59 | STD P2 | 是 |
| Frame夜袭配套牌 | 15 | STD P2 | 否 |
| Tryal身份（盒内） | 39 | STD P2；每局按P3取池 | 否 |
| 警长锤子 | 1 | STD P2 | 否 |
| 沙漏 | 1个30秒 | STD P2 | 否 |

## 逐类型数量
STD没有逐类型配比表。下面保留一套[社区2020转录](https://forum.mafiascum.net/viewtopic.php?f=63&t=84271)作为候选供核验，**不是当前标准版已确认配比**。情侣2张由STD P16明确提到“两张情侣”，其余数量尚未获得同等一手逐类证据。

| ID / 牌 | 候选数 | 当前标准确认数 | 状态 |
| --- | ---: | --- | --- |
| A01 辩护 | 3 | null | 待官方逐类补证 |
| A02 嫁祸 | 2 | null | 同上 |
| A03 抢劫 | 1 | null | 同上 |
| A04 诅咒 | 1 | null | 同上 |
| A05 纵火 | 1 | null | 同上 |
| A06 拘留 | 3 | null | 同上 |
| A07 避难 | 1 | null | 同上 |
| A08 信徒 | 1 | null | 同上 |
| A09 情侣 | 2 | 2 | 已核实，STD P16；这是组件引用，不将2～3人移牌规则移植到4～12人 |
| A10 指控 | 35 | null | 待官方逐类补证 |
| A11 证据 | 5 | null | 同上 |
| A12 目击 | 1 | null | 同上 |
| A13 阴谋 | 1 | null | 规则按单一事件牌描述，但未用单数措辞冒充实物清单 |
| A14 夜晚 | 1 | null | 同上 |
| A15 黑猫 | 1 | null | 同上 |
| 合计 | 59 | **59总量已证；逐类尚未全证** | 不从总量倒填其余14项 |

候选绿11+蓝5+红41+黑2=59，内部求和一致但不构成版本同一性证明。也不能用“59-其他假设数”反推出指控35。
第三方61和BGG旧12人物信息退出现行数据，不再要求把它们与当前PDF拼成一致；它们仅保留在历史归档。
当前游戏配置必须仍覆盖4～12人；身份数按[规则矩阵P3核对表](WITCH_TOWN_RULE_MATRIX.md)，不会因死亡重建人数配置，也没有按人数删减行动卡的证据。
数据中quantity未知保持null、candidateQuantity另存，不能在生成可玩牌池时静默回退候选数。

## M4执行更新（2026-10-22，用户明确授权）

用户已允许正式房间暂用候选张数并显示提示。本次房间START显式采用candidate-59；所有私人/公共视图均含notices“部分张数待官方核实”和证据警告，不再因X11阻止房间启局。**没有把任何null quantity升级为confirmed**。严格的buildPlayingDeck('official-standard')仍拒绝伪造完整已核实配比；该严格资料接口不再被房间启动路径调用。

本轮重新检查[官网产品页](https://www.facadegames.com/products/salem-1692)、[官方标准PDF](https://www.facadegames.com/files/rulebooks/salem-1692-rulebook-english.pdf)、官网产品图05/06及[设计师AMA](https://www.reddit.com/r/boardgames/comments/112zxeu/im_the_founder_of_facade_games_and_the_inventor/)，并检索BGG设计师答复及对应版本数量线索。没有取得第15印完整逐类配比的一手清单。官网图05的Piety仍是旧“禁止红牌”，与当前PDF的翻倍规则不同，故不把整张旧宣传图当同印次库存；照片扇形展示几张牌也不能当完整张数。

搜索到[Hoyle's零售页](https://hoylesoxford.com/en-fr/products/salem-1692)提及35张Accusation，可作为候选数的旁证，但不是制造商对第15印全部配比的确认。BGG未取得包含全部15类张数且可验证作者/印次的设计师答复；未用其他桌游的card-count搜索结果冒充Salem证据。没有找到可靠的对应印次完整摊牌开箱，不能把未观看的开箱写成已核实。

上表每行的候选来源仍为COMMUNITY59；其中情侣2另有STD P16，总数59及组件数由STD P2确认。各行尚缺的证据都是“本行数量对应第15印的厂家清单、可核对的完整组件摊牌或设计师确认”，并非缺少求和。后续补证可替换候选数量，但不得抹掉本轮验收所使用的candidate-59版本记录。
