# 手感 v2 验收证据

390×844竖屏；10人真实服务器对局。3/6/10人整局和横竖屏布局另见[浏览器完整局报告](full-games-report.json)及工作树忽略目录`output/xb-feel-v2/full-games/`。原v1横竖屏全阶段图库保留于[ui-v1](../ui-v1/README.md)。

| 场景 | 截图 |
| --- | --- |
| 揭晓预热 | [07-reveal-warmup.png](07-reveal-warmup.png) |
| 翻身份起段 | [08-reveal-first.png](08-reveal-first.png) |
| 翻身份中段 | [09-reveal-middle.png](09-reveal-middle.png) |
| 计分与换位 | [10-reveal-score.png](10-reveal-score.png) |
| 扔粑粑 | [03-poop.png](03-poop.png) |
| 连击 | [04-combo.png](04-combo.png) |
| 长按确认 | [02-hold-confirm.png](02-hold-confirm.png) |
| 开播 | [01-opening.png](01-opening.png) |
| 终局领奖台 | [11-finale.png](11-finale.png) |
| 省电模式 | [06-power-save.png](06-power-save.png) |
| 慢网反馈 | [00-network-slow.png](00-network-slow.png) |
| 拖拽预览 | [05-drag-preview.png](05-drag-preview.png) |
| 横滑称号 | [12-finale-titles.png](12-finale-titles.png) |

## 视频与性能

- [完整手感演示录屏](feel-v2-demo.webm)（Playwright录屏不含系统音频；网页声音请在本地试玩检查）。
- [Chromium Performance trace](reveal-performance.trace.json.gz)，解压后可导入Chrome DevTools的Performance面板。
- [性能数值](performance.json)：平均 **58.4 fps**，最低一秒 **54帧**，高于50帧验收线；本机Chromium，录屏同时开启。记录到3个超过50ms的帧，最长66.6ms，未隐藏这些抖动。
- 性能段不执行截图解码和像素排序，截图在第二轮另行采集；否则验收器会占用页面主线程。采用标准timeline/frame类别，避免开启完整cc调试跟踪的额外开销。
- [手感断言](feel-report.json)覆盖长按中止/完成、拖拽、连击、抖掉、省电、主题容量、娱乐状态不变、零页面异常。
- [触摸反馈](feedback.json)记录首帧延迟与按住后的0.94缩放。

[总体验证清单](verification.json) · [题库统计/去重](topics-report.json) · [答案不入前端产物](bundle-privacy.json) · [规则不变校验](scoring-invariance.json)

设备限制：震动测试检查API请求及开关，不等同于已在所有手机硬件上验证；系统减少动态自动启用省电，真实手机还可手动关闭动画。
