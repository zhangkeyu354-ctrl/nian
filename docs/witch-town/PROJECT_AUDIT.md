# 现有项目审查（2026-10-22）

唯一仓库：`https://github.com/zhangkeyu354-ctrl/nian`。本轮从最新 `origin/main` 提交 `17106c4` 建立 `codex/witch-town-m1`，工作树位于本报告所在仓库根目录。原稳定版本留在该基点，不切换/重置其他任务的分支。

原工作副本 `E:/DBD-BoardGame-Web` 在 `reflex-race` 分支；绘画派对工作树存在大量未提交修改，全部未触碰。新工作树仅同步远端main后新建，不吸收其他任务的未提交代码。

| 检查项 | 实际实现 | 本轮处理 |
|---|---|---|
| 入口/框架 | React 19、TypeScript、Vite、Tailwind；首页GameLobby按game参数加载 | M1不改首页、不增加假可玩入口 |
| 房间/玩家 | 各游戏独立RoomStore、昵称、座位凭证、房主 | 新增独立WTRoomStore，4～12容量，按实际加入人数发牌 |
| 联机 | 一个Node HTTP服务、同一个Socket.IO实例 | 注册wt:前缀事件，默认关闭，不开第二套后端 |
| 权威规则 | 各游戏独立package，引擎和viewFor分离 | packages/witch-town，单独私人投影 |
| 重连 | 既有游戏按token恢复座位，连接计数 | 女巫镇使用随机token，只存SHA256摘要，重连恢复同一玩家 |
| 存档 | data下各游戏JSON，tmp写入+rename；DBD依命令重放 | 女巫镇使用版本化完整快照+幂等收据，保存成功再广播 |
| 手机适配 | MobileDock、mobile-game.css；其他游戏独立样式 | 本轮无前端改动，正式圆桌UI在M5 |
| Render | render.yaml：Node24、新加坡免费实例、npm ci/build/server、main自动部署 | 不修改配置、不推送、不部署 |

边界：本地重启恢复已验证；Render免费实例临时磁盘在实例替换/休眠时不能保证持久保存。部署前M6需单独验证可靠持久存储。现有项目的单进程架构决定目前串行事务只覆盖单实例，不宣称多副本一致性。未改任何现有游戏的规则包、privacy或协议。

规则基准：完整24页官方标准版已在前序研究逐页读取；本轮重新访问同一官方地址并核对P3配置、P4准备流程。第15印次，SHA256见data.ts的RULE_SOURCE。P1封面、P2概览/组件、P3～4准备、P5日间、P6传染/胜负、P7～8夜晚、P9礼仪、P10～11主持稿、P12～14补充、P15可选进阶、P16～17排除的2～3人规则、P18～21历史、P22署名印次、P23插图、P24视频提示。豪华版机制不导入。

来源：[官方标准版](https://www.facadegames.com/files/rulebooks/salem-1692-rulebook-english.pdf)、[官方产品](https://www.facadegames.com/products/salem-1692)。中文术语沿用用户照片；机制冲突以当前标准PDF为准。
