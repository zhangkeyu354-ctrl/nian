# XP 5–6 人截图与操作证据

对应阶段 6。`report.json` 合并完整五/六人 UI 对局和最终布局重截的记录；完整对局原始报告另存 `docs/rummikub/verification/stage6-xp-full-games.json`，未把不同批次的计数混成同一次运行。

- `390/844/1280-six-seat-draw.png`：六个公开先手抽牌、长名字、开始按钮。
- `390/844/1280-six-seats-jokers.png`：六个座位、第三副本 R11c/K13c、J3/J4，实际游戏页面。
- `xp-restored-private-draft.png`：进程重启后私有草稿；真实刷新和重启还分别断言草稿及 nextSeq 一致。
- `xp-5/6-lobby.png`：房主显式选择 XP；人数选项随模式变成 5/6，非房主设置禁用。较长大厅允许纵向滚动，真实准备和开始操作均通过。
- `xp-5/6-start.png`：实际发牌，起手 14 张，牌池分别 90/76。
- `xp-5/6-result.png`：真实 UI 点击完成整局；五人 161 回合堵局，六人 134 回合正常出完。结算内容可在弹窗内滚动查看，并已实际点击下一局验证累计分与胜局保留。
- `review-1..4.png`：最终截图联系表。

最终截图检查：无横向页面滚动；长名字无文字截断；六个对局座位均完整落在玩家条内；定先手牌和按钮完整可见；操作按钮在视口内；图片非空白并已解码。使用 `scripts/screenshot-check.ts`，已人工查看联系表，以及手机竖屏和横屏原图。

首次加严座位可见性检查捕获横屏裁切，后续压缩布局并重截通过。历史失败证据保留在 `docs/rummikub/verification/stage6-seat-clip.*` 和对应失败日志；`failure-*` 仅用于诊断，不属于通过的最终截图。

本机 Chromium 手机视口，不代表真实 Safari/Android 设备验证。Classic 官方包装继续作为合集里的拉密产品封面，未将其标成 XP 包装；XP 模式有独立文字和徽标，牌面和 Joker 复用已获授权的官方素材。
