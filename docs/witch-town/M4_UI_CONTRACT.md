# M4交付给手机界面的接口

本阶段不实现手机界面。协议类型在packages/shared/src/wt-protocol.ts，服务端只接收意图；禁止把完整WTState发给浏览器。

## 房间与恢复

沿用同一Socket.IO服务：wt:create、wt:claim、wt:join、wt:action、wt:update；ACK为`{ok:true,data}`或`{ok:false,error}`。

创建`{capacity:4..12}`，占座`{code,name,claimKey}`。新界面必须在发送占座前，用浏览器crypto生成至少32字节随机秘密，编码为32～128个字母/数字/下划线/短横线，连同code和原昵称先持久保存。丢失ACK时用相同三项重发，得到同一playerId/token，不产生新座位。服务器存claimKey的哈希及服务端HMAC秘密，不存明文claimKey/token；claimKey与token均不得放进邀请链接或发给其他玩家。旧客户端不带claimKey仍兼容，但没有首次回执恢复能力。

拿到token后先保存，再发送`wt:join {code,token}`恢复自己的快照。旁观者token为空。邀请只含房间code。操作结构：`{code,request:{requestId,version,action}}`。同一操作重试必须保持requestId、原version、action完全不变；成功后不可另起ID重复消费。STALE_VERSION时取新快照，再为新意图生成新ID。

## 公共视图

- room：code、capacity、version、stage、mySeat、players的昵称/房主/准备/连接状态，milestone=M4_RULE_ENGINE。
- view：phase、turnPlayerId、blackCatOwnerId、gavelTargetId、deckCount、discard、pending、day、log、outcome。
- players：id、name、character、alive、hiddenTryalCount、revealedTryals（种类，无隐藏实例ID）、handCount、table、accusations。
- notices：必须显示“部分张数待官方核实”。countsProfile=candidate-59，evidenceWarnings保留证据状态。不能以正式房间能启局反向声称逐类张数已核实。
- ruleDecisions：各项RULE_DERIVED、DEFAULT_PENDING_CONFIRM、ONLINE_CONVENTION政策及页码；界面可放规则说明，不能称C类为官方澄清。
- public pending只给可公开的操作者、目标、事件阶段、牌池数量或截止时间；不含秘密投票、牌堆顺序、阴谋选择、夜袭目标。

## 私人视图

仅view.private给本人：playerId、tryals、hand、everWitch、abilityUses、choice、lootChoices。另一名玩家的浏览器不得收到这些内容。

| choice.kind | 本人可见字段与界面意图 |
|---|---|
| trial | targetId、concealedCount；选择未揭示身份的序号index，不发送其他玩家的隐藏身份实例ID |
| ability | ability；ABILITY_DECISION use true/false |
| tituba | deck、deadline；私人拖动排序，可多次保存，确认后执行已选抽牌 |
| loot | playerId、pool、taken、recipients；两个继承者都可查看，仅当前playerId能LOOT_PICK |
| conspiracy-cat | targetId、concealedCount；抽事件者选一张隐藏身份 |
| conspiracy-pick | sourceId、concealedCount、submitted、selectedIndex；只选序号，不看左邻牌面 |
| night-witch | allies、votes；秘密共同选一个目标，可改票，须全体一致 |
| night-constable | 保护选择；仅自己也是女巫时可见knownAttackTargetId |
| night-witch-wait | knownAttackTargetId；其他人仍只看到等待 |
| confession | confessed、deadline、governorAvailable；女巫保留已知袭击目标，平民不接收 |

`private.lootChoices`独立于choice：夜间自白致死可能产生待分牌，此时不能用分牌界面盖掉其他人的自白窗口。两个继承者可同时保留自白面板与私人分牌面板；当前第一批牌池的操作者发送LOOT_PICK。deadline不重置。对手收到空数组。若继承者之后也死亡，先前未选完的牌池按固定实例顺序补完后参与后一次死亡，日志会标记自动补完；这是已记录的C/D默认，不是秘密丢牌。

## 意图清单

- READY `{ready}`、START：现有房间流程；开始按实际4～12人数发牌。
- DAWN_TARGET `{targetId}`：女巫黎明共选；可自己。
- DRAW、END_TURN、PLAY `{cardId,targetId,recipientId?,blueId?,removeIds?,asWitness?}`。
- REVEAL_TRYAL `{index}`、ABILITY_DECISION `{use}`。
- CONSPIRACY_REVEAL `{index}`、CONSPIRACY_PICK `{index}`。
- NIGHT_TARGET `{targetId}`、NIGHT_PROTECT `{targetId}`：警长必须保护其他存活玩家；不能借用2～3人弃权规则。
- CONFESS `{index}`或`{useGovernor:true}`，两者不可同时发；30秒截止由服务器执行。
- PARRIS_DRAW `{cardIds}`：0～2张公开弃牌堆非黑牌，使用后结束回合。
- TITUBA_START、TITUBA_REORDER `{cardIds}`（整副准确排列）、TITUBA_FINISH；60秒按服务器截止，不因重连延长。
- LOOT_PICK `{cardId}`：仅当前第一批可见牌池操作者。
- START_HOURGLASS：任一存活玩家在普通白天标记拖延，启动不可重置的30秒沙漏；day.deadline显示剩余时间。到期未出牌则抽2，否则结束回合。遇秘密中断先完成中断，再处理已到期白天。

## 显示约束

手机圆桌按4～12人动态排布；10～12人可打开人物详情。手牌文字应在放大面板可读。死亡禁用游戏操作，重连不重新占座、不重新发牌。动画跟随服务端状态和日志，不预演秘密结算。没有此界面前，health.fullGame必须保持false。

本地磁盘快照已验证服务实例重建恢复。Render跨部署持久性仍需部署时另行配置持久磁盘/数据库，不能把本地恢复测试当作已完成云端持久化。
