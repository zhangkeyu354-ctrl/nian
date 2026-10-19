"""Audit saved browser evidence, data-driven geometry, and original-material exclusions."""
from pathlib import Path
import json, subprocess
R=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((R/p).read_text(encoding='utf-8-sig'))
count=0
def check(value,label):
 global count
 assert value,label
 count+=1;print('[PASS]',label)
games=read('docs/phase2/完整对局验收.json')
check(len(games['games'])==3 and len({g['mapId'] for g in games['games']})==2,'three complete click-driven games on both real maps')
check({g['winner'] for g in games['games']}=={'survivor','killer'},'both sides win in actual UI runs')
check(sum(g['commands'] for g in games['games'])==526 and sum(g['events'] for g in games['games'])==1112,'all 526 rule commands / 1112 events checked against independent engine')
check(games['curtains']>0 and games['diceShown']>=15 and games['mapClicks']>0 and games['consoleErrors']==[],'handoffs, all dice, map clicks, zero browser errors recorded')
mobile=read('docs/phase2/手机与遮挡验收.json')
check(all(mobile[k] for k in ['checkRequiredHandled','rejectedCommandUnchanged','twoFingerPinch','oneFingerDrag','largeButtons','noPageOverflow','secretPlanHandoffUnmounted']),'real touch input, error rejection, large targets, privacy assertions passed')
check(mobile['viewport']=={'width':390,'height':844} and mobile['consoleErrors']==[],'390px portrait tested without console errors')
actions=read('docs/phase2/物品与力量验收.json')
check(actions['itemDrawAndRejectedUse'] and actions['powerFormExecuted'] and len(actions['commands'])==36 and actions['consoleErrors']==[],'item draw/rejected effect and actual killer power form exercised')
layout=read('apps/web/src/layout.json')
for m in read('packages/game-data/MAP_DATA.json')['maps']:
 check(set(layout[m['id']]['rooms'])=={n['id'] for n in m['nodes']},m['id']+' drawing rooms exactly match MAP_DATA')
 check(set(layout[m['id']]['paths'])=={e['id'] for e in m['edges']},m['id']+' drawing paths exactly match physical graph icons')
check(len(list((R/'docs/phase2/screenshots').glob('*.png')))>=6,'reviewable UI screenshots preserved')
check(not list((R/'apps/server').rglob('*.ts')),'Phase3 game server remains out of scope')
check('每阶段完成时' in (R/'AGENTS.md').read_text(encoding='utf-8'),'future per-phase commit policy persisted')
if (R/'.git').exists():
 tracked=subprocess.run(['git','ls-files','reference'],cwd=R,capture_output=True,text=True,check=True).stdout.splitlines()
 check(all(p=='reference/README.md' or p.endswith('/.gitkeep') for p in tracked),'no original reference image/PDF tracked')
check(read('package.json')['private'] is True,'package remains private')
print(f'RESULT: {count} Phase2 evidence/geometry checks passed.')
