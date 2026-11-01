# 脑洞量表阶段 5：全仓回归交接（2026-11-01）

## 结果与停止点

当前仓库 **43 条可执行回归命令最终全部通过，最终失败 0**。不能据此声称用户清单已无缺项：**老二哲学**在当前 main / 工作区没有代码、入口和浏览器脚本，未执行；**卡里巴湖**未在 main，按用户条件跳过。来源树在 availability.json。

已完成 README、所有可执行检查、失败复核与证据归档。现停止，不推 main、不部署、不合并；合并上线留给 Claude 复验。未做 Git 提交；ND 文件仍在当前工作区，既有其他游戏改动保留，临时文件和原始素材不属于提交范围。

## 同步与工作区保留

分支 codex/naodong-scale，基线 a010a5a9919b5bbce83f2e8262182d6f51f236c8。

先记录 344 个跟踪文件改动、891 个未跟踪文件的清单/哈希与补丁，临时 stash：f87c97e2d936a54bd749e2879022ac296035340e。执行 git pull --rebase origin main，再执行 git rebase origin/main，均确认已是最新，无冲突。恢复后 891 个未跟踪文件逐字节核对一致。最后再次 git ls-remote origin refs/heads/main，仍为同一提交。

备份 stash 已恢复且保留，**不要再次 apply**。SOURCE-PROTECTION.json 核对 162 个其他游戏引擎、数据与共享前端源文件，改动 0；既有 UI v2 的 132 个截图/报告文件保留原字节。

## 每条命令的真实结果

通过数的单位列在范围栏，不把测试、场景、回合、截图、数据包混加成一个断言总数。早段执行器直接运行 package.json 的等价脚本入口；mobile-interfaces 按原 && 管线三步执行。恢复后的 npm 别名直接使用 npm run。实际入口、退出码和时间见 MANIFEST.json。

| 命令 | 最终通过数 | 最终失败数 | 范围 / 说明 | 证据 |
| --- | ---: | ---: | --- | --- |
| npm test | 1426 | 0 | 测试（100文件） | [日志](../naodong-scale/stage5/logs/npm-test-final.log) |
| npm run typecheck | 1 | 0 | 执行，TS诊断错误0 | [日志](../naodong-scale/stage5/logs/typecheck-final.log) |
| npm run build | 1 | 0 | 构建；已有主chunk体积提示，非错误 | [日志](../naodong-scale/stage5/logs/build-final.log) |
| npm run verify:nd-lobby | 5 | 0 | 首页游戏盒/正式入口/真实建房/离座检查 | [日志](../naodong-scale/stage5/logs/nd-lobby-final.log) |
| npm run verify:replays | 3 | 0 | 局逐事件回放 | [日志](../naodong-scale/stage5/logs/replays.log) |
| npm run verify:lan-protocol | 3 | 0 | 局；605 条命令、3025 次视图核对、64 次预期非法拒绝 | [日志](../naodong-scale/stage5/logs/lan-protocol.log) |
| npm run verify:cn-protocol | 12 | 0 | 检查组 | [日志](../naodong-scale/stage5/logs/cn-protocol.log) |
| npm run verify:nd-protocol | 47 | 0 | 检查；54082 次视图核对，含两次全新进程恢复 | [日志](../naodong-scale/stage5/logs/nd-protocol.log) |
| npm run verify:mobile-interfaces | 197 + 64 | 0 | 捕获测试 + 实际手机界面场景（三步管线均通过） | [日志](../naodong-scale/stage5/logs/mobile-interfaces-browser.log) |
| npm run verify:lan-lobby | 3 | 0 | 大厅人数/阵营场景 | [日志](../naodong-scale/stage5/logs/lan-lobby.log) |
| npm run verify:lan-browsers | 2 | 0 | 整局；337 条 UI 命令、343 次隐私帧核对、10 次完整棋盘截图核对 | [日志](../naodong-scale/stage5/logs/lan-browsers.log) |
| npm run verify:ma-browsers | 4 | 0 | 场比赛（1 个4人整局），速度切换正常 | [日志](../naodong-scale/stage5/logs/ma-browsers.log) |
| npm run verify:cn-browsers | 2 | 0 | 局，4 个隔离上下文 | [日志](../naodong-scale/stage5/logs/cn-browsers.log) |
| npm run verify:dm-browsers | 1 | 0 | 4人完整对局 | [日志](../naodong-scale/stage5/logs/dm-browsers.log) |
| npm run verify:dm-teamplay | 1 | 0 | 8人团队协作场景 | [日志](../naodong-scale/stage5/logs/dm-teamplay.log) |
| npx tsx scripts/verify-dm-assets.ts | 153 | 0 | 素材，另检查桌面/360px布局 | [日志](../naodong-scale/stage5/logs/dm-assets.log) |
| npx tsx scripts/verify-dm-photo-visual.ts | 15 | 0 | 高清角色+原生标签与手机/桌面验证（现行HD入口别名） | [日志](../naodong-scale/stage5/logs/dm-photo-visual.log) |
| npx tsx scripts/verify-dm-hd-visual.ts | 15 | 0 | 高清角色+原生标签与手机/桌面验证 | [日志](../naodong-scale/stage5/logs/dm-hd-visual.log) |
| npx tsx scripts/verify-drawing-browsers.ts | 2 | 0 | 模式的真实浏览器完整流程 | [日志](../naodong-scale/stage5/logs/drawing-browsers.log) |
| npx tsx scripts/verify-drawing-studio-eight.ts | 2 | 0 | 8人画布/工具场景 | [日志](../naodong-scale/stage5/logs/drawing-eight.log) |
| npx tsx scripts/verify-drawing-canvas-clear.ts | 14 | 0 | 画布清理/布局/导出场景 | [日志](../naodong-scale/stage5/logs/drawing-clear.log) |
| npx tsx scripts/verify-drawing-party.ts | 16 | 0 | 隔离复跑整局：tp/fa各3–10人；首轮14局通过后1次建房失败 | [日志](../naodong-scale/stage5/logs/drawing-party-retry.log) |
| npx tsx scripts/verify-drawing-load.ts | 200 | 0 | 8人笔迹包，8个客户端各收到25个私密增量；首轮1次建房失败 | [日志](../naodong-scale/stage5/logs/drawing-load-retry.log) |
| npx tsx scripts/verify-rk-browsers.ts | 11 | 0 | 检查，含2/3/4人完整对局 | [日志](../naodong-scale/stage5/logs/rk-browsers.log) |
| npx tsx scripts/verify-rk-ui.ts | 29 | 0 | 正式UI截图/布局/图像断言场景 | [日志](../naodong-scale/stage5/logs/rk-ui.log) |
| npx tsx scripts/verify-rk-xp-browsers.ts | 4 | 0 | 检查+13张截图；5人162回合、6人135回合整局 | [日志](../naodong-scale/stage5/logs/rk-xp-browsers.log) |
| npm run verify:xb-topics | 160 | 0 | 题库条目检查（类型64/64/32） | [日志](../naodong-scale/stage5/logs/xb-topics.log) |
| npm run verify:xb-browsers | 3 | 0 | 3/6/10人整局，共19轮 | [日志](../naodong-scale/stage5/logs/xb-browsers.log) |
| npm run verify:xb-feel | 1 | 0 | 完整交互脚本；8项特性报告通过，1646帧采样最低每秒141帧（桌面仿真） | [日志](../naodong-scale/stage5/logs/xb-feel.log) |
| npm run verify:xb-layout | 48 | 0 | 阶段布局样例 | [日志](../naodong-scale/stage5/logs/xb-layout.log) |
| npm run verify:xb-ui-v3 | 30 | 0 | 截图/交互场景 | [日志](../naodong-scale/stage5/logs/xb-ui-v3.log) |
| npm run verify:xb-art | 42 | 0 | 美术/交互截图用例 | [日志](../naodong-scale/stage5/logs/xb-art.log) |
| npm run verify:xb-word-change | 1 | 0 | 完整换词场景（含重连、角色/分数保留和答案隐私） | [日志](../naodong-scale/stage5/logs/xb-word-change.log) |
| npx tsx scripts/verify-xb-audio.ts | 9 | 0 | 音效离线渲染响度/峰值样例 | [日志](../naodong-scale/stage5/logs/xb-audio.log) |
| npm run verify:ss-protocol | 61 | 0 | 检查；6局、5188次视图核对 | [日志](../naodong-scale/stage5/logs/ss-protocol.log) |
| npm run verify:ss-browsers | 37 | 0 | 检查；6局、3454次网络核对、2675次DOM核对 | [日志](../naodong-scale/stage5/logs/ss-browsers.log) |
| npx tsx scripts/verify-ss-ui-v1.ts | 71 | 0 | 检查；50张截图、4134像素样本全通过；axe复杂背景未完成1979项 | [日志](../naodong-scale/stage5/logs/ss-ui-retry-final.log) |
| npx tsx scripts/verify-ss-ui-art.ts | 89 | 0 | 检查；66张截图、5633像素样本全通过；axe复杂背景未完成2747项 | [日志](../naodong-scale/stage5/logs/ss-art-retry-final.log) |
| npm run verify:rr-protocol | 15 | 0 | 协议检查组 | [日志](../naodong-scale/stage5/logs/rr-protocol.log) |
| npm run verify:rr-browsers | 6 | 0 | 浏览器验收步骤 | [日志](../naodong-scale/stage5/logs/rr-browsers.log) |
| npx tsx scripts/verify-witch-town-browsers.ts | 1 | 0 | 4人整局，2176次布局检查、0溢出/页面错误 | [日志](../naodong-scale/stage5/logs/wt-browsers.log) |
| npm run verify:nd-browsers | 21 | 0 | 4/6/9人三局五轮；2172网络、3202DOM核对 | [日志](../naodong-scale/stage5/logs/nd-browsers.log) |
| npm run verify:nd-ui | 19 | 0 | 正式UI检查；5局、131张截图、2131网络投影、19座位隐私检查 | [日志](../naodong-scale/stage5/logs/nd-ui-final.log) |
| 老二哲学浏览器测试 | 0 | 未执行 | main / 工作区缺代码及命令，不记为通过 | availability.json |
| 卡里巴湖浏览器测试 | 0 | 条件跳过 | 未在 main | availability.json |

额外的首页对比度复核：稳定帧 15 项全部通过，失败 0，见 HOME-CONTRAST.json。本地构建首页可见脑洞量表官方游戏盒；实际点击进入 /?game=nd、创建房间入座、离座返回均通过。这里是本地回归结果，不是线上已发布。

ND 协议浏览器完成 4/6/9 人各 5 轮；它是浏览器协议客户端，不冒充正式游戏 UI。另有正式 ND UI 的 4/6/9 人基础成功、4 人专家成功、9 人第 2 轮预期全队失败，共 5 局通过。真实失败终局是通过的边界案例，不计测试失败。最新构建截图在 stage5/ui/，原审核通过的 ui-v2/after/ 已还原保留。

## 首轮失败与真实修复

首轮与一次中间重跑共 **5 次失败执行**，原始日志均保留，没有删除失败记录：

1. 绘画协议与负载各 1 次：共享测试服务累积到 drawing-rooms.ts 固定 **20 房间上限**，后续建房返回“绘画房间已满”。不是修改限制使其通过；改用每条命令独立的新进程和数据目录，完整复跑 tp/fa 各 3–10 人 **16 场景**，再单独验证 **8 人 / 200 笔迹包**，均通过。
2. 旧汽水 UI 脚本首轮 1 次：统计 .ss-bribe-card img 把头像、行李和受贿箱混在一起，实际 21 而非预期 7。只将选择器改为直接子级 .ss-case，仍严格检查 7 个受贿箱，与现行美术脚本一致。
3. 旧汽水 UI 脚本中间重跑 1 次：被拖的牌会从手牌移除，.first() 重新指向下一张，旧 aria-pressed 断言检查了错误对象。改为事先固定原牌 ID / 箱图，验证原牌离开手牌、目标仅有 1 张且图片匹配。鼠标和真实触摸两种路径均完整复跑通过。
4. 汽水美术首轮 1 次：主页 15 个对比度采样失败。独立复核发现，采集透明度时首页仍在入场动画，截图又快进到结束，帧不一致；等待首页 opacity=1 后仅剩 **ND 署名真实对比度 4.43**。产品修复仅去掉 .nd-world.nd-cover h2 small 继承的透明度。没有改其他游戏样式，没有降低 4.5 阈值。两份汽水脚本等待动画稳定再采样，最终像素样本 **4134/4134** 与 **5633/5633** 全通过。

执行中曾检测到旧后台进程已终止，未拿到退出码的 xb-feel 与一次绘画隔离重跑单独标为中断，没有记通过。已通过结果保留，未完成项在全新服务上重新执行。interrupted.json 与对应日志留档。

本轮改动：ND 首页署名透明度；两个汽水浏览器测试的旧选择器 / 稳定帧等待；新增 verify:nd-lobby 测试与 npm 别名；README 与本交接。**其他游戏引擎与样式未改**。关键补丁见 STAGE5-FIXES.patch。

## 真实限制与未解决项

- 老二哲学缺少代码和测试入口，不能用其他游戏的结果冒充；需该游戏进入工作区后补跑，因此完整用户清单状态保留缺项。
- 卡里巴湖未进入 main，符合用户允许跳过的条件。
- 汽水的 axe 对复杂图像/渐变背景有未完成判定，UI 累计 1979 项、美术累计 2747 项（跨快照采样，非唯一元素数）；实际自动 violations=0，低于 17px 的项=0，像素对比度失败/未测=0。没有把这些 incomplete 项宣传成“所有无障碍审计完全通过”。报告保留 accessibilityStatus=unresolved，供 Claude 复核。
- 构建存在已有主 chunk 超过 500 kB 的体积提示，构建通过；本次未扩展到其他游戏拆包重构。
- 浏览器为桌面 Chromium 模拟手机视口；不声称实体手机硬件或真实震动已经验证。

## 证据与交接

- docs/naodong-scale/README.md：入口、玩法/规则来源、102 道题库、运行方式、设置与快照、代码、ND 验收命令。
- docs/naodong-scale/stage5/VALIDATION.json、MANIFEST.json：汇总、每条真实退出码与复跑。
- ND-PROTOCOL.json、ND-BROWSERS.json、ui/REPORT.json：ND 专项结果。
- SS-UI-FINAL-AUDIT.json、SS-ART-FINAL-AUDIT.json：汽水最终审计，初始审计另档保留。
- logs/：原始成功/失败/复跑输出；SOURCE-PROTECTION.json、STAGE5-FIXES.patch、sync.json：同步与改动边界。

本轮启动的测试服务和浏览器全部关闭；没有操作任何推送、部署或外部消息。当前分支与工作区交由 Claude 复验。
