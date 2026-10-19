"""Second intake: evidence, namespace, graph-model and ruling safeguards."""
from pathlib import Path
from collections import Counter
import json

ROOT=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
checks=0
def check(value,label):
 global checks
 assert value,label
 checks+=1;print('[PASS]',label)
sources={s['id']:s for s in read('docs/SOURCE_MANIFEST.json')['sources']}
def walk(v):
 if isinstance(v,dict):
  yield v
  for child in v.values():yield from walk(child)
 elif isinstance(v,list):
  for child in v:yield from walk(child)
allfiles=list((ROOT/'packages/game-data').glob('*.json'))+list((ROOT/'packages/game-data/out-of-scope').glob('*.json'))
for p in allfiles:
 d=json.loads(p.read_text(encoding='utf-8-sig'))
 for r in walk(d):
  if 'status' not in r or 'source_ref' not in r:continue
  assert r['status'] in {'CONFIRMED','CHECK_REQUIRED','CONFLICT'},(p,r)
  assert r['source_level'] in {'A','B','C','D',None},(p,r)
  assert all(ref.split(':',1)[0] in sources for ref in r['source_ref']),(p,r)
  if r['source_level']=='D' and r['status']=='CONFIRMED':
   assert (r.get('decision_basis')=='USER_RULING' and r.get('ruling_id')=='Q05') or (r.get('adoption_basis')=='USER_ACCEPTED_CN_RETAIL' and r.get('adoption_ref','').startswith('U02:'))
check(True,'all formal and isolated data parse; refs resolve; no D text silently upgraded')

maps=read('packages/game-data/MAP_DATA.json')['maps'];mm,ah=maps
coal=next(n for n in mm['nodes'] if n['id']=='coal_tower_upper')
check(coal['spawn_faces']==[3] and coal['field_evidence']['spawn_faces']['decision_basis']=='USER_RULING','Q05=3 explicitly uses user ruling + P1')
check(next(n for n in mm['nodes'] if n['id']=='foundry_lower_floor')['name_en'] is None,'Q06 English title remains unknown')
check(len(ah['nodes'])==10 and len(ah['edges'])==19 and ah['expected_pairwise_edge_count']==23,'Autohaven distinguishes 19 icons from Q09-adopted 23 pairwise links')
check(ah['source_level']=='D' and ah['topology_status']=='CONFIRMED' and ah['adoption_ref'].startswith('U02:'),'Autohaven original D provenance retained, adoption uses U02, not MacMillan preview')
nodes={n['id'] for n in ah['nodes']};counts=Counter()
for n in ah['nodes']:counts.update(n['initial_prop_counts'])
check(counts=={'objective':10,'boldness':10,'survival':12,'altruism':12} and sum(counts.values())==44,'Autohaven 44 slots independently sum to Y/R/B/G 10/10/12/12')
check(sorted(face for n in ah['nodes'] for face in n['spawn_faces'])==[0,1,2,3,4,5],'photo-observed Autohaven start faces each 0..5 appear once; not an official-version assertion')
check({e['id'] for e in ah['edges'] if e['jagged']}=={'ah_p03','ah_p06','ah_p10','ah_p13'},'four photo-observed wall icons reconcile to four wall components')
check({e['id'] for e in ah['edges'] if e['direction']=='a_to_b'}=={'ah_p01','ah_p14','ah_p19'},'three photo-observed arrows preserve exact from/to direction')
junctions=[e for e in ah['edges'] if e['endpoint_kind']=='MULTI_ROOM_PATH_ICON']
check({e['id'] for e in junctions}=={'ah_p02','ah_p04'} and all(len(e['rooms'])==3 and e['from'] is None and e['to'] is None and e['traversal_semantics']=='ALL_PAIRS_ONE_STEP' and e['house_rule_ref']=='U02:Q09' for e in junctions),'multi-room traversal explicitly follows Q09 house rule, physical path icon remains shared')
adj={n:set() for n in nodes}
for e in ah['edges']:
 assert set(e['rooms'])<=nodes
 if e['endpoint_kind']!='BINARY_PATH_ICON':continue
 adj[e['from']].add(e['to'])
 if e['direction']=='both':adj[e['to']].add(e['from'])
def reach(start):
 seen={start};todo=[start]
 while todo:
  for n in adj[todo.pop()]-seen:seen.add(n);todo.append(n)
 return seen
check(reach('gas_pump')==nodes and all(reach(n)==nodes for n in nodes),'candidate binary routes alone give all 10 origins reachability; no junction assumption needed')
check(all(adj.values()),'each room has a candidate outgoing binary route; not a gameplay-validity certificate')

items=read('packages/game-data/ITEM_DATA.json');defs={d['id']:d for d in items['definitions']}
alloc=Counter(c['definition_id'] for c in items['physical_cards'])
check(len(defs)==10 and sum(alloc.values())==16 and alloc=={k:d['copies'] for k,d in defs.items()},'16 observed row-major cards reconcile independently to all 10 copy counts')
check(all(d['source_level']=='D' and d['adoption_ref'].startswith('U02:') and d['structured_effect_draft']['status']=='CHECK_REQUIRED' for d in defs.values()),'ten item identities/counts adopted; item effects remain Phase4 CHECK_REQUIRED')
check(defs['flashlight']['prior_official_evidence']['effect_status']=='CONFIRMED' and defs['flashlight']['effect']['operation']=='prevent_interaction','existing official Flashlight effect was preserved')
check(len({d['structured_effect_draft']['trigger']['event'] for d in defs.values()})==4,'four item timing scopes remain distinct')

chars=read('packages/game-data/CHARACTER_DATA.json')['characters'];perks=read('packages/game-data/PERK_DATA.json')
boards=perks['board_perks'];byperk={p['id']:p for p in boards}
check(len(chars)==13 and Counter(c['side'] for c in chars)=={'survivor':7,'killer':6},'base roster remains 7+6')
check(len(boards)==39 and len(byperk)==39 and all(p['on_board'] and p['source_level']=='D' for p in boards) and sum(p['status']=='CHECK_REQUIRED' for p in boards)==5,'39 board perk IDs retain D provenance; 34 reviewed implementations and 5 explicit deferrals')
check(all(len(c['starting_perks'])==3 and all(byperk[pid]['owner_id']==c['id'] for pid in c['starting_perks']) for c in chars),'each of 13 boards links exactly three own perks')
check(all(p['structured_effect_draft']['trigger']['event']!='UNRESOLVED' and p['structured_effect_draft']['cost']['bloodpoints']==p['bloodpoint_cost'] and p['structured_effect_draft']['status']==p['status'] for p in boards),'39 structured records preserve printed costs and distinguish reviewed/deferred effects')
check(len(perks['perks'])==52 and Counter(p['side'] for p in perks['perks'])=={'survivor':28,'killer':24},'52 deck slots stay separate from 39 printed board abilities; Q07 does not double count')
check(sum(c['side']=='killer' and c['power'] is not None for c in chars)==6 and sum(c['passive'] is not None for c in chars)==3,'six base powers and three printed passives imported')
ext=read('packages/game-data/out-of-scope/COLLECTOR_CHARACTERS.json')
check(len(ext['characters'])==20 and {c['id'] for c in chars}.isdisjoint(c['id'] for c in ext['characters']) and all(c['scope_status']=='OUT_OF_SCOPE_BASE' for c in ext['characters']),'20 collector/additional characters isolated from base roster')
check(sum(len(c['board_perks']) for c in ext['characters'])==60 and all(p['structured_effect_draft']['status']=='CHECK_REQUIRED' for c in ext['characters'] for p in c['board_perks']),'60 out-of-scope board abilities keep literal clause drafts and are not certified')
comparison=read('docs/REFERENCE_SHEET_COMPARISON.json')['entries']
check(len(comparison)==30 and sum(r['comparison_status']=='CONFLICT' for r in comparison)==1,'30 reference comparisons retain the carrying/reveal conflict')
r064=next(r for r in read('packages/game-data/RULE_DATA.json')['rules'] if r['id']=='R064')
check(r064['status']=='CONFIRMED' and r064['adopted_reveal_props_during_carry'] is False and 'U02:Q08' in r064['source_ref'],'Q08 explicit user ruling adopts no reveal, while original differing claims stay recorded')
terms={t['id']:t['name_zh'] for t in read('packages/game-data/glossary.json')['terms']}
check(all(terms[k]==v for k,v in {'killer':'杀手','hex_totem':'厄咒图腾','exit_gate':'出口大门','chest':'箱子','entity':'恶灵指示物'}.items()),'current Chinese glossary follows printed terminology')
check('用户已澄清没有日文实物' in (ROOT/'docs/HOUSE_RULES.md').read_text(encoding='utf-8'),'source priority correction explicitly records no Japanese physical copy')
print(f'RESULT: {checks} second-intake research checks passed. No game behavior tests were run.')
