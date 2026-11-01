# 脑洞量表 / Top Ten：阶段 2 独立规则引擎

本包只包含规则状态机、批准题库、私密视图与测试；不包含联网、计时、存档或正式 UI。实际服务器必须绑定玩家凭证后才调用引擎，不能相信客户端自报的座位。

## 内容与模式

用户已授权继续阶段 2。首批 79 道（17 道 spicy）保存在 `data/approved-bank.json`，含授权说明、来源内容哈希和题目快照；审核稿 `cards.zh.json` 仍保留编辑状态。未来增加或修改审核稿不会自动替换批准快照，需要另行审批和生成。

默认基础模式、尺度放开、首位队长为座位 0，可显式指定。4–8 人包含队长回答；9 人队长无数字、不回答。专家默认关，支持 4–8 人；9 人专家组合因原规则没有相应队长数字环节而明确拒绝。

每局从当前尺度题池随机取 10 道不同题目，组成 5 张虚拟主题牌，每张含 2 道候选。每轮队长二选一；另一题也不在本局后续轮重复。这是对当前原创内容的组牌方案。数字 1–10 本身就是 10 张数字牌的唯一标识，换轮全部收回重发。

## API

```ts
import { createND, reduceND, viewForND } from './src/index.ts';

// seed 由后续服务器提供；测试固定种子以复现。
let state = createND(['甲', '乙', '丙', '丁'], { seed: 20261031 });
const captainView = viewForND(state, 0);
state = reduceND(state, {
  type: 'CHOOSE_TOPIC', seat: 0, seq: 1,
  topicId: captainView.choices[0].id,
});
state = reduceND(state, { type: 'READY', seat: 0, seq: 2 });
const otherPlayerView = viewForND(state, 1);
```

`createND(players, options)`：构造确定性初始状态。必传 uint32 `seed`；可选 `firstCaptain`、`expert`、`scale: open | normal`。`bank` 参数只用于受信任的服务端或测试注入，阶段 3 不能把客户端题库直接透传到这里。普通尺度过滤 spicy 后仍需至少 10 题。

`reduceND(state, command)`：纯函数。命令通过才返回新状态；非法命令抛出带中文信息的 `NDGameError`，不改变原状态、不消费序号。每个座位的 `seq` 从 1 严格递增，相同已接受命令的重试返回当前状态，不重复事件；相同序号配不同内容拒绝。只接受每种命令声明的字段，拒绝夹带文字、音频等数据。

`viewForND(state, seat)`：白名单视图、独立副本。本人只看自己的数字，其他人只看已逐张公开的数字；`seat: null` 返回无秘密数字的旁观视图。未发数字、随机状态、未来题组、重试指纹不投影。服务端完整 state 不得发送给客户端或打印到普通日志。

`assertInvariantsND(state)`：验证数字与团队标记守恒、题目不重复、座位/阶段/回答角色正确、翻牌与原数字一致、序号记录与结果边界一致。成功执行每个 reducer 命令前后都会调用。

## 命令与状态

| 命令 | 允许的阶段 / 玩家 | 结果 |
| --- | --- | --- |
| CHOOSE_TOPIC(topicId) | CHOOSE_TOPIC / 队长 | 从当前两个候选选题，秘密发牌，进入 ANSWER |
| READY | ANSWER / 答题者 | 仅记录口头回答已完成；4–8 人队长先回答，随后其他人任意次序 |
| LOCK_ORDER(order) | ORDER / 队长 | 提交全部答题座位的无重复排列，锁定后进入 REVEAL |
| REVEAL_NEXT | REVEAL / 队长 | 严格按已锁顺序逐张公开，比较紧邻前一张，不比较历史最大值 |
| GUESS_EXACT(target, guess) | EXPERT / 队长 | 指定未公开队友并猜 1–10 精确数字；不要求升序，不叠加顺序失误 |
| GUESS_CAPTAIN(guess) | CAPTAIN_GUESS / 非队长代表 | 语音达成共识后，一名队友代表提交；正确可恢复一枚已有便便标记 |
| NEXT_ROUND | ROUND_END / 当轮队长 | 队长移到下一座位，回收全部数字，进入下轮选题 |

基本模式为用户已选择的线上适配：先锁定整套排序，再逐张翻开。原版允许逐次决定下一张，二者不声称完全等价。专家模式不使用固定升序排列，按精确猜测逐次公开。

只在真正翻开时生成公开 `REVEALED` 事件；不会提前生成含未公开数字的事件队列。每次误判移动一枚独角兽到便便区；容错耗尽立即失败，即使专家后面原本还有恢复机会也不能复活。第五轮完成且有独角兽标记时全队成功。只有团队评价，没有个人分数或排名。

程序不保存或判断玩家的口头回答，不采集语音，也无法证明队友在语音中已经达成共识；阶段 4 帮助应说明切题、不得泄露数字、原回答不能修改，以及专家代表提交规则。

## 验证

```text
npx vitest run packages/naodong-scale/test/engine.test.ts
npx tsc --project packages/naodong-scale/tsconfig.json --noEmit
npx tsx scripts/verify-nd-simulations.ts
```

规则对应关系在 `docs/naodong-scale/stage2/TRACEABILITY.json`。模拟报告记录每局种子、模式、终局、命令数和公开事件摘要；策略含只为覆盖边界而读取服务端状态的测试 oracle，不是玩家胜率估计或实际客户端能力。报告不保存未公开数字。
