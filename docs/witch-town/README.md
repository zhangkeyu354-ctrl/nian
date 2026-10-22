## M5关卡1第二轮（手机优先，待审核）

[截图索引](ui/round2/INDEX.md) · [逐张自查](ui/round2/SELF_CHECK.md) · [交接报告](../handoff/WITCH_TOWN_M5_关卡1_第二轮_2026-10-22.md)。90张手机+6张保底+9张交互；仅假数据样稿，不接协议、不部署。首轮以下记录保留为历史。

# 2026-10-22 当前M5关卡1

M4十一项现为**用户已裁定**，见[裁定记录](USER_ADJUDICATIONS_2026-10-22.md)。官方逐类牌数缺证仍保留。说书人重排后可选抽2张或出牌，60秒未选才自动抽牌；旧M4下文“启动即抽牌”的描述已经被本项取代。

视觉样稿入口：`http://127.0.0.1:3410/?game=wt&mock=lobby`（启动：`npm run dev -- --port 3410`）。四尺寸截图、场景及布局基准见[ui/DESIGN.md](ui/DESIGN.md)。此入口未接联机协议。关卡1交截图后等待审核，不进入关卡2。

# 女巫镇开发入口

当前为**M4规则引擎收尾版，正式手机界面尚未完成**。传染/死亡续程、共同分牌、人物组合、白天沙漏及占座恢复已落地；C类按用户授权的默认继续执行，不把默认伪称官方判例。详见[收尾交接](../handoff/WITCH_TOWN_M4_COMPLETE_2026-10-22.md)和[手机界面接口](M4_UI_CONTRACT.md)。M1～M3及M4_ACTIVE_ROLES为历史快照。

房间显式采用candidate-59，并显示“部分张数待官方核实”。逐类quantity未无据升级确认；严格的已核实牌池资料接口与房间的已授权候选路径分开。健康检查M4_RULE_ENGINE，fullGame保持false。

## 本地运行

在本仓库根目录，Node24与现有package-lock依赖：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
$env:WT_ENABLE_DEV='1'
$env:HOST='127.0.0.1'
$env:PORT='3408'
$env:DBD_DATA_DIR='data/local-wt-m4/dbd'
$env:WT_DATA_DIR='data/local-wt-m4/wt'
npm run server
```

健康检查：<http://127.0.0.1:3408/api/health>。根页面仍是原游戏大厅，**尚无女巫镇手机游玩页**。不新增依赖，旧WT_ENABLE_M1兼容。端口占用时换端口，不停止他人进程。

## 复现测试

```powershell
npm test -- --maxWorkers=2
npx tsx scripts/verify-witch-town-m4-active.ts
npx tsx scripts/verify-witch-town-m4-recovery.ts
$env:WT_SIM_ACTIVE='1'
$env:WT_SIM_M4='1'
$env:WT_SIM_ROUNDS='100'
npx tsx scripts/simulate-witch-town-m3.ts
npm run typecheck
npm run build
```

M2协议脚本（仍保留）会在3399端口临时启动**现有主服务器**，创建4～12人房间，测试黎明、出牌、结束回合、抽牌、秘密投票消息隔离、并发、隐私、凭证恢复、重复请求及进程重启，完成后关闭临时进程。不会连接或操作线上网站。默认服务不开女巫镇开发开关，未注册任何wt事件。原M1验证脚本保留在3397端口。

## 协议

使用现有Socket.IO连接，事件和类型在packages/shared/src/wt-protocol.ts。响应沿用 `{ok:true,data}` / `{ok:false,error}`。

1. `wt:create {capacity:4..12}` → code。
2. `wt:claim {code,name,claimKey}` → token/playerId/snapshot；在发送前先保存随机秘密claimKey、code、原昵称，丢失回执时原样重发恢复同一身份。旧无claimKey调用仍兼容，但不能恢复首次丢失回执。
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

黑卡进入对应秘密阶段，CONSPIRACY_REVEAL/PICK、NIGHT_TARGET/PROTECT、CONFESS沿用原协议。新增LOOT_PICK与START_HOURGLASS；夜间private.lootChoices可与自白choice并行，deadline不重置。全部命令、权限、C/D默认及字段见[M4_UI_CONTRACT.md](M4_UI_CONTRACT.md)。已授权规则分支不再待核锁死，非法请求仍事务拒绝。

工程报告：[PROJECT_AUDIT.md](PROJECT_AUDIT.md)、[MILESTONE_1.md](MILESTONE_1.md)、[MILESTONE_2.md](MILESTONE_2.md)、[MILESTONE_3.md](MILESTONE_3.md)。此前WITCH_TOWN_*研究文档是规则基线；其中“未开始开发”的历史记录由本轮开发报告更新，不是当前工程状态。原始扫描/PDF仍在原研究工作区，不提交公开仓库。

M3协议脚本在3401端口临时运行现有主服务，使用真实30秒窗口，逐人数验证死亡、保护、自白及重连，另在自白中重启服务器。随机仿真脚本默认每人数20局，所有完成/待核/异常按实际结果分类；它使用候选59张数据，不是正式原版全功能验收。
