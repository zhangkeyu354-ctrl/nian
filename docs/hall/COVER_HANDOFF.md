# 大厅封面交接

素材均通过现有原图或站内美术排版制作。斜拍盒面仅截取正面并校正透视。

| ID | 原图或站内素材 | 画面处理 | card 字节 | wide 字节 |
|---|---|---|---:|---:|
| sk | [原版素材](https://cdn11.bigcommerce.com/s-285hkc2e8r/images/stencil/1280x1280/products/29458/260928/gpb3056ww__35827.1761835824.jpg?c=2) | 截取正面并校正透视，四周用同图模糊铺底 | 83,680 | 85,040 |
| du | `apps/web/public/assets/dnup/cover.webp` | 原图缩放，四周用同图模糊铺底 | 20,394 | 22,774 |
| bf | [原版素材](https://cdn.pegasus.de/public/media/40/13/19/1757425275/4250231743856_BossFighterQR_EN_Pac_L_RGB.png?ts=1757425275) | 截取正面并校正透视，四周用同图模糊铺底 | 107,506 | 107,702 |
| ta | [原版素材](https://casualgamerevolution.b-cdn.net/sites/default/files/field/image/The%20Menace%20Among%20Us.jpg) | 原图缩放，四周用同图模糊铺底 | 97,318 | 97,956 |
| kb | [原版素材](https://store.asmodee.com/cdn/shop/products/HL8923-image0_2000.jpg?v=1691511323) | 截取正面并校正透视，四周用同图模糊铺底 | 22,256 | 23,750 |
| nd | `apps/web/public/assets/naodong-scale/box.webp` | 截取正面并校正透视，四周用同图模糊铺底 | 42,558 | 44,618 |
| ss | [原版素材](https://www.battlefieldbangkok.com/cdn/shop/files/soda-smugglers-with-deluxe-bottle-cap-tokens-board-games-bitewing-games-912064.webp?v=1751985061&width=1946) | 原图缩放，四周用同图模糊铺底 | 74,348 | 76,202 |
| rk | `apps/web/public/assets/rummikub/box-classic.webp` | 截取正面并校正透视，四周用同图模糊铺底 | 46,938 | 61,008 |
| xb | [原版素材](https://images.vocus.cc/9df26b96-87a0-4e22-a89d-2699e4fa2f1c.png) | 原图缩放，四周用同图模糊铺底 | 81,102 | 81,586 |
| wt | [原版素材](https://static.wixstatic.com/media/bf497e_cbb756bd16a64c8188e47731cc66f7b9~mv2_d_3024_4032_s_4_2.jpg/v1/fill/w_980%2Ch_1307%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/bf497e_cbb756bd16a64c8188e47731cc66f7b9~mv2_d_3024_4032_s_4_2.jpg) | 截取正面并校正透视，四周用同图模糊铺底 | 71,862 | 71,032 |
| tp | `apps/web/src/drawing/Covers.tsx` | 站内封面直接渲染，卡带外围用同图模糊填充 | 29,446 | 39,088 |
| fa | [原版素材](https://cdn.shoplightspeed.com/shops/668362/files/71107665/1652x1652x1/oink-games-oink-a-fake-artist-goes-to-new-york.jpg) | 截取正面并校正透视，四周用同图模糊铺底 | 18,616 | 21,886 |
| rr | `apps/web/src/rr/Objects.tsx` | 站内物品图标重新排版，卡带外围用同图模糊填充 | 33,442 | 44,534 |
| dm | [原版素材](https://assets.brack.ch/images2/5/8/5/406940585/406940585_xxl.jpg) | 截取正面并校正透视，四周用同图模糊铺底 | 23,906 | 27,540 |
| dbd | [原版素材](https://toytooth.com/cdn/shop/files/71zcahZ2xKL.jpg?v=1761742672) | 截取正面并校正透视，四周用同图模糊铺底 | 53,672 | 56,156 |
| ma | `apps/web/public/assets/magical-athlete/lobby/cover.webp` | 原图缩放，四周用同图模糊铺底 | 95,674 | 127,106 |
| cn | [原版素材](https://imgix.bustle.com/uploads/image/2021/1/11/0a1d246a-f3f7-44a5-a16c-9802b1d50c48-codenames.jpg) | 原图缩放，四周用同图模糊铺底 | 43,914 | 47,532 |

共 34 张 WebP，合计 1,982,142 字节。

## iPhone 13 竖屏验收

`npm run build` 已通过。使用 Playwright iPhone 13 设备配置（390×844 CSS 像素）打开 `/?view=hall2`，34 张图均成功解码并符合尺寸。大厅首屏的「新」角标避开了两张封面的原标题。窄盒版式保留了原图比例，盒面小字在两列卡带上仍较小。

- 大厅：[首屏](cover-screens/01-top.png)、[中间](cover-screens/02-middle.png)、[底部](cover-screens/03-bottom.png)
- 详情：[骷髅王](cover-screens/detail-sk.png)、[瞎掰王](cover-screens/detail-xb.png)、[眼疾手快](cover-screens/detail-rr.png)

## 素材版本差异

- 卡里巴湖使用 Asmodee 商品页的 Helvetiq 实体盒面。这个版本以大象为焦点，未采用简报描述的水塘构图。
- 女巫镇使用 Salem 1692 实体盒正面的书封设计。该版本以深色底和金色原版标题为主。
- Top Ten 和 Rummikub 使用仓库里的包装素材截取正面，Dnup 和 Magical Athlete 使用仓库原有封面。外部来源尚未独立核验。
