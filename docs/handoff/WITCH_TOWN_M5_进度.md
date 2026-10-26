# 女巫镇 M5 关卡2进度（Claude 接手，2026-10-22）

## 2026-10-27 手机改动与验收文档交付

- 新增 [MOBILE_FIX_2026-10-27.md](../witch-town/validation/MOBILE_FIX_2026-10-27.md)：实际改动、逐问题截图、验收数字及未解决项。
- 明确本轮是核查和文档，产品代码修改 0 个文件；没有真实修复后截图，不伪造前后对比。附六张基线/复测截图，连接后成功画面标注为复测而非修复。
- 汇总 359 次操作、1/3 次运行终局、3/3 刷新及断网恢复、0/3 总体验收；布局 checkpoint 告警为 41/42/1 条，区别于 summary 的 30 条截断和独立 bug 数。
- 按用户要求，仅推送 `codex/witch-town-m1`，然后停止；不改 main、不部署。

## 2026-10-27 线上版本复核

- 按用户新指令检查实际线上 `4cfcbef`；首页及 10 游戏入口在 Chromium/WebKit 手机尺寸共 22 次打开，无页面横向溢出。
- 女巫镇 Chromium 4 人完成 213 次操作至终局，刷新、断网恢复成功；但座位状态行越出木牌边框，布局验收未通过。12 人完成入座、开局、阴谋等 127 次操作，达到 90 秒检查预算，未算整局通过。
- 触控区检查确认绘画派对人数选择、请留遗言音效及部分返回链接小于 44×44px；首次建房失败与未连接状态时序相符，原因仍需针对性确认。
- WebKit 已实际检查私牌显示/盖回及不支持 API 回退；真机 Safari 尚未验收。详细范围与证据见 [线上核查](../witch-town/validation/LIVE_AUDIT_2026-10-27.md)。
- 本次仅调查，没有修改产品代码、main 或部署。后续修复应围绕已复现的问题建立回归，不能把未验收项目写成全通过。

## Codex 上线后核查（2026-10-23，进行中）

- 已在 `codex/witch-town-m1` 执行 `git pull --ff-only`，从 `9c8650a` 开始；不碰 main、不部署。
- 第一项：浏览器脚本增加 WebKit / 内置 iPhone 设备、缺失震动及 Wake Lock 的回退检查、按住私牌检查和可视区缩减检查。普通模式四种组合均已尝试，存在稳定性超时或长时间未推进，未标整局通过；减少动态效果诊断正在运行。
- 证据及复现：[WebKit 核查](../witch-town/validation/WEBKIT_AUDIT_2026-10-23.md)。重点不能把单项私牌通过写成整局验收通过。
- 本地启动：`npm run build` 后设置 `PORT=3422`、`WT_ENABLE_DEV=1`、`WT_ALLOW_CANDIDATE_COUNTS=1`，运行 `npm run server`；浏览器环境变量见核查文档。
- 验证：typecheck、build 已通过；全仓测试正在运行，尚未出最终结论。
- 下一步：完成 WebKit 重试并保留失败证据，随后分别提交隐私核查和中文说明对照。生产代码与规则引擎未修改。

### 第二项：联机隐私检查已完成

- 新增 `scripts/verify-witch-town-privacy.ts`、独立字段白名单 `scripts/wt-privacy-audit.ts`、7 项主动注入泄露反例单测。
- 4/8/12 人各一局完整结束，合计 266 条命令、2,495 条更新及 ACK 快照，0 次越权字段；包含各座位和未占座观察者。
- 正常女巫协同、说书人和继承者授权数据单独验证，不把依法可见的数据误报。三局未实际触发共同分牌，报告明确保留这个覆盖缺口。
- 原始测试网络轨迹保存在忽略目录 `output/witch-town/privacy/`，Git 仅提交聚合数据、SHA-256、脚本与报告。
- 运行：`npx tsx scripts/verify-witch-town-privacy.ts`；单测：`npx vitest run apps/server/test/wt-wire-privacy.test.ts --maxWorkers=1`（7/7 已通过）。
- 报告：[隐私核查](../witch-town/validation/PRIVACY_AUDIT_2026-10-22.md)。下一步提交中文规则差异表，继续 WebKit 诊断。

### 第三项：中文牌面与规则对照已完成

- 逐项审计 15 张行动/特殊牌和 15 种人物的 `effectZh` / `abilityZh`，对照官方标准 PDF 第 12–14 页、相关基础规则页与官方 15 人物合照。
- 法官 6、大力士 8、虔诚翻倍、部长证据 1 与现行标准版一致；官方旧行动合照的 Piety 文本存在版本差异，以现行 PDF 为准。
- 差异表列出少女遗漏“可”、农民/裁缝残留内部编号，以及诅咒、情侣、阴谋、夜晚短文案省略的交互；完整卡面不足的条目单独标尚待确认。
- 报告：[中文说明对照](../witch-town/validation/CHINESE_RULE_AUDIT_2026-10-22.md)。没有修改 `data.ts` 或规则引擎；展示文案修改待用户确认。
- 下一步：收尾 WebKit 额外诊断与全仓测试，更新实际通过/失败结果，不把未完成的测试标为通过。

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
