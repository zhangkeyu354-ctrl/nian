# 易争议结算规则的可复现证据

测试入口：`npm exec vitest run packages/black-a-510k/test/settlement.test.ts apps/server/test/ba-room.test.ts apps/server/test/ba-constructed-network.test.ts`。测试使用完整 52 张唯一实体牌，终局基础分与最终分均守恒为 100。以下是固定牌局断言，不靠随机碰巧发生。

| 情况 | 明确预期 | 证据 |
|---|---|---|
| 第三人打空，末游还能压 | 最后一墩仍归第三人；末游只决定自己余牌分归属 | `settlement.test.ts` 的末墩与余牌断言 |
| 普通单张、同型对子可压/不可压 | 可压时末游得全部余牌分；不可压时三游得分 | `settlement.test.ts` 的 K♠/2♦ 和对子边界 |
| 仅特殊牌型可压 | 单黑A、杂/纯五十K、炸弹、双黑A都按完整规则判；不能只比较单牌点数 | `settlement.test.ts` 的五类特殊余牌 |
| 终止牌双黑A | 末游不能压；余分归三游，零分余牌仍记 0 | `settlement.test.ts` 的双黑A断言 |
| 2v2 黑A最终 65/60 | 65 胜，60 败，无平局 | `settlement.test.ts` 的 30 分差边界 |
| 独狼头游基础 0 | FINAL 加受缴 30 后胜；BASE 败 | `settlement.test.ts` 的两个计分口径 |
| 独狼 30/25 与末游 | 30 达标，25 不达标；末游即使有高分仍败 | `settlement.test.ts` 的独狼边界 |
| 头游与末游同队 | 两个人仍分别 +30/−30，队内净转移 0；允许负分、超 100 | `settlement.test.ts` 的个人账本 |
| 剃光头 | 只在败方基础分为 0 时成立；胜方零基础分不处罚；零实抓但有余分不处罚 | `settlement.test.ts` 的三个独立字段 |
| 重复终局请求 | 只返回原结算，不重新记分、不再生成奖励 | `ba-room.test.ts` 的终局重放 |
| 真实四客户端 | 2v2/独狼与普通/剃光头抽还共四个构造场景，下一局各恢复 13 张 | `ba-constructed-network.test.ts` |

这些测试核对附件 V1.1 的**网站规则**。附件已明确末墩归三游等内容尚未获地方玩法玩家确认，因此这里不把它宣传为已认证的地方原版。
