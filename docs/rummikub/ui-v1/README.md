# 拉密 UI V1 自审与截图索引

2026-10-25。29 张真实浏览器原始截图 + 6 张供浏览的拼图。拼图只缩放排版，不修饰 UI，不替代原图。
手机竖屏 390×844、横屏 844×390 各 12 状态；另有电脑 1280×800、18 张手牌、22 组桌面、首页盒子及真实完整 UI 对局结算。

图名对应：lobby 大厅、draw 定先手、empty 我的回合空草稿、progress 破冰进度、drag 拖拽中、invalid 非法组合、split 拆分、joker 百搭显示、others 别人回合、timeout 超时罚牌、result 结算、disconnect 断线。

## 逐张复核

已查看所有原始状态的 review 拼图，另查看手机非法组、超时、18 张牌、横屏断线及电脑原图。最终织纹微调后再次重截，布局断言仍通过。

| 原始图 | 文字/长名字 | 页面滚动/遮挡 | 牌面/按钮/品牌 | 自动几何 |
|---|---|---|---|---|
| [portrait-lobby](portrait-lobby.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-draw](portrait-draw.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-empty](portrait-empty.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-progress](portrait-progress.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-drag](portrait-drag.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-invalid](portrait-invalid.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-split](portrait-split.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-joker](portrait-joker.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-others](portrait-others.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-timeout](portrait-timeout.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-result](portrait-result.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-disconnect](portrait-disconnect.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-lobby](landscape-lobby.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-draw](landscape-draw.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-empty](landscape-empty.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-progress](landscape-progress.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-drag](landscape-drag.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-invalid](landscape-invalid.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-split](landscape-split.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-joker](landscape-joker.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-others](landscape-others.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-timeout](landscape-timeout.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-result](landscape-result.png) | ✓ | ✓ | ✓ | 通过 |
| [landscape-disconnect](landscape-disconnect.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-hand18](portrait-hand18.png) | ✓ | ✓ | ✓ | 通过 |
| [portrait-table22](portrait-table22.png) | ✓ | ✓ | ✓ | 通过 |
| [desktop-1280](desktop-1280.png) | ✓ | ✓ | ✓ | 通过 |
| [homepage-box](homepage-box.png) | ✓ | ✓ | ✓ | 像素检查 |
| [ui-full-game-result](ui-full-game-result.png) | ✓ | ✓ | ✓ | 像素检查 |
## 总指令清单

- [x] 文字没有无意溢出、遮盖或重叠；10 字长名字在玩家条与结算均可读，胜利标签不悬成单字。
- [x] 无页面横向滚动；ActionDock 不遮牌架。18 张牌全部落在竖屏牌架可见宽度内；更长牌架内部横滚。横屏三列牌架内部竖滚，断线条占真实布局行。
- [x] 牌面颜色、●▲■◆、数字和小圆点可辨；象牙材质、压边阴影与双层木牌架按实体牌方向处理。
- [x] Joker、Logo、包装盒均为官方来源、非占位图，尺寸至少显示的 2 倍；Joker 右下角按合法解释显示代表值。
- [x] 一个主要确认按钮；不合法与别人回合禁用，等待文案和服务器中文拒因正确；请求中锁定并显示旋转指示。
- [x] 22 组桌面可缩至 70%，全部保留，实际滚到最后一组并断言完整落在视口内；原生双指缩放验证至 160%。
- [x] 对比 DM 精修截图 docs/dying-message/polish-screens/speech-and-evidence.png：采用同等级的材质层次、真实素材、光影与操作坞，不是默认 HTML 按钮或纯色方块。木桌与暗色推理桌风格分别保留，不把 DM 的霓虹配色照搬给拉密。

## 自动与交互验收

29 张均通过 screenshot-check.ts 的真实浏览器像素非空白检查。27 张对局/大厅状态另检查图片解码、页面宽度、牌架/操作坞几何及所有可点区域≥44px（包括小牌外扩命中层、0.7倍缩放下的补偿）。首页盒子与真实整局结果为额外像素截图，亦人工复核。

audit.json 内 9 项 UI 流程全部通过：两方向拆分后合并、原生长按拖放/禁止回手/双指缩放、撤销重做全部还原、键盘选牌、菜单设置/规则、UI 建房加入准备开始、2 浏览器完整对局、房主下一局累计分保留。
完整 UI 对局 seed 2113，101 回合，正常出完获胜，-17/+17；每步通过页面点击真实 Socket.IO 命令，不直接用引擎替代用户操作。边界场景是隔离测试服务器预置的合法快照，不是公开的生产 mock 接口。

已修正并重新截图的问题：拖拽浮牌选择器误作用、非法组提示与剪刀重叠、横屏按钮挤出、排序按钮过窄、键盘点击被拖拽抑制误拦、状态提示遮玩家名、18 张牌边缘裁切、缩放后命中区不足。

Chromium 手机上下文与原生触控事件已验证；未声称完成 iOS Safari/Android 真机验证。四种数字色对比度 4.89/4.77/4.92/13.59，来源与适配见 ../ASSETS.md。
