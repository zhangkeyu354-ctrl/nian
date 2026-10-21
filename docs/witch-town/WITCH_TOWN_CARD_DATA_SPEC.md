# Salem 1692 标准版：卡牌与规则数据规范
基线：salem1692-standard-15th-printing-4to12-2026-10-22。
本文件与[声明式研究数据](research/official/salem-standard-data.json)只定义资料结构，不是游戏实现。规则事实、未决事项、线上协议分别存放。

## 1. 来源与状态
每个可影响玩法的字段必须可追溯到source ID、PDF页码/官方图位置和核对状态，不只给整张牌一个总状态。
- confirmed：当前标准版明确证据。
- author_clarified：作者实际答复且无已知当前PDF反证。
- derived：从明确事实推导的算术/结构结论，不冒充逐字条款。
- provisional：仅旧版/未标印次卡图等辅助证据。
- disputed：官方材料相互不一致。
- unconfirmed：没有足够证据，值null。
未知不是0；candidateQuantity不是quantity的默认值。profile完整规则冻结状态保持false，不能因静态验证通过自动变true。

## 2. 静态实体分类
| 对象 | 必需字段 | 约束 |
| --- | --- | --- |
| profile | id、edition、printing、主PDF URL/SHA256、玩家范围、排除机制 | standard与deluxe不能混池；主来源快照不可只用易变化URL |
| source | id、url、文件hash、page/图位置、claimStatus | PDF页与zero-based索引明确区分 |
| actionType | A01～A15、稳定英文key、中文显示名、color、quantity、candidateQuantity、quantityStatus、effectStatus、sources、openIssues | 15类不重复；姓名/中文译名可改，稳定key不改 |
| characterType | H01～H15、英文name、中文alias、effect、timing、uses、sources、openIssues | 15人物不含警长/女巫身份；John disputed不得包装成普通confirmed |
| tryalType | not_witch/witch/constable | 标准仅这3类；每局池取P3九行 |
| frameType | 对应人物ID | 辅助秘密选目标，不进59行动池、手牌或弃牌 |
| playerConfig | players、notWitch、witch、constable、tryalsPerPlayer、total、source | 9行独立；sum=players×perPlayer |
| rule | R编号、条件、受影响对象、效果、依据、例外、待澄清ID | 基本句与特殊条款显式覆盖，不靠代码顺序猜 |
| adaptation | O编号、原规则依据、线上映射、状态 | 单独文件，不伪标官方 |

quantity当前只有官方直接证实项赋值，其余null；59总量直接确认。候选59配比只用来做文献内部一致性检查，不能供产品默默开局。
逐卡目标/时点/效果见[目录](WITCH_TOWN_CARD_CATALOG.md)，逐人物见[矩阵](WITCH_TOWN_CHARACTER_MATRIX.md)。

## 3. 运行时资料需求（方案，未实施）
牌实例必须有唯一ID，与牌类别ID分开；每张实例在牌堆、某手牌、桌面、弃牌等位置只能存在一处。公开牌面、持有人与公开位置分离。
玩家状态至少拆成：
- 是否存活；公开人物；当前身份实例及每张揭示状态。
- 是否曾持有女巫牌（不可回退）、当前隐藏/公开女巫牌数。
- 当前是否持有警长牌；警长职能全局是否已被揭示停用。
- 手中行动牌、桌前红/蓝/拘留、指控现值；有限能力消耗单独记录。
- 本夜自白与保护只属于该夜，不能永久带到下一夜。
- 阵营胜负与最后感染者个人输分别存，不只一个winnerTeam字符串。

普通指控门槛取事实矩阵：普通7/法官6/George8/法官对George7；Piety×2。移除Piety的特殊触发、John分配、复制次数等保留待澄清ID，不以通用公式掩盖原文问题。
多女巫例外需记录“揭示后是否仍有隐藏女巫牌”与相关时点；不得继续用旧单一布尔isWitchCardRevealed直接判死。
抽牌要保存调用来源、原额度、已抽数和恢复点；阴谋秘密选择使用同一快照提交，不能按客户端先到先选。

## 4. 触发与审计字段
建议每事件含eventId、原因ruleId、actorId、targetIds、sourceCardId、parentEventId、phase、revealCause、牌区前后差异、私密级别。
revealCause至少区分accusation、conspiracy_black_cat、confession、death_reveal_remaining；否则无法排除Rebecca死亡/自白奖励。
不规定未证的全局触发优先级；X02/X03/X04对应事件可保存，但正式期望结算待官方澄清。软件重试、状态版本、并发提交属于工程协议，不作为原版规则。

## 5. 资料验证与发布条件
资料验证检查PDF24页、hash、9配置、15行动/15人物、候选数求和59、2情侣与主组件表、C编号无遗漏、超出标准版的项目未入数据。
正式牌池生成前必须逐类quantity完整且sum=59，或取得明确可追溯的新版官方配比；不得用candidateQuantity兜底。
“资料验证通过”与“规则引擎测试通过”分开。当前没有对局引擎与随机模拟；X项的blocked测试不算通过，不删能力规避覆盖。
