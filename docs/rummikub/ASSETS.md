# 官方素材清单（阶段 1）

2026-10-25。用户总指令已准许官方美术；本阶段登记候选来源，**尚未把素材接入前端，尚未完成 WebP 导出、2 倍清晰度或实测色值验收**。

| 素材 | 官方来源 | 已核实内容 | 计划文件 / 后续工作 |
|---|---|---|---|
| Logo | https://rummikub.com/wp-content/uploads/2019/12/logo-rummikub-vector-1.png | 官网 HTML 中存在原图链接；不用 300×66 缩略图 | apps/web/public/assets/rummikub/logo.webp；下载原图、检查尺寸与透明背景 |
| Joker | https://rummikub.com/wp-content/uploads/2019/12/cropped-red-joker-270x270.jpg | 官网 HTML 有 270×270 图；PDF 2600 p3/p4 已视觉核对黑色笑脸 | joker.webp；优先从 PDF 高分辨率提取透明图形，JPG 作参考 |
| 牌面数字与四色 | 2600-English.pdf p1–4；4600-2025-English.pdf p1–3 | PDF 图为黑、红、蓝、橙黄；数字与阴影清晰，可作视觉依据 | tiles-reference.webp；栅格化至少最终尺寸 2 倍，采样中间纯色，不能把抗锯齿边当色值 |
| 实体牌架造型 | 2600-English.pdf p1 Assembly instructions | 主版提供牌架组装图，2025 版 p1 无同样组装区域 | rack-reference.webp；提取后对照实体图；实现 CSS 牌架时标注为按官方参考重建 |
| Classic 包装盒 | https://rummikub.com/ （官网产品导航继续查找） | 尚未锁定具体 Classic 包装原图；不能用 Twist/XP 盒替代 | box-classic.webp；阶段 4 前定位官方产品页和原图 URL、截图核对型号 |
| 数字下小圆点 | 总指令 §4.1；上述 PDF 牌图 | 当前 PDF 示例图未清楚体现要求的小圆点；须看实体官方产品图再核 | 以总指令为视觉要求，不能误称已经由 PDF 确认 |
| 桌面织纹、色弱符号 | 总指令 §4.1 | 深绿 #1F4D3A 为项目指定色，非官方牌色实测值 | rk.css 生成纹理、●▲■◆；标注“自绘/代码绘制” |

## 原始资料与证据

PDF URL、版本、SHA256 见 RULE_MATRIX.md；原始文件只存被忽略的 reference/rulebooks/rummikub/，不得加入公开提交。
已生成本地阅读图：tmp/pdfs/rummikub/2600-3.png、2600-4.png、4600-1.png。前两张已查看，核对 Joker 四例中前三例、第四例、超时、计分；2025 第 1 页已渲染并查看，Logo、牌色、数字和发牌说明清晰。
阶段 4 用 pdfimages -list 先辨别嵌入位图；矢量页用 pdftoppm 高 DPI 栅格化再裁图。不可仅放大小 JPG 冒充 2 倍源分辨率。

## 阶段 4 验收要求

逐项记录下载 URL、访问日期、源尺寸、导出尺寸、SHA256、裁切位置、是否官方原图或自绘。Joker 透明边缘、Logo 清晰度、包装型号和牌色必须截图自审；未找到的图才自绘并明确标注。当前清单中的包装图定位为未完成项，不宣称已取得全部资源。
