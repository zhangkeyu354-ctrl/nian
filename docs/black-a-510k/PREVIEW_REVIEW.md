# 双黑A五十K · 本地视觉与声音评审

以下是 2026-11-24 在 E 盘隔离工作树生成的实际文件。深绿和明亮两套配色均已接入真实四人对局，玩家可以在顶部切换，刷新后保留选择。

| 内容 | 可打开文件 |
|---|---|
| 实际对局，深绿 390px | [live-play-390.png](research/live-play-390.png) |
| 实际对局，明亮 390px | [live-play-light-390.png](research/live-play-light-390.png) |
| 实际对局，最窄 320px | [live-play-320.png](research/live-play-320.png) |
| 实际第一局结算 | [live-result-390.png](research/live-result-390.png) |
| 实际明亮主题结算 | [live-result-light-390.png](research/live-result-light-390.png) |
| 实际交换后第二局 | [live-second-round-390.png](research/live-second-round-390.png) |
| 早期交互小样，含 15/17 张与特殊牌 | [preview.html](research/preview.html) |
| 纸牌录音 A/B 与三段音乐候选 | [audio-ab.html](research/audio-ab.html) |

实际 UI 采用 CC0 高清纸牌，并以 CSS 层次、细边框、低幅光影和短促位移动效统一页面。没有把候选项目的大幅背景贴图直接搬入产品。早期小样的纸牌为示意绘制，最终观察应以实际对局截图为准。

结算页按钮已在深绿和明亮主题下用实际计算后的前景色/背景色检查对比度，均超过 4.5:1；切换配色时取消按钮颜色过渡，避免瞬间白字落在金色背景上。结算页现分开写明末墩、余牌、实抓零分、基础零分、剃光头和下局抽牌数量。

截图来自 Chromium 手机视口模拟；它不等于 iPhone/Android 真机验收。音频页可由本地浏览器打开并逐项点击；解码通过不等于人耳确认。视觉与核心音效仍待用户复核，暂不标记正式 UI 验收通过。
