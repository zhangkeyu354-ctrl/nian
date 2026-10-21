# 实施验证记录

日期：2026-10-22，本地Windows Node24；Chromium headless；不是实机与Render测量。

|检查|结果与范围|
|---|---|
|首轮规则测试|17项通过；初次缺模块为RED后实现|
|权限/存档及复核回归|22项通过；新增3项先RED（选项答案位置、负时间、房主接任），修复后GREEN|
|完整单元回归|首轮453项通过；最终456项/27文件通过|
|typecheck/build|通过；旧木纹素材缺失与旧入口大chunk为已有构建警告|
|3–8人真实WebSocket|tp/fa各6种人数闭环通过；私画增量只到本人、重连、双标签旧写者拒绝、轮流权限、投票猜题、重开|
|Chromium三人浏览器|375/390/412宽、DPR3模拟；两款完整对局通过；触控事件经CDP、私画离线补传/刷新、横屏专注、整链PNG下载、秘密猜题隐藏画布、无横向溢出|
|控制台|主动断网的ERR_INTERNET_DISCONNECTED计作预期网络事件；其余console error/pageerror均无；第一次断网测试把预期日志列为错误，已修正分类后重跑|
|8人同时绘画|5Hz/人、12点/批、200批、4815ms，JSON总78488bytes；ACK中位3.87ms/P95 6.67ms/最大7.52ms；每人只收本人25批；本机短测，非CPU/内存/Render容量结论|
|旧回放|3种子1701/2903/4111事件与SHA256重放一致|
|旧LAN协议|3完整局、3025次安全视图比较通过|
|旧LAN浏览器|两种子、各5浏览器完整局通过|
|旧LAN大厅|3/4/5人场景通过|
|旧手机界面|64场景通过；第一次误用dist地址缺少/test/interface.html而超时，改用5175 Vite开发服务后通过|
|技能标准客户端|原样复制bundled web_game_playwright_client.js至work以解析本项目playwright，入口截图+render_game_to_text输出，退出0|

未测试：真实iPhone Safari、Android Chrome、微信、物理手指/来电/系统锁屏、真实移动弱网、WebKit、Render、长期持续并发、硬件断电、对象存储持久化。截图/模拟不能证明上述通过。

协议脚本正常人操作有速率间隔；第一次无间隔快速翻阅触发限流，未取消限制，而是调整测试节奏。客户端触控本机立即绘制，不等网络ACK；提交必须等笔画同步完。

最终修复后重复浏览器与协议闭环均通过。详见执行脚本，可复现；工作目录work/drawing-party-browser、work/drawing-party-load、output/mobile-implementation/interfaces。

## 2026-10-22 最终追加

最终456项/27文件通过；类型检查与生产构建通过。修复后的服务上，两款3–8全部协议闭环再次通过；三人Chromium触控全流程再次通过，其中一位模拟禁用crypto.randomUUID，验证局域网ID回退。最后补上错误游戏入口但正确房间号自动跳转：浏览器先复现等待超时，修复后tp/fa均通过；非预期控制台错误为0。共用画布截图已人工查看，手机横屏截图另查。最终结果json为passed:true、realDevices:false。无实机兼容性结论。

横屏视觉追加：首轮fullPage截图复核发现普通画板宽度限制裁切专注工具，新增画布与全部按钮屏内断言先失败；提高专注容器覆盖优先级并改用三列横屏布局后，断言及两款完整浏览器流程通过。专注截图改为viewport截图，避免fullPage临时扩展视口改变dvh。最新截图人工复核无裁切。试玩服务用work/dp-preview-data，不占用已满的测试目录。
