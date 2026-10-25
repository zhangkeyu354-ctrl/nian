# 拉密第 2 阶段交接

日期：2026-10-25；分支 codex/rummikub；本阶段完成后停止。未推送、未部署，未改任何既有游戏引擎、样式、服务器或协议。

## 改动

- packages/rummikub/src/index.ts：纯 createRK/reduceRK/viewForRK，106 张唯一 ID、确定性抽先手/发牌、全部 Joker 合法解释、破冰、回合草稿、MOVE/SPLIT/MERGE/UNDO/REDO/RESET、原子 COMMIT、摸牌/到期罚牌、正常/堵局计分、多局累计和胜局排名。
- 每 actor 的 seq 账本跨回合/小局保留，重复/过时请求不重复生效。开启 assertions 后逐次检查正式状态、快照、草稿、撤销/重做历史的 106 张守恒与牌 ID 唯一性；权限在复制输入前检查。
- 草稿不进入对手视图。发现并修复非法确认的中文牌名拒因泄露：详细原因只发给操作者，其余玩家仅看罚牌类别和实际张数。
- src/simulation.ts + scripts/verify-rk-engine.ts：本人牌架组牌、简单接牌或摸牌的确定性 AI；每局必须实际到 FINISHED，并校验守恒和零和分数；上限 2000 回合，超限即抛错而非当作通过。
- test/engine.test.ts、transactions.test.ts：38 项行为测试；含官方 Joker 四种释放示例、桌面牌替 Joker、初始 29/30、多组破冰、中文原因、权限、幂等、输入不可变、私有视图、计时、空池、计分、下一局，以及 2/3/4 人确定性草稿随机游走。
- README.md 记录完整命令/隐私/可信 actor/now 契约；更新 RULE_MATRIX 与 CHECK_REQUIRED 实际落点。
- planning/ 下补齐四关卡，来源是已有总指令和本次“继续”的授权。压力测试 Proceed（中等信心）；alignment 为 Aligned with Changes，不虚构新访谈/签字。

## TDD 与验证（实际运行）

| 项目 | 真实结果 | 证据 |
|---|---|---|
| 首轮 Red | 1 个套件因尚无 src/index.ts 导入失败，未执行用例；符合预期 | verification/stage2-red.txt |
| 第一轮 Green | 18/18 测试通过；随后发现并修正两处 TS 联合类型收窄错误 | tmp/pdfs/rummikub/stage2-green.log |
| 新增回归 Red | 29 项中 27 过、2 失败：1 项为真实拒因泄漏；另一项为测试夹具抽掉顺子中间牌导致本来非法，已修正夹具为抽端牌 | tmp/pdfs/rummikub/stage2-regression-red.log |
| 最终拉密测试 | 2/2 文件、38/38 用例通过，失败 0；1.71 秒 | verification/stage2-targeted.txt |
| 全仓 npm test | 55/55 文件、883/883 用例通过，失败 0；187.29 秒 | verification/stage2-full-test.txt |
| npm run typecheck | exit 0，无 TS 错误 | verification/stage2-typecheck.txt |
| npx prettier --check（新增 TS 文件） | 全部匹配文件通过 | 终端实际输出 |
| npm run verify:replays | 3/3 既有回放逐事件、SHA256 重现，失败 0 | seeds 1701 / 2903 / 4111；终端输出 |
| git diff --check / staged --check | 最终无空白错误 | 提交前执行 |

## 600 局最终版本种子模拟

命令：`npx tsx scripts/verify-rk-engine.ts`，exit 0；600/600 到终局，失败 0，总用时 57451 ms。

| 人数 | 种子（全部整数，含端点） | 完成 | 正常出完 | 空池堵局 | 最长回合 |
|---|---|---|---|---|---|
| 2 | 2001–2200 | 200/200 | 26 | 174 | 144 |
| 3 | 3001–3200 | 200/200 | 11 | 189 | 133 |
| 4 | 4001–4200 | 200/200 | 16 | 184 | 119 |

逐局种子、赢家、分数和回合数：docs/rummikub/verification/stage2-simulations.json；汇总：stage2-simulation.txt。AI 是贪心牌架组牌/简单接牌，不是完整桌面重组求解器；大量堵局不能作为数学意义“全局无合法解”的证据。按已登记 Q04，以空池整轮 PASS 视为共同确认终局。

## 未解决项与接口边界

- Q01–Q09 未新增官方裁定；继续按登记默认。普通超时官方摸 1 与项目罚 3 不一致，明确采用总指令，不冒称完全相同。
- Joker “新组合”的身份边界、先手 Joker 排除、堵局并列分摊、罚牌不足等仍是项目默认。见 CHECK_REQUIRED。
- 第 3 阶段必须由房间层验证 token/房主权限，生成不可由客户端指定的随机种子和可信时间；不能直接广播 RKState，也不能把客户端 actor:'server' 透传。
- 目前没有网络适配、持久化、浏览器整局或 UI。真实联机/断线、私有草稿网络流量验收留第 3 阶段；界面和官方 WebP 获取留第 4 阶段。
- 截图：无。本阶段为纯引擎，未生成游戏界面，不用 PDF 阅读图或静态页面冒充 UI 验收。
- 本地已有未跟踪总指令、其他 AI 的清晰度方案及 tmp/ 保持不动，不加入提交；reference/ 原始资料没有加入提交。

下一步：停在第 2 阶段，等待第 3 阶段授权。
