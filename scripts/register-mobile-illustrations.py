from pathlib import Path
import json,hashlib,shutil
from PIL import Image
root=Path(__file__).resolve().parents[1]; public=root/'apps/web/public/assets'
names={'items':['toolbox','commodious_toolbox','firecracker','map','rainbow_map','flashlight','first_aid_kit','broken_key','dull_key','skeleton_key'],'maps':['macmillan_estate_cover','autohaven_wreckers_cover'],'modules':['lobby','characters','plan','move','interact','skill','waiting','dice','carry','results']}
shapes={
'toolbox':'<path d="M28 50h72v50H28zM46 50V36h36v14M28 65h72M42 62v10m44-10v10"/>',
'commodious_toolbox':'<path d="M12 55h104v46H12zM32 55V32h64v23M12 75h104M18 44h92M32 69v14m64-14v14"/>',
'firecracker':'<path d="M32 42h14v55H32zM49 28h14v69H49zM66 37h14v60H66zM83 47h14v50H83zM30 67h69M56 27q-12-18 8-12"/>',
'map':'<path d="M18 36l28-12 35 12 29-12v69l-29 12-35-12-28 12zM46 24v69m35-57v69M26 52l12-5m16 20 18 9m15-27 15-5"/>',
'rainbow_map':'<path d="M22 26q8-10 15 0v76q-8 10-15 0zM37 26l59 9v62l-59 5M49 44l35 5M49 58l35 5M49 72l35 5M96 35l12-8v65l-12 5"/>',
'flashlight':'<path d="M22 31l24-9 54 61-25 20zM46 22l-7 24-17-15m47 32 11-8M73 101l25-18"/>',
'first_aid_kit':'<path d="M28 44h72v58H28zM48 44V28h32v16M53 64h22v26H53zM45 72h38v10H45z"/>',
'broken_key':'<circle cx="42" cy="35" r="18"/><path d="M54 48l22 24-9 5 15 8-6 11M35 30l12 11"/>',
'dull_key':'<circle cx="40" cy="35" r="18"/><path d="M53 48l44 46-8 8-12-13-9 9-7-9 10-10"/>',
'skeleton_key':'<path d="M24 22q18-16 30 0t-6 26L28 38q-18 7-18-4t14-12M48 44l55 55-11 8-10-13-9 8-9-12 9-8"/>',
}
catalog=[]
for category,ids in names.items():
 for ident in ids:
  rel=f'svg/{category}/{ident}.svg';dest=public/rel;dest.parent.mkdir(parents=True,exist_ok=True)
  shape=shapes.get(ident,'<path d="M15 105l25-48 20 25 20-56 33 79M62 91V53h24v38zM68 53V41h12v12"/>')
  dest.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g fill="none" stroke="#cbbd91" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">{shape}</g></svg>',encoding='utf-8')
  catalog.append({'id':ident,'category':category,'file':f'{category}/{ident}.webp','svg':rel,'source':'占位','states':['module' if category=='modules' else 'neutral'],'transparent':category!='maps'})
sources=root/'work/mobile-implementation/generated-art.json'
manifest_path=root/'assets/manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
specs={e['id']:{'id':e['id'],'source_path':str(root/e['original_file']),'prompt':e['generation_prompt']} for e in manifest.get('illustrations',[]) if e.get('source')=='AI 生成' and (root/e.get('original_file','')).is_file()}
if sources.exists():specs.update({e['id']:e for e in json.loads(sources.read_text(encoding='utf-8'))})
if specs:
 for spec in specs.values():
  item=next(e for e in catalog if e['id']==spec['id']); dest=public/item['file'];dest.parent.mkdir(parents=True,exist_ok=True)
  original=root/'assets/mobile-originals'/item['category']/(item['id']+'.png');original.parent.mkdir(parents=True,exist_ok=True)
  if not original.exists():shutil.copyfile(spec['source_path'],original)
  with Image.open(original) as im:
   item['original_size']=list(im.size); im.thumbnail((256,256) if item['category']=='items' else (768,512),Image.Resampling.LANCZOS);im.save(dest,'WEBP',quality=80,method=6);item['size']=list(im.size)
  item.update(source='AI 生成',provider='built-in image_gen',generation_prompt=spec['prompt'],original_file=original.relative_to(root).as_posix(),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),bytes=dest.stat().st_size,official_reference_input=False)
manifest['illustrations']=catalog;manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');(public/'manifest.json').write_bytes(manifest_path.read_bytes())
(root/'apps/web/src/illustrations.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('ILLUSTRATIONS',len(catalog),'AI',sum(e['source']=='AI 生成' for e in catalog))
