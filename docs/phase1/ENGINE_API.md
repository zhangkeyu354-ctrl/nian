# Phase 1 引擎接口与运行

当前公开入口：`packages/game-engine/src/index.ts`，纯 TypeScript、无界面/网络。Node.js 24.14.0、npm 11.9.0已实际验证。依赖版本锁在package-lock.json。

```powershell
npm ci --ignore-scripts
npm run typecheck
npm test
npm run simulate
npm run verify:replays
# 或一次执行以上四项：
powershell -ExecutionPolicy Bypass -File scripts/run-phase1.ps1
```

最小创建示例（由tsx运行）：

```ts
import { createGame, reduce, RuleError } from './packages/game-engine/src/index.ts';
let state = createGame({
  seed: 1701, mapId: 'macmillan_estate',
  survivors: ['dwight', 'claudette', 'jake', 'ace'], killer: 'trapper',
});
state = reduce(state, {
  type: 'SETUP_REVEAL', actorId: state.survivors[state.setupIndex],
  propId: state.props.find(p => !p.revealed)!.id,
});
```

`createGame`校验地图、四名逃生者和杀手，初始化44个道具、16张物品牌及种子随机数。`owners`可指定角色所属玩家以支持3–4人兼控与共用移动牌；省略时各角色独立玩家。`mode`默认ADEPT；BLOODWEB/DEVOUT依赖Phase 4卡组，当前抛出CHECK_REQUIRED。

`reduce(state, command)`返回新状态；拒绝的命令不修改输入。内部engine.ts/skills.ts使用工作副本上的辅助函数，调用方应只使用index.ts公开入口。状态、命令及事件均可JSON保存；相同初始选项与命令产生相同事件。随机数由状态中的固定种子推进，不使用时间或Math.random。

命令载荷和选择内容以`packages/shared/src/types.ts`、模拟脚本及tests为准：

- 准备：按逃生者顺序SETUP_REVEAL；随后自动出生并进入计划。
- 计划：PLAN提交cards；强制公开计划者先提交。共用玩家手牌限制在引擎内检查。
- 行动：MOVE、INTERACT、USE_POWER；无法合法移动的牌损失互动。回合推进、清理、献祭/胜负检查自动产生事件。
- 响应：存在window时，当前`window.actors[window.index]`可USE_PERK或PASS。多项可用技能仍需逐次确认，使用次数与费用均检查；所有响应结束才恢复原流程。
- 选择：存在choice时SELECT，参数依choice.kind而定。技能、搬运、翻道具和奖励回合都必须完成其选择；不能绕过待处理项。
- REVISE_INTERACTION允许当前互动前响应者在艾斯换位等效果后修改合法目标，不额外消耗行动。

`connected`给出图上相连关系；`legalRoutes`再按颜色、方向、角色与障碍过滤。废车场三房图标保留共享pathId，木板/墙/捕兽夹状态由全部分支共享；Q09为用户自订规则。墙、木板对两阵营的普通移动处理沿用既有规则，搬运两者均不可穿。

`resolveDice`提供独立骰子结算，区分检定类型、选中骰与重掷替换；未保留失败仍给血点，替换掉的旧结果不计。同一骰不能再次重掷。实际启用重掷的物品效果留Phase 4。

未知/待核规则通过`checkRule`或请求相关能力抛出`RuleError`，`code='CHECK_REQUIRED'`。USE_ITEM、四项Q11板载能力及医生“压迫性气场”明确报错，不产生无效果成功；缺日文或Q06英文房名不构成运行阻断。

引擎为可信裁判边界：SELECT中代其他角色作出的同意/医生选项是已经收集好的决定；当前不提供玩家身份认证。未来Phase 3服务必须向相应玩家收集并校验其授权。完整GameState含私密牌和未翻道具，不能直接发给所有客户端；角色视图与联机协议尚未实现。

三局验收脚本仅调用createGame/reduce，未直接改状态或注入胜负。脚本策略用于流程验收，不用于证明游戏平衡或AI强度。事件和每条命令在games/；verify-replays.ts从文件独立重放并严格比较全部事件及最终状态哈希。TDD/保留五次真实失败检查，最终完整输出在VALIDATION.txt。
