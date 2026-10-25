# 拉密官方素材与视觉来源（阶段 4 已接入）

核对日期 2026-10-25。使用依据：用户总指令明确允许官方美术。原图保留本地 tmp/reference，不把官方原版 PDF 放入提交。前端只接入下列 WebP 衍生图，素材 SHA256、尺寸和字节数见 verification/stage4-assets.json。

| 文件 | 官方原始 URL | 源尺寸 / 导出 | 实际用途与处理 |
|---|---|---|---|
| logo.webp | https://rummikub.com/wp-content/uploads/2019/12/logo-rummikub-vector-1.png | 700×154 → 原尺寸无损 | 官网白色透明 Logo；手机显示 106px、电脑 145px、首页 150px，均超过 2 倍清晰度 |
| joker.webp | https://rummikub.com/wp-content/uploads/2019/12/cropped-red-joker-270x270.jpg | 270×270 → 原尺寸，quality 95 | 官网红色笑脸；显示 21–32px，非自绘；在象牙底上用 multiply 消除白底接缝 |
| box-classic.webp | https://rummikub.com/wp-content/uploads/2019/11/rummikub-classic-_1600.jpg | 1200×1200 → 1020×750，quality 93 | 官网 WordPress media ID 1413 取得，人工核对为 CLASSIC，非 Word/Twist/XP；裁切 x=120..1140,y=240..990 去空白。最大显示 420px，源 1020px ≥2倍 |
| tiles-reference.webp | https://rummikub.com/wp-content/uploads/2019/12/2600-English.pdf | PDF p3，300dpi 栅格 1890×2835 → 裁切 1890×720 | 前端目录保留官方数字/四色参考；不是把示例页冒充完整 106 张牌图 |

PDF 页码、版本和原件哈希见 RULE_MATRIX。已执行 pdfimages -list：p1 牌架为 300dpi 嵌入位图，p3 牌面示例为矢量，因此用 pdftoppm 300dpi 栅格化用于采色与参考；没有把低清图放大冒充高分辨率。

## 官方四色实测与对比度

从 PDF p3 上方牌面图中按饱和色主像素统计，得到：红 RGB(237,28,36) `#ED1C24`、蓝 RGB(0,173,239) `#00ADEF`、橙黄 RGB(250,178,11) `#FAB20B`、黑 RGB(35,31,32) `#231F20`。

原始蓝/橙在象牙底上的对比度不足总指令要求的 4.5:1。显示版保留四色色相并加深，不谎称与官方原始色值完全相同：

| 色 | 实际显示色 | 对象牙底 #F1EDD9 对比度 | 色弱符号 |
|---|---|---|---|
| 红 | #C02D29 | 4.89:1 | ● |
| 蓝 | #087092 | 4.77:1 | ▲ |
| 橙黄 | #965603 | 4.92:1 | ■ |
| 黑 | #242120 | 13.59:1 | ◆ |

数字是参照官方示例的 CSS 字形（本地 Arial Narrow / Helvetica Neue / Arial 回退），不是从 PDF 提取完整字体，也不冒称官方字体文件。牌面象牙材质、阴影、数字下点、色弱符号、绿色织纹和木色双层牌架均为“自绘/代码绘制”；牌架参考官方实体双层形态，材质按本次木桌主题处理。深绿 #1F4D3A 来自总指令。

## 已验收

Logo、Joker、盒子均为真实官方来源且加载成功；不是占位图。手机/横屏/电脑截图通过真实浏览器图片解码和像素检查。前端无远程素材依赖，所有图均本地提供。原件来源不等于官方授权声明，项目采用依据保持为用户指令。
