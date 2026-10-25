# 阶段 5 补充：女巫镇手牌布局修复

## 授权与改动

用户已明确回复“允许这次修复女巫镇手牌布局”。这次授权覆盖拉密总指令对其他游戏视觉修改的限制，仅用于已定位的手牌裁切，不启动拉密 XP 阶段。

`apps/web/src/wt/WitchTown.tsx` 只修改一处角度计算：每张牌的间隔仍最多 2.5°，整体展开限制在 ±8°。19 张牌原本两侧达到 ±22.5°，现在两端不会继续向外扩张。未修改引擎、网络协议或 CSS 文件。

新增可重复运行的浏览器回归 `scripts/verify-wt-hand-layout.ts`。它自行创建隔离服务器及合成存档，使用现有 `candidate-59` 测试牌数配置，与当前游戏服务器一致。没有读取用户对局存档，也没有给产品增加测试入口。

## 测试与证据

- 测试先行：旧产品构建触发失败，日志 `docs/rummikub/verification/stage5-wt-hand-red.txt`；结构化测量 `stage5-wt-hand-red.json` 保留 19 / 30 张牌稳定展开后的真实越界。初版还统计了面板入场过程中的裁切；最终断言区分预期的面板内入场裁切和真正的越界：所有动画时点都必须在屏幕内，结束后还必须完全落在个人面板内。
- 修复后专项通过：3 / 9 / 19 / 30 张牌，390×844、360×640、844×390 共 12 种情况；每种测量 0 / 100 / 225 / 2000ms，共 **48 个时点**，越界为 **0**。
- 每种手牌中逐张寻找真实露出的点击区域，再用浏览器指针点击并确认详情面板打开、关闭。共 **183 次卡牌详情操作**通过，避免只把牌挤回区域却无法选中。
- **12 张截图**通过 `scripts/screenshot-check.ts` 的图片与非空白检查，已查看 19 张手机竖屏及 30 张横屏截图，两侧牌面完整。截图归档 `docs/rummikub/verification/wt-hand-fix/`。
- 四人真实浏览器整局：**144 次行动，278419ms**，正常结束；刷新恢复、离线重连均执行，`overflow=[]`、`consoleErrors=[]`，退出码 **0**。日志 `stage5-wt-fix-browsers.txt`，摘要 `stage5-wt-fix-summary.json`，过程截图在本机 `output/rk-stage5/wt-fix/`。
- `npm run build`、`npm run typecheck`、新脚本的 Prettier 检查通过。构建保留既有大包提示。
- 最终 `npm test`：**58 个文件、892/892 项通过，181.78 秒**；日志 `stage5-wt-fix-full-test.txt`。浏览器整局结束后才启动本次全仓单元测试。

专项命令：

```text
npx tsx scripts/verify-wt-hand-layout.ts
```

完整浏览器对局使用隔离本地服务器，运行 `npx tsx scripts/verify-witch-town-browsers.ts`，指定 `WT_URL` 与 `WT_SHOTS`，原有越界判定未放宽。

## 范围与停止点

旧的诊断记录和首次失败均保留。此次修复关闭阶段 5 的女巫镇手牌越界问题。真实物理手机和 Safari 未验证；本次使用 Chromium 手机视口与真实浏览器指针事件。

完成回归后仅本地提交，不推送、不部署、不启动阶段 6。
