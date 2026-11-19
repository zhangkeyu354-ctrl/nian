# 大厅封面交接

这批封面取原版或站内图的主要元素重新构图。横图让画面向两边展开，卡带聚焦主体。延展使用取自游戏色板的渐变和边缘融合。

| 游戏 ID | 美术参考 | 主体和边缘处理 | 卡带字节 | 横图字节 |
|---|---|---|---:|---:|
| sk | [原版素材](https://cdn11.bigcommerce.com/s-285hkc2e8r/images/stencil/1280x1280/products/29458/260928/gpb3056ww__35827.1761835824.jpg?c=2) | 海盗与船帆。取局部重构，左右融入同色渐变 | 73,242 | 73,528 |
| du | `apps/web/public/assets/dnup/cover.webp` | 彩色数字与绿色标记。按两种比例重新裁切 | 20,506 | 23,428 |
| bf | [原版素材](https://cdn.pegasus.de/public/media/40/13/19/1757425275/4250231743856_BossFighterQR_EN_Pac_L_RGB.png?ts=1757425275) | 魔王与队伍。取局部重构，左右融入同色渐变 | 114,494 | 143,632 |
| ta | [原版素材](https://casualgamerevolution.b-cdn.net/sites/default/files/field/image/The%20Menace%20Among%20Us.jpg) | 飞船船员。取局部重构，左右融入同色渐变 | 116,592 | 116,074 |
| kb | `apps/web/public/assets/kariba/box.webp` | 大象与水塘。取局部重构，左右融入同色渐变 | 62,658 | 86,642 |
| nd | `apps/web/public/assets/naodong-scale/box.webp` | 标题与彩色刻度。取局部重构，左右融入同色渐变 | 41,976 | 43,142 |
| ss | [原版素材](https://www.battlefieldbangkok.com/cdn/shop/files/soda-smugglers-with-deluxe-bottle-cap-tokens-board-games-bitewing-games-912064.webp?v=1751985061&width=1946) | 紫衣走私犯与汽水。取局部重构，左右融入同色渐变 | 79,106 | 89,928 |
| rk | `apps/web/public/assets/rummikub/box-classic.webp` | 彩色数字牌。取局部重构，左右融入同色渐变 | 51,510 | 61,382 |
| xb | [原版素材](https://images.vocus.cc/9df26b96-87a0-4e22-a89d-2699e4fa2f1c.png) | 问答桌上的三只猫。取局部重构，左右融入同色渐变 | 92,978 | 124,614 |
| wt | [原版素材](https://static.wixstatic.com/media/bf497e_cbb756bd16a64c8188e47731cc66f7b9~mv2_d_3024_4032_s_4_2.jpg/v1/fill/w_980%2Ch_1307%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/bf497e_cbb756bd16a64c8188e47731cc66f7b9~mv2_d_3024_4032_s_4_2.jpg) | 深色书封与金色字标。取局部重构，左右融入同色渐变 | 105,130 | 123,338 |
| tp | `apps/web/src/drawing/Covers.tsx` | 画纸与手绘卡片。按两种比例重新裁切 | 38,730 | 43,304 |
| fa | [原版素材](https://cdn.shoplightspeed.com/shops/668362/files/71107665/1652x1652x1/oink-games-oink-a-fake-artist-goes-to-new-york.jpg) | 黄色城市剪影。取局部重构，左右融入同色渐变 | 13,858 | 13,582 |
| rr | `apps/web/src/rr/Objects.tsx` | 散落的站内物品图标。按两种比例重新裁切 | 46,370 | 47,314 |
| dm | [原版素材](https://assets.brack.ch/images2/5/8/5/406940585/406940585_xxl.jpg) | 手势与红蓝剪影。取局部重构，左右融入同色渐变 | 18,166 | 19,668 |
| dbd | [原版素材](https://toytooth.com/cdn/shop/files/71zcahZ2xKL.jpg?v=1761742672) | 火光中的杀手。取局部重构，左右融入同色渐变 | 48,016 | 51,428 |
| ma | `apps/web/public/assets/magical-athlete/lobby/cover.webp` | 赛场怪咖。取局部重构，左右融入同色渐变 | 86,556 | 125,148 |
| cn | [原版素材](https://imgix.bustle.com/uploads/image/2021/1/11/0a1d246a-f3f7-44a5-a16c-9802b1d50c48-codenames.jpg) | 两位特工。取局部重构，左右融入同色渐变 | 44,840 | 45,434 |

共 34 张，合计 2,286,314 字节。

《卡里巴湖》的水塘画面来自站内素材，外部原版出处未独立核验。Salem 1692 使用深色书封版本。

## iPhone 13 竖屏验收

`npm run build` 通过。通过 Playwright 使用 iPhone 13 的 390×844 视口打开 `/?view=hall2`。卡带上的游戏名由页面显示，盒面版式中的部分原标题随主体裁切。

- 大厅截图：[首屏](cover-screens/01-top.png)、[中间](cover-screens/02-middle.png)、[底部](cover-screens/03-bottom.png)
- 详情截图：[骷髅王](cover-screens/detail-sk.png)、[瞎掰王](cover-screens/detail-xb.png)、[眼疾手快](cover-screens/detail-rr.png)
