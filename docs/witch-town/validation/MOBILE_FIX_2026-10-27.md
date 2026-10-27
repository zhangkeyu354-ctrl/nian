# 手机问题修复与验收（2026-10-27）

本轮**实际修改 4 个产品文件**，修复座位内容超框、连接前入口按钮可点击和指定触控区过小的问题。分支 `codex/mobile-fix-1027` 从 `origin/main` 的 `4cfcbef0303234c78013977d44eb85ce00299be3` 创建；不合并 main，不部署。

参考了 Claude 的 `4bf5370`，没有直接 cherry-pick：参考版使用 `overflow:hidden`，未完整覆盖加入/入座提示，也未解决旧样式、光环和高密度状态行导致的滚动尺寸问题。本轮没有靠隐藏座位内容通过检查。

## 修改的产品文件

| 文件 | 实际修改 |
|---|---|
| `apps/web/src/wt/WitchTown.tsx` | `useSeatLayout` 只缩宽度，普通高度固定 76px（大桌面 88px），9 人以上固定 56px（大桌面 64px）；三行内容不再随布局压缩。蓝牌图标按行内预算最多显示 2 个，余下用 `+N`，点座位仍可查看全部。公开/隐藏审判牌数量合并为带完整说明的 `公开/隐藏` 计数，警长木槌移到人物行，避免状态行塞不下。创建、加入、入口入座及真实大厅入座在未连接时均禁用并显示“正在连接服务器…”。 |
| `apps/web/src/wt/live.css` | 普通三行 `34px 10px 15px`，紧凑三行 `17px 9px 15px`；覆盖旧行高，指控数字以座位为定位容器，保留 13px 字号。座位及状态行保持 `overflow:visible`；去除原来藏掉第二个蓝牌图标的规则。光环、准星和数字跳动不再扩大座位滚动边界。返回链接命中区显式至少 44×44px。多张可选行动牌换行，防止辩护等面板横向挤出。 |
| `apps/web/src/drawing/studio.css` | `.lb-seg` 允许换行，普通及小号人数按钮均至少 44×44px。 |
| `apps/web/src/dm/polish.css` | 直接修改 `.dm-app.dm-polish button.dm-sound` 的高优先级规则，音效按钮从 36×36px 改为 44×44px；没有用无效的低优先级覆盖。 |

规则引擎、协议、人物能力、卡牌数据及其他游戏逻辑均未修改。座位详情保留人物能力、完整红蓝牌和已公开审判牌，不删除游戏信息。

## 同房间、同尺寸的前后对照

为避免拿不同人数、不同尺寸或不同游戏状态凑对照，测试通过正常协议创建房间、准备、开局并完成黎明，然后暂停操作。两个页面使用同一玩家凭证、同一份服务器状态和相同 viewport：

- 修改前：本地构建中将上述四个产品文件从 `git show 4cfcbef:<路径>` 加载，预览端口 3448。
- 修改后：当前分支正常 build，端口 3447。
- 两者连接同一台本地服务器；没有将假数据截图算作整局验收。截图等待阶段横幅消退。

| 检查 | 修改前 | 修改后 |
|---|---:|---:|
| 4 人，390×844，严格滚动溢出节点 | 5 | **0** |
| 4 人座位高度 | 76px | 76px，缩宽时不再减高 |
| 12 人，375×667，严格滚动溢出节点 | 24 | **0** |
| 12 人座位高度 | 46px | **56px** |
| 两种人数座位相压 | 0 / 0 | **0 / 0** |
| 两种尺寸控件回归分组 | 2/14 通过 | **14/14 通过** |
| 375px 绘画派对/伪画家人数按钮 | 33.375×38px | **44×44px** |
| 390px 同类人数按钮 | 35.25×38px | **44×44px** |
| 请留遗言音效按钮 | 36×36px | **44×44px** |
| 女巫镇返回链接 | 基线已达 44×44px | 显式规则保证仍达标 |
| 未连接时创建/加入/两类入座 | 0/8 按钮状态检查通过 | **8/8 禁用且提示正确** |

滚动溢出节点是满足 `scrollHeight > clientHeight` 或 `scrollWidth > clientWidth` 的 DOM 节点，**不是独立 bug 数**。静态对照数据见 [comparison.json](screens/mobile-fix-1027/comparison/comparison.json)，控件数据见 [修改前](screens/mobile-fix-1027/baseline-main/controls.json)、[修改后](screens/mobile-fix-1027/after/controls.json)。

### 每个问题的修改前后截图

| 问题 | 修改前 | 修改后 |
|---|---|---|
| 4 人座位 | [390×844](screens/mobile-fix-1027/comparison/before-4p.png) | [390×844](screens/mobile-fix-1027/comparison/after-4p.png) |
| 12 人座位 | [375×667](screens/mobile-fix-1027/comparison/before-12p.png) | [375×667](screens/mobile-fix-1027/comparison/after-12p.png) |
| 连接前创建、加入 | [按钮仍可点](screens/mobile-fix-1027/baseline-main/offline-create-join-375.png) | [禁用并显示连接提示](screens/mobile-fix-1027/after/offline-create-join-375.png) |
| 连接前入口入座 | [仍可点](screens/mobile-fix-1027/baseline-main/offline-entrance-claim-375.png) | [禁用并显示连接提示](screens/mobile-fix-1027/after/offline-entrance-claim-375.png) |
| 连接前真实大厅入座 | [仍可点](screens/mobile-fix-1027/baseline-main/wt-375.png) | [禁用并显示连接提示](screens/mobile-fix-1027/after/wt-375.png) |
| 绘画派对触控区 | [375px](screens/mobile-fix-1027/baseline-main/tp-375.png) | [375px，按钮换行](screens/mobile-fix-1027/after/tp-375.png) |
| 请留遗言音效触控区 | [36px](screens/mobile-fix-1027/baseline-main/dm-375.png) | [44px](screens/mobile-fix-1027/after/dm-375.png) |

![修改后，12 人](screens/mobile-fix-1027/comparison/after-12p.png)

## 完整联机验收

使用实际产品页面创建房间、入座、准备、开局，通过真实按钮推进至服务器终局。机器人优先使用红牌，没有红牌时仍可抽牌或随机使用其他牌；不跳过服务器规则，不注入终局，不以静态对照代替完整局。

| 项目 | 4 人，390×844 | 12 人，375×667 |
|---|---:|---:|
| 正常到达终局 | 是 | 是 |
| UI 操作步骤 | 327 | 321 |
| 游戏循环耗时 | 173,837ms | 203,584ms |
| 页面布局检查次数 | 1,516 | 2,928 |
| 内容裁切告警 | **0** | **0** |
| 超框及座位相压告警 | **0** | **0** |
| 刷新恢复 | 1/1 | 1/1 |
| 短暂断网恢复 | 1/1 | 1/1 |
| 过滤后控制台错误 | 0 | 0 |
| 脚本退出码 | **0** | **0** |

合计 **648 步、4,444 次页面布局检查，两局均正常结束**。阶段包含黎明、白天、审判、人物选择、黑牌事件及结算；一次随机局不保证覆盖全部角色和卡牌组合。控制台统计沿用既有脚本的网络/音频过滤规则，不能解释成原始网络错误总数为零。

验收脚本额外检查：

1. `.wt-seat`、`.wt-seat-public`、`.wt-accuse-row` 直接比较 scroll/client 尺寸，**不加 1px 容差**，也不因 `overflow:hidden` 而豁免。
2. 可见座位高度至少 74px / 54px；用布局坐标检查座位之间相压。
3. 普通可见元素越过 viewport 或物件边界会告警；明确 `overflow:auto/scroll` 且可通过滚动到达的事件/结算列表不误报为裁切，横向越界仍检查，座位的严格检查始终独立执行。
4. 等待中的玩家也检查布局；保留完整 `layout-checkpoints.json`，不只检查当前操作者。

统计及逐阶段截图：[4 人](screens/mobile-fix-1027/release-4p/summary.json)、[12 人](screens/mobile-fix-1027/release-12p/summary.json)；[4 人终局](screens/mobile-fix-1027/release-4p/99-result-p1.png)、[12 人终局](screens/mobile-fix-1027/release-12p/99-result-p1.png)。

## 全仓验证

- `npm run build`：通过。原有 `table-wood.webp` 构建时解析警告及大 chunk 警告保留，没有构建错误。
- `npm run typecheck`、`git diff --check`：通过。
- 全仓测试：**78 个文件、1238/1238 通过，无跳过**；最终命令 `npm test -- --maxWorkers=2 --testTimeout=30000`，耗时 198.49 秒。[原始测试输出](MOBILE_FIX_2026-10-27_TESTS.txt)。
- 默认 5 秒限制也曾完整跑过 1238/1238（386.08 秒）；随后与多个浏览器并行的一轮有 3 项 100 局模拟超过 5 秒（5.4–7.1 秒）。最终停止浏览器负载，完整重跑所有断言并明确设 30 秒上限，没有跳过失败用例或改变断言。
- 最初另有 1 项魔法运动员赛道哈希测试受 Windows CRLF 影响。将该工作文件恢复为 `git show HEAD:<路径>` 的原始 LF 字节后，该测试 6/6 通过；该文件无 Git 内容差异，**不提交任何其他游戏逻辑修改**。

## 测试脚本与本地复现

新增 `scripts/verify-mobile-controls.ts`、`scripts/verify-mobile-layout-snapshots.ts`、`scripts/preview-mobile-fix-baseline.mjs`；增强既有 `scripts/verify-witch-town-browsers.ts`。还修正了测试机器人在辩护阶段错误选择 7 点目击的问题，改选合法指控牌，无合法牌则取消；没有为测试修改游戏规则。

PowerShell：

```powershell
npm run build
$env:PORT='3447'
$env:WT_ALLOW_CANDIDATE_COUNTS='1'
$env:WT_DATA_DIR='output/mobile-fix-1027/wt'
$env:DBD_DATA_DIR='output/mobile-fix-1027/dbd'
npm run server
```

另一个终端运行 `node scripts/preview-mobile-fix-baseline.mjs`，得到本地旧版预览 `http://127.0.0.1:3448`。再运行：

```powershell
$env:WT_URL='http://127.0.0.1:3447'
$env:CHECK_LABEL='after-repro'
npx tsx scripts/verify-mobile-controls.ts
npx tsx scripts/verify-mobile-layout-snapshots.ts
$env:WT_PLAYERS='4'; $env:WT_W='390'; $env:WT_H='844'
$env:WT_SHOTS='docs/witch-town/validation/screens/mobile-fix-1027/repro-4p'
npx tsx scripts/verify-witch-town-browsers.ts
$env:WT_PLAYERS='12'; $env:WT_W='375'; $env:WT_H='667'
$env:WT_SHOTS='docs/witch-town/validation/screens/mobile-fix-1027/repro-12p'
npx tsx scripts/verify-witch-town-browsers.ts
```

## 仍未验收的范围

- 实体 iPhone Safari 的地址栏、软键盘、安全区、原生长按菜单和锁屏恢复；微信浏览器及低端安卓性能。本轮是 Chromium 手机尺寸回归，不能宣称全部真机无问题。
- 本轮按要求完整重跑 4、12 人；5–11 人没有逐人数重新完成浏览器整局。既有规则测试仍全部执行。
- 其他游戏仅复验本次涉及的人数按钮和音效触控区，不是所有游戏整局功能重新验收。

三项指定修复已落实在产品代码，验收结果及前后截图如上。只推送 `codex/mobile-fix-1027`，不部署；推送后停止。
