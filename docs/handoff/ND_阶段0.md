# ND 阶段 0 交接（2026-10-31）

## 当前成果

- 工作目录：`E:\DBD-BoardGame-Web`。分支：`codex/naodong-scale`。
- 初次 `git pull origin main` 因已有未提交脚本改动中止；具名 stash 保存已跟踪改动后，`git pull --ff-only origin main` 成功。当前 HEAD 与 origin/main 均为 `a010a5a`。
- 同步后已恢复原有已跟踪改动与保留全部未跟踪文件。其中 `scripts/verify-witch-town-browsers.ts` 旧补丁因远端调整格式无法直接套用，已按原补丁在同名函数起始处恢复原有 8 行插入，未改其内容。其余原有补丁直接恢复成功。
- 原有工作的额外备份仍在 `stash@{0}`，名称为 `pre-naodong-stage0-preserve-existing-tracked`；不要再次整体 apply，以免重复。备份未删除。
- [游戏身份与逐项来源](../naodong-scale/IDENTITY.md)：确认 Top Ten 基础版；原出版社 Cocktail Games、设计师 Aurélien Picolet、2020、4–9 人。法国与台湾配件版本分别记录。
- [指定路径总指令](../instructions/ND_MASTER_2026-10-31.md)：完整保留实际 PDF 附件的文本提取结果；未收到原 MD，因此不能声称原 Markdown 原样保存。差异见 [来源说明](../instructions/ND_MASTER_2026-10-31_SOURCE.md)。

## 真实执行与验证

- 联网查证：原出版社、2Plus、年度游戏奖官网、BGG，以及台湾零售与开箱旁证；不是凭记忆辨认。
- 官方法语基础版 PDF 实际下载成功：4 页、4,551,558 字节，正文已读取，第 4 页配件清单已渲染核对。本地临时位置 `tmp/nd-stage0/Top_ten_regles_BD.pdf`，未加入 Git。
- 原附件第一页渲染核对：`tmp/nd-stage0/instructions-page1.png`；官方规则配件页：`tmp/nd-stage0/official-material.png`。本阶段无需游戏 UI 截图。
- 文档定向检查 4 项通过、0 项失败：总指令等于全部 5 页未经改写提取文本；身份必要字段及外链存在；分支正确且 HEAD 等于 origin/main；无未解决 Git 冲突。
- `git diff --check -- docs/naodong-scale docs/instructions/ND_MASTER_2026-10-31.md docs/instructions/ND_MASTER_2026-10-31_SOURCE.md` 返回 0。新文档另由上述脚本读取验证。
- 本次仅新增研究文档，无功能实现；未运行运行时回归，不声称游戏测试通过。未提交、未推送、未合并、未部署。

## 待确认与停止点

等待用户确认是 Top Ten 基础版。仍缺原 Markdown 指令、完整题卡题库、台湾完整规则书与当地发行年份；已有法语官方完整规则可作后续依据。没有进入阶段 1，没有建立规则矩阵、题卡数据、审核页或任何功能代码。
