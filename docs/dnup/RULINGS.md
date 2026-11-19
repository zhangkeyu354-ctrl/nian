# 反转王牌 Dnup：实现裁定（2026-11-19，用户同意）

规则全文见 `RESEARCH_2026-11-18.md`（Codex 调研）。下面是对其第 10 节「待确认」的裁定，引擎 `packages/dnup/` 已按此实现。

1. 牌表：采用调研第 2.2 节的 40 张清单（`CARDS`）。
2. 发牌朝向：每张牌独立 50% 随机（种子化）。
3. 已出完者桌上的组合：照常可被压（直接弃掉）、加牌、拿走；出完者不会回到本轮。
4. 终局：有人达到获胜分数立即结束，不打完末轮。
5. 标记：网页用数字计分，无库存上限。
6. 字母种类：不区分，只显示分数。
7. 无限翻转：不设限制；暂无回合计时。
8. 双人局：按调研第 7 节。
9. 日文规则书：不影响。
10. 房规 HR-DU-01：6 人局使用官方 4 人牌组 36 张，每人 6 张。HR-DU-02：3–6 人局房主可选 3 分或 4 分获胜（默认 4）。

## 结构
- 引擎 `packages/dnup/src/index.ts`（`createDU` / `reduceDU` / `viewForDU`），测试 `packages/dnup/test/`。
- 服务器 `apps/server/src/du-rooms.ts`（`du:` 事件），协议 `packages/shared/src/du-protocol.ts`。
- 前端 `apps/web/src/du/`，入口 `/?game=du`。
