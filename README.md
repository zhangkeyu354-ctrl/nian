# 《黎明杀机：桌游版》中文多人网页项目

当前完成Phase 1：无界面、确定性规则引擎；尚未实现网页界面或联机服务。

- 当前验收：`docs/PHASE_1_REPORT.md`；API和运行说明：`docs/phase1/ENGINE_API.md`。
- 用户裁定：`docs/HOUSE_RULES.md`；后续缺口：`docs/MISSING_RESOURCES.md`。
- 来源与规则：`docs/SOURCE_MANIFEST.json`、`docs/RULE_MATRIX.md`。
- 旧Phase 0/入库报告为历史快照，以U02和当前报告为准。

使用Node.js 24（已验证24.14.0）与npm：

```powershell
npm ci --ignore-scripts
powershell -ExecutionPolicy Bypass -File scripts/run-phase1.ps1
```

研究审计另运行tests/verify_*.py；缺少原版reference的分享包运行既有资料审计时加`--allow-missing-reference`（仅跳过原版文件哈希，不证明原图已核对）。引擎测试无需原版PDF/图片。

资料以已接受中文版零售照片优先、英文官方规则其次，日文仅参考。34个板载技能已实现，5个留Phase 4并明确CHECK_REQUIRED。无远程仓库、未上传；原版reference资料不随代码包分享。
