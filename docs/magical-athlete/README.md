# 魔法运动员（第二款游戏）· 交接说明（2026-10-20，Claude）

## 先说结论：为什么没有直接用 cameronnayeri/magical-athlete
那个仓库是「数字桌面」：不自动结算任何能力，玩家自己拖棋子；联机靠 Supabase；
最关键的是它的 30 张「官方」角色是作者**凭记忆写的**（代码注释自己也这么说）——
和 2025 版 36 人对比，24 个名字根本不存在（刺客、炸弹人、吸血鬼……），剩下 6 个能力也都写错。
所以只参考了它的流程（选秀 → 出场 → 比赛 → 结算），代码和数据都没有用。

## 入口
- 首页 `/` 现在是**桌游合集大厅**（`apps/web/src/GameLobby.tsx`），选黎明杀机或魔法运动员。
- 魔法运动员：`/?game=ma`（建房/加入），`/?game=ma&room=XXXX`（房间）。
- 黎明杀机原有入口不变：`/?online=1`、`/?room=XXXX`、`/?hotseat=1`、`/?view=...`、测试 `preset`。
  唯一变化：本机打开根地址不再直接进热座（改用 `/?hotseat=1`；三个 verify 脚本已同步）。

## 结构
| 位置 | 内容 |
|---|---|
| `packages/magical-athlete/src/racers.ts` | 36 名选手数据（中英名、技能、说明、来源、状态）。飞艇 CHECK_REQUIRED，不进选秀。 |
| `packages/magical-athlete/src/tracks.ts` | 两面赛道；狂野赛道格子位置待确认（填好 `specials` 并改 status 即开放）。 |
| `packages/magical-athlete/src/engine.ts` | 规则引擎，纯函数 `reduceMA(state, command)`。 |
| `packages/magical-athlete/src/privacy.ts` | `viewForMA`：隐藏牌堆、随机数、重放快照、别人的秘密出场选择、别人的待决定选项。 |
| `packages/shared/src/ma-protocol.ts` | 联机协议，事件名 `ma:*`。 |
| `apps/server/src/ma-rooms.ts` | 房间：昵称加入 → 房主设分值 → 开始；存档 = 种子 + 命令列表，重启重放。存到 `data/ma-rooms/`（`MA_DATA_DIR` 可改）。 |
| `apps/web/src/ma/` | 界面：建房/加入、房间、选秀、秘密出场、跑道、决定面板、记录、最终成绩。 |

和黎明杀机**完全不共用**规则代码与房间存档；只共用同一个 Node/Socket.IO 服务器（`main.ts` 加了一行 `attachMagicalAthlete`）。
文档建议的「房间加 game 字段」改成了「事件名加 ma: 前缀的独立房间」，这样一行黎明杀机的 rooms.ts/protocol.ts 都不用改。

## 引擎怎么处理中途选择
每个「单元」（赛前结算、某人的一个回合）从快照开始确定性执行。需要有人选择（重掷？决斗？跟上？）时抛出 Need，
状态停在那里并给出 `pending`。回答后从快照带全部回答重放这个单元——随机数也在快照里，所以结果一样。
新增能力时只需在相应时机调用 `ask(...)`，不用写「从中间继续」。

结算顺序按规则书：赛道格 → 当前玩家 → 顺时针其他人。能力发动统一走 `fire()`（顺便让挪挪蹭 1 格，并做循环保护）。

## 测试
- `packages/magical-athlete/test/racers.test.ts`：36 人的能力逐个测试（固定骰子点数）。
- `packages/magical-athlete/test/simulation.test.ts`：3–6 人各 25 局随机整局打完；隐私检查；可重放。
- `apps/server/test/ma-rooms.test.ts`：房间流程、防重复提交、重启恢复。
- `npm run verify:ma-browsers`：4 部手机浏览器从首页点进去打完整整四场。

## 待办
见 `RULE_QUESTIONS.md`：奖牌分值、狂野赛道格子、第二弯道（飞艇）、2/3 人双选手变体，以及几条需要裁定的边界情况。
中文译名来自第三方图鉴，标 DRAFT，等你确认。
