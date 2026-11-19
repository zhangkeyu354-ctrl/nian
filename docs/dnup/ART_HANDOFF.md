# 反转王牌美术交接

分支 `codex/dnup-art`，基于 `origin/claude/dnup`。本次没有改规则引擎、服务器、协议或任何 `data-testid`；没有合并或部署。

## 视觉与交互

- 深绿毡布桌面（横、竖 WebP）、米白纸纹通用牌面，数字继续由文字渲染；采用自托管 ZCOOL KuaiLe 拉丁子集，授权见 `apps/web/public/assets/dnup/fonts/OFL.txt`。
- 大厅彩色数字封面、房间页 logo；logo 的 u 和 p 由旋转 n 和 d 构成。素材均位于 `apps/web/public/assets/dnup/`。
- 字母计分标记、整手错峰旋转、压回及拿牌的飞牌、名次提示、终局数字飘落、轮到自己时的轻震动；支持系统减少动态效果设置。音效是需求中的可选项，未增加。
- 修正展示牌嵌套禁用按钮导致对手组合难以点击的问题；展示用牌改为 span，原有测试标识保留。

## 验证

- `npm test -- --testTimeout 30000`：125 个测试文件、1693 项通过。直接运行默认 `npm test` 时，5 人和 6 人随机整局各超过默认 5 秒超时；单独运行 Dnup 测试 26 项通过。
- `npm run typecheck`：通过。此仓库需先运行 `npx vitest run --config apps/web/test/capture.config.ts` 及 `npx tsx scripts/collect-ui-scenarios.ts` 生成被忽略的 `apps/web/test/scenarios.generated.json`。
- `npm run build`：通过；构建仍报告其他游戏的 `dying-message-original/table-wood.webp` 未解析警告。
- Chromium 的三部 iPhone 13 设备模拟器通过真实服务器进行多次三人整局，包含选牌、翻转、下一轮及终局；额外执行拿走整组并检查飞牌元素，页面无未捕获异常。双人和六人分别开局检查布局；并非真实 iPhone 或 Safari 测试。

## 截图

- [房间](screens/dnup-room.webp)
- [选牌与底部操作](screens/dnup-game-selected.webp)
- [对手组合及拿牌／加牌弹窗](screens/dnup-action-sheet.webp)
- [本轮结束](screens/dnup-round-end.webp)
- [终局](screens/dnup-finished.webp)
- [双人局](screens/dnup-2-player.webp)
- [六人局](screens/dnup-6-player.webp)

截图来自浏览器设备模拟，长页截图可能与实际滚动视口表现不同。

## 素材来源

桌面和卡纸纹理由内置 imagegen 生成并压缩为 WebP：提示分别为“深森林绿、顶视、细纤维、中心柔光的安静实体毡布桌面，无物件文字”和“均匀暖象牙色无涂层卡纸微细纤维，无文字和物件”。Logo 和封面以程序绘制；字体许可证随素材保存。
