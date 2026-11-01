# Top Ten 法语基础版规则矩阵


> 当前为阶段 2：用户明确要求继续，首批 79 道（spicy 17 道）已批准用于引擎，后续再补题。无服务器或正式 UI 改动；阶段 2 完成后停止。


日期：2026-10-31。本文件记录阶段 2 的规则实现与验证。全队合作；没有个人得分、距离计分或排名。用户最新授权：题库改为全部原创中文，线上仅简短口头回答，不做表演、声音或动作模仿。

## 依据、页码与对照

- FR：Cocktail Games [基础版官方规则 PDF](https://www.cocktailgames.com/wp-content/uploads/2020/01/Top_ten_regles_BD.pdf)，由[官方产品页](https://www.cocktailgames.com/jeu/top-ten/)直接链接。全文 4 个 PDF 页面；本表的页码是 PDF 顺序页码 1–4，不是图片中的页脚或主题牌数字。原文已实际读取，配件页已视觉核对。
- 官方产品页称 500 个主题；PDF 第 4 页列 125 张主题牌。这仅记录原版配件事实。用户已取消原版题卡录入与逐条本地化要求；本项目当前为 150 道中文题（144 原创、6 用户明确给出的示例），不与原版题目建立映射，不再以 500 题覆盖率验收。
- 英文检索：找到 [BGG 玩家译本入口](https://boardgamegeek.com/boardgame/300905/top-ten/files)及[零售商托管英文 PDF](https://desktopgames.com.ua/games/7634/Top_ten_rules_EN.pdf)。尚未验证其官方发布链，不标为英文官方依据，不覆盖 FR。检索到的 Queen Games Top Ten Quiz 是不同游戏，排除。当前只采用 FR。
- [Asmodee 官方基础版页](https://www.asmodee.be/product/top-ten-fr/)列 135 张卡、8 枚标记、1 张垫板、1 份规则，与 125 主题牌 + 10 数字牌吻合。

下表已映射实际接口与测试名；40 条规则 / 适配均有对应行为测试，另有 3 条幂等、原子性和不变量测试。实际代码在 packages/naodong-scale/src/index.ts，测试在 test/engine.test.ts；页码仍按 FR PDF 顺序 1–4。

| ID | 规则要点（中文归纳） | 依据 / PDF 页 | 实际接口 / 路径 | 实际测试名 |
| --- | --- | --- | --- | --- |
| ND01 | 4–9 人；4–8 人采用基本流程，9 人按专门流程 | FR 1、3 | createND / assertInvariantsND | `ND01 accepts 4–9, rejects invalid sizes, options and seeds` |
| ND02 | 所有玩家同队，共同成功或失败，无个人分数 | FR 1 | reduceND | `ND02 finishes with one team outcome and no personal scores` |
| ND03 | 法语基础盒：125 主题牌、10 数字牌、1 垫板、8 标记、1 份说明 | FR 4 | createND / assertInvariantsND | `ND03 conserves ten number cards and the active team tokens` |
| ND04 | 数字牌为 1–10，发牌时不重复，未发出的保持隐藏 | FR 1、3、4（数字范围见 1） | reduceND / viewForND | `ND04 gives unique 1–10 numbers and keeps unused numbers hidden` |
| ND05 | 随机选 5 张主题牌叠放，一局共 5 轮 | FR 1 | createND / assertInvariantsND | `ND05 draws five distinct pairs without repeating any of the ten candidate questions` |
| ND06 | 4–8 人时在独角兽区放与玩家数相同的标记 | FR 1 | createND / assertInvariantsND | `ND06 starts with one unicorn per player at 4–8` |
| ND07 | 首位队长为最有趣的玩家；随后由左手邻座接任 | FR 1 | reduceND (NEXT_ROUND) | `ND07 uses the selected first captain and advances to the next seat` |
| ND08 | 队长取顶部主题牌，朗读当前面两个主题中的一个 | FR 1 | reduceND (CHOOSE_TOPIC) | `ND08 restricts choice to this pair and to the captain` |
| ND09 | 4–8 人所有人各拿一张秘密数字牌，包含队长 | FR 1 | reduceND (CHOOSE_TOPIC) | `ND09 includes the captain in basic 4–8 player answers` |
| ND10 | 队长先回答；其余玩家的回答次序自由，不强制顺时针 | FR 1 | reduceND (READY) | `ND10 requires the captain first and then allows any answer order` |
| ND11 | 回答的程度对应题目两端：1 对应绿色一端，10 对应红色一端 | FR 1 | reduceND / viewForND | `ND11 preserves 1 and 10 endpoint directions exactly` |
| ND12 | 可口述或表演，但须切题；不能直接或间接泄露自己的数字 | FR 3 | reduceND / viewForND | `ND12 stores readiness without evaluating spoken answer content` |
| ND13 | 可以重复原回答，不能改回答 | FR 3 | reduceND (READY) | `ND13 rejects submitting a locked answer again with a new seq` |
| ND14 | 队长逐次指定一个玩家，该玩家公开数字；4–8 人包含队长自己的牌 | FR 1 | reduceND (REVEAL_NEXT) | `ND14 permits only the captain to reveal the next locked seat` |
| ND15 | 第一张没有前一张，故不产生顺序失误 | FR 1 的相邻比较定义 | reduceND (REVEAL_NEXT) | `ND15 never penalizes the first revealed card` |
| ND16 | 新翻数字小于紧邻前一张时，1 枚独角兽标记转入便便区 | FR 1、3 | reduceND (REVEAL_NEXT) | `ND16 moves exactly one token for a descending neighbor` |
| ND17 | 只与前一张比较，不与历史最大值比较；4→2→3 只有一次失误 | FR 3；FR 2 另有例子 | reduceND (REVEAL_NEXT) | `ND17 counts 4→2→3 as one mistake, not two` |
| ND18 | 错一次仍继续本轮；一轮可错多次；除非标记已全耗尽 | FR 1 | reduceND (REVEAL_NEXT) | `ND18 continues after mistakes while unicorns remain` |
| ND19 | 基本模式不猜精确数字，不按距离或区间计分；只判断相邻顺序 | FR 1、3 | reduceND / viewForND | `ND19 has no exact-guess or distance scoring in base mode` |
| ND20 | 同一轮数字唯一，故数字并列不存在；顺序必须覆盖且仅覆盖本轮答题玩家 | FR 1 发牌流程、FR 4 配件 | reduceND (LOCK_ORDER) | `ND20 rejects duplicate, missing, out-of-range and malformed order entries` |
| ND21 | 本轮全部数字揭示后收回所有数字牌，包括未发的牌；下轮重新发 | FR 3 | reduceND (NEXT_ROUND) | `ND21 returns all number cards and deals again in the next round` |
| ND22 | 换轮不重置标记；失误跨轮累积 | FR 3 | reduceND (NEXT_ROUND) | `ND22 carries mistakes across rounds` |
| ND23 | 任意时刻独角兽区变空，立即全队失败；不得等到本轮结束 | FR 1 | reduceND (REVEAL_NEXT) | `ND23 loses immediately with no remaining unicorns, mid-round` |
| ND24 | 第 5 轮完成且仍有独角兽标记，全队成功；不进行第 6 轮 | FR 1 | reduceND (REVEAL_NEXT) | `ND24 stops exactly at round five and cannot start a sixth round` |
| ND25 | 官方评价按全队剩余标记分档：全便便、便便更多、独角兽不少于便便、全独角兽；是团队评价，不是个人排名 | FR 3 评价表 | reduceND (FINISHED / result) | `ND25 gives team-only rating at zero, half, more-poop and all-unicorn boundaries` |
| ND26 | 9 人只放 8 枚标记；队长无数字且不回答，每轮 8 个答案 | FR 3 | createND / assertInvariantsND | `ND26 gives nine players eight numbers and no captain answer` |
| ND27 | 专家变体：队长指定下一人前须报精确数字；每次报错耗 1 枚标记 | FR 4 | reduceND (GUESS_EXACT) | `ND27 wrong exact guesses cost one token and validate guess bounds` |
| ND28 | 专家变体不再要求升序，队长可重复报同一数字；不得叠加基本升序惩罚 | FR 4 注记 | reduceND (GUESS_EXACT) | `ND28 expert guesses need not ascend and can repeat without double penalties` |
| ND29 | 专家变体队长自己的牌不翻；其他人均翻完后，大家共同猜队长的数字 | FR 4 | reduceND (GUESS_CAPTAIN) | `ND29 leaves the captain hidden until a non-captain submits the team guess` |
| ND30 | 猜中队长数字则从便便区回收 1 枚标记；猜错不额外损失；无便便可回收时不凭空增发 | FR 4（守恒边界来自转移定义） | reduceND (GUESS_CAPTAIN) | `ND30 recovery transfers an existing token only and wrong team guesses cost nothing` |
| ND31 | 专家变体仍保留其他规则，包括失误耗尽立即失败；全耗尽后不能等队友猜中再复活 | FR 4「其余不变」与 FR 1 | reduceND (GUESS_EXACT) | `ND31 cannot recover after expert tokens have all been lost` |
| ND32 | 官方说明只列专家变体；9 人规则是人数适配，不能当成可关闭变体 | FR 3、4 | createND / assertInvariantsND | `ND32 defaults expert off and keeps nine-player adaptation mandatory` |

## 线上适配与未决边界（不是官方新规则）

| ID | 适配 / 约束 | 依据 | 实际接口 / 路径 | 实际测试名 |
| --- | --- | --- | --- | --- |
| NDA01 | 原版是逐次指定并立即翻牌；用户新指令要求先排好顺序再逐个揭示。提前锁定整个顺序会取消队长根据翻牌继续调整的机会，不能声称与官方过程完全等价。暂记用户指定版本，待确认操作语义 | 用户「★ 阶段 0 结论」；对照 FR 1；Q03 | reduceND (LOCK_ORDER) | `NDA01 freezes the full base order before any reveals` |
| NDA02 | 服务端保存数字，仅本人可见自己的牌；揭示时才逐张向全员公开，未发数字始终不公开 | FR 1、3；用户秘密信息要求 | reduceND / viewForND | `NDA02 views cannot distinguish changes to other hidden numbers or future topics` |
| NDA03 | 线上只用语音简短回答，每题只需一个东西、一个词或一句话；不做表演、声音或动作模仿，不新增文字聊天和自动语义判断；提示文案统一「开麦回答」 | 用户总原则 5 | reduceND (命令字段白名单) | `NDA03 rejects text/audio attachments rather than storing them in receipts` |
| NDA04 | 不制作不存在的指针、距离连线、个人分数、名次与个人领奖台；显示第几轮、全队失误标记、每轮翻牌回顾 | FR 1、3、4；用户最新结论 | reduceND / viewForND | `NDA04 emits one public reveal event per shown number with team token counts` |
| NDA05 | 专家模式默认关；9 人与专家组合未获明确处理，默认不提供该组合 | 用户默认关；FR 3、4；Q04 | createND / assertInvariantsND | `NDA05 explicitly refuses unsupported expert and nine-player combination` |
| NDA06 | 规则没有超时自动跳过或扣分条款，不能用「未猜得 0 分」处理合作游戏；默认关闭计时，掉线保留座位与秘密状态 | FR 无该条款；Q05 | reduceND (拒绝 TIMEOUT / 未知命令) | `NDA06 has no invented timeout, recording or skip commands` |
| NDA07 | 当前批准快照为 79 道：74 原创、5 用户示例，spicy 17；不导入外部商业牌库；新增草稿不会自动进入 approved-bank.json | 用户最新原创题库指令；Q01、Q02 | createND / assertInvariantsND | `NDA07 filters spicy in normal mode and validates unique, sufficient content` |
| NDA08 | 用户本轮明确授权继续阶段 2，当前 79 道批准为首批引擎内容；编辑稿与批准快照分离；无个人分数或排名 | 用户最新结论及阶段 1 停止点 | createND / assertInvariantsND | `NDA08 loads the authorized 79-question bank without exposing it in views` |

## 当前实现边界

40 行均已映射实际测试，43 项定向测试通过。基本 4/6/9 人各 200 局（600），专家 4/6 人各 200 局（400），共 1000 局全部到终局、全部通过固定种子重放。模拟策略包含读取服务端状态的测试 oracle，目的是覆盖成功/失败边界，不代表真实玩家猜题或客户端能力。

首批内容为用户授权的 79 道批准快照，普通尺度仅使用非 spicy 题。每局随机抽 10 道互不重复题目，形成 5 张二选一虚拟主题牌；不受原版 125 张物理卡数量限制，不自行补题。原版物理清单仍作为来源事实保留。

计时、断线和联网身份验证未在阶段 2 实现；引擎只验证传入座位的规则权限，真实座位凭证必须由阶段 3 服务器绑定。状态只可在服务端保存，客户端只能收到 viewForND。只锁定口头回答已完成状态，不保存文本或录音，额外命令字段拒绝。

具体授权、默认值与状态机见 STAGE2_BASELINE.md。所有后续工作仍按阶段停止，不进入阶段 3、不推 main、不部署。

## 阶段 3 更新

用户验收阶段 2 后已授权服务器联机。nd-rooms.ts 复用已有 DM / SS 的绑定、连接跟踪与原子存档模式；仓库无 wf-rooms.ts。79 道批准内容不变。计时默认不限时，可选服务器提醒式 60/120 秒，不改变原规则结果。协议、恢复与隐私验收见 SERVER_PROTOCOL.md 及 stage3/ 证据，阶段 2 的纯引擎规则和测试映射不变。无正式 UI 或部署。


## 2026-11-01 R2 与阶段 4 更新

题卡内容已由用户直接审核为 102 道，spicy 20 道；新增 23 道与 11 道用词修正见 feedback/2026-11-01-r2/INSTRUCTION.md。仅更新授权内容与哈希，不改任何计分规则。UI 使用 nd-protocol 白名单视图，队长确认完整顺序后逐张发送 REVEAL_NEXT。普通尺度过滤 spicy，默认放开；默认不限时。回顾仅取公开 history；娱乐称号只描述真实公开统计，无个人分数或名次。
