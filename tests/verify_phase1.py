"""Acceptance artifacts/provenance; engine behavior is tested by Vitest."""
from pathlib import Path
import json
import hashlib
R=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((R/p).read_text(encoding='utf-8-sig'))
checks=0
def check(ok,msg):
 global checks
 assert ok,msg
 checks+=1;print('[PASS]',msg)
manifest=read('docs/SOURCE_MANIFEST.json')
check(manifest['current_source_policy']['primary']=='USER_ACCEPTED_CN_RETAIL','Chinese retail data highest, Japanese optional')
text=(R/'AGENTS.md').read_text(encoding='utf-8')
check('用户没有日文实物' in text and '第三部分：Phase 1' in text,'corrected ownership assumption and original Phase1 acceptance restored')
check(read('package.json')['private'] is True,'npm package private')
check(read('packages/game-data/DICE_DATA.json')['dice'][0]['faces']==[0,1,2,3,4,5],'Q04 black-die six adopted faces')
rules={r['id']:r for r in read('packages/game-data/RULE_DATA.json')['rules']}
check(all(rules[x]['status']=='CONFIRMED' for x in ['R064','R074','R075','R076']) and rules['R064']['adopted_reveal_props_during_carry'] is False,'Q01/Q02/Q08/Q09 adopted, not blocked on Japanese')
support=read('docs/phase1/ABILITY_SUPPORT.json')
check(support['implemented']==34 and support['deferred']==5 and sum(p['status']=='CHECK_REQUIRED' for p in support['board_perks'])==5,'34 board implementations; five explicit Phase4 errors rather than fake no-ops')
summary=read('docs/phase1/SIMULATION_SUMMARY.json')['games']
check(len(summary)>=3 and {g['winner'] for g in summary}=={'survivor','killer'},'at least three full games and both winners')
check({g['mapId'] for g in summary}=={'macmillan_estate','autohaven_wreckers'},'both real maps exercised')
for g in summary:
 stem='docs/phase1/games/'+str(g['seed'])
 events=[json.loads(s) for s in (R/(stem+'.events.jsonl')).read_text(encoding='utf-8').splitlines()]
 replay=read(stem+'.replay.json')
 check(events[-1]['type']=='GAME_OVER' and events[-1]['data']['winner']==g['winner'] and len(events)==g['events'],f"{g['seed']} real terminal event and event count")
 check([e['seq'] for e in events]==list(range(1,len(events)+1)) and replay['options']['seed']==g['seed'] and len(replay['commands'])==g['commands'],f"{g['seed']} sequential events and full replay command list")
 assert all(e['data']['revealed'] is False for e in events if e['type']=='CARRIED')
 check(any(e['type']=='PERK_USED' for e in events),f"{g['seed']} activates a real board ability through reducer commands")
replay=read('docs/phase1/REPLAY_VERIFICATION.json')['verified']
check({g['seed'] for g in replay}=={g['seed'] for g in summary} and all(len(g['sha256'])==64 for g in replay),'independent replay verifier recorded all three final-state hashes')
check(all(hashlib.sha256((R/f"docs/phase1/games/{g['seed']}.events.jsonl").read_bytes()).hexdigest()==g['eventsSha256'] and hashlib.sha256((R/f"docs/phase1/games/{g['seed']}.replay.json").read_bytes()).hexdigest()==g['commandsSha256'] for g in replay),'replay verification hashes match current logs/commands, not a stale prior run')
check(not list((R/'apps/server').rglob('*.ts')) and 'Phase 2' in text,'Phase2 UI explicitly authorized; Phase3 server remains unimplemented')
print(f'RESULT: {checks} Phase1 acceptance/provenance checks passed.')
