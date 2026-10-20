# Phase 2E 美术补全报告（2026-10-20）

已用内置 built-in image_gen 生成并接入17张正式原创图：5物品、2地图封面、10操作坞模块。原有5张物品保留；illustrations共22项全部登记为“AI 生成”，占位数为0。SVG文件继续作为加载失败/关闭美术时的回退，不将保留回退文件误算成未完成。未做上线部署。

## 来源与处理

全部为独立提示词生成，没有向工具提供任何输入图片、官方图、reference/资料，没有描摹官方构图。原PNG按工具实际输出原样复制到 assets/mobile-originals/：透明图1254×1254 RGBA；两张封面1536×1024 RGB、不透明。未裁切、重画、补字或改变原图透明通道。

依指令运行 scripts/register-mobile-illustrations.py，物品生成256×256 WebP，模块512×512，封面768×512，quality=80。manifest及浏览器副本、illustrations.json同步，登记来源、提示词、真实尺寸、哈希、字节数与 official_reference_input:false。修正登记脚本中模块透明度标志，使其与生成文件一致。

PhoneSetup的地图选择页实际使用新地图封面，选角色步骤使用characters模块；对局操作坞、库存和打出物品反馈沿用现有Illustration组件自动加载新图，没有改动操作、合法性或规则计算。

## 逐张交付

| id | 类别 | 原PNG尺寸 | WebP尺寸 | WebP字节 | 重生成 |
|---|---|---|---|---:|---|
| flashlight | items | 1254×1254 | 256×256 | 15,460 | 否 |
| first_aid_kit | items | 1254×1254 | 256×256 | 20,528 | 否 |
| broken_key | items | 1254×1254 | 256×256 | 10,184 | 否 |
| dull_key | items | 1254×1254 | 256×256 | 11,732 | 否 |
| skeleton_key | items | 1254×1254 | 256×256 | 15,342 | 否 |
| macmillan_estate_cover | maps | 1536×1024 | 768×512 | 101,266 | 否 |
| autohaven_wreckers_cover | maps | 1536×1024 | 768×512 | 89,892 | 否 |
| lobby | modules | 1254×1254 | 512×512 | 71,940 | 否 |
| characters | modules | 1254×1254 | 512×512 | 51,570 | 否 |
| plan | modules | 1254×1254 | 512×512 | 56,194 | 否 |
| move | modules | 1254×1254 | 512×512 | 40,602 | 否 |
| skill | modules | 1254×1254 | 512×512 | 24,112 | 否 |
| interact | modules | 1254×1254 | 512×512 | 52,908 | 否 |
| waiting | modules | 1254×1254 | 512×512 | 54,646 | 否 |
| dice | modules | 1254×1254 | 512×512 | 49,964 | 否 |
| carry | modules | 1254×1254 | 512×512 | 38,542 | 否 |
| results | modules | 1254×1254 | 512×512 | 66,534 | 否 |

所有17张均首次生成后通过人工核对；没有弃用版本。逐张查看生成图及[36/48像素总览](evidence/17_assets_review.png)，核对主体完整、居中、无文字水印。三把钥匙分别以断裂短杆、钝齿金属、浅色三环骨制结构区分；模块用门灯、头像、牌、脚印、手与齿轮、闪电、沙漏、骰子、肩扛剪影和星章区分。地图封面为完整原创场景，其缩略图用于选图，不承担36px动作图标职责。

机器检查见 [ASSET_CHECKS.json](ASSET_CHECKS.json)，复现命令 python scripts/verify-phase2e-art.py。它检查原图、WebP尺寸/alpha、哈希、清单一致、17项记录/22项AI/零占位及回退路径；文字/美术辨识由人工看图，不伪称自动语义判定。

## 验收结果

| 检查 | 结果 |
|---|---|
| 开始前 npm test / verify:mobile-interfaces | 208项 / 64场景通过 |
| 最终 npm test | 209项通过（仓库期间新增Claude提交55ae974的1项服务器测试） |
| npm run typecheck / npm run build | 通过；主包大于500kB警告仍存在，实际传输另测 |
| npm run verify:replays | 三局逐事件一致，哈希未变化 |
| npm run verify:visuals | 41状态、翻牌/骰子/修机/挂钩/攻击、开关和资源缺失回退通过 |
| npm run verify:board | 两地图6张中局视图；完整地图11/22及10/19房间/路线、非空像素验收通过 |
| npm run verify:mobile-surface | 两种手机布局、48px、无页面滚动/下拉通过 |
| npm run verify:mobile-interfaces | 64场景通过，角色技能/物品功能接线保持可用 |
| npm run verify:lan-browsers | 4111/1701，两局各5浏览器；107/188条命令；双方各1胜；110/191帧隐私投影、各5全图截图通过 |
| python scripts/verify-phase2e-art.py | 17原图、22AI、0占位，尺寸/alpha/哈希通过 |
| npx tsx scripts/verify-phase2e-evidence.ts | 五张新物品实际加载；真实网络失败后Illustration回退SVG通过 |
| npx tsx scripts/measure-phase2e-download.ts | 两种地图、各5手机上下文全部低于8MB |

详细原始结构化记录在 evidence/；界面64场景为开发入口中的真实App接线测试，不冒充64局联网对局。浏览器模拟并非实体iPhone Safari/安卓人工体验。

一次额外的 verify:mobile-taps 并行运行因本机 ERR_NO_BUFFER_SPACE 中断；没有计为通过。其余浏览器关闭后，独立冷进入脚本成功重测；随后单独重跑完整手机联机，两局107/188命令均通过，结果见 VALIDATION.txt。

## 下载量与截图

与Phase 2D一致：关闭浏览器缓存，记录从进入建房页/房间至棋盘图片解码、networkidle时的CDP HTTP encodedDataLength，并加双向WebSocket文本帧字节。10上下文范围 1,734,920–1,768,050字节，约1.73–1.77MB；上阶段约1.64–1.67MB，增加后仍小于8MB。数据见[cold-download.json](evidence/cold-download.json)，不是dist目录大小，也不是原PNG总大小。

[iPhone13竖屏中局](evidence/iPhone13_竖屏中局.png) · [横屏中局](evidence/iPhone13_横屏中局.png) · [物品栏](evidence/iPhone13_物品栏.png) · [结算](evidence/iPhone13_结算.png) · [网络失败回退](evidence/手电筒_网络失败SVG回退.png)。已逐张打开核对。局部镜头截图只检查可见非空像素，不冒称所有房间都在画面；完整房间/路线数由verify:board的全图截图验证。

## 范围与未做内容

没有修改 packages/、apps/server/、协议、privacy.ts或游戏数据。开始于8c5b212；生成期间Claude在同一仓库提交55ae974上线准备。本次不回滚、修改或包含该提交的服务器工作；45个受保护源文件与该现有提交一致，记录于SCOPE_GUARD.json。原版照片/PDF没有进入本次提交，dist/仍不提交。

选做机制图标和物品背面本次未执行；未增加其界面接线。52张技能卡组、实体设备体验及上云仍属于其他工作，不用本次美术验收冒称完成。完成提交后按指令停止。

## 完整提示词

每项均使用内置image_gen独立调用；透明图传 transparent_background:true，地图封面传false；没有任何参考图参数。以下为实际送入工具的提示词，与GENERATION.json和manifest一致。

### flashlight

原图：`assets/mobile-originals/items/flashlight.png`。

One original inventory illustration: a chunky vintage handheld flashlight with a broad circular reflector and short ribbed grip, diagonally centered, one single flashlight, no emitted beam. Cold damp horror tabletop style, rough charcoal brushwork, bone-white rim light, restrained tarnished brass. Centered isolated object occupying 75% of square, bold silhouette readable at 48px. True transparent exterior and generous padding. No frame, text, numerals, logo, watermark, UI, official game art or tracing. Neutral idle state. Square production asset.

### first_aid_kit

原图：`assets/mobile-originals/items/first_aid_kit.png`。

One original inventory illustration: a compact battered rectangular first-aid satchel with one thick top handle, aged canvas and dark metal clasp, a plain bone-white broad cross-shaped stitched patch with no letters. Cold damp horror tabletop style, rough charcoal brushwork, bone-white rim light, restrained tarnished brass. Centered isolated single object occupying central 75% of square, bold simple silhouette readable at 48px. True transparent exterior, generous empty padding. No frame, text, numerals, logo, watermark, UI, official game art or tracing. Neutral idle state. Square production asset.

### broken_key

原图：`assets/mobile-originals/items/broken_key.png`。

One original inventory illustration: one visibly broken old iron key, large simple ring bow, short shaft ending in a conspicuous jagged snapped tip, missing lower half, no detached pieces. Cold damp horror tabletop style, rough charcoal brushwork, bone-white rim light, restrained tarnished brass. Centered isolated single object occupying central 75% of square, bold simple silhouette readable at 48px. True transparent exterior, generous empty padding. No frame, text, numerals, logo, watermark, UI, official game art or tracing. Neutral idle state. Square production asset.

### dull_key

原图：`assets/mobile-originals/items/dull_key.png`。

One original inventory illustration: one intact worn flat brass key with a solid rounded-square bow with small square hole, long thick shaft and two distinctly blunt rounded teeth; no cracks, no skeleton imagery. Cold damp horror tabletop style, rough charcoal brushwork, bone-white rim light, restrained tarnished brass. Centered isolated single object occupying central 75% of square, bold simple silhouette readable at 48px. True transparent exterior, generous empty padding. No frame, text, numerals, logo, watermark, UI, official game art or tracing. Neutral idle state. Square production asset.

### skeleton_key

原图：`assets/mobile-originals/items/skeleton_key.png`。

One original inventory illustration: one pale carved bone skeleton master key, elongated bone shaft, broad three-lobed hollow bow like joined bone loops, two large angular bit teeth, clearly ivory-colored; no skull face, no metal ring. Cold damp horror tabletop style, rough charcoal brushwork, bone-white rim light, restrained tarnished brass. Centered isolated single object occupying central 75% of square, bold simple silhouette readable at 48px. True transparent exterior, generous empty padding. No frame, text, numerals, logo, watermark, UI, official game art or tracing. Neutral idle state. Square production asset.

### macmillan_estate_cover

原图：`assets/mobile-originals/maps/macmillan_estate_cover.png`。

Use case: stylized-concept. Asset type: original horror tabletop map cover. Original wide cover landscape: an abandoned coal-mining foundry among dense crooked woodland, one monumental weathered brick furnace chimney, dark mine entrance, cold low mist, small muted amber furnace glow, damp rails leading obliquely toward the furnace, cinematic asymmetrical composition. Entirely invented architecture and arrangement, no characters. Landscape aspect 3:2, fully opaque scene filling edge to edge. Dark foggy charcoal hand-painted cut-paper style, bold bone-white edge highlights, restrained tarnished brass, charcoal black and cold desaturated teal. Atmospheric but legible, no interface or map diagram. No text, letters, numbers, logo, watermark, official game images, tracing or recognizable official compositions.

### autohaven_wreckers_cover

原图：`assets/mobile-originals/maps/autohaven_wreckers_cover.png`。

Use case: stylized-concept. Asset type: original horror tabletop map cover. Original wide cover landscape: a fogbound vehicle scrapyard at dusk, a weathered corrugated salvage shed and a large tilted crane hook, irregular silhouettes of stacked wrecked vintage cars, pooled rain and cold pine trees, one restrained amber workshop light. Entirely invented arrangement and architecture, no recognizable real brands, no characters. Landscape aspect 3:2, fully opaque scene filling edge to edge. Dark foggy charcoal hand-painted cut-paper style, bold bone-white edge highlights, restrained tarnished brass, charcoal black and cold desaturated teal. Atmospheric but legible, no interface or map diagram. No text, letters, numbers, logo, watermark, official game images, tracing or recognizable official compositions.

### lobby

原图：`assets/mobile-originals/modules/lobby.png`。

Use case: stylized-concept. Asset type: small action dock module illustration readable at 36px. One simple iconic weathered iron doorway with a single warm hanging lantern in its arch; isolated bold silhouette. Symbol of entering a shared game room. No surrounding building or scene. Dark foggy charcoal hand-painted cut-paper style, bold bone-white edge highlights, restrained tarnished brass, charcoal black and cold desaturated teal. Centered single grouped subject occupies central 75%, thick simple forms and very few interior details, genuine transparent exterior, no frame, no backdrop, no particle cloud. Square composition. No text, letters, numbers, logo, watermark, official game images, tracing or recognizable official compositions.

### characters

原图：`assets/mobile-originals/modules/characters.png`。

Use case: stylized-concept. Asset type: small action dock module illustration readable at 36px. One simple iconic pair of overlapping blank head-and-shoulder silhouette medallions, one bone-white foreground and one tarnished brass behind, no facial features. Symbol of choosing characters. No scene. Dark foggy charcoal hand-painted cut-paper style, bold bone-white edge highlights, restrained tarnished brass, charcoal black and cold desaturated teal. Centered single grouped subject occupies central 75%, thick simple forms and very few interior details, genuine transparent exterior, no frame, no backdrop, no particle cloud. Square composition. No text, letters, numbers, logo, watermark, official game images, tracing or recognizable official compositions.

### plan

原图：`assets/mobile-originals/modules/plan.png`。

Use case: stylized-concept. Original small action dock module illustration, readable at 36px: a single fan of three blank thick charcoal playing cards, the front card has one large simple bone-white branching path mark, no lettering or colored move information. Dark foggy horror tabletop style, hand-painted cut-paper, charcoal outlines, bone-white faces and restrained tarnished brass edge highlights, cold desaturated teal shadows. Centered isolated single grouped subject fills central 75% of square. Broad simple shapes, strong light-dark contrast, very few interior marks. Genuine transparent exterior. No scene, background panel, border, frame, text, letters, numerals, logo, watermark, official game art, copying or tracing.

### move

原图：`assets/mobile-originals/modules/move.png`。

Use case: stylized-concept. Original small action dock module illustration, readable at 36px: a single bold bone-white bootprint angled forward with a short thick tarnished brass directional arrow attached to its heel, simple readable walking symbol. Dark foggy horror tabletop style, hand-painted cut-paper, charcoal outlines, bone-white faces and restrained tarnished brass edge highlights, cold desaturated teal shadows. Centered isolated single grouped subject fills central 75% of square. Broad simple shapes, strong light-dark contrast, very few interior marks. Genuine transparent exterior. No scene, background panel, border, frame, text, letters, numerals, logo, watermark, official game art, copying or tracing.

### skill

原图：`assets/mobile-originals/modules/skill.png`。

Use case: stylized-concept. Original small action dock module illustration, readable at 36px: one tall angular tarnished brass spark with a bone-white bright center, a bold single lightning-shaped cut-paper charm, no complicated radiating rays. Dark foggy horror tabletop style, hand-painted cut-paper, charcoal outlines, bone-white faces and restrained tarnished brass edge highlights, cold desaturated teal shadows. Centered isolated single grouped subject fills central 75% of square. Broad simple shapes, strong light-dark contrast, very few interior marks. Genuine transparent exterior. No scene, background panel, border, frame, text, letters, numerals, logo, watermark, official game art, copying or tracing.

### interact

原图：`assets/mobile-originals/modules/interact.png`。

Use case: stylized-concept. Original small action dock module illustration, readable at 36px: one simplified bone-white open hand gripping a small thick brass cogwheel, a single compact interaction emblem, no arm or person. Dark foggy horror tabletop style, hand-painted cut-paper, charcoal outlines, bone-white faces and restrained tarnished brass edge highlights, cold desaturated teal shadows. Centered isolated single grouped subject fills central 75% of square. Broad simple shapes, strong light-dark contrast, very few interior marks. Genuine transparent exterior. No scene, background panel, border, frame, text, letters, numerals, logo, watermark, official game art, copying or tracing.

### waiting

原图：`assets/mobile-originals/modules/waiting.png`。

Use case: stylized-concept. Original small action dock module illustration, clearly readable at 36px: one simple upright hourglass, two stout tarnished brass posts and bone-white sand in broad glass bulbs; strong hourglass silhouette, no small grains outside. Hand-painted cut-paper horror tabletop style with broad flat shapes, charcoal outlines, bone-white and tarnished brass dominant colors, cold desaturated teal shadows. Centered isolated single grouped subject within central 75% of square, generous transparent margin. Very few interior details, bold high contrast. True transparent exterior. No scene, background panel, border, text, letters, numbers, watermark, logo, official game art, reference or tracing.

### dice

原图：`assets/mobile-originals/modules/dice.png`。

Use case: stylized-concept. Original small action dock module illustration, clearly readable at 36px: one chunky black six-sided die in three-quarter view, each visible face carries a single large ivory inlaid geometric mark: a cross, a check, a star; decorative module symbol only, no dots or numbers. Hand-painted cut-paper horror tabletop style with broad flat shapes, charcoal outlines, bone-white and tarnished brass dominant colors, cold desaturated teal shadows. Centered isolated single grouped subject within central 75% of square, generous transparent margin. Very few interior details, bold high contrast. True transparent exterior. No scene, background panel, border, text, letters, numbers, watermark, logo, official game art, reference or tracing.

### carry

原图：`assets/mobile-originals/modules/carry.png`。

Use case: stylized-concept. Original small action dock module illustration, clearly readable at 36px: one simple charcoal faceless human silhouette carrying a smaller bone-white faceless human silhouette sideways over one shoulder, both compact and clearly separated by light-dark contrast, minimal limbs, no wounds or weapons. Hand-painted cut-paper horror tabletop style with broad flat shapes, charcoal outlines, bone-white and tarnished brass dominant colors, cold desaturated teal shadows. Centered isolated single grouped subject within central 75% of square, generous transparent margin. Very few interior details, bold high contrast. True transparent exterior. No scene, background panel, border, text, letters, numbers, watermark, logo, official game art, reference or tracing.

### results

原图：`assets/mobile-originals/modules/results.png`。

Use case: stylized-concept. Original small action dock module illustration, clearly readable at 36px: one broad tarnished brass laurel half-wreath embracing a single large bone-white four-point star, simple victory emblem, no cup, no ribbons or text. Hand-painted cut-paper horror tabletop style with broad flat shapes, charcoal outlines, bone-white and tarnished brass dominant colors, cold desaturated teal shadows. Centered isolated single grouped subject within central 75% of square, generous transparent margin. Very few interior details, bold high contrast. True transparent exterior. No scene, background panel, border, text, letters, numbers, watermark, logo, official game art, reference or tracing.
