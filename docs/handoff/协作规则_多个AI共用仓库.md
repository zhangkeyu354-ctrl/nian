# 桌游网站：项目现状与协作规则（2026-10-20，Claude 写）

给在本仓库工作的所有 AI（Claude 各个对话、Codex）看。**开工前先读这份。**

## 1. 代码在哪
- **GitHub（唯一准确版本）**：https://github.com/zhangkeyu354-ctrl/nian ，分支 `main`（公开仓库，用户同意）。
- 用户电脑本地副本：`E:\DBD-BoardGame-Web`（Codex 在这里工作；`origin` 已指向上面的仓库）。
- 必读：`AGENTS.md`（总纲、最高原则）、`docs/handoff/CODEX_交接_2026-10-20.md`（最新进度，第 8 节起）、`docs/HOUSE_RULES.md`（用户裁定）。

## 2. 线上
- 正式网址：https://dbd-boardgame-8qky.onrender.com （Render 免费网页服务，新加坡，`render.yaml`）。
- **推送到 `main` = 自动重新部署，进行中的房间会断开。** 没人玩时再推。
- 免费方案：15 分钟无人访问休眠（再打开约等 1 分钟）；重启后房间消失。`/api/health` 显示线上版本号（提交号）。

## 3. 技术结构（一个 Node 服务器同时提供网页与联机）
- `apps/web`：React 19 + Vite + TS，手机优先界面（`MobileDock.tsx`、`mobile-game.css`）。
- `apps/server`：Node + Socket.IO，服务器权威；房间流程 `rooms.ts`（建房选人数 → 自选阵营 → 随机分配 → 选角 → 开局），断线按 token 重连。
- `packages/game-engine`：黎明杀机规则引擎（纯函数 `reduce(state, command)`），`privacy.ts` 的 `viewFor` 按座位隐藏秘密。
- `packages/game-data`、`packages/shared`（类型与联机协议 `protocol.ts`）。
- 部署：`npm ci --ignore-scripts && npm run build`，启动 `npm run server`（tsx）。

## 4. 加第二个游戏（魔法运动员）的做法
- 规则引擎放独立包，例如 `packages/magical-athlete/`，同样做成纯函数 `reduce`；**不要改**黎明杀机的 `packages/game-engine`。
- 联机复用现有服务器：房间文件加 `game` 字段（`"dbd"` / `"magical-athlete"`），服务器按 `game` 选用对应引擎与 `viewFor`。改 `rooms.ts`、`protocol.ts` 时黎明杀机现有行为和测试必须全部保持通过。
- 首页加游戏选择大厅；黎明杀机现有入口和 `?online=1`、`?hotseat=1`、测试用 `preset` 网址保持可用。
- 不要另起 Supabase 等第二套后端。规则以官方规则书为准，缺资料写 `CHECK_REQUIRED` 并问用户，不凭记忆编。原创美术。

## 5. 协作规则（多个 AI 同时改同一个仓库）
1. 开工前 `git pull origin main`；只改自己负责的部分。
2. 大改动开分支（如 `magical-athlete`），做完、测试通过后再合并到 `main`。
3. 推送 `main` 前必须全部通过：`npm test`、`npm run typecheck`、`npm run verify:replays`、`npm run verify:mobile-interfaces`；动了服务器/房间再加 `verify:lan-protocol`、`verify:lan-browsers`、`verify:lan-lobby`（先 `npm run build`；部分脚本需要先开 `npm run dev`）。
4. 规则有歧义：写进 `docs/RULE_QUESTIONS.md` 问用户。
5. 做完在 `docs/handoff/` 写清楚改了什么，方便别的 AI 接手。

## 6. 分工（2026-10-20）
- **Claude（本仓库最初的对话）**：黎明杀机规则引擎、服务器、上线部署、用户试玩反馈的修复。
- **Codex**：本地验证、美术、界面细节（按 `docs/instructions/` 里的指令执行，完成后报告并停止）。
- **新对话（魔法运动员）**：`packages/magical-athlete/`、游戏大厅、魔法运动员界面；碰到 `apps/server/src/rooms.ts`、`packages/shared/src/protocol.ts` 时先开分支。

## 7. 黎明杀机当前进度（摘要）
- 规则完整：13 角色、39 技能、6 力量、3 被动、10 物品。用户裁定已落实：出生从先手逃生者起逐人掷骰、杀手最后；所有掷骰由本人点「🎲 掷骰」；医生电火花逐人选择；物品只问此刻能用的人。
- 选角页有技能介绍；手机竖屏棋盘优先；210 项测试 + 5 部手机整局联机通过。
- 正在等用户和朋友的真机试玩反馈。
