"""Export resolution-appropriate derivatives, without changing original artwork."""
from pathlib import Path
import hashlib,json,shutil
from PIL import Image

root=Path(__file__).resolve().parents[1]
public=root/'apps/web/public/assets'
manifest_path=root/'assets/manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
stats=[]
def export(source,dest,width):
    dest.parent.mkdir(parents=True,exist_ok=True)
    with Image.open(source) as im:
        im.thumbnail((width,width),Image.Resampling.LANCZOS)
        im.save(dest,'WEBP',quality=78,method=6)
        stats.append({'file':str(dest.relative_to(public)).replace('\\','/'),'size':list(im.size),'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
for entry in manifest['assets']:
    entry['mobile_file']=entry.get('mobile_file','mobile/'+Path(entry['file']).stem+'.webp')
    export(public/entry['file'],public/entry['mobile_file'],256)
for entry in manifest['rooms']:
    for variant,width in [('mobile',600),('desktop',1000)]:
        entry[variant+'_file']=variant+'/'+Path(entry['file']).with_suffix('.webp').as_posix()
        export(public/entry['file'],public/entry[variant+'_file'],width)
for size in (192,512):
    with Image.open(public/'brand_lantern.png') as im:
        im.thumbnail((size,size),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',(size,size),'#111c1e');canvas.alpha_composite(im,((size-im.width)//2,(size-im.height)//2));canvas.save(public/f'pwa-lantern-{size}.png')
manifest['mobile_derivatives']={'generator':'scripts/prepare-mobile-art.py','format':'WebP','originals_preserved':True,'files':stats}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(public/'manifest.json').write_bytes(manifest_path.read_bytes())
print('MOBILE_ART_EXPORTED',len(stats),'files',sum(x['bytes'] for x in stats),'bytes')
