# 素材来源清单（阶段 1）

状态按实际区分：已核对 / 仅定位 / 未取得。没有正式游戏资源接入，没有自绘冒充官方素材。

| ID | 素材 / 用途 | 来源与定位 | 状态 / 本地路径 |
| --- | --- | --- | --- |
| ND-REF-FR | 法语基础版完整规则，4 页 | [官方 PDF](https://www.cocktailgames.com/wp-content/uploads/2020/01/Top_ten_regles_BD.pdf)，[官方发布页](https://www.cocktailgames.com/jeu/top-ten/) | 已下载核对；本地 `tmp/nd-stage0/Top_ten_regles_BD.pdf`；不提交原 PDF |
| ND-VISUALS-ZIP | 原出版社高清视觉包 | 官方产品页「Visuels」直接链接 [Top_ten.zip](https://www.cocktailgames.com/wp-content/uploads/2021/03/Top_ten.zip) | 已下载 21,539,179 字节；12 张 JPG 和 1 个归档元数据文件；逐文件大小与 SHA-256 见 ASSET_MANIFEST.json；原 ZIP 仅存 `tmp/nd-stage0/`，不提交 |
| ND-BOX-TW | 台湾繁体基础盒封面 | [2Plus 产品页](https://2plus.com.tw/product/q086-top-ten/)封面与图库 | 仅定位，未下载与接入；不得混用没有下限/大冒险封面 |
| ND-MAT-FR | 垫板外观 | 官方法语 PDF 第 4 页配件图 | 已视觉核对；当前没有提取为游戏资源 |
| ND-TOKEN-FR | 独角兽 / 便便标记外观 | 官方法语 PDF 第 4 页配件图 | 已视觉核对；当前没有逐枚提取为游戏资源 |
| ND-NUMBER-FR | 1–10 数字牌外观 | 官方法语 PDF 第 2、4 页 | 已读取文档；未逐张取得独立图，不能声称 10 张牌面已齐 |
| ND-THEMES-FR | 基础版 125 张主题牌 / 全部题目底稿 | 官方产品页和 PDF 仅说明数量，规则例图不是全卡面 | 仅记录原版配件，不再要求取得或录入题卡内容；现有 150 道中文题独立原创 |
| ND-PNP-EXCLUDED | 官方封控专题 Print & Play | [免费 PDF](https://www.cocktailgames.com/wp-content/uploads/2020/01/Top_ten_confinement_print_and_play.pdf) | 已识别为独立免费专题，规则还标 simplified；排除为基础版全文 / 全题库来源 |
| ND-REVIEW | 审核页排版和交互 | 仓库 `docs/xiabaiwang/original/terms-review/index.html` | 复用分组筛选、逐条审核、本地保存、导入导出模式；新页面不包含官方卡面，不是正式游戏 UI |

用户已允许使用官方美术。用户最新决定题目全部原创，不从美术宣传图提取或翻译商业题卡内容。本阶段不改图、不创建正式大厅入口、不修改其他游戏样式。后续中文标题与卡面文字应以文字层覆盖方式展示，保留底图来源；自绘素材须逐项写明「自绘」，目前自绘 0 项。

## 官方视觉包逐文件登记

以下每张图片均来自上述同一官方 ZIP，已下载校验，但**没有接入游戏**。用途仅按文件名初分；明确视觉核对的项另标出。原图均留本地临时目录 / ZIP，不加入公开仓库。

| ZIP 内路径 | 初步用途 / 核对状态 |
| --- | --- |
| HD/Top_ten_boite_3D_HD.jpg | 三维盒装图；已打开视觉核对，法语基础版 |
| HD/Top_ten_face_logo_HD.jpg | 正面与标志组合候选；未逐图视觉核对 |
| HD/Top_ten_boite_3D_logo_HD.jpg | 盒装与标志组合候选；未逐图视觉核对 |
| HD/Top_ten_visuel_3_HD.jpg | 宣传图 3；未逐图视觉核对 |
| HD/Top_ten_visuel_1_HD.jpg | 宣传图 1；未逐图视觉核对 |
| HD/Top_ten_face_HD.jpg | 正面图候选；未逐图视觉核对 |
| HD/Top_ten_visuel_4_HD.jpg | 宣传图 4；未逐图视觉核对 |
| HD/Top_ten_logo_HD.jpg | 官方 Top Ten 标志；已打开视觉核对 |
| HD/Top_ten_dos_HD.jpg | 背面图候选；未逐图视觉核对 |
| HD/Top_ten_visuel_2_HD.jpg | 宣传图 2；未逐图视觉核对 |
| HD/Top_ten_visuel_2_logo_HD.jpg | 宣传图 2 与标志组合候选；未逐图视觉核对 |
| HD/Top_ten_boite_3D_gauche_logo_HD.jpg | 左向盒装与标志组合候选；未逐图视觉核对 |

`HD/.DS_Store` 为归档元数据，非游戏美术，不计入 12 张图片。[逐文件清单及校验值](ASSET_MANIFEST.json)。这些视觉宣传图不能证明全部题卡已取得。


## 阶段 4 实际接入（2026-11-01）

历史“未接入”描述为阶段 1 留档，以下为当前状态。

| ID | 文件 / 用途 | 来源 / 处理 | 状态 |
| --- | --- | --- | --- |
| ND-BOX-WEB | apps/web/public/assets/naodong-scale/box.webp；首页与大厅官方盒装和盒上 Logo | 官方视觉包 HD/Top_ten_boite_3D_HD.jpg；只缩放到 640×640 内、转 WebP，未涂改原图 | 已接入；中文「脑洞量表」用独立前端文字层 |
| ND-UI-CSS | nd.css 的纸质题卡、数字背面和翻牌效果 | 自绘 CSS 交互外观，不冒充官方卡面 | 已接入 |
| ND-SYSTEM-MARKS | 独角兽 / 便便 / 语音状态 | 系统 Emoji 和文字图标，始终配计数或文字，不冒充官方代币图 | 已接入；无单独图片文件 |

盒装 WebP SHA-256：ed93016e0e15fae2f59370ad51ed8925b5a8db1085eeee41e2fde057c6939d72。未提取官方商业题目，运行时仅使用批准的 102 道中文内容。官方 ZIP 和原始 JPG 仍不提交。CSS 自绘为界面材质，不是新增桌游美术扫描。


## UI v2 自绘界面图标（2026-11-01）

| ID | 用途 | 来源 / 文件 |
| --- | --- | --- |
| ND-RESULT-GAUGE-V2 | 成功结算显示守住的量表、失败显示归零量表 | 自绘内联 SVG，NaodongScale.tsx 的 ResultGauge；两态共用刻度、指针与圆心，不使用无关云朵或星星图片 |
| ND-CROWN-V2 | 紧凑座位条的队长皇冠 | 自绘内联 SVG，NaodongScale.tsx 的 Crown；编号圆章、状态点与“我”为 CSS / 文字 |

本轮没有新增或修改位图。舞台去除斜纹与过强光泽，纸卡、编号和量表统一线宽、圆角与弱阴影。官方盒装图保持原文件。
