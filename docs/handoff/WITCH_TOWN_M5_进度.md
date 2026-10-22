# 女巫镇 M5 关卡2进度（Claude 接手，2026-10-22）

## Codex 上线后核查（2026-10-23，进行中）

- 已在 `codex/witch-town-m1` 执行 `git pull --ff-only`，从 `9c8650a` 开始；不碰 main、不部署。
- 第一项：浏览器脚本增加 WebKit / 内置 iPhone 设备、缺失震动及 Wake Lock 的回退检查、按住私牌检查和可视区缩减检查。普通模式四种组合均已尝试，存在稳定性超时或长时间未推进，未标整局通过；减少动态效果诊断正在运行。
- 证据及复现：[WebKit 核查](../witch-town/validation/WEBKIT_AUDIT_2026-10-23.md)。重点不能把单项私牌通过写成整局验收通过。
- 本地启动：`npm run build` 后设置 `PORT=3422`、`WT_ENABLE_DEV=1`、`WT_ALLOW_CANDIDATE_COUNTS=1`，运行 `npm run server`；浏览器环境变量见核查文档。
- 验证：typecheck、build 已通过；全仓测试正在运行，尚未出最终结论。
- 下一步：完成 WebKit 重试并保留失败证据，随后分别提交隐私核查和中文说明对照。生产代码与规则引擎未修改。

Codex 额度用完，Claude 从 `8d3781c` 接手。只在 `codex/witch-town-m1` 工作，不碰 main，不部署。

## 已完成
- `apps/web/src/wt/WitchTown.tsx`：真实联机客户端（入口/建房/入座/准备/开局、白天出牌全部牌种的目标流程、审判揭牌、阴谋揭黑猫与同时传牌、黎明与夜晚女巫共选（含「采用」同伴目标）、警长保护、30秒自白（官员不揭牌）、共同分牌、牧师取牌、说书人排序后选抽2/出牌、能力是否使用、沙漏催促、死亡观战、终局全员身份）。
- `live.css`：座位尺寸由布局计算统一、指控条加粗、横幅分色、入口页、大厅名单。
- 首次占座 claimKey 先存后发；ACK 丢失重放；STALE_VERSION 自动重试；切回前台自动重连；Wake Lock。
- 引擎 `viewForWitchTown` 新增 `final`：仅终局时公开全员审判牌与是否曾是女巫。
- `?game=wt` 为正式版，`?game=wt&mock=<场景>` 仍是视觉稿。
- `scripts/verify-witch-town-browsers.ts`：N 部手机尺寸浏览器打完整局，中途一次刷新、一次断网重连。4/8/12 人均打完，无控制台错误。截图 `docs/witch-town/validation/screens/live-*p/`。

## 运行
```
npm run build
WT_ENABLE_DEV=1 WT_ALLOW_CANDIDATE_COUNTS=1 PORT=3420 npm run server
WT_URL=http://127.0.0.1:3420 WT_PLAYERS=8 PW_CHROME=<chromium> npx tsx scripts/verify-witch-town-browsers.ts
```

## 打磨（63c0732）
- 出牌飞牌动画、指控数字跳动、手牌发入动画、主按钮轻震。
- 揭审判牌全屏翻牌（女巫：紫烟+震动）；抽到黑牌全屏亮牌。
- 座位按等弧长排布，放不下自动缩小：12人在375×667不再重叠。
- 女巫/黎明共选加「采用最多票」按钮；嫁祸/抢劫在座位上标「被抢/转出/接收」。
- 自白改为按住牌偷看、点一下选择；横幅不再积压过期提示。
- 首页大厅加入女巫镇盒子（原创封面，8位房间号）。
- 4/6/8/12人（含375×667小屏）整局通过；全仓781项测试通过。

## 下一步
- 用户要求：上线前继续深度打磨界面、手感、反馈。
- 上线需用户明确同意：服务器默认开启女巫镇（目前仍需 WT_ENABLE_DEV=1）、health 改 M5/fullGame=true、合并 main、Render 手动部署。
