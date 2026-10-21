# 行动代号美术（2026-10-21，官方漫画风格修订）

用户在本次对话明确允许使用原游戏美术，随后要求「只说美术」：手机布局与操作保持，人物、词卡、配色和背景按原游戏风格调整。

## 当前素材

- `agent-red.webp`、`agent-blue.webp`、`bystander.webp`、`assassin.webp`：codenames.game 官方默认人物原文件（335×256，透明）。
- `scene-red.webp`、`scene-blue.webp`、`scene-neutral.webp`、`scene-assassin.webp`：官方对应场景原文件（502×324），通过 CSS 在人物下方分层显示。
- `desk.webp`：官方城市背景（1920×1080）；沿用原消费路径，已不再是上一版的办公桌。
- `lobby-cover.webp`：官方 loading illustration（1440×1024）。
- `icon-assassin.webp`：与官方刺客人物同源，CSS 显示为白色轮廓以适应深色队长卡。
- `card-paper.webp`：保留上一版极淡原创纸纹，配合奶油色与描边绘制词卡，不含人物或官方词库。

素材未重新绘制、裁切或缩放，CSS 按现有手机卡牌尺寸呈现；全部单文件小于 120 KB。原生成版可从 Git 历史 `006edb7` 取回。本次未调用图像生成。

## 来源与记录

- 官方入口：https://codenames.game/
- 官方素材 CDN：`https://cdn2.codenames.game/cno/main-64161e0c4e34/`
- 每个文件的完整来源 URL、尺寸、字节数与 SHA-256 见 `official-sources.json`。
- 只接入官方图片，未复制官网应用代码、词库、字体或布局。
- 权利归原权利人所有；用户决定在本项目采用不等于取得权利人许可。

之前原创版本的提示词与生成方式保留在上述 Git 历史中。本次范围不改变服务器、联机协议、游戏规则、DOM 或交互。
