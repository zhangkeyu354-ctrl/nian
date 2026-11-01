# 脑洞量表阶段 3：服务器联机交接（2026-10-31）

## 结果与边界

阶段 3 已完成。首批题库仍为 79 道，其中 spicy 17 道，没有补题。未进入正式 UI 阶段、未推 main、未部署；本轮未提交。临时 loopback 测试服务器、浏览器和自建子进程在测试结束后关闭，原有手机审核通道未改动。

工作目录 E:\DBD-BoardGame-Web，分支 codex/naodong-scale。开工 git pull --ff-only origin main 显示 Already up to date。既有其他游戏引擎、样式及用户工作区改动未改；共享入口仅加入 ND 服务和健康计数，并为多游戏固定监听器设置有限预算 16，未关闭警告机制。package.json 只增加两个验收命令，无依赖或锁文件改动。

## 实现

- apps/server/src/nd-rooms.ts：nd:create / join / claim / action / update，凭证绑定、房主设置、开始/重开、规则命令转发、服务器计时、逐连接白名单广播、原子 JSON 存档与恢复。
- packages/shared/src/nd-protocol.ts：NDSettings、NDAction、NDActionRequest、NDSnapshot、NDAck 与事件常量。所有座位 0 起始；socket 绑定 token 后服务端派生 seat，客户端不可自报 actor/seat/now 或内部 seq。
- apps/server/src/main.ts：注册 attachNaodongScale，ND_DATA_DIR 默认 DBD_DATA_DIR 同级 nd-rooms；/api/health 增加 ndRooms。没有生产游戏路由、前端组件或 CSS 改动。
- 参考 dm-rooms.ts，事务保护参考 ss-rooms.ts；当前仓库无 wf-rooms.ts，未伪称读过或复用了该不存在文件。
- 外层 seq 跨大厅、对局和重开连续；相同已接受请求重试不重复执行，复用序号改变载荷拒绝；同轮并发 READY 可接受合法旧版本，其余命令要求最新版本。失败不消费序号或改变存档。
- JSON 以 .tmp + rename 提交，创建 mode 0600，失败回滚整个内存事务。恢复检查 schema、文件名、设置、凭证、命令记录和引擎不变量。异常仅记录文件名，不打印 token、数字或完整状态。
- token 重连、页面刷新和服务恢复保留同一秘密数字、READY、已锁顺序、揭示进度、seq 与 deadline；公开列表/广播不含 token。收到请求 token 与 socket 当前绑定不符会拒绝。

## 房主设置与超时裁定

默认 4 人、尺度放开、专家关闭、首位队长座位 0、seconds=0 不限时。房主可在大厅设置人数、首位队长、尺度、专家和 60/120 秒提醒计时；普通尺度不发 spicy，设置变更清除大厅准备；开局后设置锁定。固定五轮，不任意改轮数；9 人专家组合仍拒绝。

法语原版没有计时或超时判负条款，已在 CHECK_REQUIRED Q05 明确：服务器 deadline 到时只标 expired、增加 timeoutCount、保存并广播一次，继续等玩家，不跳过、不自动猜数字、不按个人得 0 分，不改变团队标记或已提交内容。阶段变化重开窗口；ANSWER 部分提交不延长窗口；专家每次精确猜测是新窗口。客户端不能伪造 TIMEOUT 或时间。

这沿用已选默认值，区别于官方规则，不声称是规则书原文。测试通过推进注入的服务端时钟后等待真实定时 tick 触发，未通过客户端直接触发超时。

## 浏览器验收方式

scripts/fixtures/nd-client.html 只由临时测试服务器提供，标题明确「协议验收客户端（非游戏 UI）」。每个座位是隔离浏览器上下文，用真实 Socket.IO 和提交按钮走完整对局；没有在正式大厅添加入口。

每个收到的 ND 快照及 DOM JSON 与对应服务器版本、对应座位的 viewForND 比较；不把数字在人数/轮次中偶然出现误判为泄密。Socket.IO 数据帧与 Engine.IO 握手/心跳分别处理。测试控制器只在 Node 中汇总各玩家各自合法视图用于成功排序，浏览器中没有注入他人的数字。测试不声称模拟了真实语音理解或完成阶段 4 体验。

## 实际执行结果

| 命令 | 真实结果 |
| --- | --- |
| npx vitest run apps/server/test/nd-rooms.test.ts packages/naodong-scale/test/engine.test.ts | 60 passed / 0 failed，其中引擎 43、房间 17 |
| npm run verify:nd-protocol | 47 项检查通过，4 局完整对局，54,082 次网络投影核对，0 失败 |
| npm run verify:nd-browsers | 21 项检查通过，4/6/9 人各完成五轮；2,172 次网络快照、3,202 次 DOM 核对，0 脚本/隐私错误 |
| npm test | 98 个文件、1,423 项通过，0 失败（216.68 秒） |
| npm run typecheck | 通过 |
| npm run verify:replays | 3 局旧游戏逐事件重放一致，双方胜负均覆盖 |
| npm run verify:lan-protocol | 3 局旧游戏完成，3,025 次座位视图核对；无监听器超限提示 |

旧 LAN 三局命令数 228 / 268 / 109（合计 605），事件数 450 / 535 / 223；预期拒绝 24 / 28 / 12（合计 64）。仅该命令设置隔离 ND_DATA_DIR=tmp/nd-stage3-lan-rooms，避免写入实际 ND 数据目录。

ND 协议完整对局：

| 人数 | 模式 | 轮数 | 成功动作数 | 结果 |
| --- | --- | --- | --- | --- |
| 4 | 基础 | 5 | 60 | 全队成功 |
| 6 | 基础 | 5 | 82 | 全队成功 |
| 9 | 基础 | 5 | 105 | 全队成功 |
| 4 | 专家 | 5 | 55 | 全队成功 |

ND 浏览器完整对局：

| 人数 / 隔离上下文 | 轮数 | 浏览器提交次数（含预期拒绝） | 结果 |
| --- | --- | --- | --- |
| 4 | 5 | 65 | 全队成功 |
| 6 | 5 | 87 | 全队成功 |
| 9 | 5 | 109 | 全队成功 |

覆盖非房主设置、伪造座位/时间、非法操作、锁后再次提交、锁后改序、幂等重试、服务器超时、token 断线、刷新自动回座、存档恢复和正常尺度过滤。17 项单元测试另覆盖保存失败回滚、离座清理、过期 deadline 恢复不重复提醒，以及失败后重开不重置外层 seq。

额外恢复验证：重建 Socket.IO 服务与仓库，确认完整已提交文件恢复并跳过损坏文件；随后用同一真实协议建立的测试快照，实际启动/停止并再次启动 2 个全新 main.ts 子进程，完成 33 次恢复投影核对，继续翻开 1 张并确认再次落盘。不是只构造一个内存类来冒充进程重启。

## 失败与修正记录

先写房间测试，模块不存在时真实失败，随后实现通过。验收工具开发中修正了尚未入座连接的同步范围、JSON 与 null-prototype 的序列化比较，以及 Engine.IO 握手误当 Socket.IO 数据帧的问题。初次全服务集成因固定多游戏处理器数量超过 Node 默认 10 个而出现监听警告；显式有限预算 16 后重新跑 LAN 和真实主服务恢复，警告消失。初次类型检查发现测试代码的非法动作强转及可空断言消息，修正后全仓通过。上述都不是在报告中掩盖失败或删去隐私断言。

没有生产秘密或原始网络包写入验收报告；磁盘上的测试快照留在隔离临时目录。截图仅为合成测试座位的协议页，不是正式游戏界面，也不冒充阶段 4 视觉验收。

## 证据与下一步

- docs/naodong-scale/stage3/VALIDATION.json：汇总。
- PROTOCOL.json、BROWSERS.json：逐场结果与检查明细。
- RED-room-module.txt、TARGETED.txt、FULL-TEST.txt、TYPECHECK.txt、REPLAYS.txt、LAN-PROTOCOL.txt、PROTOCOL-OUTPUT.txt、BROWSERS-OUTPUT.txt：真实输出。
- screens/4-before-reveal.png、6-before-reveal.png、9-before-reveal.png，以及对应 finished.png：协议测试页截图。
- SERVER_PROTOCOL.md、STAGE3_BASELINE.md、CHECK_REQUIRED.md：协议合同、默认值和实施边界。

测试服务和本轮自建子进程已关闭。等待用户授权阶段 4，再做正式 UI；本轮不推 main、不部署。
