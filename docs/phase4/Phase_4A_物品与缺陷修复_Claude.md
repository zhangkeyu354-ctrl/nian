# Phase 4A：物品效果 + 审计缺陷修复（Claude，2026-10-19，Codex 限额期间）

只改了规则引擎、引擎测试和游戏数据的实现状态；**没有动任何界面文件**（Codex 正在进行的手机改版不受影响）。

## 做了什么

| 项 | 结果 |
|---|---|
| AUDIT-B01 克劳黛特「精研百草」在别人回合可用 | 已修：只在克劳黛特自己的回合（含奖励回合）出现时机 |
| AUDIT-B02 梅格躲柜后妖巫传送攻击卡局 | 已修：目标合法离开后，若空间里还有别的逃生者，妖巫重新选择对象（新选择 `PHANTASM_TARGET`）；没有就本次交互作废（`INTERACTION_LOST`），游戏继续。不会攻击柜内的人 |
| 新发现：救下"计划阶段就在钩子上"的逃生者后整局崩溃 | 已修：这位逃生者本轮没有放移动牌，本轮跳过他的回合（救援时已经获得一次移动） |
| 10 种物品效果 | 9 种完整可用；鞭炮的"阻止杀手进入"可用，"移除墙壁"等用户裁定 Q10 |
| 医生「压迫性气场」 | 可用（原先只因物品没做而延后） |
| 剩余延后技能 | 4 个：冲刺爆发、轻盈敏捷、穷追不舍、第三封印（都卡在 Q11 文字语义） |

时机模型写在 `docs/HOUSE_RULES.md` 的 **U-ITEM-TIMING**；需要用户确认的问题 Q10、Q12–Q14 在 `docs/RULE_QUESTIONS.md` 末尾。

## 引擎接口变化（给 Codex 接界面用）

- 命令 `USE_ITEM`：`{ type, actorId, itemId, ...参数 }`。参数按物品不同（`propId` / `targetId` / `option` / `index`）。**不要自己拼**：用 `itemActions(state, actorId)`，它返回该角色此刻所有合法的物品按钮（完整命令 + 中文文字），直接做成按钮即可。
- `getControls()` 已经在三种情况下自动带上物品按钮：自己回合的移动阶段与交互阶段、物品响应窗口。所以现有界面不用改就能用大部分物品。
- **界面必须补的一处**：不是自己回合时也能用物品（"在任意逃生者的回合中""任何时候"）。联机时 `App.tsx` 对"不是我"的玩家返回空操作；请在手机操作坞里加一个常驻的"我的物品"按钮：对自己座位的每个角色调用 `itemActions(view, actorId)`，非空时可点。服务器只校验座位凭证、版本号和角色归属，不限制轮次，所以直接发送即可。
- 旧界面里那个只发 `{type:"USE_ITEM", actorId}` 的"使用物品"按钮现在会报"缺少参数"，请换成 `itemActions`。
- 新的选择类型：`MAP_REVEAL`（地图依次翻开至多 3 个道具，`SELECT {propId}`，`SELECT {}` 表示翻完）、`PHANTASM_TARGET`（妖巫重选对象）。`getControls` 都已列出按钮。
- 新的窗口字段 `window.itemActors`：这次暂停是在问哪些持有物品的人。只看"有没有物品"，不看是哪张，所以不泄露手牌。
- 新事件（都公开）：`ITEM_USED`、`ITEM_NEGATED`、`INTERACTION_PREVENTED`、`MOVE_BLOCKED`、`KILLER_WOULD_ENTER`、`DIE_REROLLED`、`KILLER_CARDS_REVEALED`、`INTERACTION_LOST`。建议在反馈弹窗里给 `ITEM_USED` 一个"物品牌翻开"的动画。
- `privacy.ts` 没改：`ITEM_USED` 本来就不在隐藏列表里，打出即公开，符合 U-ITEM。

## 验证（Claude 环境实际运行）

- `npm test`：113 项全部通过（新增 29 项：`packages/game-engine/test/items.test.ts`，每种物品的正反用例、医生、B01/B02 回归、界面按钮）。
- `npm run typecheck` 通过。
- `npm run verify:replays`：三局回放命令**完全没变**；只有 4111 的开局事件里"未实现技能列表"少了压迫性气场，因此重新生成了 `docs/phase1/games/4111.events.jsonl` 和 `REPLAY_VERIFICATION.json`。
- `npx tsx scripts/fuzz-items.ts 40`：随机合法对局压力测试（随机 4 名逃生者 × 6 个杀手 × 两张地图，随机穿插物品使用，包括不在自己回合时）。40 局、78,675 条命令、62 次物品使用（9 种物品都用到；宽敞工具箱只有 1 张，由单元测试覆盖），**0 次卡死、0 个意外错误**，他人物品在视图中始终隐藏。（随机乱走的对局有 10 局在 4000 步上限内没分出胜负，这是随机策略本身的问题，不是卡死。）就是这个测试抓到了"救下计划阶段就在钩子上的逃生者后崩溃"的老问题。
- `verify:lan-protocol`：3 局完整对局，2630 次座位视图检查，57 次越权/重复提交全部被拒。
- `verify:lan-browsers`：5 个浏览器（含 2 台手机尺寸）完整打完 4111、1701 两局，杀手浏览器收到的 306 条消息逐条检查无泄露，截图通过像素检查。
- `verify:hotseat`（3 局）、`verify:actions`、`verify:mobile`、`verify:visuals`、`verify:board` 全部通过。`verify:actions` 原来断言"使用物品显示尚未实现"，现改为断言"旧按钮发送缺参数命令时被拒且状态不变"。

## 给 Codex 的注意

- 你的范围保护记录 `docs/phase2d/SCOPE_GUARD.json` 里规则引擎文件的哈希会变，这是预期的（本次 Claude 修改，用户授权"两者都做"里的规则补全部分）。
- 你的 `verify-mobile-taps.ts` 用的 1701/4111 回放命令没有变化。
