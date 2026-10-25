# 拉密第 3 阶段交接

日期：2026-10-25；分支 codex/rummikub；本阶段结束即停止，未推送、未部署。

## 实现

- apps/server/src/rk-rooms.ts：遵循 DM 房间结构的独立拉密房间；2–4 人、房主设置/开始/下一局、准备、token 恢复身份、在线连接计数、房间上限与闲置清理。局数 1–100，默认一轮等于人数个小局；计时 1/2 分钟/不限。
- packages/shared/src/rk-protocol.ts：rk:create/join/claim/action/update，独立命名空间，typed action/snapshot/ack。禁止客户端 TIMEOUT、actor、now 和内部 seq 注入。
- apps/server/src/main.ts：仅增加 import、attachRummikub 注册和健康检查 rkRooms 字段，不改其他游戏逻辑。RK_DATA_DIR 默认 data/rk-rooms；RK_ALLOW_FIXED_SEED=1 仅测试使用，生产拒绝指定 seed。
- 原子 JSON 存档：临时文件 + rename；事务落盘失败恢复内存前态，成功保存后再发包。保存完整权威状态、当前草稿、撤销/重做历史、seq；原始文件不由 Web 静态目录提供。
- 私有 MOVE/SPLIT/MERGE/UNDO/REDO/RESET 不增加公共 version，仅同 token 连接收到更新；nextSeq/privateRevision 仅给本人。其他玩家没有草稿包，只在 COMMIT/罚牌/计时/大厅变化时收到各自投影视图。
- 服务器每 500ms 检查 deadline，请求到达也先处理已到时回合；客户端不能自行提交超时。非法 COMMIT 先保存罚牌并广播，ack ok:false + consumed:true + 最新 snapshot；同 seq 重试无副作用。
- scripts/verify-rk-browsers.ts：启动真实主服务器、4 个独立 Chromium 上下文和 WebSocket 客户端；使用测试种子和显式边界夹具。中途实际结束并重启服务器进程，检查草稿和 nextSeq 恢复。
- 补充 STAGE3_PLAN.md 需求/对齐/非 UI 基线及引擎 README 的联机协议契约，沿用先前压力测试和本次“继续”的授权。

## 实际验收

证据文件均在 docs/rummikub/verification/。

| 命令 | 结果 | 证据 |
|---|---|---|
| Red：npx vitest run apps/server/test/rk-rooms.test.ts | 1 套件因 rk-rooms.ts 尚未创建而失败，未执行用例，预期 Red | stage3-red.txt |
| 最终目标测试（显式列 rk-rooms.test.ts、rk-network.test.ts） | 2/2 文件、7/7 测试通过，0 失败；746ms | stage3-targeted.txt |
| npm test | 57/57 文件、890/890 用例通过，0 失败；321.24 秒 | stage3-full-test.txt |
| npm run typecheck | exit 0，无类型错误 | stage3-typecheck.txt |
| npm run build | exit 0；3.21 秒，存在既有大 chunk/插件耗时提示，非构建错误 | stage3-build.txt |
| npx tsx scripts/verify-rk-browsers.ts | exit 0；11/11 检查通过，0 失败，Chromium pageerror 为 0 | stage3-browsers.json / .txt |
| npm run verify:lan-protocol | exit 0；3/3 局通过，3025 次视图检查，预期拒绝 24+28+12=64 次 | stage3-lan-protocol.txt |
| npm run verify:lan-lobby | exit 0；3/3 人数与阵营场景通过 | stage3-lan-lobby.txt |
| npm run verify:lan-browsers | exit 0；2/2 局完成，每局 5 浏览器，均通过；分别检查 112/231 个杀手帧及 5/5 截图验收组 | stage3-lan-browsers.txt |
| npx prettier --check（新增 TS 文件） | 全部匹配文件通过 | 终端实际输出 |
| git diff --check / staged --check | 最终无空白错误 | 提交前执行 |

中途一次 Vitest 筛选参数中的 rk-*.test.ts 未展开，报 no test files；已改为显式两个文件重新通过，不将该次当作通过。首轮实现也修正了一处 TIMEOUT 类型比较写法，最终类型检查通过。未伪称所有中间命令都一次通过。

## 拉密浏览器 11 项检查

1. 真实服务端 deadline 到期，回滚并罚摸 3，切下一座。
2. 27 分破冰被拒，具体缺分原因，事务罚牌回滚。
3. 非连续组合被拒；对手在私有编辑期间收到草稿更新 0 包，罚牌后也不见私有牌名原因。
4. Joker 替换释放并用于新组，同时出完手牌正常胜利（不是堵局）。
5. 浏览器 reload 后用 token 恢复私有草稿和 nextSeq。
6. 真实服务器进程重启后恢复相同草稿和 nextSeq。
7. 空池完整一轮无人出牌，堵局计分结束。
8. 2 人完整网络对局：seed 2001，135 回合，终局分数 -26/+26。
9. 3 人完整网络对局：seed 3001，115 回合，终局分数 +10/-4/-6。
10. 4 人完整网络对局：seed 4001，99 回合，终局分数 +31/-17/-9/-5。
11. Chromium pageerror 为 0。

上述 3 局完整模拟由各座位浏览器的本人视图规划动作，全部通过真实 Socket.IO 接口完成；均以空池堵局结束。AI 仍只是牌架贪心/简单接牌，不是全桌面求解器；正常胜利由第 4 项独立边界案例验证。边界夹具在测试服务器启动前写入隔离临时目录，不是生产后门或公开注入接口。

## 截图与未完成范围

本阶段拉密没有 UI 截图。浏览器验收是 Chromium 内的真实协议客户端，不代表阶段 4 成品界面、触控操作或官方美术完成，也未用占位界面冒充功能。
既有 DBD 浏览器回归的图片位于 output/lan/（4111、1701 的中局、全图、结算等），大厅在 output/lan-lobby/；均由既有 screenshot-check.ts 验证，属于原游戏回归证据，不是拉密 UI。服务器启动日志仅本地 output/playwright/rk-stage3-server.txt，不含牌架。

Q01–Q09 无新官方裁定，继续按登记默认值；普通超时罚 3 与官方普通超时摸 1 的差异保留。第 4 阶段再做 /?game=rk 正式 UI、音效/震动、素材与全部截图自审。本阶段未改其他游戏引擎/样式，未实施 XP。

## Git 范围

只加入拉密房间、协议、测试、验收脚本、交接/计划/证据/README，以及 main.ts 的注册改动。已有未跟踪总指令、其他 AI 的清晰度方案、tmp/ 保持原状；reference/、data/、output/ 未加入提交。

停止在第 3 阶段，等待用户下一条指令。
