# 清晰卡面替换 · 2026-10-21

用户指出照片裁切后的牌背与身份卡不清晰，授权生成清晰版或查找网络资源。此次先检查发行方SYNKA官网图库原图（约4032×3024）与同版官方说明书；图库仍是实拍，PDF内人物约250像素宽，并非完整高清电子卡面。最终使用内置image_gen，依照用户原卡照片与发行方图复刻15个人物，保留服装、姿态、道具、遮眼设计和原配色。**这些是参考图复刻插画，不是官方高清原文件，也不保证逐笔一致。**

三张图集均为1254×1254，每张3列2行，前5格对应5角色，第6格为空；每个人物有效画面约418×627。最大秘密身份卡内部宽210 CSS像素，可接近2倍屏幕像素显示，没有把小照片简单插值冒充细节恢复。文字和眼睛符号由HTML/SVG渲染，牌背是700×1000 viewBox的SVG，放大保持文字边缘清晰。153张无字证据图没有更改。

素材位置：

- apps/web/public/assets/dying-message-hd/atlas-1.webp
- apps/web/public/assets/dying-message-hd/atlas-2.webp
- apps/web/public/assets/dying-message-hd/atlas-3.webp
- apps/web/public/assets/dying-message-hd/card-back.svg

生成方式与完整提示词：[HD_ASSET_PROMPTS.json](HD_ASSET_PROMPTS.json)。原生成PNG保存在Codex generated_images目录，项目内保留WebP。来源参考：[发行方官网](https://www.synkagames.jp/dyingmessage)、[同版说明书](https://www.synkagames.jp/_files/ugd/7f318b_121e099419c545d5a0ca7287d2b67f91.pdf)。原照片和下载参考文件仍仅存本地reference，不提交。

验收：15角色图片与原生名称、英文名称一致；浏览器不再请求旧照片卡面；360与1440宽布局无横向溢出；隐藏座位仅显示牌背；四客户端完整对局、刷新恢复、顺序发言、两轮投票、胜负与重开通过。24文件411项测试通过，类型检查与构建通过（既存主包尺寸提示仍在）。标准web-game客户端冒烟已运行并查看截图。私有截图及机器结果位于output/dm-hd-review与output/dm-hd-smoke。

本次只替换美术与展示组件，没有修改任何游戏规则，没有推送或部署。
