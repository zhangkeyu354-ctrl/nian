# 双黑A五十K独立 Beta 部署

此配置只创建 `dbd-boardgame-black-a-beta` 服务，读取 `codex/black-a-510k-v11` 分支。正式服务 `dbd-boardgame`、`main` 与其房间数据均不在配置中。Beta 站点仍会显示合集大厅，双黑A入口是 `/?game=ba`。

## Render 创建步骤

1. 在 Render 中新建 Blueprint，选择仓库 `zhangkeyu354-ctrl/nian` 的 `codex/black-a-510k-v11` 分支。
2. Blueprint Path 填 `render.beta.yaml`，预览变更时确认**只新增** `dbd-boardgame-black-a-beta`。若预览显示修改正式服务，停止操作。
3. 创建后记录 Beta 服务独立的 `onrender.com` 地址，打开 `/api/health`，再用该地址的 `/?game=ba` 测试。
4. 从四台独立设备或浏览器进入同一 Beta 房间，完成创建、入座、出牌、结算、抽还、第二局。保留每台设备的截图和问题记录。

部署配置关闭后续自动部署。需要更新 Beta 时，先跑相应回归，再在 Beta 服务上手动部署指定提交。回滚也仅操作 Beta 服务。房间存档使用 Beta 服务自己的 `data/black-a-beta-rooms` 路径；免费实例重建后本地存档可能丢失，Beta 测试期间不得依赖其长期保存。

## 当前状态

配置已准备，服务尚未创建。此工作环境没有可用的 Render 账号连接或 API 凭证，无法从本机验证远程 URL。创建后须补做健康检查、真实联网四端流程和 T01–T69 未完成项的证据；未完成项仍保持 `CHECK_REQUIRED`。正式生产站点未经用户最终确认不得覆盖。
