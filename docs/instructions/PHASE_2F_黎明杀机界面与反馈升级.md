# Phase 2F：黎明杀机界面与操作反馈升级（给 Codex，Claude 2026-10-21）

游戏已正式上线：https://dbd-boardgame-8qky.onrender.com （`main` 推送即自动部署，进行中的房间会断开）。
用户要求：继续升级黎明杀机的 **界面质感** 和 **操作反馈**，让朋友们玩起来"一眼看懂、点了有回应、不想放下"。

## 0. 开工前（必须）

1. 读 `AGENTS.md`、`docs/handoff/协作规则_多个AI共用仓库.md`、`docs/handoff/CODEX_交接_2026-10-20.md` 第 8 节起的追加。
2. `git pull origin main`，**新建分支 `ui-2f`**，全部工作在这个分支上做。**不要直接推 `main`**（会立刻上线、打断正在玩的房间）。
3. 跑一遍基线：`npm test`、`npm run typecheck`、`npm run verify:replays`、`npm run verify:mobile-interfaces`。
4. 先在手机尺寸（iPhone 13 竖屏 390×664、Pixel 7、横屏 844×390）实际玩一局热座（`/?hotseat=1`），截下你觉得最差的 5 个画面，写进报告开头当"改前"。

## 1. 现状（Claude 最近两轮已做，不要重复，可以在此基础上做得更好）

- 角色脚下光环与头像描边：`apps/web/src/playerColors.ts`（逃生者 4 色、杀手红色脉动大光环、当前行动者跳动）。
- 房间色标名牌、更亮的房间图、高对比路线（`Board.tsx`、`board-visuals.css` 末尾"2026-10-21"块）。
- 顶部阶段标题 + 一句话"现在在干嘛"、行动顺序条、阶段切换大字：`apps/web/src/GameStatus.tsx`。
- 回合步骤条（翻牌→移动→翻道具→交互→掷骰→结束）：`MobileDock.tsx` 的 `TurnSteps`。
- 掷骰：所有掷骰由本人点「🎲 掷骰」（`ROLL_DICE`/`SPAWN_ROLL` 选择）；骰子落定后大字结果（`App.tsx` 的 `DiceResult`）；检定结算大号播报（`apps/web/src/Verdict.tsx`）。
- 魔法运动员那边已经做了音效/震动/轮到你提醒/按钮防重复点，可以参考它的实现方式（不要改魔法运动员的文件）。

## 2. 本阶段要做（按优先级；做完一项验收一项）

### A. 操作反馈（最重要）
1. **移动动画**：任何人移动时，棋子沿实际路线滑过去（约 500ms），走过的路线短暂发光；所有人的屏幕都要看到。关闭动画设置时直接到位。
2. **交互动画**：交互发生时，被交互的道具放大闪一下，并从角色到道具画一道短暂的连线；发电机进度条有填充动画；发电机修好时有明显的完成效果。
3. **受伤 / 挂钩 / 逃脱**：被攻击的人屏幕边缘红色闪烁 + "受伤"印章；挂钩、逃脱、献祭、发电机完成都有专属的大号播报（风格与 `Verdict.tsx` 一致）。
4. **按钮按下反馈**：所有按钮按下立即有视觉变化（已有下沉效果，可改进）；发送中显示小转圈并防止重复点；被服务器拒绝时按钮抖动并显示原因。
5. **音效与震动**（设置里可关，默认开音效、开震动）：掷骰、成功、失败、大成功、受伤、轮到你、杀手进入你所在的房间。用 WebAudio 合成或原创音效文件，不用任何官方/版权音效。
6. **危险提示**：杀手与你同房间或在相邻房间时，你的角色光环和屏幕边缘有红色警示。

### B. 界面质感
7. **13 个角色头像**：现在的原创剪影彼此太像。重新生成一批轮廓、发型、服装剪影差别明显的原创头像（不参考官方立绘），保证 36px 下也能分清；杀手头像要比逃生者更有压迫感。登记方式同 Phase 2E。
8. **棋盘**：房间内道具图标更大更清楚（未翻开的背面与已翻开的道具要一眼区分）；路线图标与颜色在最小缩放下仍可辨认；可去的房间高亮更醒目。
9. **操作栏**：
   - 技能按钮显示：名称、费用、一句话效果；不可用时灰掉并写原因（时机未到 / 血点不足 / 已用过）。
   - 计划阶段的移动牌做成大卡片（有颜色、图标、名称），选中有翻起效果；杀手两张牌显示顺序"①②"。
10. **事件日志**：按轮分组，每条前面用角色颜色的小圆点；重要事件（受伤、挂钩、发电机完成、逃脱）加图标与粗体。
11. **大厅 / 房间 / 选角页**：与游戏内统一的视觉风格；选角卡片更像一张"角色卡"（头像、称号、力量、三个技能）。
12. **横屏与平板**：检查所有新元素在横屏 844×390、平板 1024×768 下不遮挡、不溢出。

## 3. 限制

- **只改 `apps/web/`、`assets/`、`scripts/`（验证脚本）**。不改 `packages/game-engine`、`packages/shared`、`apps/server`、`packages/game-data`、魔法运动员的文件。需要引擎多给信息时，写进报告由 Claude 改。
- 保留所有现有 `data-testid` 和 `data-command` / `data-perk` / `data-group` 属性；按钮 ≥48px；手机页面不能出现整页滚动；不新增下拉框。
- 动画只用 transform/opacity，遵守"关闭动画"设置与系统"减少动态效果"；不能改变规则流程，也不能挡住按钮（播报类浮层 `pointer-events: none`）。
- 冷进入下载量 < 8MB（现在约 1.8MB）。原创美术，不用官方图。
- 编辑代码时不要同时跑依赖 dev server 的浏览器验证（Vite 热更新会打断测试）。

## 4. 验收（全部通过才算完成）

```
npm test
npm run typecheck
npm run verify:replays
npm run build
npm run verify:hotseat
npm run verify:actions
npm run verify:mobile
npm run verify:mobile-surface
npm run verify:visuals
npm run verify:board
npm run verify:mobile-taps
npm run verify:lan-protocol
npm run verify:lan-browsers
npm run verify:lan-lobby
npm run verify:mobile-interfaces
```
（hotseat/actions/mobile/visuals/board/mobile-interfaces 需要先开 `npm run dev`。）

另外：
- "改前 / 改后"对比截图：计划、移动、交互+掷骰+结果播报、受伤、挂钩、杀手回合、等待别人、结算页，竖屏与横屏各一套，放 `docs/phase2f/evidence/`，自己逐张看过。
- 重新测冷进入下载量。

## 5. 交付

1. 在 `ui-2f` 分支提交，`git push origin ui-2f`（**不要合并到 main**）。
2. 写 `docs/phase2f/Phase_2F_报告.md`：每项做了什么、改前改后截图、验收结果、没做完的项和原因、需要 Claude 在引擎侧补的接口。
3. **报告并停止**。由 Claude 审核后，在没人玩的时候合并上线。
