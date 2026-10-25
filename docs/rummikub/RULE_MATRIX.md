# 拉密规则矩阵（阶段 1）

核对日期：2026-10-25。范围：原版 2–4 人；本阶段仅资料与实现契约，以下函数、测试名全部是**规划名，尚未实现或运行**。

## 来源

- B-RK01（主）：[2600-English.pdf](https://rummikub.com/wp-content/uploads/2019/12/2600-English.pdf)，4 页，页脚 D-2600-1236-0041 120819。SHA256 `88A6F8B14C119B19B641DCFD13352F9ECA3364F1B1A4219459B0F8F1B506AB00`。
- B-RK02（对照）：[4600 Classic 2025](https://rummikub.com/wp-content/uploads/2025/06/4600-0236-0013-EN-_rummikub-Classic.pdf)，4 页，文件名 0013、实际页脚 D-4600-0236-0014/EN 270525。SHA256 `6372ECC855B4AE4484BF540F890C7D16330E89263037E3141EB760FF45655DBA`。
- 官方入口：[规则页](https://rummikub.com/rules/)，当前英文链接为 `2600-English-1.pdf`；本次按总指令指定下载无 `-1` 的版本，不声称两文件哈希相同。
- P-RK：`docs/instructions/RK_MASTER_2026-10-25.md`，用户明确指定的项目默认值；与官方规则分开标识。

页码为 PDF 物理页（与正文 1–4 一致）。原始 PDF 留在被 Git 忽略的 `reference/rulebooks/rummikub/`。

## 规则到实现、测试映射

| ID | 规则与采用方式 | 来源页码 / 状态 | 规划引擎函数 | 规划测试名 |
|---|---|---|---|---|
| R01 | 4 色 × 1–13 × 2，加 2 Joker，共 106；唯一 ID 如 R07a/J1 | 两版 p1；CONFIRMED，ID 为项目表示 | createTiles | tiles_106_unique |
| R02 | 基础版 2–4 人，各发 14，余牌入池 | 两版 p1；CONFIRMED | createRK | deal_2_3_4_players |
| R03 | 每人抽一张比数字，最大先手；抽牌归池重洗后再发牌 | 两版 p1；CONFIRMED | drawStartingPlayer | start_draw_return_before_deal |
| R04 | 服务器代抽并公开牌；同点重抽 | P-RK §1；PROJECT_DEFAULT，官方未规定平手处理 | drawStartingPlayer / viewForRK | start_draw_public_ties_redraw |
| R05 | 同数 3–4 张，颜色互异 | 两版 p1；CONFIRMED | validateMeld | group_3_4_distinct_colors |
| R06 | 同色连续 ≥3；1 最小，13 不接 1 | 两版 p1；CONFIRMED | validateMeld | run_no_wrap_no_gap |
| R07 | 破冰一组或多组总分 ≥30；只用自己手牌；Joker 按代表数值计 | 两版 p1；CONFIRMED | validateInitialMeld | initial_29_rejected_30_accepted_joker_value |
| R08 | 破冰整回合不能改原桌面或拿桌面 Joker，后续回合才可操作桌面 | 两版 p1、p3；CONFIRMED | validateTurn | initial_turn_table_immutable |
| R09 | 可自愿不出牌，摸 1 后立即结束，刚摸的牌不能当回合出；顺时针轮转 | 两版 p1；CONFIRMED | drawAndEnd / nextSeat | draw_one_ends_turn |
| R10 | 后续可添牌、拆顺子、取四张组中一张、跨组重组；结束每组合法，无散牌 | 两版 p2–3；CONFIRMED；新版 p2 修正旧版 round 为 turn | validateTurn / splitMeld / mergeMelds | manipulation_examples_all_legal |
| R11 | 桌面牌不回手；每个出牌回合至少贡献一张本人手牌 | 两版 p2–3；CONFIRMED（p3 明确至少一张） | validateTurn | table_cannot_return_rack_and_no_zero_tile_commit |
| R12 | Joker 颜色和数字由合法解释决定，枚举所有解释；顺子多解取最高总分，剩余平手固定 ID/颜色次序 | 两版 p3 + P-RK §2；PROJECT_DEFAULT 为消歧策略 | validateMeld / chooseInterpretation | joker_all_interpretations_highest_run |
| R13 | Joker 可用来自手牌或桌面的牌替换，只需原组合仍合法；三张组中缺的两色任一均可 | 两版 p3；CONFIRMED | validateJokerRetrieval | joker_missing_either_color_table_replacement |
| R14 | 允许通过拆组、前添牌、移走全部普通牌等释放 Joker，不强求同数字同色实体替牌 | 两版 p3 四例、p4 第四例；CONFIRMED | validateJokerRetrieval | joker_release_official_four_examples |
| R15 | 释放的 Joker 必须当回合用于新组合，可重解释；本回合至少贡献一张手牌；不能留手 | 两版 p3；CONFIRMED；新组合身份判定见 Q06 | validateJokerRetrieval / validateTurn | joker_reused_new_meld_same_turn |
| R16 | 官方每回合 1 分钟；房间可设 1/2 分钟/不限，默认 1 分钟 | 两版 p4 + P-RK §1；扩展设置为 PROJECT_DEFAULT | turnDeadline / reduceRK | deadline_server_60_120_unlimited |
| R17 | 官方普通超时摸 1；未完成操作回滚桌面、收回本回合牌并罚摸 3 | 两版 p4；CONFIRMED；与项目冲突 Q01 | resolveTimeout / restoreTurn | official_timeout_one_incomplete_three |
| R18 | 项目默认：超时或确认非法均回滚并罚摸 3，结束回合；非法具体中文原因 | P-RK §1–2；PROJECT_DEFAULT，非官方原文，见 Q01/Q02 | commitTurn / penalizeTurn | project_timeout_invalid_rollback_three |
| R19 | 首个出完手牌者胜；其他玩家手牌点数为负，胜者取负分绝对值总和；手中 Joker=30 | 两版 p1、p4；CONFIRMED | finishGame / rackPoints | normal_score_zero_sum_joker_30 |
| R20 | 空池后继续，直至无人可出；项目按完整一轮无人出结束，出牌则重置计数 | 两版 p1、p4 + P-RK §1；检测方式 PROJECT_DEFAULT，见 Q04 | trackStalemate | empty_pool_continue_full_round_reset_on_play |
| R21 | 堵局最低手牌点数者胜；每位败者得 m−s_i，胜者得 Σ(s_i−m)，不是按普通清空结算 | 两版 p4；CONFIRMED，最低分并列未规定，见 Q03 | scoreBlockedGame | blocked_10_20_30_scores_30_minus10_minus20 |
| R22 | 一轮包含与人数相同的小局；约定轮数；总冠军先比胜局数，再比累计分；每局重做准备 | 两版 p1、p4；CONFIRMED；项目房间局数映射见 Q08 | nextGame / matchRanking | match_wins_before_points_and_redeal |
| R23 | 5–6 人 XP：160=12×13+4 Joker，阶段 6 用户同意后才开；Twist 不做 | 两版 p1 + P-RK §5；OUT_OF_SCOPE | createTiles（后续） | xp_disabled_by_default（后续） |
| R24 | 草稿仅操作者可见；seq 幂等；UNDO/REDO/RESET；牌不重不丢，非当前玩家不能改 | P-RK §2；软件约束，不是实体规则 | reduceRK / viewForRK / assertInvariants | seq_idempotent_private_draft_106_conserved |

## 确定的计分例子

普通结束，败者剩 10、20、30，胜者 +60，三位败者 -10/-20/-30。
堵局，三人剩 10、20、30，最低者 +30，其余 -10/-20。两者都零和。
官方样例表经 PDF 图片核对：2600 的 Game 1 是 +24/-5/-16/-3；文本抽取会错读为 -15/-43，故不可用提取后的样例数字作测试真值。

## 实现承接

沿用 `dm-rooms.ts` 的 token、连接映射与快照结构；从 `dm/Polish.tsx` 的 ActionDock/计时反馈和 `drawing/feel.ts` 复用，不重写第二套音效服务。样式新增 `.rk-world` 范围。阶段 2 开始前重读最新接口，尤其共享 feel 文件已随拉取更新。
本矩阵不代表阶段 2 的代码开发已开始。所有未决边界与默认值见 CHECK_REQUIRED.md。
