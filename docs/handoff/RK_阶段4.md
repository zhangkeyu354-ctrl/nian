# 拉密第 4 阶段交接

日期：2026-10-25；分支 codex/rummikub。正式入口 /?game=rk。完成本阶段后停止，未推送、未部署；第 5 阶段全站专项回归尚未执行。

## 做了什么

- apps/web/src/rk/Rummikub.tsx、rk-net.ts、rk.css、ui-model.ts：接入第 3 阶段真实房间；大厅/邀请/人数计时局数/公开抽先手/私有草稿/破冰进度/组牌/拆分合并/撤销重做还原/摸牌/确认/他人回合/超时/断线恢复/结算累计与下一局。
- 两种操作均为真实服务器命令：点选多张后新建或放入组；pointer events 长按 150ms 拖拽、放大跟手、组合插缝、禁止桌面牌回手、双指缩放 0.7–1.6。UI 不冒充权威规则，确认亮灭依据服务器 validation。
- 深绿 #1F4D3A 绒布织纹、象牙牌、大数字、四色符号、木色双层牌架。手机手牌 38×52/4px、两行9列能完整显示18张；横屏70/30桌面和右栏、三列可滚牌架；电脑1200居中、48×66牌。主坞64px，触控区域≥44px（小牌扩展命中层，缩小时补偿）。
- 复用 DM 的 ActionDock、CountdownRing 与 drawing/feel.ts；放牌/成功/非法/滴答/胜利、轮到你/罚牌震动，菜单可关闭。偏好访问 try/catch；reduced-motion 关闭动画。
- 官方 Logo/Joker/Classic 盒子均本地 WebP；来源、裁切、原始采色、适配后的对比度和 SHA256 留 ASSETS.md / verification/stage4-assets.json。显示蓝/橙加深以满足4.5:1，不伪称与原始浅色像素完全一致。
- 首页 GameLobby 增加官方盒子与Logo，main.tsx 增加懒加载入口；全站 button 的四条排除规则仅加 .rk-world *。其他游戏的引擎、协议、服务器和专属样式未修改。

## 实际验收结果

| 命令/检查 | 真实结果 | 证据 |
|---|---|---|
| TDD Red：npx vitest run apps/web/test/rk-ui-model.test.ts | 缺失 ui-model 导入，1 套件预期失败，未执行用例 | verification/stage4-red.txt |
| 对应 Green | 2/2 新增 UI 模型用例通过 | 终端记录；最终全仓亦包含 |
| npm run typecheck | exit 0，无类型错误 | verification/stage4-typecheck.txt |
| npm run build | exit 0；构建仍有既有大 chunk 提示，无构建错误 | verification/stage4-build.txt |
| npx tsx scripts/verify-rk-ui.ts | exit 0；29 张截图、9 项 UI 流程通过，监听到 pageerror 0 | ui-v1/audit.json、verification/stage4-ui.txt |
| npm test 最终串行复跑 | exit 0；58/58 文件、892/892 用例通过，0 失败；201.62秒 | verification/stage4-full-test.txt |
| npx prettier --check（本次新 TS/TSX/CSS） | 全部匹配文件通过 | 终端输出 |
| git diff --check / staged --check | 最终无空白错误 | 提交前执行 |

中间真实失败保留：并行浏览器验收时，原有 game-engine privacy.test.ts 的 2903 回放超过默认5000ms（实际5942ms），该轮891过/1超时，未篡改或删除记录。浏览器退出后单独重跑该文件5/5通过（3.99秒），再以原始 npm test 默认配置串行重跑892/892通过；没有提高测试超时或改其他游戏代码。见 stage4-full-test-timeout.txt、stage4-privacy-retry.txt。

UI 自审中也曾因悬浮拖牌选择器、横屏尺寸、键盘抑制、触控区域等失败，均修正后重建重截；不声称所有中间验收一次通过。

## 截图和自审

原图29张位于 docs/rummikub/ui-v1/；6张 review 拼图供快速浏览。逐张索引、7项总指令勾选、修正记录与自动审计在 ui-v1/README.md。

- portrait-*：390×844，12状态。
- landscape-*：844×390，12状态。
- portrait-hand18.png：18张全部可见；portrait-table22.png：22组，0.7倍缩放，末组滚动可达。
- desktop-1280.png：1280×800；homepage-box.png：首页官方包装盒和Logo。
- ui-full-game-result.png：两浏览器完整 UI 对局 seed2113，101回合，正常胜利（不是空池终局），最终-17/+17。

所有原始截图使用既有 screenshot-check.ts 的 assertUiShot；没有用占位页或修图冒充运行界面。9项UI流程包括两方向拆分/合并、原生长按/禁止回手/双指缩放、撤销/重做/还原、键盘选择、菜单设置与规则、UI建房加入准备开始、完整对局、房主下一局且累计分保留。

## 剩余边界

- Q01–Q09 继续沿用登记默认；界面规则明确说明普通超时罚3与纸质原版普通超时摸1的区别，没有改规则引擎。
- 手机验收为真实Chromium手机上下文及原生CDP触控事件；未宣称完成Safari/Android真机测试。离线/重连通过浏览器断网验证。
- 官方字体文件没有提取；数字为参照官方示例的本地字体回退，牌架/材质/符号为代码绘制，明确记入ASSETS。
- 本阶段未执行第5阶段的 verify:mobile-interfaces、各游戏浏览器等整套专项回归；之后按总指令进入第5阶段，不将前一阶段结果冒充此次执行。
- 未改XP，未推main，未部署。已有未跟踪总指令/其他AI方案和tmp保持原样；reference/data/output不提交。

停在第4阶段，等待下一条指令。
