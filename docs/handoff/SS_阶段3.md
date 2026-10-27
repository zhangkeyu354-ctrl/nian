# 汽水走私犯阶段3交接

日期2026-10-27；分支codex/soda-smugglers。用户授权阶段3：房间设置、服务器联机、SS协议/浏览器验收和三项LAN回归；完成后停止，不推main、不部署。Q09–Q13在开工更新中逐条中文列出默认，按用户要求不等待答复。

## 实现与范围

- `apps/server/src/ss-rooms.ts`：独立SSRoom，ss:create/join/claim/action/update；随机token绑定连接身份；大厅人数/准备/房主设置；SS_DATA_DIR内JSON快照、事务复制与.tmp→rename写盘；恢复校验；服务器250ms周期检查deadline；断线按token恢复本人座位、手牌、已锁定秘密选择及seq。
- `packages/shared/src/ss-protocol.ts`：动作/请求/快照类型，普通客户端类型不包含TIMEOUT/actor/now；运行时仍拒绝伪造这些字段。
- `apps/server/src/main.ts`仅增加SS导入、挂接和health的ssRooms字段，不改其他游戏房间逻辑。
- `apps/web/src/ss/`：沿用rk-net的房间/重连/本地token模式，复用dm的ActionDock/CountdownRing和drawing/feel；入口`/?game=ss`。房主设置：人数3–8、事件默认关、计时不限/60/120、指定首位警长、随机指定按钮。全员准备后开始。
- `apps/web/src/main.tsx`仅加ss懒加载路由；全站style.css仅在4个已有button的:not(:where(...))排除中加.ss-world *。SS样式全部在ss/ss.css，作用域.ss-world。
- `scripts/verify-ss-protocol.ts`、`verify-ss-browsers.ts`与共享验收机器人`ss-test-driver.ts`；package.json新增verify:ss-protocol、verify:ss-browsers。
- `apps/server/test/ss-rooms.test.ts`按红灯→实现→绿灯验证房主权限、设置、并发提交、隐私投影、快照和失败原子性。
- 联机接口文档`docs/soda-smugglers/NETWORK.md`。阶段2引擎源码及其他游戏引擎/样式没有改。

这是阶段3功能联机界面，正式官方美术、完整拖拽、阶段揭晓动画、领奖台/回顾、音效菜单和阶段4全尺寸自审尚未执行。当前截图不冒充阶段4一次交付。未提交的本机点选草稿不是正式行李；本次验证的刷新/服务重启保留对象为已提交锁定行李和手牌分配。

## 关键联机行为

- 事件完整8张可启用，默认关；随机指定设置为开局随机，由服务器种子决定实际警长并在开局公开；房主可改回明确座位。
- 每人请求seq独立、连续，重复不会二次支付；非法指令不耗seq。引擎内部seq由服务器映射，不受大厅准备指令干扰。
- 正常动作要求当前version；同时装包允许同一轮PACK的旧公共version，必须轮次一致，不能将旧轮秘密提交到新轮。
- 向每个连接分别投影；完整state/seed/牌堆/未来事件/盖弃牌不出服务器；其他座位不收到本人token。无凭证view=null，无效token拒绝。
- 正式房间拒绝客户端固定seed；仅明确SS_ALLOW_FIXED_SEED=1验证环境允许。actor、时间、TIMEOUT均由服务器掌握，无调钟后门。
- 计时/保存错误日志只记房间号，不记录手牌、行李、token或完整状态。客户端本地存储读写try/catch；服务器期限和seq随快照保存。

## 验收结果（真实运行）

证据在`docs/soda-smugglers/verification/`，stage3-前缀。

| 命令 | 结果 |
|---|---|
| 3184端口检查 | `Get-NetTCPConnection -LocalPort 3184 -State Listen`：0监听；没有在旧3184 tsx上跑测试，没有终止其他会话进程 |
| TDD房间红灯 | 新ss-rooms.ts尚不存在，1文件加载失败、0用例执行；实现后房间测试1/1通过 |
| SS引擎+房间单元 | `npx vitest run packages/soda-smugglers/test apps/server/test/ss-rooms.test.ts`：5文件/25测试通过，0失败 |
| `npm run verify:ss-protocol` | 退出0；3/5/8人×事件关/开共6局完整终局；61项检查通过，0失败；6402次真实Socket.IO快照与预期投影核对 |
| `npm run verify:ss-browsers` | 退出0；3/5/8人×事件关/开共6局，通过37项检查；4186次WebSocket收包投影核对、3297次DOM检查，0页面错误；每局真实离线+刷新按token恢复已锁定行李 |
| `npm run build` | LAN回归前成功；终局提示修正后最终构建再次退出0。仅有大chunk体积提示，非构建失败 |
| `npm run typecheck` | 最终退出0，0诊断 |
| `npm run verify:lan-protocol` | 退出0，3局（1701/2903/4111）、605条命令、64次预期拒绝、3025次视图核对；逐事件回放一致 |
| `npm run verify:lan-lobby` | 退出0，5人多人想杀手/4人无人杀手且自愿兼控/3人共3场景全部通过 |
| `npm run verify:lan-browsers` | 退出0，2局（4111/1701），每局5端，共337条命令；343个杀手收包检查、10张截图检查通过 |
| DOM完整编号匹配负对照 | 实际读取验收脚本中的RegExp表达式执行：完整编号能命中、前缀相似但不同编号不能命中，2/2通过 |
| 终局提示页面冒烟 | 最终构建恢复一局已结束快照，真实页面验证操作栏为「本局结束」，1/1通过并截图 |

SS协议6局记录：3人关51/开48、5人关55/开53、8人关136/开132条机器人命令（不把设置、初次并发提交等请求混入该计数）；轮数分别6/6/5/5/8/8。
SS浏览器6局记录：3人关53/开48、5人关59/开63、8人关143/开139条页面行动；轮数分别6/6/5/5/8/8。所有正常对局动作由实际页面点击；非法指令测试特意另连真实socket绕过禁用按钮来证明服务器拒绝。

协议超时以仅测试挂接可注入的clock推进，实测PACK→BRIBE→INSPECT→ARREST→ROUND_END；浏览器超时用服务器JSON恢复专例，将已提交一人的存档deadline缩到15秒，重启生产main.ts自动补齐其他人且原提交不变。没有把该加速fixture宣称为等待了完整60秒，也没有生产调钟API。

协议重启专例：关闭真实Socket.IO服务器，重新从同一个目录挂接，token/nextSeq/已锁定行李均恢复；非法token、无凭证视图、生产seed限制也有检查。

## 中途失败及处理（没有隐藏）

1. 协议脚本首轮在尚未全部claim时同步未入座socket，读取undefined token；修正为只同步已claim的座位。生产服务未因此改规则。
2. 浏览器脚本先把无行李的警长也要求显示锁图标；修正测试排除警长。
3. tsx转译后的命名辅助函数缺失、刷新前render_game_to_text尚未注册，分别由测试环境辅助与等待初始化解决；最终0页面错误。
4. 受控复选框异步确认前，Playwright.check立即判未改变；改真实点击后等待服务器版本/状态确认。
5. 子字符串查找把SS0-1误匹配本人SS0-10；改完整编号正则并做2项负对照。网络投影逐版本比较未放宽。
6. 第一次全仓npm test与多组浏览器并行：82文件通过/1文件失败；1262测试通过/1失败，312.40秒；唯一失败是女巫镇12人100种子场景超5000ms（约5212ms），不是规则断言失败。未改女巫镇代码或默认限时。随后同一用例单独复跑，1通过/75跳过，1.67秒。默认npm test已在浏览器组结束后后台重跑，最终数字见下方追加。
7. 截图看出终局操作栏仍写等待警长，已自行改为「本局结束」并按最终构建冒烟验证。

## 截图与检查范围

使用现有`scripts/screenshot-check.ts`的assertUiShot像素检查，保存8张：3/5/8人事件关/开结算6张、deadline恢复1张、终局提示修正1张。原图在`output/playwright/ss-stage3-*.png`，提交副本在`docs/soda-smugglers/verification/stage3-screens/`。已实际查看3人结算与最终提示截图，修复发现的错误；不声称完成阶段4全部图逐张审美验收。

## 未决解释与停止点

沿用CHECK_REQUIRED Q09–Q13，不等待答复：犬长不查同一旅客第二箱；贪得无厌在任何受贿前二选一；瓶盖按面值自动找零/HR-SS-01封顶；犬长超时选第一最大箱且不公布并列；铁面无私只免自付赔款、库存收益照付，破釜沉舟按普通逮捕数量扣款。BGG原PDF与英文完整事件组资料缺口未新增解决，中文版来源不冒称英文证据。

阶段3完成后停止；不开始阶段4，不推main、不部署。只提交本次SS实现、接入和证据，不带开工前其他游戏未提交改动。当前全仓检查基于含这些既存改动的工作区，不冒称干净main回归。

## 最终全仓复跑与完成确认

浏览器组结束后，以完全相同的默认`npm test`重跑，未加testTimeout参数、未改vitest配置：**退出0，83/83文件通过，1263/1263测试通过，0失败，187.36秒**。证据stage3-full-test-final.txt、stage3-full-test-final-exit.txt。首轮1262通过/1超时仍保留，不抹掉历史失败。

最终：SS协议6/6、61检查；SS浏览器6/6、37检查、4186收包/3297 DOM；LAN协议3/3、大厅3/3、浏览器2/2；类型检查0诊断、构建通过；终局提示冒烟1/1。功能联机验收全部完成。阶段3至此停止。
