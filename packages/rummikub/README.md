# 拉密纯引擎接口（阶段 2）

模块入口 `src/index.ts`；不依赖网络、React、磁盘、Math.random 或系统时钟。

```ts
const state = createRK(['小王', '小李'], {
  seed: 2025,       // 正式服务器必须自己生成，不能信任客户端
  now: 0,          // 服务端可信时间
  minutes: 1,      // 0 不限、1 默认、2 两分钟
  assertions: true,
});
const next = reduceRK(state, {
  type: 'MOVE', actor: state.current, seq: 1, now: 100,
  tiles: ['R07a'], to: { meld: null },
}); // 示例中的 ID 必须实际在本人手牌/桌面，否则抛错
```

## 命令和回合

- `actor` 为座位索引；TIMEOUT 必须是 `'server'`。下一阶段房间服务必须先验证 token，再填 actor/seq/now，不能直接转发客户端伪造身份或时间。
- seq 是每 actor 单调递增正整数。小于等于已处理值的一律忽略并返回同一 state；账本跨回合/小局保留。错误命令不消耗 seq；成功的草稿/罚牌命令会消耗。不要每回合从 1 开始。
- MOVE `{tiles, to:{meld:null}}` 新建组，`{meld:'m0',index?:0}` 插入，`{rack:true}` 仅收回本人本回合暂放的牌。桌面已有牌回手立即中文报错。组合按 ID 定位，顺子合法性按数字集合计算，不依赖显示顺序。
- SPLIT `{meld,at}` 从指定缝拆；MERGE `{melds}` 按参数顺序合并；中间不足三张的组合允许存在草稿。
- UNDO/REDO 恢复草稿快照；RESET 还原本回合开头，可撤销 RESET。历史只在权威状态，视图仅给可用标志，不给全量历史。
- `validateTurn(state)` 实时返回 `{ok,reason,points,interpretations}`，不会罚牌。破冰 points 是本回合新组总分，已破冰后不是“新打出的牌分数”。
- COMMIT 非法不抛出丢失罚牌状态的异常，而是返回回滚/罚牌/切回合后的新状态，中文原因在 lastAction.error；服务端必须持久化这个新状态。其他结构/权限错误抛 RKError 且输入不变。
- DRAW 先放弃草稿，再从正式牌架摸 1；无牌可摸相当于 PASS；未提交的牌不能偷留桌面。
- TIMEOUT 或到期后任意有效玩家操作：放弃草稿、罚 min(3,剩余池牌)、结束回合。普通超时官方摸 1 的差异见 Q01。无计时模式拒绝 TIMEOUT；非法命令不能趁超时引发扣牌。
- FINISHED 时当前座位可 NEXT_GAME；房主权限留给阶段 3 房间层映射，不由引擎假设房主是谁。保留累计分/胜局，重洗 106 张、重抽先手。

## Joker 与守恒

validateMeld 返回所有合法 group/run 解释。run 优先，最高总分优先，余下按 Joker 颜色/点数的稳定序列消歧；每张 Joker 的代表值都从解释对象读取。
已有 Joker 直接 MOVE 记为取出；通过普通牌分流释放则由原组普通牌 ID 的最终归属识别。全部桌面牌必须留在桌面、全部组合合法、每回合至少贡献本人一张手牌。取出后仅恢复原成员集合不算新组；组身份判定是 Q06 项目默认，不声称解决所有实体裁定歧义。
assertions 开启时创建及每次新状态转换检查：106 个真实 ID 恰好出现一次，正式桌面合法，回合快照与正式状态一致，草稿/撤销/重做历史分别守恒。

## 隐私契约

只能向客户端发 `viewForRK`，不能发 RKState。view 公开池数量而非池内容、已提交桌面、先手每轮抽牌、手牌数和积分。本人可见自己的正式手牌，轮到本人另有 draft/validation/canUndo/canRedo。终局公开所有剩余手牌。非法 COMMIT 的具体牌名拒因只给操作者；其他人仅见罚牌类型/人数与数量。seed、随机状态、其他玩家草稿、历史、seq 账本、内部快照均不投影。

## 验证

`npx vitest run packages/rummikub/test`：规则例子与确定性草稿随机游走。
`npx tsx scripts/verify-rk-engine.ts`：2/3/4 人各 200 局，种子分别 2001–2200、3001–3200、4001–4200；报告写入 docs/rummikub/verification/stage2-simulations.json。
AI 只做本人手牌贪心组牌和简单接牌；不是完整重组求解器。空池整轮 PASS 是共同确认无法出牌的项目默认，模拟堵局多不证明全局已无解。输出只有种子、回合、赢家和分数，不记录隐藏牌架。
