# 双黑A五十K资源调研（进行中）

调研日期：2026-11-24。范围：全球公开项目与游戏资产网站的英文检索，已查看 GitHub 项目说明、许可入口、部分演示说明，以及 OpenGameArt 原始素材页面。中文、日文、GitLab、Codeberg 与真机视觉对照尚未完成，T60 保持 CHECK_REQUIRED。评分为当前初筛，不代表已完成手机实测。

| 类别 | 候选 | 新近/维护证据与实际预览证据 | 授权状态 | 品质初筛 | 处理 |
|---|---|---|---|---:|---|
| 手机多人游戏 | [8tp/Coup](https://github.com/8tp/Coup) | 仓库列出 288 次提交、手机 360/390 审计、44px 触控、卡牌飞行动画、分层录音及音乐；已实际打开[在线演示](https://coup.8tp.dev)，用 390×844 浏览器进入机器人对局并截取[首页](research/coup-mobile-390.png)及[牌桌](research/coup-game-390.png) | 代码 MIT；**美术与音频需逐项核验** | 4/5 | 手机桌面空间层次和清晰牌背值得参考；其角色美术与品牌不可直接套用 |
| 手机多人游戏 | [Open Mercy](https://github.com/alii13/open-mercy) | Vue 3、实时房间、320px 适配、程序化 SVG 卡面；已实际打开[在线站](https://open-mercy.com)，以 390×844 检查[首页](research/open-mercy-mobile-390.png)和[游戏模式页](research/open-mercy-lobby-390.png) | 代码及素材许可待核 | 3/5 | 手机卡片布局清晰，但黑红霓虹与本项目纸牌桌方向不合；不套用视觉资产 |
| 手机多人游戏 | [Omi Multiplayer](https://github.com/MythKid/omi-multiplayer) | 重连、PWA、响应式与 reduced motion；已实际打开[在线演示](https://omi.nodenull.org)并截取[390px 首页](research/omi-mobile-390.png)，真机待核 | 代码及素材许可待核 | 3/5 | 深绿与金色的纯色排版较克制，但首屏空白较大；仅参考层级，不复制 |
| 手机纸牌游戏 | [GameHelix/Hearts](https://github.com/GameHelix/hearts) | 手机优先、Framer Motion 与程序化声音说明；多人架构不适用 | 代码及素材许可待核 | 3/5 | 动效参考候选 |
| 原生手机纸牌 | [homeo26/coup-game](https://github.com/homeo26/coup-game) | Expo 57、手机牌桌与 Reanimated 4；仓库有首页、牌桌、结算截图 | 仓库明确 Private，不能复用代码或素材 | 3/5 | 仅观察动效分层；不下载或复制 |
| 手机多人游戏 | [8tp/chudopoly](https://github.com/8tp/chudopoly) | 2026 年移动端动效审计；已实际打开[在线演示](https://chudopoly.deal)并截取[390px 首页](research/chudopoly-mobile-390.png) | 代码 MIT，品牌/商标不可复用 | 2/5 | 大幅品牌贴图与沙色背景纹理过重，不符合用户“减少贴图感”的要求；仅研究触屏动画 |
| 手机纸牌桌 | [drusifer/recard](https://github.com/drusifer/recard) | 触屏拖放、牌堆与公开/私有牌面；静态站可本地运行 | 许可待核 | 3/5 | 交互候选，尚未实际运行 |
| 手机多人游戏 | [Shamika-WAD/omi-house-table](https://github.com/Shamika-WAD/omi-house-table) | 声称 iPhone/Android 浏览器及 PWA；近期仓库活动 | 许可待核 | 2/5 | 初筛候选，截图和实测待做 |
| 手机纸牌游戏 | [Arcomage clone](https://github.com/joseteodoro/arcomage-card-game-clone) | React 与 CSS 动效、PWA、移动端和减少动态效果说明；在线实际体验待做 | 开源仓库，独立美术/音乐授权待核 | 2/5 | 只观察无 Canvas 动效和设置设计，不移植旧规则或素材 |
| 扑克牌 | [Kenney Playing Cards Pack](https://kenney.nl/assets/playing-cards-pack) | 270 文件、2020 年 1.0；已下载191,985字节原包并查[包内许可证](research/kenney-license.txt)，实测所谓大牌仅64×64，另有16×16小牌；[样卡](research/card_spades_A-kenney.png) | CC0 | 1/5 | 淘汰：像素风且高 DPI 不清晰 |
| 扑克牌 | [AustinGabriel Public Domain Playing Cards](https://github.com/AustinGabriel/Public-Domain-and-CC0-Playing-Cards) | 2026-09-17 commit `3765067`；已下载、查看[黑桃A](research/austin-ace-sample.png)、[红桃K](research/austin-king-sample.png)及[牌背](research/austin-back-sample.png)，原图1500×2100，53张处理后377,498字节 | [源仓库 CC0](research/austin-license.txt) | 4/5 | 采用：完整、高清、真实纸牌感；手机真机清晰度待核 |
| 扑克牌 | [OpenGameArt Playing Cards](https://opengameart.org/content/playing-cards-5) | 2024 年发布，源页面有牌背预览；下载与全套清晰度待核 | 页面标 CC0 | 2/5 | 初筛对照，尚未采用 |
| UI 素材 | [Kenney UI Pack](https://opengameart.org/content/ui-pack) | 2024 年发布，430 多个 PNG 与矢量文件；风格偏通用游戏控件 | 页面标 CC0，文件级待核 | 2/5 | 暂不采用，当前自制组件更统一 |
| 棋盘图标 | [Kenney Board Game Icons](https://kenney.nl/assets/board-game-icons) | 官网预览，棋盘图标资产；实际下载与缩放检查待做 | 官网标 CC0 | 2/5 | 仅候选；当前牌桌不需要额外图标装饰 |
| 纸牌音效 | [BMacZero Playing Card Sounds](https://opengameart.org/content/playing-card-sounds) | 2020 年录制的 5 个 WAV，已下载、解码、归一化并制作试听页；真实听感仍待人耳确认 | 原页面标 CC0，署名可选 Brian MacIntosh | 3/5 | 暂时接入候选音效，可按试听反馈替换 |
| 纸牌音效 | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | 从 Kenney 在 OpenGameArt 的公开发布页下载 876,839 字节原包；23 种纸牌 OGG 均由 Chromium AudioContext 实际解码，0.46–3.06 秒；见 [A/B 试听页](research/audio-ab.html) | 原包 `License.txt` 明确 CC0，Kenney 官网也标 CC0 | 4/5 | 高品质候选；与 BMacZero 等量试听后决定是否替换 |
| UI 音效 | [Kenney Interface Sounds](https://opengameart.org/content/interface-sounds) | 官方公开页列 100 个已归一化 OGG；未下载试听 | 页面标 CC0，文件级待核 | 2/5 | 界面声候选，避免电子点击感前待试听 |
| 纸张音效 | [Various Paper Sound Effects](https://opengameart.org/content/various-paper-sound-effects) | 原作者公开页列 7 个纸张声音；未下载试听 | 作者标 CC0 | 2/5 | 可补充翻牌/摩擦，但需排除撕纸声 |
| UI 音效 | [Kenney UI Audio](https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks) | 原作者公开页列 51 个有机按键声；未下载试听 | 作者标 CC0 | 2/5 | 候选，旧录音可用性待听 |
| 背景音乐 | [Overworld](https://opengameart.org/content/overworld-bgm) | 2025 年作品，公开下载 275,424 字节 MP3，浏览器解码 9.80 秒 | 作者标 CC0 | 2/5 | 暂不采用，需人耳检查循环和语音遮盖 |
| 背景音乐 | [Calm Loop](https://opengameart.org/content/calm-loop) | 公开下载 314,222 字节 MP3，浏览器解码 19.31 秒 | 作者标 CC0 | 2/5 | 暂不采用，需人耳检查循环和语音遮盖 |
| 背景音乐 | [Short Loops Background Music Pack / Swinging Sweet](https://opengameart.org/content/short-loops-background-music-pack) | 公开下载 405,170 字节 OGG，浏览器解码 24.93 秒 | 作者标 CC0 | 2/5 | 暂不采用，需人耳检查风格与手机兼容 |

本轮去重初筛候选：现代游戏 8（另有 1 个仅作未授权视觉对照）、视觉/牌面 5、音效包 5、音乐 3。额外检索过 GitLab、Codeberg、中文与日文关键词；GitLab/Codeberg 暂未筛出可核实的合格候选，中文结果中的 [card-playv2](https://github.com/RixeChen/card-playv2)、[landlord](https://github.com/Sanotsu/landlord) 与 [GuanDanInOffice](https://github.com/LiUshin/GuanDanInOffice) 待独立视觉和许可核验，不计入上表已评候选。尚不足以满足附件 11.4 的多渠道调研数量与质量门槛，不将此初筛当作最终报告。现有 `board/deck.png` 的来源许可未知，不直接进入正式包。

## 动效与音频技术对照

[CSS transform/transition](https://developer.mozilla.org/en-US/docs/Web/CSS/transform) 与 [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API) 可直接实现短促选牌和落牌且不新增依赖；[Motion](https://motion.dev/docs) 提供 React 布局/弹簧动画，但当前项目只需短动效，暂不引入；[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) 已用于候选音频解码与轻量事件播放；[Howler.js](https://howlerjs.com/) 可做多格式音频和音乐淡入淡出，但在未采用 BGM 时没有引入必要。技术方案初筛 4 种，浏览器解码只证明兼容 Chromium，不代替 iOS/安卓试听。

## 已下载候选的技术检查

目录：`research/candidate-audio/bmaczero/`，原始来源 URL 均为 `https://opengameart.org/sites/default/files/<文件名>`。五个文件均为 44.1 kHz 单声道 WAV，Python `wave` 解码成功。RMS 是原始 16 位 PCM 样本值，不是主观响度或 LUFS。

| 文件 | 字节 | 时长（秒） | RMS | SHA-256 |
|---|---:|---:|---:|---|
| contact1.wav | 7,212 | 0.081 | 439 | `6b5c7632849848604d4321e37af0a93369eda54d2190b433454151a3e9b81e86` |
| contact2.wav | 26,668 | 0.302 | 849 | `7a30a388cab6ce4b9da74fbc13f3a376ec4e588a024d1e26d59545d0153e5433` |
| cut.wav | 15,404 | 0.174 | 558 | `e34049add637cd31efe11aedfd93d5834f9e469ffb083b444c15aa709f1ac1d1` |
| shuffle.wav | 68,652 | 0.778 | 1170 | `eedc3d3112c593f0a9bc3697dcb496e1b03ac5423b0f45f89e412f7b62818729` |
| shuffleandbridge.wav | 158,764 | 1.800 | 1336 | `7178fdd4b85875fc74aa0aaf534acbec8dad393006156cf7e679443dd6a4f85b` |

下一步：实际在手机宽度打开项目演示、下载更多现代卡面和音效候选并试听对照；核实素材文件自身许可；设计事件映射、响度和试听小样。当前已将 CC0 牌面与纸牌音效接入本地候选实现；其余候选仍需更多试听与实测。

## 当前可审阅的小样

- [可操作视听预览](research/preview.html)：对局、特殊牌、15/17 张交换、结算和五个已下载 WAV 的点击试听。使用演示手牌及分数，不连接真实玩家数据。
- [明亮方向 B 预览](research/preview-light.html)及[390px 截图](research/preview-light-390.png)：米白桌面、柔和绿毡、红色行动按钮；同一交互骨架便于对比。当前推荐深绿方向 A，因为牌面与桌面分离更明显，夜间观感更稳定；两方向均待用户确认。
- [BMacZero 与 Kenney 纸牌音效 A/B 试听](research/audio-ab.html)：同一动作并列点击；Kenney 23 个 OGG 已在 Chromium 中解码，具体试听选择仍待人耳确认。
- [390px 对局截图](research/preview-390.png)、[320px 交换截图](research/exchange-320.png)。Playwright 在 320、360、390、414px 下核对 17 张交换视图均无整页横溢出；这不是 iOS/安卓真机验收，也不证明所有触控区域已经达标。
- 设计选择：深绿牌桌、米白牌面、只用金色标示关键行动与结算；真实纸牌反馈优先，音效目前仍为候选，已下载 3 个 BGM 候选但暂不接入；需人耳确认。
- 用户确认状态：CHECK_REQUIRED。正式 UI 已有本地实现和四客户端实测，视觉方向与听感尚未经用户确认，T58/T63 不标通过。

## 本地资源与加载实测

53 张 168×235 WebP 共 377,498 字节；5 个当前接入 WAV 共 276,700 字节，均可解码。Chromium 390×844、localhost 首次打开游戏入口，Performance API 记录资源传输合计约 321,827 字节，其中此游戏独立 JS 8,154 字节、CSS 3,739 字节、首页 5 张牌面合计 35,722 字节，单项请求约 2–6 毫秒。此数据是本机 LAN/localhost 模拟，不能代表移动弱网或真机帧率；T68 仍待测。
