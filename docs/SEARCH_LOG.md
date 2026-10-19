# Phase 0 三语搜索日志

检索日期：2026-10-19（Asia/Tokyo）。以下“未找到”只表示本次公开检索未取得，不能推断资料不存在。搜索引擎摘要、可读正文、已下载文件分别登记，不混为全文审阅。来源 ID 对应 SOURCE_MANIFEST.json。

## 英文

|目标|实际检索词 / 访问|找到什么|未取得 / 限制|来源|
|---|---|---|---|---|
|L99 官网与商店规则书|`Dead by Daylight board game official rulebook pdf Level99`；`"Dead by Daylight" "DBD_Board_Game_Rulebook"`；官网游戏页/产品页|官方商店角色与组件清单；官方CDN上20页PDF，直接下载成功|游戏介绍页没有完整卡牌资料库；旧 `/dead-by-daylight` 路径报错，`/pages/dead-by-daylight` 可读|B01–B03|
|规则书URL来源核验|Steam页面给出的CDN链接；直接HTTPS下载，检查PDF页数/官方署名/组件清单|B01 4,872,008字节，与L99产品页89张卡/13人等相符；本地留SHA-256|没有查得明确PDF修订号，不能宣称为最新勘误版|B01、B02、D14|
|FAQ/勘误|`"Dead by Daylight" "FAQ" site:level99games.com`；`"Dead by Daylight" "board game" "FAQ" "errata"`；打开官方支持分类|规则书p18有完整基础FAQ；支持页有典藏版零售问题|未找到独立可下载规则勘误；支持分类可见内容有限，不代表没有其他勘误|B01、B04|
|Kickstarter项目与所有Updates|`Dead by Daylight board game Kickstarter updates rules`；打开原项目与 `/posts`；`"Dead by Daylight" site:kickstarter.com/projects/level99games/dead-by-daylight-the-board-game/posts/`|项目入口、Updates 51导航、Auris更新标题线索|网页仅导航；直接HTTP403。51篇正文、分页和预览图未逐一取得；本目标未完成全文审阅|B05–B07|
|BGG Files|`site:boardgamegeek.com/boardgame/358246 "files" "rules"`；直接打开Files页并用HTTPS复核|索引13个文件，语言分类含英/法/西/乌；基础版条目|直接读取403，未下载各文件，未核实上传者身份；未取得完整卡牌清单/参考卡|D01|
|BGG Rules / 官方人员|`site:boardgamegeek.com/thread "Dead by Daylight" "Brad"`；`"Dead by Daylight" "board game" "FAQ" "Kyokai"`；规则论坛入口|设计师Brad Talton/Kyokai策略帖索引（标Designer/Publisher）；Rules论坛入口|策略帖打开403；没有取得可用来裁定下列歧义的官方完整回答|C05、D02|
|搬运路线与失败骰的专项补查|`"Dead by Daylight" "board game" "carry" "yellow" site:boardgamegeek.com/thread`；`"Dead by Daylight" "board game" "failures" "bloodpoint" site:boardgamegeek.com/thread`|无可采用的明确回答|保留CHECK_REQUIRED，未按个人理解选择|RULE_QUESTIONS.md|
|官方/权威How to Play|`Dead by Daylight board game how to play Level 99 Games video`；`"Dead by Daylight" "How To Play" "Level 99 Games" youtube`|Nerdist/Geek & Sundry Becca Scott合作教学；说明页明确付费合作|仅元数据/说明页，未观看视频，无核实时间点，时间点留空|D03、D04|
|官方历史日志 / 角色预览|`"Dead by Daylight" site:level99games.com "perks"`|2022设计日志Part4/6/7；另有2024恶意扩展预览|历史原型、典藏/扩展角色不替代2023基础版最终卡文；未混入正式数据|B08–B10|

## 日文

|目标|实际检索词 / 访问|找到什么|未取得 / 限制|来源|
|---|---|---|---|---|
|发行商/代理官方页|`デッドバイデイライト ボードゲーム 日本語版 ルール PDF`；`"デッドバイデイライト" "ボードゲーム" "日本語" ホビージャパン`；`"Dead by Daylight" site:asobition.com`|核实发行方为Asobition，标准版日文版产品页，2023-05-19发售；不把初始搜索中的Hobby Japan假设当结论|未取得官方日文规则书下载|C01|
|日文预览图|打开C01中「盤面.png」链接并取其原图|4645×3293整桌图，保存本地；可辨5人日文姓名|只有一面地图的倾斜展示，棋子/道具挡住部分路线；板面细字未可靠转录|C02|
|日文规则下载/勘误|`ASOBITION Dead by Daylight ルールブック エラッタ`；`"デッドバイデイライト" "アソビション" "訂正"`；`"デッドバイデイライト" "ボードゲーム" "ルールブック" pdf`；打开发行方Support页|取得官方Support栏目|可读栏目未列DBD；未找到DBD日文PDF或专项勘误。不能把别的桌游PDF当DBD|C03|
|日本店铺/玩家评测/教学|`"デッドバイデイライト" "ボードゲーム" "質問"`；ボドゲーマ商品/评测/视频页|日文零售与白州评测索引、ボドゲかぞく视频线索|未取得可替代A/B原文的完整规则问答；视频未观看，时间点空|D05–D07|
|日文BGG / 玩家问答|`"デッドバイデイライト" "ルール" site:boardgamegeek.com`；`"デッドバイデイライト" "ボードゲーム" site:boardgamegeek.com/thread`|没有检出有效日文裁定|BGG不存在单独的已验证“日文版规则页”；不能把普通BGG条目称为日文规则书|D01、D02|

## 中文

|目标|实际检索词 / 访问|找到什么|未取得 / 限制|来源|
|---|---|---|---|---|
|官方中文版/代理/规则书|`黎明杀机 桌游 中文版 规则`；`"黎明杀机" "香蕉桌游"`；`"黎明杀机" "桌面游戏" "说明书"`；`"黎明死線" "規則書" "彌生"`|繁中出版方挖贝答复索引说盒内有繁中卡与规则书；游民2022典藏版报道；摩点香蕉桌游扩展线索|挖贝正文403；未取得中文官方规则PDF。简中代理名义线索不足以确认授权链；典藏版17/16与基础版7/6分开|C04、D11、D12|
|B站规则/翻译/开箱|`"黎明杀机 桌游" site:bilibili.com/read`；中文桌游规则检索|弥生规则视频元数据及章节时间轴；恶意扩展日志民间译文；开箱/玩法介绍线索|未观看视频，卡牌图文未逐张可靠取得；扩展内容排除|D10、D15|
|中文社区/旅法师营地/规则站|`"黎明杀机" "规则书" 香蕉`；中文规则关键词|HIDALICLICK规则书1–7与8–9页译文索引；爱桌游中文规则帖标题|个人译者声明可能出错/旧版；不据此确认正式机制或全卡效果|D08、D09、D13|
|小红书|`"黎明杀机" "桌游" site:xiaohongshu.com`；追加“规则”|没有检出可核验的相关规则文档|不登录、不声称站内全库已检索，也不把电子游戏结果当桌游|无可用来源|
|知乎|`"黎明杀机" "桌游" site:zhihu.com`；追加“规则”|没有检出可核验的完整规则或卡文|无A/B可用原文|无可用来源|
|贴吧|`"黎明杀机" "桌游" site:tieba.baidu.com`；追加“规则”|直接结果主要为无关主页；D09自述译文在贴吧同步|未取得具体贴吧桌游规则帖，不能声称读过其正文|D09（交叉发布线索）|

## 已存本地文件和核验方式

- `reference/rulebooks/DBD_Board_Game_Rulebook_EN.pdf`：官方规则20页；核心章节文本提取，关键图示视觉核验；来源及哈希见清单。
- `reference/maps/ASOBITION_board_preview.png`：发行商日文预览，已视觉检查；仅部分事实可辨。
- `work/`：文本提取/渲染及研究生成脚本，属于中间文件，Git排除。
- 初次检查 `reference/` 时没有用户资料；没有假定附件中的“持有日文基础版”已经等同收到实物照片。

## 本阶段研究的边界

公开资料检索已覆盖指令列出的所有目标，但访问受阻的全文、未检出的文件和未观看的视频仍明确保留未完成状态。本阶段资料整理完成，不等于全部规则资源齐备。不绕过登录/访问限制，不使用电子游戏Wiki填缺口。

## 2026-10-19：Phase 0 补充搜索

|任务|实际检索/访问|本轮结果|来源/记录|
|---|---|---|---|
|八种道具数量|`site:boardgamegeek.com/boardgame/358246 "8" "Generators" "Props"`；读取基础版条目与moreinfo索引|8/2/5/5/6/6/6/6，按用户指定C级采用；没有将整个社区Wiki升级为C|C06、PROP_DATA|
|RulesPal|打开`https://www.rulespal.com/dead-by-daylight/rulebook`并读取至428行；普通HTTPS另试为403|网页工具内容可读；与本地PDF逐章节核对，没有声称字节一致；差异另表|D16、RULESPAL_COMPARISON|
|目标automa帖子|`site:boardgamegeek.com "Dead by Daylight" "Free web automa helper"`；`"bluekms21" "automa"`；`"free-web-automa-helper" daylight`；Variants入口|取得标题及作者，未取得具体thread URL/正文；普通浏览器安全验证未完成|D24|
|automa候选关联|同名作者博客索引→实际可见GitHub Pages URL；正常浏览器只读查看|存在移动/骰子及solo规则/力量面板；未证明含完整原版卡牌/地图库；未复制|D25、D26、AUTOMA_REVIEW|
|Rules/Files入口|Rules `/forums/66`、分页`?pageid=2`、Files区；`site:boardgamegeek.com/filepage "Dead by Daylight" cards`|直接读取受限；索引显示Rules约247–248帖、Files 13项，未声称读完全部页|D01、D02|
|通用逐字引文|`"Dead by Daylight" "perk reads"`、`"card reads"`、`"card says"`、`"wording"`，加BGG域名/线程限制；另试搜索服务|多个结果只返回论坛索引或无结果；不是全站穷尽|BGG_CARD_QUOTE_REVIEW|
|Sprint Burst|`"Meg Thomas Sprint Burst" boardgamegeek`、具体帖子URL检索|取得玩家逐字效果及回复；缺费用|D17 / BQ01|
|Ace in the Hole|`"boardgamegeek.com/thread" "ace in the hole"`；卡名+本作检索|取得KaruiAshi引文及设计师独立策略回复，未把两者混为同一评级|D18 / BQ02|
|Botany Knowledge/Deception|`"Botany Knowledge" "BoardGameGeek"`；具体帖子URL；`"Dead by Daylight" "Deception"`|同帖官方人员引用与玩家引用分别C/D；费用、版本有缺口|C07 / BQ03–04|
|答复者身份|`"mnmkami" "Dead by Daylight" developer`；实际Gamefound评论索引|同用户名在L99项目标Creator，与BGG署名/制作名单交叉核实|C08|
|其他技能定向检索|Botany Knowledge、Saboteur、Bitter Murmur、Adrenaline、Self-Care、Plunderer、Lightborn、Unnerving Presence、Quick and Quiet、Urban Evasion、Slippery Meat、Insidious、Prove Thyself、Leader、Balanced Landing、Hope、Bail Out、Streetwise、Open-Handed、Monitor and Abuse、Bloodhound等与本作/BGG组合|仅把实际返回的桌游引文登记；Urban Evasion、Dark Sense、Iron Will等只得问答/玩家解释；无结果或电玩误命中不填数据|C09、D20–D23、研究线索JSON|
|扩展引文|检索结果命中新扩展规则问题|收录2种引用线索但明确排除基础版；不采纳玩家猜测或无链接的Discord转述|D19 / BQ05–06|
|物品原文|Flashlight、First Aid Kit、Toolbox、item card，与本作/BGG/thread组合；尝试排除forums/其他命中|可核实本作逐字物品卡文0种；另一桌游的radio/keys/Toolbox讨论排除|D27；ITEM_DATA未新增|
|Files内容范围|读取13项可见文件索引|有规则摘要、发行商法文规则、玩家西/乌译文、随机地图选择卡、变体、计分/自订角色；正文及具体filepage链接未取得|D01（补充备注）|
|日文官方重查|Asobition产品页、Support；`site:asobition.com/deadbydaylight ルールブック`；`site:asobition.com "Daylight" FAQ`；`site:asobition.com "デッドバイデイライト" エラッタ`|未发现本作日文规则PDF或FAQ；其他桌游FAQ/勘误不混用|C01/C03补充备注|

禁止资料执行情况：没有使用搜索结果中自动混入的电子游戏Wiki数值；没有下载已下架TTS模组或其镜像素材；没有用民间重制网页游戏填正式数据。Automa只保留范围记录，没有复制源代码/卡牌/地图数据。

覆盖限制：规则论坛分页、具体目标帖正文和Files文件正文未取得。因此“收集所有被逐字引用卡文”和“查看目标automa帖子全文”仍属访问限制下未完成；报告保留这一限制，不以少量索引冒充穷尽。

## 麦克米伦入库：中文版来源补查（2026-10-19）

检索：`黎明杀机 桌游 中文版 发行 香蕉桌游 规则书`、`黎明死線 桌遊 中文 說明書 彌生`、`"黎明杀机" "规则书" filetype:pdf 桌游 中文`、`"香蕉桌游" "黎明杀机" 简体`、`site.modian.com "黎明杀机" "光明使者"`。

- P1/D28 可见简体中文印刷，但第三方照不独立证明正版授权或具体发行商。
- D34 游民星空 2022-08-18正文报导官方中文典藏版、集石预售，未明确简中发行商。D35 摩点索引出现光明使者扩展/香蕉桌游，不能替代基础版授权证据。
- C10 挖贝FAQ索引可读：繁中由彌生项目发布，港澳808；直接正文打开失败。C11商城页脚核实彌生戲夢桌上遊戲出版社，动态商品主体未展开。未取得本作中文官方规则PDF。
- 命中个人2022翻译/旧TTS资料，只记录排除，不下载模组或贴图；未使用电子游戏Wiki数值。
- 11房间/22路径逐项对照本地 C02 图（B11 限定评级）。官方图遮挡的出生刻痕没有从清晰D级照片直接升级；原始草稿和intake保持原状，纠正见核验报告。


## 第二批：共用路径与规则核对（2026-10-19）

- B01全文检索junction/three/purple及路径相关章节，并重读p5/8/10/16/19，未取得三房间共用图标的明确分支通行/障碍语义。C02/B11只显示麦克米伦，不用于Autohaven确认。
- 网页检索 `"Dead by Daylight" "board game" "three" "paths" junction` 及 `site.level99games.com "Dead by Daylight" "connected" "paths"`；命中评测、扩展预览及社区解释，未取得可直接采纳的基础版官方三端路径裁定；未将这些解释写入正式移动规则。搜索误命中的电子游戏Wiki未打开/采用。
- 两张中文参考卡逐项视觉核对；英文PDF p18另作页面渲染确认“pick up moves”问答，与中文搬运不翻道具确实不同，见Q08和REFERENCE_SHEET_COMPARISON.md。

