# 女巫镇开发入口

当前：**M1工程基础，非完整可玩游戏**。正式配置的行动牌单类数量尚未冻结；默认拒绝开始，不伪造官方张数。候选59张配置只供显式本地工程测试，状态视图始终带CHECK_REQUIRED。

## 本地运行

在本仓库根目录，Node24与现有package-lock依赖：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
$env:WT_ENABLE_M1='1'
$env:WT_ALLOW_CANDIDATE_COUNTS='1'
$env:HOST='127.0.0.1'
$env:PORT='3398'
$env:DBD_DATA_DIR='data/local-wt/dbd'
$env:WT_DATA_DIR='data/local-wt/wt'
npm run server
```

健康检查：<http://127.0.0.1:3398/api/health>，会显示witchTown/M1_SETUP_ONLY/fullGame:false。根页面仍是原游戏大厅，**尚无女巫镇手机游玩页**；M1通过真实Socket.IO协议操作和验证。当前分支不要求新增依赖，原开发环境可复用node_modules；换电脑请先npm ci。

## 复现测试

```powershell
npm test -- packages/witch-town apps/server/test/wt-rooms.test.ts
npx tsx scripts/verify-witch-town-m1.ts
npm run typecheck
npm run build
```

协议脚本会在3397端口临时启动**现有主服务器**，创建4～12人房间，测试并发、隐私、凭证恢复、重复请求及进程重启，完成后关闭临时进程。不会连接或操作线上网站。默认服务不开WT_ENABLE_M1，未注册任何wt事件。

## 协议

使用现有Socket.IO连接，事件和类型在packages/shared/src/wt-protocol.ts。响应沿用 `{ok:true,data}` / `{ok:false,error}`。

1. `wt:create {capacity:4..12}` → code。
2. `wt:claim {code,name}` → token/playerId/snapshot；客户端保存私人token。claim是初次占座，不在超时后盲目重发；M6需完善丢失首次回执的占座恢复。
3. `wt:join {code,token?}` → 本人或旁观者快照；私人token只交给自己的连接。
4. `wt:action {code,request:{requestId,version,action:{type:'READY',ready:true}}}`。
5. 全部准备后房主发送同类请求 `action:{type:'START'}`。
6. 同一个requestId只可重发完全相同请求；旧版本冲突先拉取新快照再发新requestId。服务器使用连接绑定身份，不信任客户端actor/token字段。

开始成功后phase=dawn，黑猫未放置，turnPlayerId=null。未完成的游戏指令明确返回M1_ACTION_NOT_IMPLEMENTED，不把未实现能力当作成功的空操作。

工程报告：[PROJECT_AUDIT.md](PROJECT_AUDIT.md)、[MILESTONE_1.md](MILESTONE_1.md)。此前WITCH_TOWN_*研究文档是规则基线；其中“未开始开发”的历史记录由本轮开发报告更新，不是当前工程状态。原始扫描/PDF仍在原研究工作区，不提交公开仓库。
