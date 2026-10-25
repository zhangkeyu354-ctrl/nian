# 传情画意主题与欢乐奖项

## 实施基线

依据 docs/instructions/传情画意_主题投票与MVP坑货_交给Codex.md（origin/main d2d301c）。该指令包含需求、默认裁定、UI基线和验收；用户已明确委托执行，沿用既有绘画派对产品验证与架构，不重新设计产品。只改tp，fa保留原状态机和界面。

新增THEME（30秒）→THEME_RESULT（服务端1.5秒）→PROMPT（完整60秒）；最后一页自动进入AWARD（30秒），结票进入AWARD_RESULT，房主下一本或结束。保留旧存档无新增字段时的旧流程。每次tp操作scope附cursor，阻止迟到的上一册操作。新增字段通过原JSON快照保存，无数据库、依赖或部署变化。

题目由玩家填写，不提供题库、不做主题归属检查；超时空题记“未出题”并标missing。奖项只计票，无积分、排名或输赢。零票不授奖，显示“本轮无人获票”。

## 待用户确认

- 默认匿名，仅本人知道自己的选择，公布仅显示票数。
- MVP与坑货可以投给同一人，也可分别弃权；一次确认后锁定。
- 固定七个主题是否合适。
- 零票不授奖；超时空题标“未出题”，而非系统补题。

## 验证记录

- 新增核心与房间回归：主题计票/平票复现/超时/非法值/重复/隐私，奖项候选/禁止自投/双项同人/弃权/并列汇总，JSON落盘重载与房主接任、旧传话本scope拒绝。
- `npm test -- --maxWorkers=2 --testTimeout=30000`：55文件、850项通过（299.44秒）；最终冻结版再次55文件/850项通过（230.44秒）。
- `npm run typecheck`、`npm run build`通过。构建保留旧木纹资源缺失与大包提示，未改这些资源。
- `npm run verify:replays`：1701、2903、4111三局逐事件与SHA-256复现通过。
- `DP_URL=http://127.0.0.1:3015 npx tsx scripts/verify-drawing-party.ts`：tp/fa分别3～10人共16局全部PASS。tp奇数人数选歌词，偶数人数选自定义，每一本都走完整奖项投票与结票；fa流程和断言未改。
- `verify-drawing-studio.ts`：BROWSER_PASS tp / fa，真实浏览器三端完整流程、离线补传、刷新、导出、重新开局通过。
- `verify-drawing-studio-eight.ts`：EIGHT_UI_PASS fa / tp。844×390画布fa682×341、tp632×316；没有缩小原绘画工作区。
- `verify-tp-theme-mvp.ts`：10个真实Socket座位与触屏模拟浏览器，完整主题→自由写题→10步画猜→10本奖项投票→结算，覆盖10人全并列。844×390、667×375、390×844的主题/写题/揭晓/投票/公布/全场结算截图与边界检查通过；使用screenshot-check.ts的assertUiShot检查截图像素。最终冻结版视觉复跑通过，截图已用view_image人工复核。
- 投票画纸：844×390从576×288到418×209（面积52.7%）；667×375从503×251.5到388×194（59.5%）；竖屏390×195不变。公布时422×211/392×196/390×195，均不少于投票前一半。10人候选横屏一行，竖屏换两行；并列公布名单可滑动阅读。
- develop-web-game标准客户端运行并检查截图/安全状态；完整操作证据以上述联机脚本为准。
- 所有移动尺寸为桌面Chromium触屏模拟，**未声称真实iPhone Safari、Android或微信通过**；Render未部署/未测试。


## 协议与持久化

`THEME_VOTE {theme:0..6}`在THEME投一次。`AWARD_VOTE {chain,mvp?:string|null,dud?:string|null}`在AWARD一次确认两项，省略项归一为null。新op重复投票被拒；同op网络重试保持既有幂等处理。

TP scope由`gameScope`统一生成`id:phase:step:turn:cursor`，FA仍是原`id:phase:step:turn`。chain必须等于cursor计算出的当前册，不能提交别册的票。非房主不能NEXT；接任房主复用现有权限映射。

新增Game字段：theme、themeVotes、themeTieSeed、themeRandomIndex、awardVotes、awardResults。两个主题随机量独立在服务器生成并写入既有快照。无新数据库。GameView仅包含本人myThemeVote/myAwardVote和已投人数；awardResults只含已结票册的计票，不含投票者。RESULT额外给awardTotals。THEME_RESULT与AWARD截止由服务器推进；客户端无跳过指令。

## 文件与复验

- 核心：packages/drawing-party/src/index.ts，packages/drawing-party/test/tp-theme-awards.test.ts及旧TP测试适配。
- 房间：apps/server/src/drawing-rooms.ts、apps/server/test/tp-theme-awards.test.ts；原房间上限、人数、限流不改。
- 画室：DrawingParty.tsx、Studio.tsx、StudioArt.tsx、TaleAwards.tsx、Results.tsx、studio.css。CSS新增规则均以.st-tp限定；FakeResult函数保持原文，Portrait新增tale参数默认false，fa默认呈现不改。
- 验收脚本：verify-drawing-party.ts、verify-drawing-studio.ts、verify-drawing-studio-eight.ts、verify-tp-theme-mvp.ts；verify-drawing-load.ts仅适配TP新主题与scope。
- 截图：theme-mvp-screens/，metrics.json记录尺寸与画纸；work/中的房间token/存档不提交。

本地预览：`http://127.0.0.1:3017/?game=tp`。默认服务器启动命令仍为npm run server；3017为隔离验证端口，数据在work/tp-theme-mvp-final。协议脚本一次创建16个房间，重新跑需要新测试目录/进程，避免碰到既有20房间上限，禁止删除生产存档。

本分支codex/tp-theme-mvp基于origin/main@d2d301c；不合并main、不推送、不部署，完成后交Claude复验。
