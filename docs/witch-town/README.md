# 女巫镇开发入口

M4进行中：新增牧师替代抽牌、说书人私人限时排序，详见[M4进度与真实验收](M4_ACTIVE_ROLES.md)。M3健康检查标识暂保留，不能据此声称M4全部完成。人物均已有执行路径，但复制、死亡与其他复杂交互仍有待核条目。

当前：**M3黑卡/夜晚引擎，正式手机游戏尚未完成**。已接通白天、审判、同时传染、夜袭、保护、自白、夜末洗牌、死亡与胜负，以及可恢复的嵌套事件。部分规则组合仍会明确暂停待核；主动能力和手机UI尚未全部完成。正式配置的行动牌单类数量尚未冻结；默认拒绝开始，不伪造官方张数。候选59张配置只供显式本地工程测试，状态视图始终带CHECK_REQUIRED。

## 本地运行

在本仓库根目录，Node24与现有package-lock依赖：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
$env:WT_ENABLE_DEV='1'
$env:WT_ALLOW_CANDIDATE_COUNTS='1'
$env:HOST='127.0.0.1'
$env:PORT='3398'
$env:DBD_DATA_DIR='data/local-wt/dbd'
$env:WT_DATA_DIR='data/local-wt/wt'
npm run server
```

健康检查：<http://127.0.0.1:3398/api/health>，会显示witchTown/M3_EVENT_ENGINE/fullGame:false。根页面仍是原游戏大厅，**尚无女巫镇手机游玩页**；通过真实Socket.IO协议操作和验证。当前分支不要求新增依赖，原开发环境可复用node_modules；换电脑请先npm ci。旧WT_ENABLE_M1开关仍兼容。

## 复现测试

```powershell
npm test -- packages/witch-town apps/server/test/wt-rooms.test.ts
npx tsx scripts/verify-witch-town-m3.ts
npx tsx scripts/simulate-witch-town-m3.ts
npm run typecheck
npm run build
```

M2协议脚本（仍保留）会在3399端口临时启动**现有主服务器**，创建4～12人房间，测试黎明、出牌、结束回合、抽牌、秘密投票消息隔离、并发、隐私、凭证恢复、重复请求及进程重启，完成后关闭临时进程。不会连接或操作线上网站。默认服务不开女巫镇开发开关，未注册任何wt事件。原M1验证脚本保留在3397端口。

## 协议

使用现有Socket.IO连接，事件和类型在packages/shared/src/wt-protocol.ts。响应沿用 `{ok:true,data}` / `{ok:false,error}`。

1. `wt:create {capacity:4..12}` → code。
2. `wt:claim {code,name}` → token/playerId/snapshot；客户端保存私人token。claim是初次占座，不在超时后盲目重发；M6需完善丢失首次回执的占座恢复。
3. `wt:join {code,token?}` → 本人或旁观者快照；私人token只交给自己的连接。
4. `wt:action {code,request:{requestId,version,action:{type:'READY',ready:true}}}`。
5. 全部准备后房主发送同类请求 `action:{type:'START'}`。
6. 同一个requestId只可重发完全相同请求；旧版本冲突先拉取新快照再发新requestId。服务器使用连接绑定身份，不信任客户端actor/token字段。

开始成功后phase=dawn，黑猫未放置，turnPlayerId=null。接续命令（仍包在wt:action/request/action内）：

- `DAWN_TARGET {targetId}`：仅女巫提交，可选自己；全部一致进入白天，黑猫持有者先手。未定投票不改变公开版本号，不向非女巫发送更新。
- `DRAW`：抽两张并自动结束回合。黑卡占一次额度并立即暂停，续程保存在服务器。
- `PARRIS_DRAW {cardIds:string[]}`：牧师每局两次，从公开弃牌堆选择0～2张非黑牌替代抽牌并结束回合；不额外抽牌。
- `TITUBA_START`：选择“抽牌并使用说书人”，每局一次，开启服务器60秒私人排序；本人choice.deck为当前完整牌堆。`TITUBA_REORDER {cardIds:string[]}`只接受整副牌堆的准确排列；顺序更新只发送给本人连接，不增加公开版本号。`TITUBA_FINISH`确认排序并执行本次抽2张；超时按最近已保存顺序自动执行。可移动黑卡，抽到后仍立即结算。该确认/超时交互是线上方案，详见M4报告。
- `PLAY {cardId,targetId,recipientId?,blueId?,removeIds?,asWitness?}`：从本人手牌打出；嫁祸/抢劫需要另一recipientId；诅咒需要选中一张蓝牌blueId；辩护使用removeIds选择整张红牌，医生可选asWitness=true。
- `END_TURN`：至少打出一张后可结束，服务器处理拘留及跳过出局者。
- `ABILITY_DECISION {use:boolean}`：仅当前被询问者决定是否使用奖励/清牌能力。
- `REVEAL_TRYAL {index}`：仅最终指控者选择当前目标隐藏牌列表内的序号，不是隐藏牌实例ID。

黑卡会自动进入对应的秘密操作阶段。新增命令：CONSPIRACY_REVEAL {index}、CONSPIRACY_PICK {index}、NIGHT_TARGET {targetId}、NIGHT_PROTECT {targetId}、CONFESS {index} 或官员 CONFESS {useGovernor:true}。自白窗口为真实服务器时钟30秒，客户端不能发送TICK或自报时间。待核交互不消耗牌；涉及隐藏信息的待核错误会保存服务端具体审计码，客户端只见通用CHECK_REQUIRED:EVENT_RULE_REVIEW并暂停该事件，不能反复试选探牌。未实现的主动能力仍明确拒绝。私人视图private.choice给当前有权限者所需选项，公开pending不含隐藏内容。

工程报告：[PROJECT_AUDIT.md](PROJECT_AUDIT.md)、[MILESTONE_1.md](MILESTONE_1.md)、[MILESTONE_2.md](MILESTONE_2.md)、[MILESTONE_3.md](MILESTONE_3.md)。此前WITCH_TOWN_*研究文档是规则基线；其中“未开始开发”的历史记录由本轮开发报告更新，不是当前工程状态。原始扫描/PDF仍在原研究工作区，不提交公开仓库。

M3协议脚本在3401端口临时运行现有主服务，使用真实30秒窗口，逐人数验证死亡、保护、自白及重连，另在自白中重启服务器。随机仿真脚本默认每人数20局，所有完成/待核/异常按实际结果分类；它使用候选59张数据，不是正式原版全功能验收。
