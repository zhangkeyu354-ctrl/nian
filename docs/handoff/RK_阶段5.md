# 拉密阶段 5：全仓回归

2026-10-25，本地分支 `codex/rummikub`。阶段 1–4 基线提交 `16fbcc8`。

## 结论

阶段 5 的规定命令及其他游戏浏览器流程均已实际执行。拉密、全仓单元测试、类型检查、构建、回放、手机界面和局域网检查通过。**全仓验收暂不能称为全部通过：女巫镇浏览器脚本仍记录一项越界。** 未进入阶段 6、未推送、未合并、未部署。

## 实际结果

完整原始日志位于 `docs/rummikub/verification/stage5-*.txt`；批次命令、退出码和耗时见 `stage5-results.json`，它保留首次失败状态，不覆盖为重试通过。

| 命令 | 实际结果 |
| --- | --- |
| `npm test` | 58 文件、892/892 通过，215.47 秒 |
| `npm run typecheck` | 通过；验收脚本修正后再次通过 |
| `npm run build` | 通过；保留既有大包体积提示 |
| `npm run verify:replays` | 1701 / 2903 / 4111 共 3 局事件与哈希一致 |
| `npm run verify:mobile-interfaces` | 64 个场景通过 |
| `npm run verify:lan-protocol` | 3 局，605 条命令、3025 次视图检查、64 次预期拒绝 |
| `npm run verify:lan-lobby` | 3 / 4 / 5 人大厅共 3 场景通过 |
| `npm run verify:lan-browsers` | 2 局各 5 浏览器，337 条命令、343 帧杀手视图、10 张截图通过 |
| `npm run verify:ma-browsers` | 4 人选秀，3293 步、4 场比赛通过 |
| `npm run verify:cn-protocol` | 12 组检查通过 |
| `npm run verify:cn-browsers` | 4 身份、2 局，隐私/刷新/超时通过 |
| `npm run verify:dm-browsers` | 4 人完整对局、刷新恢复与再开通过 |
| `npm run verify:dm-teamplay` | 8 人团队机制通过 |
| `npm run verify:rr-protocol` | 通过，详细检查见日志 |
| `npm run verify:rr-browsers` | 4 手机和 360×640 小屏，误点扣分/抢答/结算/再开通过 |
| `npm run verify:xb-browsers` | 修正测试竞态后 3 人 3 轮、6 人 6 轮通过；独立复验 10 人 10 轮通过，详见下文 |
| `npx tsx scripts/verify-drawing-browsers.ts` | 通过；Chromium 模拟宽度 390 / 667 / 812 / 844，无页面错误 |
| `npx tsx scripts/verify-witch-town-browsers.ts` | **未通过**：4 人整局结束、123 次行动、刷新与离线恢复完成、控制台错误 0；有 1 条去重后的越界记录 |
| `npx tsx scripts/verify-rk-browsers.ts` | 11/11 通过，包含 2 / 3 / 4 人整局及事务、Joker、超时、恢复边界 |
| `npx tsx scripts/verify-rk-ui.ts` | 29 张截图断言、9 条交互流程通过，页面错误 0；含 101 回合完整 UI 对局 |
| `npx prettier --check scripts/verify-xb-ui-v1.ts` | 通过 |

## 瞎掰王测试脚本修正与重试

首次失败日志 `stage5-xb-browsers.txt`：十人流程在旧脚本第 345 行等待 `xb-skip` 按钮可点，15 秒超时。产品仅在 `revealed && !frame.done` 时渲染此按钮。原脚本先 `count()` 再调用通用 `click()` 等待按钮，动画可能在两者之间自然结束并移除按钮。

仅修改 `scripts/verify-xb-ui-v1.ts`：新增 `skipReveal()`，使用真实 Playwright 点击；若按钮在点击前消失，只接受明确的 `xb-reveal[data-done=true]` 终态；其他点击失败继续抛错。所有路径最终都要求揭晓完成，并保留答案一致性和整局结算断言。没有修改其他游戏引擎或样式。

首次修正后复验三人、六人流程通过；十人流程被批次结束时关闭临时服务器打断，日志 `stage5-xb-retry.txt`，该次不算十人通过。为排除测试调度影响，另用独立生命周期服务器在 3496 端口复验十人，退出码 0，`XB_UI_V1_PASS 10 players 10 rounds`，完整日志见 `stage5-xb-10-retry.txt`。

## 未解决：女巫镇越界

`stage5-wt-summary.json` 保留脚本结果：房间 `5276BD0F`，整局 221469 毫秒，123 次行动，`finished/reloaded/offlined=true`，`consoleErrors=[]`。越界记录为：

```text
day|轮到你了 · 抽2张，或打出: wt-hand-slot | wt-card wt-red wt-card-small
```

脚本会在每次动作后测量元素，尚不能凭该记录区分真实裁切、扇形牌面边界或发牌动画瞬间越界。相关 CSS 存在向下 40px 的入场动画，但这仅是可能原因，不当作已经证明的误报。抽查该阶段截图未见同样明显越界；截图按阶段首次去重，不保证恰好捕捉失败那一帧。未放宽断言、未把退出码 1 改记为通过。

总指令禁止修改其他游戏引擎和样式，本阶段保留问题，后续需在女巫镇任务中捕获失败帧及元素矩形，确认再修复。

## 截图与证据位置

- 拉密本次截图：`output/rk-stage5/rk/ui-v1/`；结构化断言结果归档 `docs/rummikub/verification/stage5-rk-ui.json`。
- 拉密联机报告归档 `docs/rummikub/verification/stage5-rk-browsers.json`。
- 局域网：`output/lan/`、`output/lan-lobby/`。
- 魔法运动员：`output/ma-browsers/`。
- 行动代号：`output/rk-stage5/cn/screens/`。
- 请留遗言：`output/rk-stage5/dm/`。
- 眼疾手快：`output/rk-stage5/rr/screens/`。
- 瞎掰王：`output/rk-stage5/xb/`、`xb-retry/`、`xb-10-retry/`。
- 绘画：`work/drawing-studio-browser/`，结果另归档 `stage5-drawing-result.json`。
- 女巫镇：`output/rk-stage5/wt/`，含各阶段与四个玩家结算截图、`summary.json`。

以上 output/work 为本机证据目录，未将大量重复截图提交；本次脚本覆盖写入的既有阶段截图与报告已归档后恢复，避免污染旧验收记录。真实设备 Safari/Android 未验证，浏览器验收为本机 Chromium 及模拟手机视口。

## 停止点

阶段 5 到此停止。阶段 6 的 XP 5–6 人仍需用户明确同意；Twist 不做。不得把本报告理解为授权推送或部署。
