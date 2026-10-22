# 女巫镇开发入口

当前：**M2白天规则引擎，非完整可玩游戏**。已接通黎明、抽/出牌、审判、已确认基础人物能力及中断存档。夜晚与阴谋在M3结算。正式配置的行动牌单类数量尚未冻结；默认拒绝开始，不伪造官方张数。候选59张配置只供显式本地工程测试，状态视图始终带CHECK_REQUIRED。

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

健康检查：<http://127.0.0.1:3398/api/health>，会显示witchTown/M2_DAY_ENGINE/fullGame:false。根页面仍是原游戏大厅，**尚无女巫镇手机游玩页**；通过真实Socket.IO协议操作和验证。当前分支不要求新增依赖，原开发环境可复用node_modules；换电脑请先npm ci。旧WT_ENABLE_M1开关仍兼容。

## 复现测试

```powershell
npm test -- packages/witch-town apps/server/test/wt-rooms.test.ts
npx tsx scripts/verify-witch-town-m2.ts
npm run typecheck
npm run build
```

M2协议脚本会在3399端口临时启动**现有主服务器**，创建4～12人房间，测试黎明、出牌、结束回合、抽牌、秘密投票消息隔离、并发、隐私、凭证恢复、重复请求及进程重启，完成后关闭临时进程。不会连接或操作线上网站。默认服务不开女巫镇开发开关，未注册任何wt事件。原M1验证脚本保留在3397端口。

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
- `PLAY {cardId,targetId,recipientId?,blueId?,removeIds?,asWitness?}`：从本人手牌打出；嫁祸/抢劫需要另一recipientId；诅咒需要选中一张蓝牌blueId；辩护使用removeIds选择整张红牌，医生可选asWitness=true。
- `END_TURN`：至少打出一张后可结束，服务器处理拘留及跳过出局者。
- `ABILITY_DECISION {use:boolean}`：仅当前被询问者决定是否使用奖励/清牌能力。
- `REVEAL_TRYAL {index}`：仅最终指控者选择当前目标隐藏牌列表内的序号，不是隐藏牌实例ID。

黑卡待结算时明确返回BLACK_EVENT_PENDING:M3_REQUIRED；未实现的主动能力返回M2_ACTION_NOT_IMPLEMENTED；待核交互返回具体CHECK_REQUIRED，事务不消耗牌。私人视图private.choice给当前有权限者所需选项，公开pending不含隐藏内容。

工程报告：[PROJECT_AUDIT.md](PROJECT_AUDIT.md)、[MILESTONE_1.md](MILESTONE_1.md)、[MILESTONE_2.md](MILESTONE_2.md)。此前WITCH_TOWN_*研究文档是规则基线；其中“未开始开发”的历史记录由本轮开发报告更新，不是当前工程状态。原始扫描/PDF仍在原研究工作区，不提交公开仓库。
