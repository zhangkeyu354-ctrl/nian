# 汽水走私犯联机接口（阶段3）

入口`/?game=ss`。当前是功能联机界面，复用dm的ActionDock/CountdownRing与feel反馈；正式官方美术、拖拽、动画、回顾和完整UI自审仍归阶段4，不能把本阶段截图称为阶段4验收。

## 房间与凭证

- 独立`ss:`事件与SS_DATA_DIR，默认data/ss-rooms；JSON含服务器完整秘密，仅本地磁盘持有，不作为HTTP静态资源或日志发出。
- `ss:create {}`→房间号；`ss:claim {code,name}`→随机32字节token、玩家ID和本人快照；`ss:join {code,token?}`恢复座位；没有token只能看大厅公开列表，view=null；无效token直接拒绝。
- 每个socket只能使用已join绑定的token发`ss:action`，不能拿别人的token伪装座位。房间广播为每个连接分别调用viewForSS，不广播完整state。
- 客户端localStorage按`ss:房间号`保存本人token，读写均try/catch；刷新与自动重连都按token恢复，服务器JSON保留已提交秘密选择和操作序号。

## 房主设置

SET_SETTINGS：人数3–8；随机事件events布尔默认false；seconds为0/60/120默认0；firstGuard为有效座位（默认0）或"random"。界面有房主指定下拉和「随机指定」按钮，后者发RANDOM_GUARD，将选择设置为开局随机，开始时由服务器秘密随机种子决定并公开实际警长。

设置修改会清除所有准备状态；非房主、开局后改设置、人数小于已入座人数均拒绝。人齐且全员准备后房主START。正式房间拒绝客户端seed；只有本机验证显式SS_ALLOW_FIXED_SEED=1时允许测试种子。

## 指令格式和幂等

`ss:action {code,token,version,seq,round?,action}`：房间序号每人独立正整数、连续；已执行序号重复不再次执行、不重复转账；非法操作不消耗seq、不写坏快照。actor/now/内部seq由服务器决定，放进action中会被拒绝，TIMEOUT不接受客户端调用。客户端每次用快照nextSeq和view.round。

普通指令要求当前version；同时装包允许旧公共version，但必须仍在PACK且round准确，避免另一人提交导致合法同时选择被版本冲突拒绝，也防止旧轮次重放到新轮。引擎内部seq与房间请求seq独立映射，房间设置/准备也不会打乱引擎序号。

事务先复制文件状态，处理指令与同目录.tmp→rename写盘成功才保留；失败恢复旧内存状态。服务器恢复时核对schema/游戏/文件名/座位/设置和引擎不变量。错误只发中文原因；计时保存失败仅记房间号，不输出秘密。

## 服务器计时

服务器250ms周期检查deadline；收到action/join前也先处理到期。只有服务器TIMEOUT会按既定默认补齐未提交行李，保留已提交选择，或跳过当前警长阶段；犬长等待按既定最大值箱处理。默认不限时；客户端只显示serverNow校正后的剩余时间，不决定是否到期。服务重启继续使用存档deadline。

## 验证

- `npm run verify:ss-protocol`：真实Socket.IO/HTTP、3/5/8人事件关/开6局，非法操作、并发、幂等、固定种子权限、断线/JSON重启恢复和注入测试时钟下的服务器超时；正常生产API无调钟后门。
- `npm run verify:ss-browsers`：真实Chromium独立上下文，从入口点击建房、设置、准备和每条正式对局行动；同样6局；真实离线/刷新恢复，逐版本比较WebSocket收到的view和服务器应有投影，检查其他座位DOM无未公开牌ID/手牌。恶意指令专门通过另一个真实socket绕过禁用按钮检查服务器拒绝。
- 浏览器超时专例：停服生成已提交一人的合法快照，仅将存档deadline缩到15秒，重启生产main.ts观察自动补齐；这是测试fixture加速，不在服务提供跳时/强制动作接口。
- 后续阶段4仍须再做完整UI与网络秘密自审；不要把引擎投影、协议检查或功能截图冒充最终美术验收。
