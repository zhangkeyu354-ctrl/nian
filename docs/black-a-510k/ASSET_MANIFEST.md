# 正式资源清单（进行中）

首批采用资源：BMacZero 的五个纸牌操作录音。原始下载文件保留在 `research/candidate-audio/bmaczero/`，生产文件在 `apps/web/public/assets/black-a-510k/audio/`。现有 `board/deck.png` 尚无来源和授权证据，禁止直接接入。卡面与界面由本项目代码原创绘制。

首次采用资源时，逐文件记录来源 URL、作者、原始文件名、版本或 commit、下载日期、许可证与证据路径、署名、修改、正式本地路径、文件大小、哈希、用途与事件映射。原创资源明确标记 ORIGINAL。

## BMacZero 纸牌录音

- 作者：BMacZero（原页面可选署名 Brian MacIntosh）。建议署名：`Playing Card Sounds by Brian MacIntosh (BMacZero), CC0 1.0`。
- 来源与许可证据：[OpenGameArt 原始作品页](https://opengameart.org/content/playing-card-sounds)明确标记 CC0；[CC0 1.0 法律文本](../../apps/web/public/assets/black-a-510k/audio/LICENSE-CC0.txt)本地保存。作品发布于 2020-10-04，无版本号；按原页面文件名下载于 2026-11-24。
- 修改：`scripts/prepare-ba-audio.py` 调整 PCM RMS，并在开头与结尾各加最多 6ms 淡入淡出；保留原采样率 44.1kHz、单声道、16位和文件名。无需额外音频库。
- 当前状态：授权与技术解码已核；主观音质、移动 Safari/安卓实机响度和事件混音仍为 CHECK_REQUIRED。

| 原始文件名 | 原始 URL | 正式本地路径（相对仓库） | 字节 | 正式 SHA-256 | 初定事件映射 |
|---|---|---|---:|---|---|
| `contact1.wav` | `https://opengameart.org/sites/default/files/contact1.wav` | `apps/web/public/assets/black-a-510k/audio/contact1.wav` | 7,212 | `f7bced2fbc430e39dbcb59c320b8b8b1e9fae4757a4c552fe58b41c3f2b4c09f` | 选牌、轻触 |
| `contact2.wav` | `https://opengameart.org/sites/default/files/contact2.wav` | `apps/web/public/assets/black-a-510k/audio/contact2.wav` | 26,668 | `f13fe75f053a0a479424cb20078e2af94006e80e0b2afb9f22f159f0e43dcf4f` | 出牌、归还 |
| `cut.wav` | `https://opengameart.org/sites/default/files/cut.wav` | `apps/web/public/assets/black-a-510k/audio/cut.wav` | 15,404 | `51837f2384c5b7d5bb06c303744c1c057858cf4d71158d2fd9c572e2122feb41` | 赢墩、抓分 |
| `shuffle.wav` | `https://opengameart.org/sites/default/files/shuffle.wav` | `apps/web/public/assets/black-a-510k/audio/shuffle.wav` | 68,652 | `2774e666237b4d1154d810f79d90326c5b7cf99e02058e3658527a6764c47abb` | 洗牌 |
| `shuffleandbridge.wav` | `https://opengameart.org/sites/default/files/shuffleandbridge.wav` | `apps/web/public/assets/black-a-510k/audio/shuffleandbridge.wav` | 158,764 | `0e78b61af005617b779da3a3096fec8d66aaaa0d124ff0451235ae47c5d580ec` | 连续发牌/收束候选 |

总生产纸牌音频 276,700 字节；许可文本 7,048 字节。原始与生产文件 SHA-256 均见 `ASSET_RESEARCH.md`。无外部实时热链。

## 52张牌面和牌背

已采用 [AustinGabriel Public Domain Playing Cards](https://github.com/AustinGabriel/Public-Domain-and-CC0-Playing-Cards) 的52张常规牌与蓝色牌背。源仓库 commit `3765067c32fcef42a30e87022332db729658e7cd`（2026-09-17），下载日期 2026-11-24。源仓库 `LICENSE` 为 CC0-1.0，本地证据在 `apps/web/public/assets/black-a-510k/cards/LICENSE-CC0.txt`。署名建议：`Playing cards by AustinGabriel, CC0 1.0`，许可证无需署名。原始档 57,395,384 字节，SHA-256 `967902bd40667f7369376d5979bf12aac7125de4b0e1927cf81c48752f6a659a`，处理后已移除大档，保留许可及样卡预览。

通过 `scripts/prepare-ba-cards.py` 将原始 1500×2100 PNG 以 Lanczos 缩至 168×235，编码 WebP 质量91，53个文件合计 377,498 字节。每张牌的原始文件名、原始 SHA-256、实际本地路径、文件字节和正式 SHA-256 逐项列于 [机器清单](cards-manifest.json)。用途：本人手牌、公开桌面牌、对手牌背；无外部热链。当前已实测本地浏览器加载，手机高 DPI 真机检查仍为 CHECK_REQUIRED。
