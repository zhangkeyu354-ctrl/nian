# 《黎明杀机：桌游版》中文多人网页项目

当前完成Phase 2及其道具状态/原创美术补充：中文数字棋盘与同设备热座界面；使用Phase 1确定性规则引擎。联机服务尚未实现。

- 最新补充验收：`docs/PHASE_2_ART_REPORT.md`；原验收：`docs/PHASE_2_REPORT.md`；热座使用：`docs/phase2/使用说明.md`；引擎API：`docs/phase1/ENGINE_API.md`。
- 用户裁定：`docs/HOUSE_RULES.md`；后续缺口：`docs/MISSING_RESOURCES.md`。
- 来源与规则：`docs/SOURCE_MANIFEST.json`、`docs/RULE_MATRIX.md`。
- 旧Phase 0/入库报告为历史快照，以U02和当前报告为准。

使用Node.js 24（已验证24.14.0）与npm：

```powershell
npm ci --ignore-scripts
npm run dev
# 在浏览器打开 http://127.0.0.1:5173/
# 或 powershell -ExecutionPolicy Bypass -File scripts/start-hotseat.ps1
```

验证：npm run typecheck、npm test、npm run build；完整浏览器对局npm run verify:hotseat（先启动开发服务；首次另运行npx playwright install chromium）。研究审计另运行tests/verify_*.py；缺少原版reference的分享包运行既有资料审计时加`--allow-missing-reference`（仅跳过原版文件哈希，不证明原图已核对）。引擎测试无需原版PDF/图片。

资料以已接受中文版零售照片优先、英文官方规则其次，日文仅参考。34个板载技能已实现，5个留Phase 4并明确CHECK_REQUIRED。无远程仓库、未上传；原版reference资料不随代码包分享。
