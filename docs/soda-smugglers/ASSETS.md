# 汽水走私犯：官方素材清单

日期2026-10-27。用户已授权本项目使用官方美术；这不表示版权转让。阶段1仅登记来源与可用性，尚未制作/接入正式Web资源，也没有自绘替代物。原PDF和照片调研副本只在tmp/ss-research/，不提交。后续导出逐文件补充路径、尺寸、SHA256和裁切范围，不能把本表的「计划」写成「已接入」。

## 来源

- P：[出版社游戏页](https://bitewinggames.com/soda-smugglers/)，本机HTTP200；下列官网图片均由此页原链接发现。
- R：[规则PDF镜像](https://gamers-hq.de/media/pdf/6c/4e/7b/Soda_Smugglers_Rules_Small.pdf)，出处链限制见RULE_MATRIX S1–S3和Q01。
- F9：[官方0/1/2/3瓶卡面合照](https://bitewinggames.com/wp-content/uploads/2022/06/CCC-Final-Production-9-scaled.jpg)，HTTP200，已看图。
- F10：[官方Night Shift与卡背照片](https://bitewinggames.com/wp-content/uploads/2022/06/CCC-Final-Production-10-scaled.jpg)，HTTP200，已看图。
- F11：[官方包装收纳照片](https://bitewinggames.com/wp-content/uploads/2022/06/CCC-Final-Production-11-scaled.jpg)，HTTP200，已看图。

## 逐项素材

| ID | 图像/用途 | 官方来源定位 | 计划Web文件（未生成） | 阶段1状态 |
|---|---|---|---|---|
| A01 | 包装盒与Logo组合，首页游戏盒 | P：[原图](https://bitewinggames.com/wp-content/uploads/2021/06/BoxAndLogo_Soda.png) | box-logo.webp | 官网页面链接已找到，尚未下载检查原图 |
| A02 | 独立Logo | R p1 标题区 | logo.webp | 已看PDF，可裁切，透明边缘待处理 |
| A03 | 封面豹角色，舞台主题 | R p1 | cover-character.webp | 已看PDF；不是具有能力的角色牌 |
| A04 | 行李牌背，装包隐私 | R p2、4；F11 | suitcase-back.webp | 已看图，需正视裁切或PDF提取 |
| A05 | 0瓶空箱牌面（12张同型） | R p2；F9左上 | suitcase-0.webp | 已看图 |
| A06 | 1瓶牌面（12张同型） | R p2；F9右上 | suitcase-1.webp | 已看图 |
| A07 | 2瓶牌面（7张同型） | R p2；F9左下 | suitcase-2.webp | 已看图 |
| A08 | 3瓶牌面（5张同型） | R p2；F9右下 | suitcase-3.webp | 已看图 |
| A09 | 收贿赂标记 | R p2,4,5 | action-bribe.webp | 已看图 |
| A10 | 检查标记 | R p2,4,5 | action-inspect.webp | 已看图 |
| A11 | 逮捕标记 | R p2,4 | action-arrest.webp | 已看图 |
| A12 | 面值1瓶盖 | R p2 黄色 | cap-1.webp | 已看图 |
| A13 | 面值3瓶盖 | R p2 蓝色 | cap-3.webp | 已看图 |
| A14 | 面值5瓶盖 | R p2 红色 | cap-5.webp | 已看图 |
| A15 | 面值10瓶盖 | R p2 深色 | cap-10.webp | 已看图 |
| A16 | 面值20瓶盖 | R p2 绿色 | cap-20.webp | 已看图 |
| A17 | 面值30瓶盖 | R p2 紫色 | cap-30.webp | 已看图 |
| A18 | 事件牌背 | R p2；F10 | event-back.webp | 已看图，不与行李牌背混用 |
| A19 | Birthday事件牌 | R p2 小缩略图 | event-birthday.webp | 有缩略图，不足以核实完整卡文/正式清晰度 |
| A20 | Holiday Season事件牌 | R p7仅FAQ | event-holiday.webp | 完整卡面未取得 |
| A21 | Sniffer Dog事件牌 | R p7仅FAQ | event-dog.webp | 完整卡面未取得 |
| A22 | Night Shift事件牌 | F10正面 | event-night-shift.webp | 已看图、可读；仍需透视校正 |
| A23 | 第5张未知事件牌 | R p2确认总数8 | 待卡名确认 | 未取得，不自编图文 |
| A24 | 第6张未知事件牌 | R p2确认总数8 | 待卡名确认 | 未取得，不自编图文 |
| A25 | 第7张未知事件牌 | R p2确认总数8 | 待卡名确认 | 未取得，不自编图文 |
| A26 | 第8张未知事件牌 | R p2确认总数8 | 待卡名确认 | 未取得，不自编图文 |
| A27 | 汽水品牌主题装饰合图 | P：[官方原图](https://bitewinggames.com/wp-content/uploads/2021/04/Soda-Brands-01.png) | soda-brands.webp | 原图链接已找到，正式导出前看图 |

## 正式资源处理要求（阶段4执行）

只导出使用到的图到apps/web/public/assets/soda-smugglers/，优先PDF内嵌高清图，必要时至少2倍分辨率渲染；WebP保留文字清晰度，不能把低清缩略图拉大冒充高清。牌面数字与非颜色符号必须清楚；不要把背景封面角色做成原版不存在的身份卡。所有官方图记录具体来源页/图、裁切、最终尺寸与哈希。确实找不到的装饰才自绘，并在对应项明确标「自绘」，不自绘补造未知事件规则。

规则与来源中美术署名：Paul K. Halkyon（瓶子与箱子插画）、Hannah Howell（事件卡插画），S3 p8。阶段1未下载已下架模组或使用玩家自制卡包。
