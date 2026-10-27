# Soda Smugglers 规则引擎（阶段2）

纯TypeScript，无I/O、不读系统时钟、不使用Math.random。状态仅由服务器持有；浏览器只能收到`viewForSS(state, seat)`，旁观者用`-1`。引擎内部卡ID包含瓶数，因此不向其他座位发送未公开牌ID，公开牌仅发送位置与瓶数。不要把完整状态、种子、命令中的私有牌ID写到公共日志。

```ts
const state = createSS(["小王", "小李", "小张"], {
  seed: 123,                 // 正式联机由服务器生成，不能公开
  firstGuard: 0,             // 数字座位，或显式选择 "random"
  events: false,             // 随机事件默认关；开启则完整8张
  seconds: 0,                // 0 | 60 | 120，默认不限时
  now: 1000,                 // 由调用方传入服务器时间
});
```

`reduceSS(state, command)`成功返回新状态，不改原状态；非法命令抛具体中文Error，原状态与seq不变。每个行动者独立seq，必须正整数并连续递增，重复/旧seq幂等返回原状态。联机层必须用座位token绑定actor，用服务器时间覆盖客户端now；**actor="server"是内部能力，不得暴露为客户端可选字段**。

| 命令 | 行动者与时机 |
|---|---|
| SUBMIT { luggage: id[], bribe: id } | PACK中的未提交旅客，默认2箱、假日狂欢3箱；提交锁定 |
| ACCEPT { target, useEvent? } | BRIBE中的警长，固定金额从旅客自有余额付，立即公开行李并结算放行；useEvent只供起早贪黑 |
| INSPECT { target, index?, useEvent? } | INSPECT中的警长；普通一次只开一只且每旅客一次；领导视察可第二箱；犬长先请求本人翻箱，不接受警长替选 |
| REVEAL_DOG { index } | 仅pendingDog旅客；必须自己选最大瓶数箱，平手任选，不发是否平手的标记 |
| ARREST { target, useEvent? } | ARREST中的警长；useEvent只供铁面无私 |
| GREEDY | 贪得无厌，BRIBE第一次受贿前选择全收全放；直接结算该轮 |
| ADVANCE | 警长放弃该阶段剩余动作；BRIBE→INSPECT→ARREST→ROUND_END或FINISHED |
| NEXT_ROUND | ROUND_END的当前警长；顺时针下一人，回收全部36张重新洗牌 |
| TIMEOUT | 仅server，需已到deadline；PACK填未提交旅客，犬长等待时选第一最大值箱，其余跳过当前警长阶段 |

普通动作标记与事件额外标记分开消费，事件每轮至多用一次。阶段deadline不因普通动作刷新；犬长等待开始/结束各建立下一责任方的计时窗口。无计时时TIMEOUT报错。

历史只记已公开行李瓶数、付款与赔款金额，不记未公开手牌/盖弃牌。已公开历史可回顾。每次reduce自动断言牌、事件、瓶盖总面值、非负余额、对他人私有选择的修改权限以及逐座位投影隐私；返回view是深拷贝。

瓶盖用面值账本表达随时找零，CAP_STOCK只登记80枚官方物理组成，总值422，不建立逐枚实物所有权。用户房规HR-SS-01：所有付款最多扣现有余额，无欠款/负分，不凭空生成瓶盖。

验证：`npx vitest run packages/soda-smugglers/test`；`npx tsx scripts/simulate-ss.ts`。后者3/5/8人×事件关/开×种子1..200，共1200局，每步检查所有玩家/旁观者投影，结果写`docs/soda-smugglers/verification/stage2-simulations.json`。完整规则、照片来源和待外部裁定的边界见docs/soda-smugglers/。

阶段2不包含房间服务、网络协议、浏览器UI、按钮或DOM/网络隐私验收；这些分别留阶段3/4。`events`与`firstGuard="random"`的引擎选项已实现，对应房间开关/随机指定按钮尚未接线。
