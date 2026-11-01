# 脑洞量表 Top Ten

正式入口 `/?game=nd`，首页已有游戏盒。4–9 人通过自己的设备加入同一房间，使用现有语音通话工具开麦回答。每人按秘密数字 1–10 的程度回答，队长将回答从小到大排序并确认，再逐个翻开数字。全队共同保住独角兽，闯过 5 轮；没有个人分数或名次。

机制依据 Cocktail Games 法语官方基础版规则：[官方 PDF](https://www.cocktailgames.com/wp-content/uploads/2020/01/Top_ten_regles_BD.pdf)。具体页码、官方变体和已确认的线上操作适配见 [RULE_MATRIX.md](RULE_MATRIX.md)；身份来源见 [IDENTITY.md](IDENTITY.md)。完整排序确认是用户已选的线上操作方式，翻牌判定仍由服务器执行。

## 本地运行

```powershell
npm run build
npm run server
```

打开 `http://127.0.0.1:3000/?game=nd`。开发可用 `npm run dev`，默认将 `/socket.io` 转发至本地 3000 端口。创建房间、设置人数和尺度、复制邀请链接；每人准备后房主开始。

## 设置与存档

- 人数 4–9。基础玩法默认开启；专家变体默认关闭，仅 4–8 人可选。
- 尺度默认“放开”；“普通”过滤 spicy 题。
- 计时默认不限时。可选 60 / 120 秒提醒，到时不跳过回答、不改秘密、不自动处罚，仍可继续提交。规则书无计时要求，默认值记录在 CHECK_REQUIRED.md。
- `ND_DATA_DIR`：服务端 JSON 快照目录，默认 `data/nd-rooms`；含私密数字、已确认排序、成员 token、序号/幂等记录、deadline。
- `ND_ALLOW_FIXED_SEED=1`：仅用于隔离测试，默认关闭。正式房间不接受客户端指定种子。
- 本人凭证按房间保存，断线和刷新可回原座位；已提交内容不丢失。大厅可离座，对局中关闭网页仍保留座位。

## 内容

批准快照为 `packages/naodong-scale/data/approved-bank.json`：**102 道，spicy 20 道**。第二批 23 道和指定用词修正已由用户于 2026-11-01 直接审核通过。编辑稿为 cards.zh.json；引擎只读取批准快照，新草稿不会自动进入运行时。完整来源、哈希与版本见该目录 README.md。

只用中文原创题和用户提供的示例，不复制/翻译商业题卡；所有题都用一个东西、一个词或一句话回答。界面不收集文字答案或录音，没有表演、模仿动作和个人得分。

## 代码

| 文件 | 职责 |
| --- | --- |
| packages/naodong-scale/src/index.ts | createND / reduceND / viewForND，纯规则与秘密投影 |
| packages/shared/src/nd-protocol.ts | nd: 事件、设置、动作与快照类型 |
| apps/server/src/nd-rooms.ts | 房间权限、服务器 deadline、原子快照、token 重连、版本与 seq 校验 |
| apps/web/src/nd/NaodongScale.tsx | 大厅、语音回答、触摸/点选排序、逐张翻牌、合作终局与回顾 |
| apps/web/src/nd/nd-net.ts | 连接与凭证恢复，提交等待与中文错误 |
| apps/web/src/nd/ui-model.ts | 排序、公开回顾、真实统计娱乐称号 |
| apps/web/src/nd/nd.css | .nd-world 作用域；68px 紧凑座位条与完整名单浮层 |

服务器只下发本人数字和已公开的翻牌；不下发随机种子、未来题对、其他人的未揭晓数字或凭证。排序锁定后不可修改；跳过动画仍逐个等待服务器公开，不预取秘密。

## ND 验收

```powershell
npm run verify:nd-protocol
npm run verify:nd-browsers
npm run build
npm run verify:nd-ui
# 正式服务运行时，默认地址为 http://127.0.0.1:3000
npm run verify:nd-lobby
```

`verify:nd-protocol` 是真实 Socket.IO 与新进程恢复验收；`verify:nd-browsers` 是 4/6/9 人浏览器协议客户端，覆盖完整五轮与隐私，但不冒充正式 UI。`verify:nd-ui` 直接操作构建后的正式界面，覆盖 4/6/9 人基础、专家、全队失败、触摸排序、断线与截图布局。`verify:nd-lobby` 从首页游戏盒进入正式入口、真实建房入座并离座返回。

UI v2 已由用户审核通过。前后截图在 [ui-v2/index.html](ui-v2/index.html)，素材来源见 [ASSETS.md](ASSETS.md)。全仓阶段 5 的真实命令、通过/失败数字与无法执行项以 [交接报告](../handoff/ND_阶段5.md) 为准；没有部署或推送 main，合并上线由 Claude 复验后执行。

## 阶段 5 当前结果

43 条可执行回归命令最终通过、最终失败 0。全仓单元测试 100 文件 / 1426 项通过；ND 协议、4/6/9 人浏览器与正式 UI 均通过。老二哲学缺代码/入口，卡里巴湖未在 main，未将两项标为通过。首次环境/旧脚本失败与修复后证据、复杂背景自动审计限制见交接报告。首页署名透明度已修复以满足 4.5 对比度要求；其他游戏样式/引擎未改。
