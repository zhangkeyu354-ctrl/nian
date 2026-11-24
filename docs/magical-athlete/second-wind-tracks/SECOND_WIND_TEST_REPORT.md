# Second Wind 阶段测试报告

这是地图基础阶段的真实记录，**不是V1.0 Final全部验收通过报告**。
基于origin/main `55aa06e`；独立分支`codex/ma-second-wind-tracks`。未推main、未部署。

## 已执行

|检查|实际结果|证据|
|---|---|---|
|开发前npm ci --ignore-scripts|通过，0 vulnerabilities|baseline-install.log|
|开发前npm test|1893通过、1跳过；159文件通过、1文件跳过|baseline-tests.log|
|地图/通道专项|25通过（5结构＋19落点/交互＋1模拟）|whirly-final.log|
|100场螺旋单场|种子540001–540100，4109命令；72/72角色曾参赛|output/ma-tracks/whirly-simulation.json|
|逐命令不变量|100场全部执行既有checkChainInvariants|同上；不是所有技能触发证明|
|一代冻结＋落点回归|25通过（6旧登记＋19落点）|whirly-legacy-final.log|
|手机/电脑结构图|320/360/390/414/1280，共10张，无横向溢出|output/ma-tracks/browser-results.json|
|17→22浏览器落点|twin位置22，鸡脚小屋导致摔倒，符合预期|game-client-final/state-0.json|
|内置游戏浏览器客户端|已执行并实际打开截图检查|tracks-game-client-final.log、game-client-final/shot-0.png|
|npm run typecheck|通过|tracks-typecheck-current.log|
|npm run build|通过，原有大chunk提示仍存在|tracks-build-current.log|

当前完整回归结果在本报告末尾追加，未完成前不能用旧日志代替。

## 发现并修复
1. 初始实现用新图扩充原tracks.ts，触发旧文件哈希冻结回归。改为独立track-registry.ts增量注册，一代文件恢复原字节，不删旧测试。
2. 巨婴在通道源端先挤走到达者，导致4没有传送到6。先增加失败回归，再修正地图优先，已通过。
3. 第一次浏览器fixture漏导游戏CSS，320宽结构溢出；修正fixture实际样式导入，未放宽溢出断言，10种地图/宽度组合通过。
4. 通道动画事件保留原移动经过对象，不因传送漏掉香蕉；通道路径不额外制造经过对象，专项通过。

## 未执行／未完成（CHECK_REQUIRED）
- 13张Twist可执行事件、方向适配、镜像后的全部角色技能；事件卡独立UI。
- 四图自定义/随机/逐轮赛程房间设置、服务端权限、锁图、主机迁移回退。
- 400场四图模拟、40组四场系列、132种混乱有序组合；目前仅100场螺旋。
- 新地图4客户端完整比赛与混合赛程、掉线重连/重复请求/弱网/后台切换。
- 真机Safari/Chrome/微信、iPhone/安卓；目前为桌面Chromium手机尺寸仿真。
- 角色参赛记录见ROLE_PARTICIPATION.md。每个角色具体技能与新图的正常/边界/交互验收尚未全做，不标72/72技能兼容通过。
- 结构SVG不等于最终还原美术；原图装饰插画未下载或复制，公开授权未确认。

## 发布结论
新图均CHECK_REQUIRED，正式PLAYABLE_TRACKS仍只有mild/wild。不能合并或上线此阶段为完整二代赛道更新；未写发布公告。骰子工作树独立保留，不混入本分支。

## 完整回归收尾

最终`npm test`：162个文件通过、1个文件跳过；1918项通过、1项跳过（总1919），无失败。耗时285.66秒。日志tracks-tests-final.log。既有跳过项未移除或伪装为通过。

中间一次全量运行有2项失败（旧赛道文件冻结、巨婴优先级），上文已记录修正；最终重新跑完整套件通过，不以专项结果代替。
类型检查和构建另已通过（tracks-typecheck-current.log、tracks-build-current.log）。
## 2026-11-25 扭扭赛道续作：首个事件

本阶段实现第一次实际正向跨越13/14边界时抽牌，先锁触发标记、从当前场牌堆不放回抽取，再执行效果。T01「地上烤鸡」固定事件开始时的并列末位名单，每人向前实际移动7格，复用原有超越/冲线/落点。传送与赛前摆放不调用此逻辑。每次扭扭比赛生成独立13张牌堆。

其余T02–T13尚无真实效果，抽到会抛CHECK_REQUIRED错误；新地图仍禁止正式房间选择。当前测试仅用完整快照指定T01，用于专项验证，不对玩家开放未实现事件。需要继续做全部事件、方向适配、赛程和多人回归。

专项：twisty-first-event 5通过，连同一代冻结与螺旋回归共30通过；typecheck/build通过。完整npm test结果见twisty-full.log，完成后补数。未合并main，未部署。
完整npm test：163文件通过、1文件跳过；1923项通过、1项跳过。耗时242.43秒。日志twisty-full.log。
