# UI v3 截图与验收证据

来自实际 Chromium 页面。横竖屏分别为 390×844、844×390；另附 360×800 极限图。截图脚本会检查无横向溢出，再保存稳定画面。

| 场景 | 竖屏 | 横屏 |
| --- | --- | --- |
| 教学：身份 | [查看](01-tutorial-identity-390x844.png) | [查看](01-tutorial-identity-844x390.png) |
| 教学：瞎掰 | [查看](02-tutorial-bluff-390x844.png) | [查看](02-tutorial-bluff-844x390.png) |
| 教学：得分 | [查看](03-tutorial-score-390x844.png) | [查看](03-tutorial-score-844x390.png) |
| 首次当想想 | [查看](04-first-guesser-390x844.png) | [查看](04-first-guesser-844x390.png) |
| 首次当老实人 | [查看](04-first-truth-390x844.png) | [查看](04-first-truth-844x390.png) |
| 首次当瞎掰人 | [查看](04-first-bluffer-390x844.png) | [查看](04-first-bluffer-844x390.png) |
| 统一闭眼 | [查看](07-eyes-390x844.png) | [查看](07-eyes-844x390.png) |
| 老实人私密答案 | [查看](08-private-answer-390x844.png) | [查看](08-private-answer-844x390.png) |
| 仅目标的点名提示 | [查看](09-callout-390x844.png) | [查看](09-callout-844x390.png) |
| 想想私密小抄 | [查看](10-notes-private-390x844.png) | [查看](10-notes-private-844x390.png) |
| 揭晓后公开小抄 | [查看](11-notes-public-390x844.png) | [查看](11-notes-public-844x390.png) |
| 本轮真相及来源 | [查看](12-truth-card-390x844.png) | [查看](12-truth-card-844x390.png) |
| 最离谱瞎掰投票 | [查看](13-crown-vote-390x844.png) | [查看](13-crown-vote-844x390.png) |
| 10人长名字／最长题目 | [查看](14-extreme-question-390x844.png) | [查看](14-extreme-question-844x390.png) |
| 10人长名字／最长解释 | [查看](15-extreme-answer-390x844.png) | [查看](15-extreme-answer-844x390.png) |

[360宽最长题目](16-extreme-0-360.png) · [360宽最长解释](16-extreme-1-360.png)。共32张图片。

- [UI专项结构化报告](ui-report.json)：教学与身份提示记忆、统一9秒窗口、点名目标隔离、小抄隐私与公开、皇冠不改引擎状态、历史卡横滑、刷新不重播、10人极限尺寸及四档字号。
- [音频报告](audio-report.json)：48kHz OfflineAudioContext 渲染实际合成音效，比较最大50ms RMS和绝对峰值；相对“轮到你”提示音均不超过1.5倍。该指标是客观短时电平检查，不是手机扬声器主观听感校准。
- 后台验证通过浏览器 visibilitychange 模拟调用生产监听器，并检查 WebAudio 发声节点计数与揭晓状态；没有宣称完成实体手机系统级切后台测试。
- [全量结构化验收摘要](verification.json)：51文件835项全量测试、3／6／10人整局及原有五游戏回归全部通过；细节见交接文档。临时房间、过程日志及旧版验收入口的额外截图存入忽略目录 output/xb-ui-v3/，不写入生产数据。

复跑：先 npm run build；在3359启动本地服务；运行 npx tsx scripts/verify-xb-ui-v3.ts。音频脚本需要 npm run dev 在5173运行，然后 npx tsx scripts/verify-xb-audio.ts。
