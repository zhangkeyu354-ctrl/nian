"""Copy built-in image_gen originals unedited and export cache-safe portrait WebP."""
from pathlib import Path
from PIL import Image
import hashlib,json,shutil
root=Path(__file__).resolve().parents[1]
public=root/'apps/web/public/assets'
manifest_path=root/'assets/manifest.json'
m=json.loads(manifest_path.read_text(encoding='utf-8'))
records=json.loads((root/'docs/phase2f/PORTRAITS.json').read_text(encoding='utf-8'))
assert len(records)==13
for r in records:
    original=root/'assets/portraits/phase2f'/('portrait_'+r['id']+'.png')
    original.parent.mkdir(parents=True,exist_ok=True)
    if not original.exists():shutil.copy2(r['source_path'],original)
    e=next(a for a in m['assets'] if a['id']=='portrait_'+r['id'])
    rel='portraits/phase2f/'+original.name
    target=public/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original,target)
    mobile='mobile/phase2f/portrait_'+r['id']+'.webp'
    with Image.open(original) as im:
        assert im.mode=='RGBA' and im.getchannel('A').getextrema()==(0,255)
        size=list(im.size);im.thumbnail((256,256),Image.Resampling.LANCZOS)
        dest=public/mobile;dest.parent.mkdir(parents=True,exist_ok=True);im.save(dest,'WEBP',quality=80,method=6)
        derivative=dict(file=mobile,size=list(im.size),bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
    e.update(file=rel,original_file=original.relative_to(root).as_posix(),source_file=Path(r['source_path']).name,generation_prompt=r['prompt'],prompt_en=r['prompt'],prompt_zh='原创轮廓：'+r['shape'],size=size,official_reference_input=False,sha256=hashlib.sha256(original.read_bytes()).hexdigest(),provider='built-in image_gen',mobile_file=mobile)
    derivatives=m['mobile_derivatives']['files'];derivatives[:]=[d for d in derivatives if d['file']!=mobile];derivatives.append(derivative)
manifest_path.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(public/'manifest.json').write_bytes(manifest_path.read_bytes())
print('PHASE2F_PORTRAITS_PASS',len(records),'transparent originals, cache-safe 256px WebP')
