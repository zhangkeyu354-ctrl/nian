"""Check original art metadata, fallback coverage and actual browser evidence."""
from pathlib import Path
import json,hashlib,struct,subprocess
R=Path(__file__).resolve().parents[1];read=lambda p:json.loads((R/p).read_text(encoding='utf-8-sig'));n=0
def check(ok,label):
 global n
 assert ok,label
 n+=1;print('[PASS]',label)
m=read('assets/manifest.json');check(m==read('apps/web/public/assets/manifest.json'),'root/browser manifests identical')
check(len(m['assets'])==32 and len({a['id'] for a in m['assets']})==32,'32 unique original asset entries')
check(all(a['source']=='AI 生成' and a['svg_source']=='占位' and a['states'] and a['generation_prompt'] for a in m['assets']),'AI provenance, explicit state coverage and original-code SVG fallback recorded')
for a in m['assets']:
 p=R/'apps/web/public/assets'/a['file'];raw=p.read_bytes();w,h=struct.unpack('>II',raw[16:24]);assert(w,h)==(1254,1254) and raw[25]==6,a['id'];assert hashlib.sha256(raw).hexdigest()==a['sha256'];assert (R/'apps/web/public/assets'/a['svg']).is_file()
check(True,'all PNG hashes / uniform native RGBA sizes and SVG files verified')
audit=read('docs/phase2-art/PNG_AUDIT.json');check(audit['all_passed'] and len(audit['assets'])==32 and all(a['alpha_extrema']==[0,255] and a['corner_alpha']<=1 for a in audit['assets']),'actual transparent-alpha read-only inspection retained')
e=read('docs/phase2-art/反馈与回退验收.json');check(e['galleryStates']==41,'all 41 state examples exercised')
check({r['kind'] for r in e['records']}=={'flip','dice','progress','hook','attack'} and all(len(r['frames'])==3 for r in e['records']),'five real feedback sequences, three timed frames each')
check(all(e[k] for k in ['settingsOff','settingsPersisted','systemReducedMotion','missingPngFallback','svgMode']) and not e['consoleErrors'],'settings/reduced-motion/SVG/missing-PNG paths passed without JS exceptions')
for r in e['records']:
 for f in r['frames']:assert (R/'docs/phase2-art'/f).stat().st_size>1000
check(True,'all 15 screenshot files present')
check(read('docs/phase2-art/SVG_FUNCTIONAL_PASS.json')['stateGallery'],'SVG-only functional stage evidence preserved before raster ingestion')
check((R/'docs/ART_STYLE_GUIDE.md').exists() and (R/'docs/ART_PROMPTS.md').exists(),'style guide and bilingual production prompts saved')
if (R/'.git').exists():
 p=subprocess.run(['git','ls-files','reference'],cwd=R,capture_output=True,text=True,check=True).stdout.splitlines();check(all(x=='reference/README.md' or x.endswith('/.gitkeep') for x in p),'no original reference images/PDF tracked')
print(f'RESULT: {n} Phase2 art/feedback checks passed.')
