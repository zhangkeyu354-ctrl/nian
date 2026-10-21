# 行动代号与全仓验收：真实输出（2026-10-21）

工作目录 `E:/DBD-Codenames-Codex`，分支 `codex/cn-acceptance`，基于 `origin/codenames` 的 `81586d3`。

## 结论与执行条件

- 构建、类型检查、3 局回放、局域网协议/浏览器/大厅、行动代号协议/浏览器、魔法运动员 2/3/4 人均完成。
- 全仓 `npm test -- --maxWorkers=1`：380/380，仍使用原默认单项 5 秒限制；`npm test -- --testTimeout=20000` 也为 380/380。
- 原样 `npm test` 的默认并行运行两次均有旧隐私回放测试超过 5 秒。没有修改测试断言、游戏规则或全局时限配置，不能称原样并行命令稳定通过。
- `npm run verify:mobile-interfaces` 默认并行 capture 在繁忙环境有 3 项超时。等价流程使用 `vitest run --config apps/web/test/capture.config.ts --testTimeout=20000` → collect → verify：197/197 capture、64/64 UI 操作通过。
- 5173 已有原工作目录的服务，正式有效的本分支手机验收使用 `DBD_TEST_BASE_URL=http://127.0.0.1:5174` 与本工作目录启动的 Vite。早期指向 5173 的 UI 输出不作为本分支验收证据。
- 魔法运动员 4 人使用正常动画；2/3 人最终复跑使用 `MA_REDUCED_MOTION=1`，调用产品已有的减少动态效果行为，各完整完成四场。
- 实测为 Chromium 模拟手机视口，不冒称真实手机或 Safari 测试。

## 修复先失败后通过的证据

1. 四字词：回归检查 `Four-character word clipped` 先失败，再允许词条在卡牌内部换行。
2. 悬停：`Hover must preserve word-card paper` 先失败（背景图从纸张变为 none），再提升本游戏按钮样式优先级。
3. 原 MA 测试脚本在 2/3 人中点击 `.sending` 按钮后 DOM 被移除而超时；最终脚本仅选择未发送且可操作按钮，2/3/4 人完成四场。
4. LAN 协议测试全部断言通过后强制退出导致 Windows `UV_HANDLE_CLOSING` 崩溃，在 Node 24.14/24.19 均复现。脚本改为等待子进程退出并自然清理句柄后，最终命令退出码 0。

下面逐项保留命令输出；初次失败不隐去。

## 最终构建

```text
> dbd-boardgame-private@0.2.2 build
> vite build --config apps/web/vite.config.ts

vite v8.3.4 building client environment for production...
transforming...
✓ 112 modules transformed.
rendering chunks...
computing gzip size...
dist/web/index.html                            0.66 kB │ gzip:   0.40 kB
dist/web/assets/MobilePreview-BbSlgr20.css     4.64 kB │ gzip:   1.54 kB
dist/web/assets/Codenames-DyjpYR9D.css        14.20 kB │ gzip:   3.75 kB
dist/web/assets/MagicalAthlete-DxRl6wek.css   25.25 kB │ gzip:   6.10 kB
dist/web/assets/index-De0oScLf.css            68.10 kB │ gzip:  16.23 kB
dist/web/assets/Codenames-CeMNI4yH.js         21.28 kB │ gzip:   7.61 kB
dist/web/assets/MagicalAthlete-D_bLfDye.js    53.18 kB │ gzip:  18.72 kB
dist/web/assets/MobilePreview-CdFCebC7.js     66.17 kB │ gzip:   7.08 kB
dist/web/assets/index-CP4byzHq.js            828.45 kB │ gzip: 189.02 kB

✓ built in 2.49s
[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
```

## 全仓测试：默认并行，失败记录

```text
> dbd-boardgame-private@0.2.2 test
> vitest run


 RUN  v5.0.5 E:/DBD-Codenames-Codex

 ❯ packages/game-engine/test/privacy.test.ts (5 tests | 1 failed) 9437ms
   ❯ 联机隐藏信息 (5)
     × 回放 1701 的每一步，每个座位都看不到别人的秘密 5579ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/game-engine/test/privacy.test.ts > 联机隐藏信息 > 回放 1701 的每一步，每个座位都看不到别人的秘密
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ packages/game-engine/test/privacy.test.ts:63:5
     61| describe("联机隐藏信息", () => {
     62|   for (const seed of [1701, 2903, 4111])
     63|     it(`回放 ${seed} 的每一步，每个座位都看不到别人的秘密`, () => {
       |     ^
     64|       let checked = 0;
     65|       for (const s of states(seed)) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 18 passed (19)
      Tests  1 failed | 379 passed (380)
   Start at  11:06:19
   Duration  306.45s (tests 99%, import 1%)
```

## 全仓测试：20 秒限制，380 通过

```text
> dbd-boardgame-private@0.2.2 test
> vitest run --testTimeout=20000


 RUN  v5.0.5 E:/DBD-Codenames-Codex


 Test Files  19 passed (19)
      Tests  380 passed (380)
   Start at  11:10:09
   Duration  375.38s (tests 95%, transform 3%, import 2%)
```

## 全仓测试：默认时限、单 worker，380 通过

```text
> dbd-boardgame-private@0.2.2 test
> vitest run --maxWorkers=1


 RUN  v5.0.5 E:/DBD-Codenames-Codex


 Test Files  19 passed (19)
      Tests  380 passed (380)
   Start at  11:18:09
   Duration  167.25s (tests 98%, import 1%)
```

## 最终类型检查

```text
> dbd-boardgame-private@0.2.2 typecheck
> tsc --noEmit
```

## 回放

```text
> dbd-boardgame-private@0.2.2 verify:replays
> tsx scripts/verify-replays.ts

Replay 1701: survivor, every event reproduced, SHA-256 003023f949f2c4873d031fac0c3f2c32eea1ef48861459f02a2bd9566f5a066a
Replay 2903: survivor, every event reproduced, SHA-256 957d9d25558d5622a6b47d08c42d178fb6db55ac0f298e40658e2e97e570a91c
Replay 4111: killer, every event reproduced, SHA-256 2fa6a8fa6f5eabbdcc72d83b5683cb6b81b1a0b22a6aedbbd64d9bad84e4463f
```

## 手机原样命令 capture 超时记录

```text
> dbd-boardgame-private@0.2.2 verify:mobile-interfaces
> vitest run --config apps/web/test/capture.config.ts && tsx scripts/collect-ui-scenarios.ts && tsx scripts/verify-mobile-interfaces.ts


 RUN  v5.0.5 E:/DBD-Codenames-Codex

 ❯ packages/game-engine/test/controls.test.ts (2 tests | 1 failed) 6292ms
   ❯ Hotseat engine queries (2)
     × every offered basic action on full legal games is accepted; preview respects one-way and walls 6163ms
 ❯ packages/game-engine/test/privacy.test.ts (5 tests | 2 failed) 16009ms
   ❯ 联机隐藏信息 (5)
     × 回放 1701 的每一步，每个座位都看不到别人的秘密 8719ms
     × 回放 2903 的每一步，每个座位都看不到别人的秘密 5171ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/game-engine/test/controls.test.ts > Hotseat engine queries > every offered basic action on full legal games is accepted; preview respects one-way and walls
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ packages/game-engine/test/controls.test.ts:22:3
     20|     expect(JSON.stringify(s)).toBe(before);
     21|   });
     22|   it("every offered basic action on full legal games is accepted; prev…
       |   ^
     23|     const result = simulateGame(
     24|       {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  packages/game-engine/test/privacy.test.ts > 联机隐藏信息 > 回放 1701 的每一步，每个座位都看不到别人的秘密
 FAIL  packages/game-engine/test/privacy.test.ts > 联机隐藏信息 > 回放 2903 的每一步，每个座位都看不到别人的秘密
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ packages/game-engine/test/privacy.test.ts:63:5
     61| describe("联机隐藏信息", () => {
     62|   for (const seed of [1701, 2903, 4111])
     63|     it(`回放 ${seed} 的每一步，每个座位都看不到别人的秘密`, () => {
       |     ^
     64|       let checked = 0;
     65|       for (const s of states(seed)) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯


 Test Files  2 failed | 10 passed (12)
      Tests  3 failed | 194 passed (197)
   Start at  11:11:02
   Duration  17.92s (tests 74%, transform 11%, import 10%, setup 4%, worker 1%)

    Isolate  12 workers spawned · ~1.46s startup each (spawn + environment, per file)
             at least ~1.05s faster with isolate: false — reuses workers across files instead of one per file
```

## 手机 capture：20 秒复核

```text
RUN  v5.0.5 E:/DBD-Codenames-Codex


 Test Files  12 passed (12)
      Tests  197 passed (197)
   Start at  11:12:00
   Duration  16.98s (tests 77%, transform 10%, import 10%, setup 3%)
```

## 场景汇总

```text
UI_SCENARIOS_COLLECTED 64 (successful engine test inputs; generated, not shipped)
```

## 本分支 5174 手机操作

```text
UI_WIRING_PASS board_ace_1 1
UI_WIRING_PASS board_dwight_3 1
UI_WIRING_PASS board_doctor_1 1
UI_WIRING_PASS item_toolbox 2
UI_WIRING_PASS item_commodious_toolbox 2
UI_WIRING_PASS item_first_aid_kit 2
UI_WIRING_PASS item_map 2
UI_WIRING_PASS choice_MAP_REVEAL 2
UI_WIRING_PASS item_rainbow_map 2
UI_WIRING_PASS item_flashlight 2
UI_WIRING_PASS item_firecracker 2
UI_WIRING_PASS item_skeleton_key 2
UI_WIRING_PASS item_broken_key 2
UI_WIRING_PASS item_dull_key 2
UI_WIRING_PASS board_doctor_3 1
UI_WIRING_PASS board_dwight_2 1
UI_WIRING_PASS board_claudette_1 1
UI_WIRING_PASS board_meg_3 1
UI_WIRING_PASS choice_PHANTASM_TARGET 1
UI_WIRING_PASS power_hillbilly 2
UI_WIRING_PASS power_hag 2
UI_WIRING_PASS board_ace_2 2
UI_WIRING_PASS board_jake_1 1
UI_WIRING_PASS board_dwight_1 4
UI_WIRING_PASS board_meg_2 1
UI_WIRING_PASS board_claudette_2 2
UI_WIRING_PASS board_claudette_3 1
UI_WIRING_PASS board_jake_2 3
UI_WIRING_PASS board_jake_3 1
UI_WIRING_PASS board_nea_1 2
UI_WIRING_PASS board_nea_2 1
UI_WIRING_PASS board_nea_3 1
UI_WIRING_PASS board_ace_3 1
UI_WIRING_PASS board_feng_min_2 2
UI_WIRING_PASS board_feng_min_3 3
UI_WIRING_PASS board_trapper_1 2
UI_WIRING_PASS board_trapper_2 1
UI_WIRING_PASS board_trapper_3 2
UI_WIRING_PASS board_wraith_1 1
UI_WIRING_PASS board_wraith_2 1
UI_WIRING_PASS board_hillbilly_1 1
UI_WIRING_PASS board_hillbilly_2 1
UI_WIRING_PASS board_hillbilly_3 2
UI_WIRING_PASS board_nurse_1 1
UI_WIRING_PASS board_nurse_2 1
UI_WIRING_PASS board_nurse_3 1
UI_WIRING_PASS board_hag_2 1
UI_WIRING_PASS board_hag_3 1
UI_WIRING_PASS board_doctor_2 1
UI_WIRING_PASS power_trapper 2
UI_WIRING_PASS power_wraith 2
UI_WIRING_PASS power_nurse 2
UI_WIRING_PASS power_doctor 2
UI_WIRING_PASS board_meg_1 2
UI_WIRING_PASS board_feng_min_1 2
UI_WIRING_PASS board_wraith_3 1
UI_WIRING_PASS choice_REPLAN 1
UI_WIRING_PASS board_hag_1 1
UI_WIRING_PASS choice_CARRY_REROUTE 1
UI_WIRING_PASS out_of_turn_commodious_toolbox 2
UI_WIRING_PASS out_of_turn_first_aid_kit 2
UI_WIRING_PASS out_of_turn_map 2
UI_WIRING_PASS out_of_turn_rainbow_map 2
UI_WIRING_PASS shared_seat_inventory 2
MOBILE_INTERFACES_PASS 64
```

## LAN 协议：最初退出崩溃

```text
> dbd-boardgame-private@0.2.2 verify:lan-protocol
> tsx scripts/verify-lan-protocol.ts

LAN_PROTOCOL_PASS [{"seed":1701,"code":"BN2U","commands":228,"winner":"survivor","events":450,"rejectedAsExpected":24},{"seed":2903,"code":"MU6H","commands":268,"winner":"survivor","events":535,"rejectedAsExpected":28},{"seed":4111,"code":"T2B3","commands":109,"winner":"killer","events":223,"rejectedAsExpected":12}] view checks 3025
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

## LAN 协议：最终正常退出

```text
> dbd-boardgame-private@0.2.2 verify:lan-protocol
> tsx scripts/verify-lan-protocol.ts

LAN_PROTOCOL_PASS [{"seed":1701,"code":"DJ24","commands":228,"winner":"survivor","events":450,"rejectedAsExpected":24},{"seed":2903,"code":"JK2M","commands":268,"winner":"survivor","events":535,"rejectedAsExpected":28},{"seed":4111,"code":"VPBA","commands":109,"winner":"killer","events":223,"rejectedAsExpected":12}] view checks 3025
```

## LAN 浏览器

```text
> dbd-boardgame-private@0.2.2 verify:lan-browsers
> tsx scripts/verify-lan-browsers.ts

LAN_BROWSERS_PASS [{"seed":4111,"room":"3PXL","commands":109,"winner":"killer","browsers":5,"killerFramesChecked":112,"screenshotsChecked":5},{"seed":1701,"room":"7SDV","commands":228,"winner":"survivor","browsers":5,"killerFramesChecked":231,"screenshotsChecked":5}]
```

## LAN 大厅

```text
> dbd-boardgame-private@0.2.2 verify:lan-lobby
> tsx scripts/verify-lan-lobby.ts

LAN_LOBBY_PASS [{"scenario":"5人_两人想当杀手","room":"EEHV","players":5,"killerOptions":3},{"scenario":"4人_没人选杀手_一人报名控两名","room":"L7XK","players":4,"killerOptions":3},{"scenario":"3人","room":"N85V","players":3,"killerOptions":3}]
```

## 行动代号协议

```text
> dbd-boardgame-private@0.2.2 verify:cn-protocol
> tsx scripts/verify-cn-protocol.ts

✔ 建房成功，房间号 PBYN
✔ 5 人加入并分队；只有房主能开始
✔ 自选队长：没有队长不能开局，同队只能 1 名队长，开局后队长为报名者
✔ 隐私：两名队长收到 25 张身份；3 名队员收到的所有数据里没有任何未揭晓身份/刺客/种子
✔ 服务器拒绝桌面词线索、拒绝队员代替队长出线索
✔ N+1：提示 1 翻对 2 张后自动换边；队长/对方不能操作；未翻牌不能结束；同时提交只成功一次
✔ 队长 3 秒不出线索 → 服务器自动换边（实测 2.9 秒）
✔ 0 线索不限次数；加时 +2 秒只能一次、队长不能按；猜词超时自动换边（含加时实测 5.7 秒）
✔ 断开后用 token 重连回原座位，棋盘一致
✔ 服务器重启后按存档重放恢复（棋盘、回合、加时状态一致）
✔ ∞ 线索下翻到刺客 → 该队立即失败；结束后所有人看到全部身份
✔ 再来一局：保留队伍、清空队长；随机队长模式连开 6 局，红队抽到过 3 名不同队长

全部通过：12 组检查
```

## 悬停回归：先失败

```text
> dbd-boardgame-private@0.2.2 verify:cn-browsers
> tsx scripts/verify-cn-browsers.ts

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Hover must preserve word-card paper
+ actual - expected

+ 'none'
- 'url("http://127.0.0.1:3341/assets/codenames/card-paper.webp"), linear-gradient(rgb(239, 229, 207), rgb(226, 213, 184))'

    at <anonymous> (E:\DBD-Codenames-Codex\scripts\verify-cn-browsers.ts:93:10) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'none',
  expected: 'url("http://127.0.0.1:3341/assets/codenames/card-paper.webp"), linear-gradient(rgb(239, 229, 207), rgb(226, 213, 184))',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.14.0
```

## 行动代号最终浏览器

```text
> dbd-boardgame-private@0.2.2 verify:cn-browsers
> tsx scripts/verify-cn-browsers.ts

CN_BROWSERS_PASS {"contexts":4,"phones":2,"games":2,"goals":9,"privacy":true,"refresh":true,"timeout":true}
```

## MA 2 人：初次脚本失败

```text
> dbd-boardgame-private@0.2.2 verify:ma-browsers
> tsx scripts/verify-ma-browsers.ts

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.ma-decide.you .ma-options button').first()
    - locator resolved to <button class="ma-go sending">🎲 掷骰</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

    at <anonymous> (E:\DBD-Codenames-Codex\scripts\verify-ma-browsers.ts:92:19) {
  log: [
    "  - waiting for locator('.ma-decide.you .ma-options button').first()",
    '    - locator resolved to <button class="ma-go sending">🎲 掷骰</button>',
    '  - attempting click action',
    '    - waiting for element to be visible, enabled and stable',
    '  - element was detached from the DOM, retrying'
  ],
  name: 'TimeoutError'
}

Node.js v24.14.0
```

## MA 3 人：初次脚本失败

```text
> dbd-boardgame-private@0.2.2 verify:ma-browsers
> tsx scripts/verify-ma-browsers.ts

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.ma-decide.you .ma-options button').first()
    - locator resolved to <button class="ma-go sending">🎲 掷骰</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="ma-options">…</div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting 100ms
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

    at <anonymous> (E:\DBD-Codenames-Codex\scripts\verify-ma-browsers.ts:92:19) {
  log: [
    "  - waiting for locator('.ma-decide.you .ma-options button').first()",
    '    - locator resolved to <button class="ma-go sending">🎲 掷骰</button>',
    '  - attempting click action',
    '    2 × waiting for element to be visible, enabled and stable',
    '      - element is visible, enabled and stable',
    '      - scrolling into view if needed',
    '      - done scrolling',
    '      - <div class="ma-options">…</div> intercepts pointer events',
    '    - retrying click action',
    '    - waiting 20ms',
    '    - waiting for element to be visible, enabled and stable',
    '    - element is not stable',
    '  - retrying click action',
    '    - waiting 100ms',
    '    - waiting for element to be visible, enabled and stable',
    '  - element was detached from the DOM, retrying'
  ],
  name: 'TimeoutError'
}

Node.js v24.14.0
```

## MA 2 人：最终四场通过

```text
> dbd-boardgame-private@0.2.2 verify:ma-browsers
> tsx scripts/verify-ma-browsers.ts

MA_BROWSERS_PASS {"players":2,"deal":"draft","steps":143,"racesSeen":4}
```

## MA 3 人：最终四场通过

```text
> dbd-boardgame-private@0.2.2 verify:ma-browsers
> tsx scripts/verify-ma-browsers.ts

MA_BROWSERS_PASS {"players":3,"deal":"draft","steps":170,"racesSeen":4}
```

## MA 4 人：正常动画四场通过

```text
> dbd-boardgame-private@0.2.2 verify:ma-browsers
> tsx scripts/verify-ma-browsers.ts

MA_BROWSERS_PASS {"players":4,"deal":"draft","steps":1436,"racesSeen":4}
```
