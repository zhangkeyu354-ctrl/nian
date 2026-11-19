# 大厅封面交接

本批九款。将原版盒面放到宽画布，再用图像编辑外扩。合成时恢复原版中心像素，接缝处理限于边沿及外围。宽图使用完整画布，卡带去掉两侧各 200 像素的外扩区域。

| 游戏 ID | 参考出处 | 文件 | 卡带字节 | 横图字节 |
|---|---|---|---:|---:|
| sk | [参考出处](https://uploads.comparajogos.com.br/img/7f7be480a7023ddc0b9365ee2fa83a73fa038d33.jpg) | [原图](ref/sk.jpg) · [对照](compare/sk.webp) | 109,740 | 116,924 |
| du | [参考出处](https://github.com/zhangkeyu354-ctrl/nian/blob/b7380a3/apps/web/public/assets/dnup/cover.webp) | [原图](ref/du.jpg) · [对照](compare/du.webp) | 22,394 | 25,050 |
| bf | [参考出处](https://cdn.pegasus.de/public/media/40/13/19/1757425275/4250231743856_BossFighterQR_EN_Pac_L_RGB.png?ts=1757425275) | [原图](ref/bf.jpg) · [对照](compare/bf.webp) | 118,828 | 134,280 |
| ta | [参考出处](https://casualgamerevolution.b-cdn.net/sites/default/files/field/image/The%20Menace%20Among%20Us.jpg) | [原图](ref/ta.jpg) · [对照](compare/ta.webp) | 118,530 | 138,378 |
| kb | [参考出处](https://store.asmodee.com/cdn/shop/products/HL8923-image0_2000.jpg?v=1691511323) | [原图](ref/kb.jpg) · [对照](compare/kb.webp) | 25,098 | 27,406 |
| nd | [参考出处](https://media.cdnws.com/_i/184339/1087/490/87/cgtop01-box3d-010420.png) | [原图](ref/nd.jpg) · [对照](compare/nd.webp) | 61,318 | 63,514 |
| ss | [参考出处](https://www.battlefieldbangkok.com/cdn/shop/files/soda-smugglers-with-deluxe-bottle-cap-tokens-board-games-bitewing-games-912064.webp?v=1751985061&width=1946) | [原图](ref/ss.jpg) · [对照](compare/ss.webp) | 84,924 | 88,278 |
| rk | [参考出处](https://i.ebayimg.com/00/s/MTQ5OVgxNTAw/z/pEYAAOSwzOleZypW/%24_57.JPG?set_id=8800005007) | [原图](ref/rk.jpg) · [对照](compare/rk.webp) | 76,364 | 77,654 |
| wt | [参考出处](https://static.wixstatic.com/media/bf497e_cbb756bd16a64c8188e47731cc66f7b9~mv2_d_3024_4032_s_4_2.jpg/v1/fill/w_980%2Ch_1307%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/bf497e_cbb756bd16a64c8188e47731cc66f7b9~mv2_d_3024_4032_s_4_2.jpg) | [原图](ref/wt.jpg) · [对照](compare/wt.webp) | 89,494 | 88,246 |

拉密、脑洞量表、魔王试炼、卡里巴湖和女巫镇的参考包含包装透视或盒外背景，取正面后校正。卡里巴湖采用 Helvetiq 大象版；女巫镇采用 Salem 1692 深色书封版。反转王牌使用仓库内的对应封面，该来源的外部出处尚未独立核验。

剩余八款沿用分支已有资源，待首批方向确认。

## 验收

`npm run build` 通过。用 Playwright 的 iPhone 13 竖屏配置打开 `/?view=hall2`，18 张成品均通过浏览器解码、文件尺寸和体积检查。逐款对照原版，并排检查了九张 170×128 缩略图。女巫镇的实体书封保留了原版边沿和材质，其余八款尚未进行本批对照验收。

- 大厅：[首屏](cover-screens/01-top.png)、[中段](cover-screens/02-middle.png)、[底部](cover-screens/03-bottom.png)
- 详情：[骷髅王](cover-screens/detail-sk.png)、[脑洞量表](cover-screens/detail-nd.png)、[拉密](cover-screens/detail-rk.png)
