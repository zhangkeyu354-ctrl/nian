# 行动代号：交给 Codex 的任务（2026-10-21，Claude 写）

> 开工前先读：`AGENTS.md`、`docs/handoff/协作规则_多个AI共用仓库.md`、`docs/codenames/` 里 6 份研究报告。
> 工作分支：**`codenames`**（已推到 GitHub）。全部完成、测试通过前**不要合并到 main**（合并 = 线上自动重新部署）。
> 每完成一个任务就提交一次，最后在 `docs/handoff/` 写报告并停止。

## 0. 已经完成的（Claude 做的，不要重写）

| 部分 | 位置 | 状态 |
|---|---|---|
| 官方网站实测研究 + 规则对照（Phase 0） | `docs/codenames/CODENAMES_*.md`（6 份） | 完成 |
| 规则引擎（纯函数） | `packages/codenames/src/engine.ts`、`types.ts`、`privacy.ts` | 完成 |
| 原创中文词库 570 词（11 类） | `packages/codenames/src/words.ts` | 完成 |
| 引擎单元测试 34 项 | `packages/codenames/test/engine.test.ts` | 通过 |
| 服务器房间（`cn:` 事件、服务器计时、存档重放） | `apps/server/src/cn-rooms.ts`，已接入 `main.ts` | 完成 |
| 联机协议 | `packages/shared/src/cn-protocol.ts` | 完成 |
| 前端（房间页、分队、队长模式、棋盘、线索输入、猜词、加时、记录、结算） | `apps/web/src/cn/`，路由 `/?game=cn`，首页第三个盒子 | 完成初版，**还没在真浏览器里看过** |
| 协议验收脚本（5 个独立客户端，12 组检查） | `scripts/verify-cn-protocol.ts` | 通过 |
| 全仓 `npm test` 380 项、`npm run typecheck` | — | 通过 |

规则要点（已实现，不要改）：60 秒出线索 / 120 秒猜词，超时自动换边；每队每局一次 +30 秒（只能本队猜词阶段）；提示 N 最多翻 N+1 张；0 和 ∞ 不限次数；至少翻 1 张才能主动结束；队员点牌 = 标记，只有本队「操作员」能确认翻开；队长服务器端才看得到颜色。

## 任务 1：浏览器实测与修界面（最优先）

1. `npm run build` 后用 `CN_TIMING=20,30,10 npm run server` 启动（缩短计时方便测；正式默认 60/120/30）。
2. 写 `scripts/verify-cn-browsers.ts`（参考 `scripts/verify-ma-browsers.ts`）：**4 个独立的 Playwright 浏览器上下文**（不要用同一个上下文开多个标签页，会共用 localStorage），其中至少 2 个是手机视口 390×844。
   - 建房 → 4 人加入 → 分队 → 自选队长 → 开始。
   - 截图：红队长、红队员、蓝队长、蓝队员 4 个视角各一张（存 `docs/codenames/screens/`）。
   - 检查队员页面的 DOM 里**没有** `data-role` 值为 red/blue/neutral/assassin 的未翻开牌。
   - 打一整局：出线索 → 标记 → 确认翻开 → 换边 → 加时 → 结束猜词 → 有人超时 → 刺客或全部找到 → 再来一局 → 随机队长再打一局。
   - 刷新其中一个浏览器，确认回到原座位。
3. 在 `package.json` 加 `"verify:cn-browsers"` 脚本（`verify:cn-protocol` 已经有了）。
4. 看截图修界面问题，重点：手机上 25 张牌的字是否清楚、底部按钮会不会被遮、线索大字闪现、倒计时最后 10 秒变红、结算条。**只改 `apps/web/src/cn/` 和 `cn.css`**，不要动规则引擎；发现规则 bug 写进报告，不要自己改规则。

## 任务 2：美术资源

前端已经留好了图片位置，图没放进去时会显示纯色后备，所以**放进文件就会自动生效**，不需要改代码。

放到 `apps/web/public/assets/codenames/`：

| 文件名 | 用途 | 规格 |
|---|---|---|
| `agent-red.webp` | 翻开后的红队特工牌（整张牌背景） | 400×330，人物居中偏上，底部 1/4 留给词（会盖一条白色词条） |
| `agent-blue.webp` | 翻开后的蓝队特工牌 | 同上 |
| `bystander.webp` | 翻开后的中立路人牌 | 同上，米色调 |
| `assassin.webp` | 翻开后的刺客牌 | 同上，黑底，剪影或戴帽黑影 |
| `card-paper.webp` | 未翻开词卡的纸张纹理 | 400×330，浅米色，纹理要很淡（上面要放 22px 黑色粗体中文） |
| `icon-assassin.webp` | 队长视角刺客牌上的小标记 | 64×64，金色，透明背景 |
| `desk.webp` | 整个页面背景（深色办公桌/档案） | 1080×1920 竖图，**很暗**，不能抢牌的颜色，压缩到 200KB 以内 |
| `lobby-cover.webp` | 首页「行动代号」盒子的封面 | 宽 1600，高约 880（和魔法运动员封面比例一致） |

要求：
- **原创**风格：「特工档案」—— 牛皮纸、打字机、印章、深色办公桌；红 `#c4313b`、蓝 `#2a5db3`。
- **不得**使用或模仿官方《Codenames》的插画、人物、Logo、字体、盒子设计；不得出现 "Codenames" 字样。
- 红蓝两张特工最好各做 2–3 个不同人物（如果做了多个，命名 `agent-red-1.webp`…，然后在报告里告诉我，由 Claude 改代码轮换显示）。
- 全部 webp，单张 ≤ 120KB（desk 除外）。
- 放好后用任务 1 的脚本重新截图，确认字看得清。

## 任务 3：上线前全量验收

按协作规则全部跑一遍并把输出贴进报告：
`npm test`、`npm run typecheck`、`npm run verify:replays`、`npm run verify:mobile-interfaces`、`npm run verify:lan-protocol`、`npm run verify:lan-browsers`、`npm run verify:lan-lobby`、`npm run verify:ma-browsers`、`npm run verify:cn-protocol`、`npm run verify:cn-browsers`。

黎明杀机和魔法运动员的已有测试必须全部保持通过。

## 任务 4：交接报告（然后停止）

写 `docs/handoff/行动代号_Codex报告_日期.md`：做了什么、截图位置、所有测试的真实输出、发现但没修的问题。**不要合并 main**，等用户确认后由用户/Claude 合并上线。

## 待用户确认的规则问题（不要自行决定）

见 `docs/codenames/CODENAMES_RESEARCH_GAPS.md` 第 2 节 Q1–Q4。
