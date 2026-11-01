# ND 服务器协议（阶段 3）

实现：`apps/server/src/nd-rooms.ts`。类型：`packages/shared/src/nd-protocol.ts`。主入口已调用 attachNaodongScale；不含生产游戏页面。

## 房间事件

| 事件 | 请求 | 成功结果 |
| --- | --- | --- |
| nd:create | `{}` | 4 位房间号；随后入座的第一人为房主 |
| nd:claim | `{code,name}` | 仅该连接获得 token、playerId 和自己的 snapshot |
| nd:join | `{code,token?}` | 绑定原座位并返回 snapshot；显式无效 token 拒绝，不冒充旁观加入 |
| nd:action | `{code,token,version,seq,round?,action}` | changed、当前 snapshot |
| nd:update | 服务端发出 | 逐连接计算的 snapshot；不使用全房间共享的完整 state |

无 token 可加入公开大厅，但 view 为 null；开局后不能新入座。掉线不释放座位，原 token 可恢复。连接一次只绑定一个 ND 房间；切房和断线会更新连接状态，不清除对局信息。token 不能放在邀请 URL 或公开日志中。

所有座位序号从 0 开始。mySeat 是数字或 null；players[].ready 是大厅准备状态，游戏中的回答锁定看 view.players[].ready。hostId 是公开玩家 ID，不是凭证。snapshot.nextSeq 只给本人下一条外层序号。

## 设置与动作

SET_SETTINGS 只允许房主在大厅使用，可设 count 4–9、seconds 0/60/120、scale open/normal、expert、firstCaptain。默认 4 人、不限时、放开、专家关、首位队长 0。改变设置会清除大厅准备。普通尺度从已批准题库中过滤 spicy。五轮固定，不开放任意轮数。9 人专家组合拒绝。

大厅 READY 切换准备，START 要满员且全员准备。正式服务器用 crypto.randomInt 生成种子；仅 ND_ALLOW_FIXED_SEED=1 的测试环境可提交 START.seed。游戏动作与阶段 2 同名，但请求内不能自报 seat、actor、内部 seq 或 now，服务端按绑定 token 生成引擎命令。

LOBBY LEAVE 只退出自己；开局后保留座位供重连，不允许中途换人。FINISHED 后房主可 REMATCH，清理对局和准备状态，外层序号不清零。

版本必须合法且不大于当前值。普通动作要求当前版本；同轮 ANSWER 阶段 READY 允许合法旧版本，避免同时提交互相覆盖。轮次由请求携带并核对。不同轮、角色或已锁定操作由服务器和引擎共同拒绝。

每个玩家的外层 seq 从 1 连续递增，覆盖大厅和整局/重开；成功请求记录规范化指纹。完全相同的成功请求重试返回 changed=false，不重复执行；同序号不同内容拒绝。失败不消费序号。引擎内部 seq 与外层分开，由服务器维护。应答中合法本人 snapshot 帮助客户端重新同步；不能靠篡改请求 token 获取其他座位快照。

## 服务器计时

原版未规定计时，所以默认 0（不限时）。可选 60/120 秒是提醒功能，不引入胜负或个人 0 分。

deadline 为服务端 epoch 毫秒，仅用于 CHOOSE_TOPIC、ANSWER、ORDER、EXPERT、CAPTAIN_GUESS。阶段变化重开窗口；专家每次精确猜测后为下一次猜测重开窗口。ANSWER 中部分提交不延长时间。REVEAL、ROUND_END、FINISHED 无计时。

到时由服务端 tick 标记 expired=true、增加 timeoutCount、保存并广播，且只触发一次。数字、READY、排序和团队标记均不改变；玩家仍能提交。进入下一阶段才清除 expired 并按设置生成新 deadline。客户端 TIMEOUT、伪造时间或截止时间字段都拒绝。

## 持久化与隐私

ND_DATA_DIR 指定独立快照目录；默认是 DBD_DATA_DIR 的同级 nd-rooms，必须置于静态目录之外。主服务仅提供前端构建目录，没有 ND 存档 HTTP 路由。

快照包含成员凭证、完整引擎状态、已提交 READY、锁定排序、命令记录及计时。先写同目录临时文件，再原子 rename；写失败回滚整个内存事务。文件创建 mode 0600；这不是加密，也不代表 Windows ACL 自动被修改。原始存档不得提交仓库或分享。

恢复时校验 schema、文件名/房间号、设置、token/ID 唯一、命令记录和引擎不变量；坏文件跳过，仅记录文件名。恢复后按原 token 重连，同一数字、排序、序号和计时保留；已过期的提醒不会再次触发。

所有成功、错误应答及 nd:update 都只携带各连接允许的投影。JSON 完整 state、RNG、未来题组、未发数字、其他人的秘密数字与任何人的 token 不进入广播。口头回答不保存文字或录音，额外字段会拒绝。

## 验收边界

verify:nd-protocol 使用真实 Socket.IO 客户端并核对服务端各版本的合法投影；包含实际 main.ts 新进程启动/停止/重启恢复。verify:nd-browsers 使用 scripts/fixtures/nd-client.html，每个座位是隔离浏览器上下文，提交走真实按钮和 WebSocket；每个收到的 ND 快照和 JSON DOM 都与该座位、该版本的投影比较，不用“字符串里是否出现某个数字”这种会误判的方法。

测试控制器只在 Node 中汇总多个各自合法的私密视图，以生成可控成功排序；没有把其他人的数字注入浏览器，也不把控制器能力当成真实玩家能力。页面只为协议验收服务，不是阶段 4 游戏 UI；生产主服务不提供此测试页。
