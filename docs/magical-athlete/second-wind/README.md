# Second Wind 升级调查与验证交付

2026-10-25调查，2026-10-26继续验证 · 独立分支 `codex/ma-second-wind-research` · 基线 `f356900`。

**现有36名已齐全，差集0/0。新36名完成候选登记，已在独立分支实现23/36名可选角色；未发布，官方原文核验仍为0/36。两新赛道均CHECK_REQUIRED。没有推main或部署。**

最新开发进展见[首批角色、开关与同模板卡面](09_首批角色与一致卡面.md)。下方早期调查报告保留当时结论，以该进展页和用户后续要求为准。

首批修正及第二、三、四批均已获用户确认。第五批新增5名，见[第五批报告与14张截图](../../handoff/魔法运动员_第五批5名_2026-10-26.md)。第五批完成后暂停等确认，不开始第六批。开关关闭时36名、开启后59名混合招募。本批按用户建议采用黏液沙漏、活体旅馆、金币摇篮、木匠高跷和舞台像的不同轮廓。

香蕉后退经过按用户要求保持现状，记录在[待核对清单](04_缺少资源与待核清单.md)，全部完成验收时统一决定。

用户确认四称号数据榜尚未正式上线；与全部新角色一起做最终验收、公告和发布。本分支的截图不是已上线功能证明。

**后续来源确认（2026-10-26）：用户已确认采用SW-F01站点的Second Wind技能文字，不再因缺官方PDF整体阻塞角色开发。** 详见[用户采用来源确认](08_用户采用来源确认.md)。这不等于将玩家站升级为官方来源、解决所有互动或授权上线。

|交付|文件|
|---|---|
|1. 新旧版本对照|[当前实现与差异](01_新旧版本对照.md)、[机器可读基线](current-implementation.json)|
|2. 36名候选数据库|[可读角色表](02_角色数据库.md)、[完整字段JSON](second-wind-candidates.json)|
|3. 规则与赛道证据|[证据表](03_规则及赛道证据.md)、[来源及哈希](sources.json)|
|4. 缺少资源|[资源与待核清单](04_缺少资源与待核清单.md)|
|5. 核心引擎方案|[兼容、控制权、队列与11角色设计](05_核心引擎修改方案.md)|
|6. 实际测试|[测试结果、数量与未完成项](06_实际测试报告.md)|
|7. 可用/不可上线|[开发用途及发布门槛](07_上线许可清单.md)|

补充：[新赛道待核JSON](tracks-research.json)、[2025参考名单](reference-base-roster.json)、[32名粉丝角色排除表](excluded-fan-characters.json)。候选数据库中的 `candidate_*`是待核释义，`verified_semantics`全部为null，不能作为正式规则自动导入。

## 本轮可运行开发内容

- `scripts/audit-ma-second-wind.ts`：离线对照当前代码、角色差集、来源与运行默认值，写出本目录基线JSON。
- `packages/magical-athlete/experimental/event-queue.ts`：不接生产的纯数据事件队列原型；11项测试。
- `second-wind-registry.test.ts`：6项登记完整性、粉丝内容隔离、发布闸门与生产文件哈希检查。
- `packages/magical-athlete/experimental/queue-store.ts`：本地原子文件保存/加载的隔离适配，6项测试；不接Socket.IO和线上房间。

运行：`npx tsx scripts/audit-ma-second-wind.ts`；`npx vitest run packages/magical-athlete/test/second-wind-queue.test.ts packages/magical-athlete/test/second-wind-registry.test.ts packages/magical-athlete/test/second-wind-store.test.ts --maxWorkers=1`。

原始PDF、截图、立绘参考与临时抓取只在忽略目录 `work/ma-second-wind/`，不进入公开素材或Git。本轮没有把未核内容作为大厅“已上线更新”公告发布。
