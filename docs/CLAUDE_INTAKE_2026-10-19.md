# 资料入库说明（Claude 整理，2026-10-19）

本次由用户提供的小红书截图整理而来。Codex 请先读完本文件，再处理 `packages/game-data/drafts/MACMILLAN_FROM_PHOTOS.json`。

## 1. 新增文件

| 文件 | 内容 | 等级 | 用途 |
|---|---|---|---|
| `reference/maps/macmillan_cn_retail_xhs.jpg` | 中文版**零售实物**棋盘（麦克米伦庄园）俯拍 | D（第三方实物照） | 主要依据。底部被裁切、有反光 |
| `reference/maps/macmillan_en_promo_xhs.jpg` | 发售前英文宣传渲染图，地图完整 | D | 只补 P1 缺失的底部；有错字 |
| `reference/maps/macmillan_cn_start_markers_zoom.png` | P1 中 11 个房间名左侧标记的放大图 | D | 核对起点标记 |
| `reference/maps/forsaken_boneyard_cn_retail_xhs.png` | 中文版"遗弃埋骨地"地图实物照 | D | **非基础版**，不得录入基础版数据 |
| `reference/photos/movement_cards_xhs.jpg` | 5 种移动卡正面（潜行/冲刺/蹲伏/翻越/等待） | D | 确认颜色对应 |
| `reference/photos/setup_layout_en_xhs.jpg` | 英文规则书的开局摆放示意图（截图） | D | 与规则书 p7 对照，无新信息 |
| `packages/game-data/drafts/MACMILLAN_FROM_PHOTOS.json` | 11 个房间、44 个槽位、22 条路线的转录草稿 | — | 待合并 |

## 2. 关键发现

1. **存在官方中文版**：P1 棋盘上印的是简体中文。请在 `SOURCE_MANIFEST.json` 和 `SEARCH_LOG.md` 中补记，并搜索中文版发行商与中文规则书（关键词：黎明杀机 桌游 中文版 发行）。
2. **官方中文房间名**：熔炉上层、熔炉下层、熔炉地下室、矿井深处、矿井入口、煤矿废塔上层、煤矿废塔下层、古树、废品场、木屋、露天场地。`MAP_DATA.json` 里草拟的"铸造厂上层""废料场"等须改用这些官方名，`translation_status` 可标为 `OFFICIAL_ZH_PRINT`（来源 P1）。
3. **槽位计数完全吻合**：11 个房间槽位合计 44；黄/红/蓝/绿 = 10/10/12/12，分别对应 目标(发电机8+逃生门2)/勇气(钩子5+图腾5)/生存(宝箱6+储物柜6)/协作(木板6+乌鸦6)。颜色→类别是由计数推断的，请用规则书道具章节确认。
4. **锯齿外框路线 = 4 条**，与 4 枚可破坏墙一致；宣传图在同样 4 个位置印着墙壁图标。含义请以规则书确认。
5. **单向路线 4 条**：mm_p02、mm_p11、mm_p12、mm_p22（见 JSON）。
6. **起点标记**：熔炉上层 I、矿井入口 II、煤矿废塔上层 III、废品场 IIII、古树 DBD 标志（=5）、露天场地 杀人鬼头像。宣传图编号与此不同，以实物为准。用法须查规则书准备章节。

## 3. Codex 合并步骤（请按顺序）

1. **先用官方图交叉核对**：`reference/maps/ASOBITION_board_preview.png` 如果是发行商官方预览图（B 级），逐条对照 JSON 中的 11 个房间和 22 条路线。与之一致的升级为 `CONFIRMED`（source_level B，附 P1 为佐证）；不一致的写入 `RULE_QUESTIONS.md`，标 `CONFLICT`。
2. 如果 ASOBITION 图无法确认某项，则该项保持 `CHECK_REQUIRED`，`source_level: D`，`source_ref` 写明 P1/P2。**不得**因为照片看着清楚就自行标 CONFIRMED。
3. 核对规则书中关于：起点标记、锯齿外框/可破坏墙、单向箭头、地图上方两条进度轨道的说明，把结论写进 `RULE_MATRIX.md`。
4. 再把结果合并进 `packages/game-data/MAP_DATA.json`（保留原有字段结构），不要删除原有 source_ref。
5. 运行 JSON 中 `self_checks.codex_must_run` 列出的 4 项程序检查，并生成一张路线示意图（如 `docs/macmillan_graph.svg`）供用户核对。
6. 更新 `MISSING_RESOURCES.md`：麦克米伦庄园降为"待最终核对"；**废旧车场仍完全缺失**，列为第一优先。
7. 报告后停止。

## 4. 仍然缺失

- 废旧车场 Autohaven Wreckers 整面地图
- 68 张技能卡与 16 张物品卡的正面原文
- 人物板正反面
- mm_p22（木屋→露天场地）的路线颜色
