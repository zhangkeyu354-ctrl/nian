"""Create original deterministic SVG fallbacks and the asset production manifest."""
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[1];P=R/'apps/web/public/assets';(P/'svg').mkdir(parents=True,exist_ok=True);(R/'assets').mkdir(exist_ok=True)
if (R/'assets/manifest.json').exists() and any(a.get('source')=='AI 生成' for a in json.loads((R/'assets/manifest.json').read_text(encoding='utf-8'))['assets']):
 print('Existing AI assets/manifest retained. This bootstrap script only initializes an empty art set.');raise SystemExit(0)
paths={
'generator':'<rect x="29" y="48" width="69" height="42" rx="6"/><circle cx="49" cy="68" r="12"/><path d="M49 56v24m-12-12h24M72 57h15m-15 12h15M36 46V30h16v16M80 47V36h12M27 95h77"/>',
'exit_gate':'<path d="M29 99V31h70v68M40 98V44h47v54M64 44v54M26 31h76M44 58h39M44 73h39"/><circle cx="75" cy="87" r="3"/>',
'hook':'<path d="M29 102V29h65M31 38l27-9M83 31v28c0 13-20 12-20 1v-7M28 103h25"/><path d="M55 30h9"/>',
'hex_totem':'<path d="M64 24l16 19-16 17-16-17zM40 100l24-40 24 40M64 62v42M43 77h42M36 105h56"/><circle cx="64" cy="43" r="5"/>',
'chest':'<path d="M27 57q0-25 37-25t37 25v39H27zM28 61h72M37 38v57m53-57v57"/><rect x="58" y="59" width="14" height="20" rx="3"/>',
'locker':'<rect x="35" y="25" width="59" height="80" rx="4"/><path d="M44 39h40M44 47h40M44 55h40M45 91h38"/><circle cx="80" cy="73" r="3"/>',
'pallet':'<path d="M27 31l18-6 55 71-18 7zM28 66l14-10 31 40-15 10zM71 23l16 14-57 64-16-14z"/>',
'crow':'<path d="M29 84q20 7 24-15Q36 39 24 34q28-2 43 17 9-31 33-29-16 14-17 34l22 7-22 7q0 23-28 23L38 108l5-18M63 92v13"/><circle cx="76" cy="56" r="2"/>',
'wall':'<path d="M25 101V33h21V25h29v11h25v65zM25 57h75M25 80h75M48 36v21M74 58v22M47 82v18"/>',
'bear_trap':'<path d="M23 65l9-10 9 13 10-12 12 13 10-13 10 12 10-13 12 10M25 65q1 34 39 34t39-34M30 48l8 12m52-12-8 12M53 100l-9 14"/><circle cx="64" cy="83" r="8"/>',
'phantasm':'<path d="M64 23l40 75H24zM64 45l20 39H44zM40 32l-7-7m55 7 7-7M15 103l-6 6m104-6 6 6"/><circle cx="64" cy="71" r="5"/>',
'madness':'<path d="M51 105V88q-20-13-14-34 5-25 31-25 32 0 31 32l8 13-12 4v20H75v10M55 44l18 12-20 12 22 15M31 35l-10-9m5 35H13m28-40-3-9"/>',
'entity':'<path d="M64 20l11 29 29 15-29 14-11 30-14-30-28-14 28-15zM47 63l17-14 17 14-17 17z"/>',
'brand_lantern':'<path d="M52 28q12-16 24 0M39 40h50l-6 51H45zM33 99h62M46 33h36M64 48v29M56 62l8 15 8-15"/>',
}
backs={'objective':('目标','#d8b95c','<path d="M64 26v76M26 64h76M39 39l50 50M39 89l50-50"/><circle cx="64" cy="64" r="22"/>'), 'boldness':('无惧','#bb6458','<path d="M65 24L36 71h25l-3 34 35-51H66z"/>'),'survival':('逃生','#609cb7','<path d="M30 91l31-56h36M61 35l23 22m13-22-2 34M31 91h27"/>'),'altruism':('援助','#7da579','<path d="M31 67q8-17 24-6l9 8 10-8q17-11 25 6L65 98zM58 27h13v11h11v13H71v10H58V51H47V38h11z"/>')}
names={'generator':'发电机','exit_gate':'出口大门','hook':'钩子','hex_totem':'厄咒图腾','chest':'箱子','locker':'储物柜','pallet':'木板','crow':'乌鸦','wall':'可破坏墙壁','bear_trap':'捕兽夹','phantasm':'鬼灵陷阱','madness':'神经紊乱','entity':'恶灵','brand_lantern':'原创灯笼标志'}
hexagon='<path d="M64 6L115 35v58l-51 29-51-29V35z" fill="#202b29" stroke="#b8a887" stroke-width="3"/><path d="M64 12l45 26v51l-45 26-45-26V38z" fill="none" stroke="#736c59" stroke-dasharray="5 7"/>'
assets=[]
def add(key,label,body,color='#d4cfb3',portrait=False):
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">{hexagon}<g fill="none" stroke="{color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>'
 (P/'svg'/(key+'.svg')).write_text(svg,encoding='utf-8')
 size=384 if portrait else 256
 zh=f'原创{label}的独立游戏素材，做旧炭笔与骨白刻线，黑暗迷雾气质，居中简洁构图；透明RGBA背景，正方形{size}像素。'+('原创匿名头肩剪影，不还原任何既有角色面貌、服装、武器。' if portrait else '统一六边形底框，主体清楚易识别。')+'禁止官方素材、描摹、标志、文字、水印。'
 en=f'Original standalone {label} game asset. Worn charcoal and bone-white engraved brushwork, dark fog mood, simple readable centered composition. Square {size}px transparent RGBA background. '+('An anonymous invented head-and-shoulders silhouette, no recognizable existing character face, costume or weapon. ' if portrait else 'One unified hexagonal token frame. ')+'No official game art, no tracing, no franchise iconography, no letters, no logo, no watermark.'
 assets.append({'id':key,'file':key+'.png','svg':'svg/'+key+'.svg','source':'占位','states':['DYNAMIC_ENGINE_OVERLAY'],'size':[size,size],'transparent':True,'name_zh':label,'prompt_zh':zh,'prompt_en':en})
for key,body in paths.items():add(key,names[key],body)
for key,(label,color,body) in backs.items():add('back_'+key,label+'道具背面',body,color)
chars=json.loads((R/'packages/game-data/CHARACTER_DATA.json').read_text(encoding='utf-8'))['characters']
for i,c in enumerate([{'id':'anonymous','name_zh':'匿名角色'},*chars]):
 wide=18+i%4*2;neck=40+i%5*3
 body=f'<path d="M{64-wide} 53q-4-29 {wide}-30t{wide} 30q-2 22-{wide} 23t-{wide}-23z" fill="#131c1b"/><path d="M24 111q1-28 30-32l10 16 11-16q29 4 30 32" fill="#131c1b"/><path d="M35 105l{neck-25}-20M94 105L{neck+35} 85"/>'
 add('portrait_'+c['id'],c['name_zh']+'原创剪影',body,portrait=True)
manifest={'version':1,'style_guide':'docs/ART_STYLE_GUIDE.md','original_only':True,'state_composition':'Base art plus engine-owned SVG overlays; PNG absence uses SVG automatically.','assets':assets}
for dest in [R/'assets/manifest.json',P/'manifest.json']:dest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
prompts=['# 原创素材中英文提示词','', 'SVG功能完成后制作PNG。每个文件透明RGBA，中文标签由界面排版，不烘焙文字。基础美术不携带进度或占用状态，所有状态由引擎覆盖。','']
for a in assets:prompts += [f"## {a['file']} · {a['size'][0]}×{a['size'][1]}",f"- 中文：{a['prompt_zh']}",f"- English: {a['prompt_en']}",f"- 背景：透明；路径：apps/web/public/assets/{a['file']}；SVG回退：{a['svg']}。",'']
(R/'docs/ART_PROMPTS.md').write_text('\n'.join(prompts),encoding='utf-8')
print('Created',len(assets),'original SVG fallbacks and bilingual production entries.')
