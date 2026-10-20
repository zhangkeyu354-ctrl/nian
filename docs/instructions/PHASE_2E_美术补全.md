# Phase 2E：补全剩余美术（给 Codex，Claude 2026-10-20）

用户要求由你完成剩下的图片。用户之前打算用 ChatGPT 生成 28 张图，**没有交过来，不要等**，全部由你用内置生图工具（与之前 5 张物品图相同的 `built-in image_gen`）生成。

## 0. 开始前

1. `git log --oneline -3` 应看到 `ce4b763`（Q15 裁定）和 `d7b908f`（竖屏棋盘优先 + paramActions）。读 `docs/handoff/CODEX_交接_2026-10-20.md` 第 7 节。
2. 读 `docs/ART_STYLE_GUIDE.md`。风格、尺寸、透明度、"不烘焙文字"、"不参考官方图"全部照它执行。
3. `npm test`（208 项）、`npm run verify:mobile-interfaces` 先跑一遍，确认基线是绿的。

## 1. 必做：17 张占位图换成正式图

`assets/manifest.json` → `illustrations` 中 `source: "占位"` 的 17 项：

| 类别 | id | 要求 |
|---|---|---|
| 物品（5） | flashlight, first_aid_kit, broken_key, dull_key, skeleton_key | 与已有 5 张物品图同一套提示词结构（见 manifest 里 commodious_toolbox 的 `generation_prompt`），透明底，48px 下轮廓可辨；三把钥匙要一眼区分（断裂 / 磨钝 / 骨制万能） |
| 地图封面（2） | macmillan_estate_cover, autohaven_wreckers_cover | 横向不透明，原创场景（矿场熔炉 / 废车场），不出现文字、Logo、官方构图 |
| 操作坞模块图（10） | lobby, characters, plan, move, interact, skill, waiting, dice, carry, results | 小尺寸显示（手机上 36px，电脑上更大），要**简单、高对比、单一主体**，不要细节场景；同一套色调 |

做法：
- 生成原图放 `assets/mobile-originals/<类别>/<id>.png`，在 `work/mobile-implementation/generated-art.json` 登记 `{id, source_path, prompt}`，然后运行 `python scripts/register-mobile-illustrations.py`（它会生成 WebP、写 manifest 与 `apps/web/src/illustrations.json`）。
- 记录真实输出尺寸，不要改画、不要描摹，不要把官方照片或 reference/ 里的任何东西送进生图工具（`official_reference_input: false`）。
- 生成后逐张看：主体是否居中、48px/36px 下能否认出、有没有混进文字或水印。不合格就重生成，不要凑数。

## 2. 选做（做完第 1 节、验收通过后再做）：6 个机制图标 + 物品背面

`icon_sealed_card`（第三封印封住的颜色）、`icon_firecracker_block`（鞭炮拦截）、`icon_flashlight_block`（手电筒阻止）、`icon_reroll`（钥匙重掷）、`icon_carry_reroute`（搬运改道）、`card_item_back`（物品牌背面）。

这些需要**界面接线**才会显示。只允许改 `apps/web` 里的展示：在对应事件反馈（`SEALED_MOVE_FAILED`、鞭炮/手电筒的 `ITEM_USED`、重掷、`CARRY_REROUTE` 选择）旁加图标，缺图时用 SVG 回退。不改规则引擎、协议、服务器、游戏数据。

## 3. 限制

- 不改 `packages/`、`apps/server/`、`packages/shared/`。规则问题写进 `docs/RULE_QUESTIONS.md`。
- 冷进入下载量仍要 < 8MB（现在约 1.64MB）；WebP 物品 ≤256px、模块/封面 ≤768×512，质量 80。
- 原图 PNG 可以提交在 `assets/mobile-originals/`，但 `dist/` 不提交。

## 4. 验收（全部通过才提交）

```
npm test
npm run typecheck
npm run verify:replays
npm run verify:visuals        # 含资源缺失回退
npm run verify:board
npm run verify:mobile-surface
npm run verify:mobile-interfaces   # 64 场景
npm run verify:lan-browsers
```

另外：
- 截图核对：iPhone 13 竖屏中局、横屏中局、物品栏、结算页各一张，放 `docs/phase2e/evidence/`，自己看一遍再交付。
- 重新测冷进入下载量（同 Phase 2D 报告的口径），写进报告。
- manifest 里 `source: "占位"` 应为 0（第 1 节 17 项）。

## 5. 交付

提交（一个或几个提交都行），写 `docs/phase2e/Phase_2E_报告.md`：每张图的 id、尺寸、提示词、是否重生成过；验收结果；下载量；还剩什么没做。**报告并停止**，不要进入上线部署（上线由 Claude 负责，方案见 `docs/phase5/上线方案.md`）。
