# 汽水走私犯：官方素材清单

日期2026-10-27。用户已授权本项目使用官方美术；这不表示版权转让。阶段1仅登记来源与可用性，尚未制作/接入正式Web资源，也没有自绘替代物。原PDF和照片调研副本只在tmp/ss-research/，不提交。后续导出逐文件补充路径、尺寸、SHA256和裁切范围，不能把本表的「计划」写成「已接入」。

## 来源

- P：[出版社游戏页](https://bitewinggames.com/soda-smugglers/)，本机HTTP200；下列官网图片均由此页原链接发现。
- R：[规则PDF镜像](https://gamers-hq.de/media/pdf/6c/4e/7b/Soda_Smugglers_Rules_Small.pdf)，出处链限制见RULE_MATRIX S1–S3和Q01。
- F9：[官方0/1/2/3瓶卡面合照](https://bitewinggames.com/wp-content/uploads/2022/06/CCC-Final-Production-9-scaled.jpg)，HTTP200，已看图。
- F10：[官方Night Shift与卡背照片](https://bitewinggames.com/wp-content/uploads/2022/06/CCC-Final-Production-10-scaled.jpg)，HTTP200，已看图。
- F11：[官方包装收纳照片](https://bitewinggames.com/wp-content/uploads/2022/06/CCC-Final-Production-11-scaled.jpg)，HTTP200，已看图。

## 逐项素材（阶段2已补齐中文事件来源，正式资源尚未生成）

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
| A19 | 生日礼物事件牌 | ZH-P2第2张；R p2 | event-birthday.webp | 中文完整卡面已核，英文FAQ交叉核对 |
| A20 | 假日狂欢事件牌 | ZH-P2第3张；R p7 FAQ | event-holiday.webp | 中文完整卡面已核，英文FAQ交叉核对 |
| A21 | 缉私犬长事件牌 | ZH-P2第8张；R p7 FAQ | event-dog.webp | 中文完整卡面已核，英文FAQ交叉核对 |
| A22 | 起早贪黑事件牌 | ZH-P2第7张；F10英文正面 | event-night-shift.webp | 中英文卡面已核 |
| A23 | 领导视察事件牌 | ZH-P2第1张 | event-inspection.webp | 中文完整卡面已核；英文全文未取得 |
| A24 | 破釜沉舟事件牌 | ZH-P2第4张 | event-desperate.webp | 中文完整卡面已核；英文全文未取得 |
| A25 | 贪得无厌事件牌 | ZH-P2第5张 | event-greedy.webp | 中文完整卡面已核；英文全文未取得 |
| A26 | 铁面无私事件牌 | ZH-P2第6张 | event-impartial.webp | 中文完整卡面已核；英文全文未取得 |
| A27 | 汽水品牌主题装饰合图 | P：[官方原图](https://bitewinggames.com/wp-content/uploads/2021/04/Soda-Brands-01.png) | soda-brands.webp | 原图链接已找到，正式导出前看图 |

## 正式资源处理要求（阶段4执行）

只导出使用到的图到apps/web/public/assets/soda-smugglers/，优先PDF内嵌高清图，必要时至少2倍分辨率渲染；WebP保留文字清晰度，不能把低清缩略图拉大冒充高清。牌面数字与非颜色符号必须清楚；不要把背景封面角色做成原版不存在的身份卡。所有官方图记录具体来源页/图、裁切、最终尺寸与哈希。确实找不到的装饰才自绘，并在对应项明确标「自绘」，不自绘补造未知事件规则。

规则与来源中美术署名：Paul K. Halkyon（瓶子与箱子插画）、Hannah Howell（事件卡插画），S3 p8。阶段1未下载已下架模组或使用玩家自制卡包。

## 阶段2补充：用户中文版照片（2026-10-27）

照片为用户提供的商品/卡面照片，不谎称由用户亲自拍摄或英文官方PDF。已实际看图。原文件留附件目录，不入库；不在阶段2生成UI资源。

- ZH-P1：配件数，规则书印刷p2；路径 `C:/Users/Lenovo/.codex/codex-remote-attachments/01a17b22-fccd-76d2-a8c5-936053515bf1/31343787-5EE9-475B-AEF9-29F9888DB1C8/1-照片-1.jpg`；SHA256 `f37ae6305f994f6fc962e44c03c79321894b0526462564c5bed8dc319a14f7a6`。
- ZH-P2：八张完整事件卡面，无页码；路径 `C:/Users/Lenovo/.codex/codex-remote-attachments/01a17b22-fccd-76d2-a8c5-936053515bf1/31343787-5EE9-475B-AEF9-29F9888DB1C8/2-照片-2.jpg`；SHA256 `ac78c099f24a0d87b8079ad6653c616a5ca09a2b82b882bf7904a06d2c40f80b`。
- ZH-P3：0/1/2/3瓶手提箱牌面与背面，无页码；路径 `C:/Users/Lenovo/.codex/codex-remote-attachments/01a17b22-fccd-76d2-a8c5-936053515bf1/31343787-5EE9-475B-AEF9-29F9888DB1C8/3-照片-3.jpg`；SHA256 `bcf5e1a364007359772ce36cec9d141b90e99357bc340363ffe33b45959999d5`。

事件卡逐张来源：A19生日礼物、A20假日狂欢、A21缉私犬长、A22起早贪黑、A23领导视察、A24破釜沉舟、A25贪得无厌、A26铁面无私均补齐为ZH-P2。阶段1的「未知/未取得完整卡面」是历史记录，当前已由该照片补齐中文卡面；英文完整组仍未取得。照片清晰度足以核对本次转录，正式UI仍须优先提高清图，不能声称本附件足够2倍高清。
