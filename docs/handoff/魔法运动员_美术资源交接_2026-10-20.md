# 魔法运动员：美术资源交接（2026-10-20，Codex）

用户本轮仅授权规则/角色资料核对与全部基础版美术制作。代码保持在 `main=435eaef`，未改业务代码、引擎、协议；未提交、推送、部署。仅只读 fetch 并查看了 `origin/magical-athlete=a11126d`。

## 包在哪里

- `assets/magical-athlete-production-v1/`：本轮正式交接包。
- 先打开 `index.html` 看完整素材，或读 `README.md`、`asset-contract.json`。
- `docs/魔法运动员_36角色技能书.pdf`：22 页技能参考。
- `previews/all-36-cards.png`、`previews/all-36-tokens.png`：全量总览。
- 上轮 `assets/magical-athlete-generated-v1/` 是原创风格候选，**不属于本套原版还原素材**，不要混用。

## 已对齐框架

全部 36 个 ID、中文名、中文技能名与该分支 `packages/magical-athlete/src/racers.ts` 相同，含下划线命名。赛道 ID 为 `mild`、`wild`；六种玩家颜色与 `apps/web/src/ma/Track.tsx` 相同。所有译文仍为 DRAFT。

包内含：36 中文卡 SVG + 36 中文卡 WebP，36 英文核对卡，36 头像，36 透明棋子 PNG + 36 标准画布棋子 SVG，2 原版棋盘的 SVG/PNG/WebP/手机版，36 骰面，15 标记，卡背、标题、大厅封面、定位 JSON 与技能书。

原版角色与棋盘取自 CMYK 作者的公开规则书 PDF（供应商镜像）；原始 PDF 留在被 Git 忽略的 `reference/magical-athlete/`。包内来源与哈希详见 `SOURCE_MANIFEST.json`。插画不是本项目原创，不要标为 imagegen 原创图。中文排字、规则面板和通用标记使用原生矢量制作。

## 可补齐规则分支的证据

见包内 `TRACK_EVIDENCE.json`。以下是直接读到的原版棋盘，不是从社区自制地图推测：

- **MA-Q02**：狂野 1、13 星星；5、18、26 石头；7 +3、11 +1、16 -3、23 +2、24 -3。
- **MA-Q03**：两面第二弯角都是第 13 格。
- **MA-Q04**：起点 0，赛道 1–29；跨过 29 之后是终点（阈值 30），领奖台不是可停格。
- `previews/*-coordinates.png` 有原图与编号叠加证据；`boards/coordinates.json` 有归一化中心和尺寸。
- MA-Q01 金银分值仍未全部看清，未猜测。通用奖杯/银章不写死轮次分值，由规则数据叠加数字。

这里只提供证据，没有更改 `tracks.ts` 或开放飞艇/狂野。请规则负责人按本项目来源标准纳入。

## 接入要点

1. Vite 资源目录建议 `apps/web/public/assets/magical-athlete/`，加载路径前缀 `/assets/magical-athlete/`。按需复制运行时目录；不要把 PDF 和预览大图都作为首屏资源。
2. 当前 `Track.tsx` 的 360×520 程序椭圆与原版格位不同。应换用原版底图 viewBox 和 JSON 坐标，不能只贴背景继续调用旧 `pointAt()`。
3. 同格多棋子、玩家颜色、当前行动和摔倒由 UI 叠加。棋子用 `object-fit:contain`，底部中心锚定；大长腿与巨婴保留原比例。
4. `RaceState.tokens[].racer` 是棋子身份；`base` 是被复制的能力。蛋、双胞胎等不得按 `base` 换成别人的棋子。
5. 角色卡列表建议 `card_zh_mobile`，放大查看用 SVG；原生插画只有约 261px 宽，矢量中文文字可放大，但不把插画导出尺寸称为原生高清。
6. 原版棋盘横长，手机要支持缩放/平移或全图查看，不能拉伸填入旧竖版椭圆画布。

## 本轮发现的来源内部冲突

`ART-RULE-01 / Sisyphus / p25`：最终可见卡文写掷 6 时“替代移动，传送起点并失去 1 分”，同页旁注却写“传送后仍有主移动”。中文卡按最终可见卡面转述，技能书保留冲突，交由规则负责人核定。本包不代替用户裁定。

附件中的 `no2ooo` 图鉴插画与零售原版不同，故没有使用；`cameronnayeri` 赛道也不是本版准确原图，未采用。

## 验证

- 素材完整性、透明通道、SVG 解析及引用检查记录见包内 `VALIDATION_ASSETS.json`；文件校验见 `FILES_MANIFEST.json`。
- Chromium 桌面 1440×1000、手机 390×844：89 张展示图全部解码、无页面错误、无失败请求、无横向溢出；筛选与展开棋子通过。证据截图通过项目 `scripts/screenshot-check.ts` 的像素检查，见 `VALIDATION_BROWSER.json`。
- 36 张卡与 36 枚棋子总览、两面棋盘编号、技能书渲染均已目视检查。
- 没有修改运行时代码，因此未执行或声称整局/联机回归通过。后续接入、提交和推送遵循共享协作规则。
