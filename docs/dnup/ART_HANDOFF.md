# 反转王牌美术交接（未完成）

本分支是视觉初稿，尚未达到 CODEX_ART_BRIEF.md 的验收标准，不应作为完成版合并。

## 已做
- 深绿色毡布风格桌面、纸牌纹理和阴影、圆润数字、大厅彩色数字封面。
- 字母计分标记、手牌错峰旋转、名次徽章、终局数字飘落、轮到自己时的轻震动；支持减少动态效果设置。
- 没有修改规则引擎、服务器、协议或 data-testid。

## 待完成
- 指定的 WebP 牌面、横竖桌面、Logo 和封面素材及自托管字体尚未制作；目前使用 CSS 和系统字体。
- 压回及拿牌的飞行动画尚未实现；名次动效只应用于对手标记。
- iPhone 13 的房间、对局、弹窗、结算、终局、双人及六人截图，和三人完整联机验收尚未进行。
- 音效为可选项，目前没有增加。

## 验证
- `npm run build` 通过；仓库已有 dying-message 资源未解析警告。
- `npm run typecheck` 失败：缺少 `apps/web/test/scenarios.generated.json`，并引发该文件相关的隐式 any 错误。
- `npx vitest run packages/dnup/test/engine.test.ts --testTimeout 30000`：26 项通过。
- 完整测试及截图验收结果见后续更新；不得仅凭本初稿宣称通过。
