# 女巫镇 M5 关卡2进度（Claude 接手，2026-10-22）

Codex 额度用完，Claude 从 `8d3781c` 接手。只在 `codex/witch-town-m1` 工作，不碰 main，不部署。

## 已完成
- `apps/web/src/wt/WitchTown.tsx`：真实联机客户端（入口/建房/入座/准备/开局、白天出牌全部牌种的目标流程、审判揭牌、阴谋揭黑猫与同时传牌、黎明与夜晚女巫共选（含「采用」同伴目标）、警长保护、30秒自白（官员不揭牌）、共同分牌、牧师取牌、说书人排序后选抽2/出牌、能力是否使用、沙漏催促、死亡观战、终局全员身份）。
- `live.css`：座位尺寸由布局计算统一、指控条加粗、横幅分色、入口页、大厅名单。
- 首次占座 claimKey 先存后发；ACK 丢失重放；STALE_VERSION 自动重试；切回前台自动重连；Wake Lock。
- 引擎 `viewForWitchTown` 新增 `final`：仅终局时公开全员审判牌与是否曾是女巫。
- `?game=wt` 为正式版，`?game=wt&mock=<场景>` 仍是视觉稿。
- `scripts/verify-witch-town-browsers.ts`：N 部手机尺寸浏览器打完整局，中途一次刷新、一次断网重连。4/8/12 人均打完，无控制台错误。截图 `docs/witch-town/validation/screens/live-*p/`。

## 运行
```
npm run build
WT_ENABLE_DEV=1 WT_ALLOW_CANDIDATE_COUNTS=1 PORT=3420 npm run server
WT_URL=http://127.0.0.1:3420 WT_PLAYERS=8 PW_CHROME=<chromium> npx tsx scripts/verify-witch-town-browsers.ts
```

## 下一步
- 用户要求：上线前继续深度打磨界面、手感、反馈。
- 上线时 render.yaml 需加 WT_ENABLE_DEV=1、WT_ALLOW_CANDIDATE_COUNTS=1，大厅加女巫镇入口，health fullGame=true。
