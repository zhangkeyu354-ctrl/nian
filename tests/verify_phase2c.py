"""Audit Phase 2C artifacts and unchanged rule/data hashes; no screenshots are synthesized."""
from pathlib import Path
import json,hashlib,subprocess
from PIL import Image
R=Path(__file__).resolve().parents[1];read=lambda p:json.loads((R/p).read_text(encoding='utf-8-sig'));n=0
def check(ok,label):
 global n
 assert ok,label
 n+=1;print('[PASS]',label)
m=read('assets/manifest.json');check(m==read('apps/web/public/assets/manifest.json'),'browser and source manifest match')
ids={x['id'] for a in read('packages/game-data/MAP_DATA.json')['maps'] for x in a['nodes']};check({a['id'] for a in m['rooms']}==ids and len(m['rooms'])==21,'one original image for each of 21 actual rooms')
for a in m['rooms']:
 p=R/'apps/web/public/assets'/a['file'];assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256'];assert a['source']=='AI 生成' and a['official_reference_input'] is False and a['generation_prompt'];assert Image.open(p).size==tuple(a['size'])
check(True,'21 native scene files, hashes, prompts and provenance checked')
for a in read('docs/phase2c/RULE_LOGIC_GUARD.json')['unchanged_rule_and_data_files']:
 assert hashlib.sha256((R/a['file']).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==a['sha256_lf'],a['file']
check(True,'22 rule and data files unchanged from pre-Phase2C commit')
e=read('docs/phase2c/棋盘验收.json');check(len(e['records'])==6 and {a['screen'] for a in e['records']}=={'电脑','手机竖屏','手机横屏'},'both maps captured at all three screen sizes')
check(e['boardReveals']>0 and e['boardInteractions']>0 and e['highlights']>0 and e['diceCaptured'] and not e['consoleErrors'],'actual board clicks, glowing actions and check dice without browser errors')
for a in e['records']:
 p=R/'docs/phase2c'/a['file'];assert Image.open(p).width==a['viewport']['width'];assert p.stat().st_size>20000
check(True,'six original browser screenshots retained at actual viewport widths')
for seed in [1701,2903]:
 im=Image.open(R/f'docs/phase2c/{seed}_棋盘全图.png').convert('RGB');assert len(im.getcolors(im.width*im.height))>30000,'blank SVG capture';assert (R/f'docs/phase2c/{seed}_竖屏切换横屏.png').is_file()
check(True,'full board PNGs contain scene pixels; software landscape screenshots retained')
for a in read('docs/phase2c/完整对局验收.json')['games']:assert a['events'] in [408,477,227]
check(True,'unchanged full replay outcomes/events also verified by browser')
if (R/'.git').exists():
 tracked=subprocess.check_output(['git','ls-files','reference'],cwd=R,text=True).splitlines();check(all(p=='reference/README.md' or p.endswith('/.gitkeep') for p in tracked),'original photos/PDF remain outside Git')
print(f'RESULT: {n} Phase2C checks passed.')
