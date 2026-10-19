# 资料入库说明 第二批（Claude 整理，2026-10-19）

本批是一套**中文版典藏版实物**的照片（用户经小红书提供）。Codex 请先读本文件，再处理下列草稿。第一批说明见 `docs/CLAUDE_INTAKE_2026-10-19.md`。

## 1. 新增文件

| 文件 | 内容 |
|---|---|
| `reference/maps/autohaven_cn_retail_xhs.png` | **奥托海文废车场**整面实物照（完整无裁切） |
| `reference/photos/ref_survivor_interactions_cn.png` | 逃生者交互行动参考（人物板背面） |
| `reference/photos/ref_killer_interactions_cn.png` | 杀手交互行动参考 + 献祭/搬运完整规则 |
| `reference/items/items_16_cn.png` | 16 张物品牌正面 |
| `reference/characters/*.png` | 17 名逃生者、16 名杀手的角色板正面（含典藏版） |
| `packages/game-data/drafts/AUTOHAVEN_FROM_PHOTOS.json` | 废车场 10 房间、44 槽位、19 个路线图标 |
| `packages/game-data/drafts/ITEMS_FROM_PHOTOS.json` | 16 张物品牌（10 种）全文 |
| `packages/game-data/drafts/CHARACTERS_FROM_PHOTOS.json` | 33 名角色：名称、难度、血点、力量、被动、3 个板载技能（含血点消耗）全文 |
| `docs/REFERENCE_SHEETS_FROM_PHOTOS.md` | 两张交互参考卡逐字转录 |

全部为 D 级（第三方实物照）。数据文件中 `transcription_confidence`：HIGH = 已放大逐字核对；MEDIUM = 按截图原分辨率转录，可能有个别错字。

## 2. 关键发现

1. **两张基础版地图现在都有完整照片了。** 废车场 10 个房间、槽位合计 44，黄/红/蓝/绿 = 10/10/12/12；锯齿路线 4 条，单向 3 条。
2. **道具颜色→类别已由官方参考卡确认**：目标(黄)=发电机8+出口大门2；无惧(红)=钩子5+厄咒图腾5；逃生(蓝)=箱子6+储物柜6；援助(绿)=乌鸦6+木板6。
3. **16 张物品牌全部齐了**：工具箱×2、宽敞工具箱×1、鞭炮×2、地图×1、彩虹地图×1、手电筒×3、急救箱×3、破损钥匙×1、晦暗钥匙×1、万能钥匙×1。
4. **13 名基础版角色的板载技能全部齐了**（7 逃生者 + 6 杀手，均已放大核对）。这足以实现规则书的基础模式（只用人物板上的 3 个技能）。
5. **献祭/搬运规则有完整中文原文**（见参考卡转录）：杀手选 ≤4 颗技能检定骰，出现大成功则挣脱；否则每颗骰允许移动至多 1 个空间去找钩子；搬运中不能穿木板/可破坏墙、不能用力量、不能交互；搬运中不翻开道具。
6. **血点**：逃生者初始 2 / 上限 6；杀手初始 4 / 上限 12；杀手消耗 4 血点可在第二回合后打出一张手牌执行额外回合。
7. **技能检定失败的结果计为 0**（妖巫被动原文）。
8. **废车场出现"一个图标连接 3 个房间"的路线**（ah_p02、ah_p04），麦克米伦庄园没有。请查规则书确认含义，写入 RULE_QUESTIONS.md，并让 Graph 数据结构能表达。
9. **官方中文术语**：用"杀手"不用"杀人鬼"，"厄咒图腾"不用"诅咒图腾"。请统一更新 glossary.json、AGENTS.md 中的用语和已有数据文件。
10. **版本范围**：照片是典藏版。只把 `edition: BASE` 的 13 名角色合并进基础版数据；其余 20 名放进单独的扩展数据文件，状态标为 `OUT_OF_SCOPE_BASE`。

## 3. Codex 处理步骤

1. 按第一批说明第 3 节的方法，处理 `AUTOHAVEN_FROM_PHOTOS.json`（先用 `ASOBITION_board_preview.png` 交叉核对，再合并进 MAP_DATA.json）。
2. 把 `ITEMS_FROM_PHOTOS.json` 合并进 `ITEM_DATA.json`；把 13 名基础版角色合并进 `CHARACTER_DATA.json`，板载技能写入 `PERK_DATA.json`（标注 `on_board: true`）。所有条目 `source_level: D`，`source_ref` 写照片文件名。
3. 把参考卡上的规则逐条对照 `RULE_MATRIX.md`：与英文规则书一致的，标注"中文版原文佐证"；不一致的写入 RULE_QUESTIONS.md。
4. 为每个技能、物品、杀手力量写出**结构化效果草案**（触发时机、条件、效果），状态 `CHECK_REQUIRED`，供 Phase 4 使用。不要现在实现。
5. 更新 `MISSING_RESOURCES.md`。现在仍缺：
   - 28 张逃生者技能卡、24 张杀手技能卡（卡组本身，不是人物板）
   - 技能检定骰子、危险骰子各面分布
   - 中文版规则书正文（准备、计划阶段、清理、3–4 人模式）
   - 日文原文（AGENTS.md 原计划以日文版为准；现有资料均为中文版和英文版，请在报告里提出是否改为以中文版为准，由用户决定）
6. 运行全部检查，报告后停止。
