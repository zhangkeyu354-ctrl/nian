# 汽水走私犯阶段1交接

日期：2026-10-27。分支：codex/soda-smugglers。起点提交：4cfcbef。阶段1调研完成后停止；未进入阶段2，无引擎/协议/服务器/前端改动，未推送、未部署。

## 本次交付

- docs/instructions/SS_MASTER_2026-10-27.md：保存用户总指令，内容未改写。
- docs/soda-smugglers/RULE_MATRIX.md：34条基础规则与9条事件登记（含1条启用流程、8个卡槽），每行有证据定位、计划函数、计划测试名；均不是已实现测试。
- docs/soda-smugglers/CHECK_REQUIRED.md：8个中文问题，逐项列默认做法。
- docs/soda-smugglers/ASSETS.md：27项官方美术登记，逐项注明来源、可用性和未生成状态。
- docs/soda-smugglers/verification/：阶段1命令输出与文档核查数据。

## 已确认的关键规则

3–8人；每轮每名旅客5张，选两张行李和一张贿赂，剩余两张盖弃；贿赂同时翻开。动作必须收贿赂→检查→逮捕。接受贿赂从旅客自有瓶盖支付，立即放行；查箱只开一只且每人至多一次，查箱不直接结算。逮捕总瓶数≥2由库存付检查者全部行李瓶数；0/1瓶误捕由检查者赔2，再按行李瓶数从库存付旅客。最终平局共享胜利。

原版无强制声明数量/秘密身份卡，不增加这两类规则。结构化贿赂是牌面固定金额提议与检查者接受，旅客无再次拒付权。事件规则未齐，默认关闭整个事件模式，缺卡不能当无效果。

## 来源缺口与待确认

出版社页面指向BGG官方规则书；BGG直访403，取得的是零售商托管的官方排版8页PDF，哈希及证据链见矩阵。没有谎称从BGG成功下载或核过字节一致。可选事件中Night Shift官网成品卡面可读；其他三张只有FAQ，余四张尚无卡名。所有缺口已按总指令登记，调研阶段不等待答案。

Q01接受暂行PDF镜像；Q02声明/身份仅流程提示；Q03固定金额贿赂提议自动履约；Q04完整事件默认关闭；Q05欠款及库存找零未定；Q06默认不限时、可选超时主持；Q07房主按最近喝汽水确认首位检查者；Q08按官方步骤公开、回顾不泄密。完整一问一行及默认值在CHECK_REQUIRED。

## 实际命令与结果

- git pull origin main：退出0，Already up to date。随后git switch -c codex/soda-smugglers成功。起始在codex/ma-second-wind-research，工作区有大量既存未提交改动；保留，未暂存到本次提交。
- 文档核查Python：10项执行、10通过、0失败。包括34+9矩阵行、8问题、27素材、PDF8页与哈希、36牌/80枚瓶盖/422总面值算术。证据stage1-documents.json。
- npm test：实际运行约206秒，输出停在vitest启动，无任何用例完成统计。仅终止本次PID18648及其worker25136，命令退出-1。**未完成，0个已报告通过，失败用例未知，不宣称测试全绿**。没有终止其他会话的Node/Vite进程。
- npm run typecheck：退出0，0诊断。
- npm run verify:replays：退出0，3/3回放逐事件和哈希复现（1701、2903、4111）。
- npm run verify:mobile-interfaces首次：前置12文件/197测试全部通过，采集64场景；浏览器首个board_ace_1因127.0.0.1:5173连接拒绝失败，整个命令退出1。启动本仓库Vite后重跑，最终结果见下方追加。
- git diff --check限定本次文档：退出0；提交前再次核查暂存路径。
- git ls-files reference：仅README和7个.gitkeep，无原PDF/原图提交。本次PDF在tmp，不暂存。

未运行SS单元测试、SS联机、SS浏览器或阶段5的全套其他游戏浏览器回归：SS代码尚未开始，不伪报通过。此次运行的既有测试也包含工作区原先未提交内容，不能视为干净main回归。

## 截图/图像检查

这是调研阶段，没有SS界面截图。PDF规则正文p2–p7均实际看过渲染：tmp/ss-research/page-2.png至page-7.png；另看封面page-1.png。官方成品照片production9.jpg/production10.jpg/production11.jpg均实际看图。渲染与原图保留本机tmp，不作正式UI验收、不提交原PDF。移动界面回归截图由现有scripts/screenshot-check.ts路径输出到output/mobile-implementation/interfaces/，不是SS截图。

## 下一阶段边界

等待用户审阅/授权后才阶段2；继续沿用总指令，不推main、不部署。后续隐私测试必须查DOM和网络包：未提交、部分提交、贿赂统一公开、单箱检查、双箱结算、重连、回顾。事件未齐时测试覆盖缺口须明确，不假称每张事件已实现。

### 移动界面重跑最终结果

npm run dev -- --host 127.0.0.1启动本仓库Vite，随后npm run verify:mobile-interfaces重跑：退出0；12/12测试文件、197/197测试通过；64/64浏览器界面场景通过，MOBILE_INTERFACES_PASS 64。首次失败和重跑输出分别保存stage1-mobile-first.txt、stage1-mobile-retry.txt。总计不是全部检查通过：全仓npm test未完成仍保留。

阶段1文档交付完成，8项问题待裁定；事件资料有明确缺口，不声称规则资料100%齐全。
