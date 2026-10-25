# 拉密规则矩阵（阶段 1）

核对日期：2026-10-25。范围：原版 2–4 人。阶段 1 原始规划保留，下表函数和测试映射已于阶段 2 更新为实际实现；官方普通超时策略与 XP 明确例外。

## 来源

- B-RK01（主）：[2600-English.pdf](https://rummikub.com/wp-content/uploads/2019/12/2600-English.pdf)，4 页，页脚 D-2600-1236-0041 120819。SHA256 `88A6F8B14C119B19B641DCFD13352F9ECA3364F1B1A4219459B0F8F1B506AB00`。
- B-RK02（对照）：[4600 Classic 2025](https://rummikub.com/wp-content/uploads/2025/06/4600-0236-0013-EN-_rummikub-Classic.pdf)，4 页，文件名 0013、实际页脚 D-4600-0236-0014/EN 270525。SHA256 `6372ECC855B4AE4484BF540F890C7D16330E89263037E3141EB760FF45655DBA`。
- 官方入口：[规则页](https://rummikub.com/rules/)，当前英文链接为 `2600-English-1.pdf`；本次按总指令指定下载无 `-1` 的版本，不声称两文件哈希相同。
- P-RK：`docs/instructions/RK_MASTER_2026-10-25.md`，用户明确指定的项目默认值；与官方规则分开标识。

页码为 PDF 物理页（与正文 1–4 一致）。原始 PDF 留在被 Git 忽略的 `reference/rulebooks/rummikub/`。

## 规则到实现、测试映射

| ID | 规则与采用方式 | 来源页码 / 状态 | 实际引擎函数 | 实际测试名 / 验证入口 |
|---|---|---|---|---|
| R01 | 4 色 × 1–13 × 2，加 2 Joker，共 106；唯一 ID 如 R07a/J1 | 两版 p1；CONFIRMED，ID 为项目表示 | createTiles | 106 unique tiles and deterministic public start draw |
| R02 | 基础版 2–4 人，各发 14，余牌入池 | 两版 p1；CONFIRMED | createRK / deal | 106 unique tiles and deterministic public start draw |
| R03 | 每人抽一张比数字，最大先手；抽牌归池重洗后再发牌 | 两版 p1；CONFIRMED | deal | starting draw tie is public and only highest tied players redraw |
| R04 | 服务器代抽并公开牌；同点重抽 | P-RK §1；PROJECT_DEFAULT，官方未规定平手处理 | deal / viewForRK | starting draw tie is public and only highest tied players redraw |
| R05 | 同数 3–4 张，颜色互异 | 两版 p1；CONFIRMED | validateMeld | groups require distinct colors, runs have no wrapping or gaps |
| R06 | 同色连续 ≥3；1 最小，13 不接 1 | 两版 p1；CONFIRMED | validateMeld | groups require distinct colors, runs have no wrapping or gaps |
| R07 | 破冰一组或多组总分 ≥30；只用自己手牌；Joker 按代表数值计 | 两版 p1；CONFIRMED | validateTurn | 29 points across groups stays below 30 and reports exact one point shortfall |
| R08 | 破冰整回合不能改原桌面或拿桌面 Joker，后续回合才可操作桌面 | 两版 p1、p3；CONFIRMED | edit / validateTurn | cannot return old table tiles to rack and cannot edit initial table |
| R09 | 可自愿不出牌，摸 1 后立即结束，刚摸的牌不能当回合出；顺时针轮转 | 两版 p1；CONFIRMED | drawEnd / nextTurn | DRAW discards uncommitted draft and ends turn, no zero-tile commit |
| R10 | 后续可添牌、拆顺子、取四张组中一张、跨组重组；结束每组合法，无散牌 | 两版 p2–3；CONFIRMED；新版 p2 修正旧版 round 为 turn | edit / validateTurn | official example 2: split around joker and use both new endpoints |
| R11 | 桌面牌不回手；每个出牌回合至少贡献一张本人手牌 | 两版 p2–3；CONFIRMED（p3 明确至少一张） | edit / validateTurn | cannot return old table tiles to rack and cannot edit initial table |
| R12 | Joker 颜色和数字由合法解释决定，枚举所有解释；顺子多解取最高总分，剩余平手固定 ID/颜色次序 | 两版 p3 + P-RK §2；PROJECT_DEFAULT 为消歧策略 | validateMeld | enumerates joker endpoints and colors without depending on order |
| R13 | Joker 可用来自手牌或桌面的牌替换，只需原组合仍合法；三张组中缺的两色任一均可 | 两版 p3；CONFIRMED | validateTurn | a table tile can replace joker, and another rack tile must still be played |
| R14 | 允许通过拆组、前添牌、移走全部普通牌等释放 Joker，不强求同数字同色实体替牌 | 两版 p3 四例、p4 第四例；CONFIRMED | edit / validateTurn | official example 1–4（四项独立用例） |
| R15 | 释放的 Joker 必须当回合用于新组合，可重解释；本回合至少贡献一张手牌；不能留手 | 两版 p3；CONFIRMED；新组合身份判定见 Q06 | edit / validateTurn | moved joker cannot simply return to original membership and count as a new set |
| R16 | 官方每回合 1 分钟；房间可设 1/2 分钟/不限，默认 1 分钟 | 两版 p4 + P-RK §1；扩展设置为 PROJECT_DEFAULT | beginTurn / reduceRK | late player commands resolve timeout and 2-minute timer is respected |
| R17 | 官方普通超时摸 1；未完成操作回滚桌面、收回本回合牌并罚摸 3 | 两版 p4；CONFIRMED；与项目冲突 Q01 | 官方普通超时策略未实现，按 R18 项目覆盖 | Q01：不执行普通超时摸 1；项目默认覆盖 |
| R18 | 项目默认：超时或确认非法均回滚并罚摸 3，结束回合；非法具体中文原因 | P-RK §1–2；PROJECT_DEFAULT，非官方原文，见 Q01/Q02 | reduceRK / drawEnd | only trusted server deadline expires, penalty bounded by remaining pool |
| R19 | 首个出完手牌者胜；其他玩家手牌点数为负，胜者取负分绝对值总和；手中 Joker=30 | 两版 p1、p4；CONFIRMED | finish / rackPoints / scoreGame | normal and blocked scores are zero sum, joker costs 30 |
| R20 | 空池后继续，直至无人可出；项目按完整一轮无人出结束，出牌则重置计数 | 两版 p1、p4 + P-RK §1；检测方式 PROJECT_DEFAULT，见 Q04 | drawEnd / reduceRK | empty pool needs a full round of passes and scores lowest rack |
| R21 | 堵局最低手牌点数者胜；每位败者得 m−s_i，胜者得 Σ(s_i−m)，不是按普通清空结算 | 两版 p4；CONFIRMED，最低分并列未规定，见 Q03 | scoreGame | normal and blocked scores are zero sum, joker costs 30 |
| R22 | 一轮包含与人数相同的小局；约定轮数；总冠军先比胜局数，再比累计分；每局重做准备 | 两版 p1、p4；CONFIRMED；项目房间局数映射见 Q08 | deal / matchRanking | normal and blocked scores are zero sum, joker costs 30；matchRanking 实现胜局优先 |
| R23 | 5–6 人 XP：160=12×13+4 Joker，阶段 6 用户同意后才开；Twist 不做 | 两版 p1 + P-RK §5；OUT_OF_SCOPE | createRK 拒绝（XP 未实现） | rejects unsupported players and malformed seed/settings |
| R24 | 草稿仅操作者可见；seq 幂等；UNDO/REDO/RESET；牌不重不丢，非当前玩家不能改 | P-RK §2；软件约束，不是实体规则 | reduceRK / viewForRK / assertInvariants | preserves 106 tiles through randomized move/undo/redo/reset/draw sequences |

## 确定的计分例子

普通结束，败者剩 10、20、30，胜者 +60，三位败者 -10/-20/-30。
堵局，三人剩 10、20、30，最低者 +30，其余 -10/-20。两者都零和。
官方样例表经 PDF 图片核对：2600 的 Game 1 是 +24/-5/-16/-3；文本抽取会错读为 -15/-43，故不可用提取后的样例数字作测试真值。

## 实现承接

沿用 `dm-rooms.ts` 的 token、连接映射与快照结构；从 `dm/Polish.tsx` 的 ActionDock/计时反馈和 `drawing/feel.ts` 复用，不重写第二套音效服务。样式新增 `.rk-world` 范围。阶段 2 开始前重读最新接口，尤其共享 feel 文件已随拉取更新。
阶段 2 已实现独立引擎，测试位于 packages/rummikub/test/，全部命令契约见 packages/rummikub/README.md。所有未决边界与默认值见 CHECK_REQUIRED.md。
