# 汽水走私犯 Soda Smugglers

入口：`/?game=ss`。3–8 人；房主选择人数、计时、首位缉私警长和随机事件（默认关闭）。旅客以语音自由讨论；无文字聊天。随机事件采用用户提供中文版的八张卡，卡文与素材来源见 `RULE_MATRIX.md` 和 `ASSETS.md`。

## 运行与资料

在仓库根目录执行 `npm install`、`npm run build`、`npm run server`，进入游戏入口创建房间并分享邀请链接。服务端使用 `SS_DATA_DIR` 中的 JSON 快照，浏览器凭座位 token 断线重连；服务器负责计时及其他玩家的秘密行李。`viewForSS` 只投影当前座位获准查看的信息。

规则与待核实问题见 `RULE_MATRIX.md`、`CHECK_REQUIRED.md`；用户指定的付不起时付到0、不记欠款为房规 HR-SS-01。网络协议与验证方法见 `NETWORK.md`。卡面来源见 `ASSETS.md`。

## 验收与限制

- `npm test`、`npm run typecheck`、`npm run build`。
- `npm run verify:ss-protocol`、`npm run verify:ss-browsers`；真实页面对局、秘密投影、重连与超时检查。
- `npx tsx scripts/verify-ss-ui-v1.ts`：截图、按钮尺寸、八人长名字、阶段文案、轮末滚动与对比度检查。结果写入 `ui-v1/audit.json`，截图总览为 `ui-v1/OVERVIEW.png`。
- 全仓回归的实际执行结果和已知问题以 `docs/handoff/SS_阶段5.md` 为准；不把未运行或未通过的检查作为通过。
