# Design Baseline（非 UI）

来源：PRD_STAGE2.md、ALIGNMENT_STAGE2.md。范围：非 UI 命令与数据流，UI 第 4 节仍是后续视觉基准。
主流程：createRK(seed, players, now) → reduceRK(state, command) → viewForRK(state, seat)。状态 PLAYING/FINISHED；草稿状态合法/非法/可撤销/可重做。
输入：actor、单调 seq、命令载荷；now 为服务端可信时钟参数，TIMEOUT 仅由服务端命令调用。引擎不能自行采当前时间。
输出：成功新状态及 lastAction；拒绝非法草稿结构或越权抛 RKError（中文）；非法 COMMIT 返回罚牌后状态及具体中文原因，避免抛异常导致罚牌丢失。
MOVE 以稳定 tile ID 和目标组 ID 表示；新组由引擎分配稳定 ID；拆/并不丢牌；非法组合允许存在草稿，COMMIT 才整体验证。
默认/空：创建后空桌面，当前玩家草稿等于快照。Loading：无异步引擎状态，由未来服务器提供。Success：正式桌面一次更新并切下一座。Error：具体中文组名/差分；Permission denied：不改状态。
隐私：本人可看草稿、验证进度和撤销能力；其他人只看已提交桌面、各人手牌数、公开先手牌、池数量。终局摊开全部剩余手牌。不给客户端原始快照、seq 账本、池顺序、随机种子或历史。
可访问性/响应式：纯引擎不决定尺寸；面向 UI 输出中文、稳定 ID 和结构化合法解释，不把颜色作为唯一标识。
不可变边界：随机只靠显式 seed；断言检查正式状态、快照和草稿各自守恒；UNDO/REDO 也保留 seq 幂等。
Implementation allowed after explicit approval: Yes。授权依据为总指令的阶段划分和本次“继续”，无新增范围；接 `$tdd-builder`。
