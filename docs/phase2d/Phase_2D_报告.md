# Phase 2D 第二步实施报告（2026-10-20）

已把正式手机对局接入现有规则引擎，并按用户追加指令先合并 `claude/room-flow`（`d8e28df`）。正式联机建房只选人数，加入后选阵营，由服务器随机地图及角色候选；沿用 JoinRoom / LobbyRoom / DraftRoom 及其 data-testid。PhoneSetup 仅保留给本机热座；固定测试建房使用 `?online=1&seed=N&preset=地图,逃生者1,逃生者2,逃生者3,逃生者4,杀手`。

## 改动

手机以顶部状态、真实数字棋盘、底部阶段操作坞呈现；移除手机长控制面板、房间下拉框与常驻日志。保留棋盘移动、相邻房间定位、双指缩放、拖动、全图及横屏查看。秘密手牌只在所属操作界面出现，热座有交接遮挡。

常驻“物品”入口逐一查询本座位角色的 itemActions，覆盖等待别人时使用及兼控两名角色。直接发送查询给出的完整命令。接上 MAP_REVEAL、PHANTASM_TARGET、CARRY_REROUTE、REPLAN；冲刺爆发/轻盈敏捷用引擎 canCommand 验证的路线与目的地在棋盘选择；物品打出显示公开图片和事件反馈。未改动 privacy.ts。

非骰子的手机装饰反馈改为自动消失，掷骰仍由行动者确认，观看者自动关闭。同步发送锁避免重复提交，断线期间禁止发送；回合提示音/震动可关；在支持且允许的浏览器申请屏幕常亮；添加原创灯笼 PWA 清单，不缓存离线对局。HTTP 局域网或浏览器限制可能使常亮、震动、安装提示不可用，本次未做实体设备验证。

修复了触摸关闭抽屉/全图后浏览器兼容点击落到下层按钮的缺陷。64 场景检查每次只发送一条正确命令，曾发现的工具箱使用后意外结束行动现在不再复现。联机浏览器驱动也会等待观看者的骰子队列结束，避免把自动关闭过程误当已结束。

## 实际验证

| 检查 | 结果 |
|---|---|
| npm test | 13 文件、208 项通过（包含合并分支的12项房间测试） |
| typecheck / build | 通过；构建仍提示主 JS 大于500kB，实际冷进入另测 |
| verify:replays | 1701 / 2903 / 4111 全部逐事件一致，哈希不变 |
| verify:mobile-taps | 4111：107条、杀手获胜；1701：188条、逃生者获胜；每局5个独立浏览器，全部为触屏设备配置，逐条核对事件和版本 |
| verify:mobile-interfaces | 从成功的引擎测试提取64个输入，真实App界面完成39技能、10物品、6力量、4新选择、4回合外物品及1兼控库存；这是开发测试入口，不冒充64局联网验收 |
| verify:lan-lobby | 3/4/5人建房、修改人数、进房、选阵营、随机分配、角色选择直到开局；含多人争杀手、无人选杀手、自愿兼控 |
| verify:lan-protocol | 三局通过，2565次投影检查；非法请求按预期拒绝 |
| verify:hotseat | 三局完整真实界面回放，188/218/107条命令 |
| verify:actions | 35条合法命令与事件一致，物品按钮使用完整参数 |
| verify:mobile / mobile-surface | 双指缩放、拖动、隐私遮挡、不可用技能、48px和无页面滚动/下拉通过 |
| verify:board | 两地图三种屏幕共6张中局；全图房间/路线计数及像素通过 |
| verify:visuals | 41状态、翻牌/骰子/修理/挂钩/攻击序列、设置及资源缺失回退通过 |
| verify:mobile-preview | 历史独立样稿仍通过，不拿样稿代替真实验收 |

verify:lan-browsers 两局通过：4111/1701各5浏览器，检查杀手收到的110/191帧投影，中局全图截图各5张，刷新恢复座位通过。完整摘要见 VALIDATION.txt。开发技能标准客户端亦运行，检查了真实App的截图和 render_game_to_text；它是补充检查，不代替联网回放。

设备使用 Playwright iPhone 13 / Pixel 7 的触屏及 DPR 设置、Chromium。当前安装的描述文件可用视口分别为390×664与412×839；另有390×844竖屏、844×390横屏中局证据。不是实体 iPhone Safari/安卓的人工体验结论。

## 点击数与下载对照

第一步审计见 [手机操作审计](手机操作审计.md)。下表为本次两局联机实际测到的流程；完整每步点击、额外骰子确认与上限判断在 [mobile-taps.json](implementation/evidence/mobile-taps.json)。没有隐藏自动操作或直接向服务器替代点击。

| 操作 | 改前实际 | 本次实际 |
|---|---:|---:|
| 逃生者/杀手计划 | 2/3，需页面滚动 | 2/3，无页面滚动 |
| 合法移动 | 1 | 1 |
| 开局翻道具 | 3 | 2；最后一块触发全员出生掷骰，另列出生结果确认 |
| 常见交互 | 2–4 | 提交1，若本动作掷骰加1，合计≤2 |
| 无参数技能/跳过 | 2/1 | 1/1 |
| 结束行动 | 1，需滚动 | 1 |
| 搬运 | 2步操作+2次反馈（原审计一步） | 每步1+确认1；规则要求的后续骰子另列 |
| 物品使用 | 旧入口缺参数，可能被拒 | 物品入口1+完整合法选项1；本次10种物品接线均成功 |

**限制：不能宣称任意复杂技能都只点一次。** 需要多个目标、路径或数值的技能保留大按钮分页选择；64场景里board_dwight_1 为22次、board_feng_min_3 为20次（含多字段选择与翻页），力量最多9次。无参数“使用/跳过”符合1次，但若把复杂目标选择也算入同一项1次上限，该严格口径尚未达成。这里如实交付可用版本和记录，不把接线通过等同于全部复杂技能的点击效率达标。

改前1701初始房间冷下载为57,734,958字节 HTTP。本次关闭缓存，从进入建房页/房间到棋盘图片完成解码及网络空闲，包含 HTTP 实际传输字节和双向 WebSocket 文本帧；10个独立上下文合计各自为1,636,461–1,671,296字节（约1.64–1.67MB），低于8MB。两口径不是同一旧规则版本、不是互联网测速；本次额外计入WebSocket。WebP只改变显示资源，不改变地图与道具数据。

## 图像与证据

沿用13角色、21房间及道具原创插画，派生手机600px房间图、电脑1000px图及256px图标。保留此前已生成的5张物品图。新增插画登记22项中5项为AI图、17项为SVG占位；用户另行生成的28张图尚未收到，未冒称全部最终美术完成。缺图即时保留SVG；assets/manifest.json及公开副本登记来源、尺寸和对应文件。

| 场景 | 截图 |
|---|---|
| 计划 | [1701](implementation/evidence/1701_plan.png) |
| 移动 | [1701](implementation/evidence/1701_move.png) |
| 交互 | [1701](implementation/evidence/1701_interact.png) |
| 技能 | [1701](implementation/evidence/1701_skill.png) |
| 等待 | [4111](implementation/evidence/4111_waiting.png) |
| 掷骰 | [4111](implementation/evidence/4111_dice.png) |
| 搬运 | [4111](implementation/evidence/4111_carry.png) |
| 结算 | [1701](implementation/evidence/1701_results.png) |
| 麦克米伦竖/横屏 | [竖屏](implementation/evidence/1701_portrait_midgame.png) · [横屏](implementation/evidence/1701_landscape_midgame.png) |
| 废车场竖/横屏 | [竖屏](implementation/evidence/4111_portrait_midgame.png) · [横屏](implementation/evidence/4111_landscape_midgame.png) |
| 完整地图 | [麦克米伦11房间22路线](implementation/evidence/1701_portrait_fullmap.png) · [废车场10房间19路线](implementation/evidence/4111_portrait_fullmap.png) |

UI截图用screenshot-check检查非空白像素；只有标为全图的截图要求全部房间/路线可见。局部自动镜头不冒称全图。证据保留于 implementation/evidence；调试失败截图未列入交付。

## 边界

合并后45个受保护文件与d8e28df内容一致，记录于 [SCOPE_GUARD.json](implementation/SCOPE_GUARD.json)。规则引擎、协议、服务器和游戏数据的变更来自用户明确授权合并的Claude分支，此后的手机适配没有再改它们。reference/不提交原版照片/PDF。

尚未包含52张技能卡组/Bloodweb/Devout；Q15两种弃牌公开性沿用现有投影。随机压力测试20局运行41818条合法命令，8种物品随机使用29次，14局获胜、6局达到步数上限；不是20局全部完成，也不是无bug保证。10种物品由定向界面测试补齐覆盖。

按用户要求，本次提交并停止，不进入新的规则或上云阶段。
