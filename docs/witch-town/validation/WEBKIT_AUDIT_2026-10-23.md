# WebKit / iPhone 模拟核查

本地服务 `http://127.0.0.1:3422`，以 `9c8650a` 的真实客户端和服务端开始测试。本轮不部署，不改规则引擎。

## 环境与复现

Playwright 1.64.1，Windows WebKit 27.2（webkit-2370）。使用 Playwright 内置设备：iPhone 13 为 390×664 可视区域、390×844 屏幕；`iPhone SE` 为第一代 320×568，不是第三代 375×667。

PowerShell 示例：

```powershell
$env:PW_BROWSER='webkit'
$env:WT_DEVICE='iPhone 13' # 或 iPhone SE
$env:WT_PLAYERS='4' # 或 8
$env:WT_URL='http://127.0.0.1:3422'
$env:WT_SHOTS='docs/witch-town/validation/screens/webkit-iphone13-4p-repro'
npx tsx scripts/verify-witch-town-browsers.ts
```

额外诊断设置 `WT_REDUCED_MOTION=1`，模拟系统“减少动态效果”，结果单独存 `*-reduced`，不得与普通模式混计。WebKit 测试关闭音效，并显式模拟 `vibrate` / `wakeLock` 不存在，验证回退路径。

## 普通模式观察

| 设备 / 人数 | 观察 | 整局验收 |
|---|---|---|
| iPhone 13 / 4 | 已开局至白天；私牌按钮 hover 的可见稳定检查 30 秒超时 | 未通过 |
| iPhone 13 / 8 | 第 6 位入座按钮可见稳定检查 30 秒超时 | 未通过 |
| iPhone SE / 4 | 已至白天；私牌按下显示、松手盖回、阻止网页菜单事件、无文本选中通过；后续长时间未推进，人工停止 | 未完成 |
| iPhone SE / 8 | 全部入座并进入黎明；后续长时间未推进，人工停止 | 未完成 |

失败及部分截图在 `screens/webkit-*`。`webkit-iphone13-4p-diagnostic/failure.json` 含已完成 JS/CSS 请求的诊断，不能把等待懒加载直接归因网络失败。`webkit-iphone13-4p-final/failure.json` 记录私牌按钮超时。SE 的 `safari-probe.json` 是单项检查，不是整局通过证明。

最初一轮脚本错误地在黎明等待仅白天显示的私牌入口，已修正为白天再检查；这项旧失败不作为产品缺陷。反复并行启动多个 WebKit 进程有资源竞争可能，现以单局及减少动态效果重试定位，尚未确认根因。

## 检测范围

- 同一脚本通过真实按钮创建房间、入座、开局、出牌及阶段选择；中途刷新、断网恢复。
- 私牌测试使用移动设备配置下的鼠标指针按下/松开；合成 `contextmenu` 仅验证网页阻止逻辑，不等同于 iOS 原生触摸长按菜单。
- 通过调整 viewport 高度模拟可视区缩减，检查底部 dock 边界；不能模拟原生 Safari 地址栏动画，桌面 WebKit 的安全区可能为 0。
- 每次记录的布局检查保留可见元素越界结果，不因是滚动容器就整体忽略。新运行的 `layout-checkpoints.json` 持续落盘，等待者也检查。意图滚动的内部元素与页面越界需人工复核，不能删掉失败项来凑 0。
- Windows WebKit 不等于实体 iPhone。当前不能宣称“四局 Safari 整局通过”或“全部阶段超框为 0”。

减少动态效果整局结果与最终检查结果在后续提交补充；本次先保存可复现测试入口与实际阻塞证据。
