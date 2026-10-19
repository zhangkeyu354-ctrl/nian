"""Validate research graph and provenance; this is not a gameplay engine."""
from collections import Counter
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
m=read('packages/game-data/MAP_DATA.json')['maps'][0]
nodes={n['id']:n for n in m['nodes']}
edges=m['edges']
adj={n:set() for n in nodes}
assert len(nodes)==11 and len(edges)==22 and len({e['id'] for e in edges})==22
for e in edges:
    assert e['from'] in nodes and e['to'] in nodes and e['from']!=e['to']
    assert e['color'] in {'red','green','blue','yellow'}
    assert e['direction'] in {'both','a_to_b'}
    adj[e['from']].add(e['to'])
    if e['direction']=='both':adj[e['to']].add(e['from'])

def reachable(start):
    seen={start};pending=[start]
    while pending:
        for nxt in adj[pending.pop()]-seen:
            seen.add(nxt);pending.append(nxt)
    return seen

# Backlot is the draft's requested test origin, not a killer-exclusive start.
assert reachable('backlot')==set(nodes)
assert all(reachable(n)==set(nodes) for n in nodes)
print('[PASS 1/4] Directed reachability: Backlot reaches 11/11; all 11 origins reach 11/11.')
assert all(adj.values())
print('[PASS 2/4] Every room has an outgoing route; minimum out-degree =',min(map(len,adj.values())))
walls={e['id'] for e in edges if e['jagged']}
assert walls=={'mm_p05','mm_p11','mm_p21','mm_p22'}
assert all((e['special_state']=='BREAKABLE_WALL_AT_SETUP')==e['jagged'] for e in edges)
props=read('packages/game-data/PROP_DATA.json')
assert len(walls)==props['separate_components'][0]['quantity']==4
print('[PASS 3/4] Four distressed-border routes match four initial breakable walls:',', '.join(sorted(walls)))
counts=Counter()
for n in nodes.values():counts.update(n['initial_prop_counts'])
assert counts=={'objective':10,'boldness':10,'survival':12,'altruism':12}
assert sum(counts.values())==44
print('[PASS 4/4] Prop slots = 44; Y/R/B/G = 10/10/12/12.')

assert {e['id'] for e in edges if e['direction']=='a_to_b'}=={'mm_p02','mm_p11','mm_p12','mm_p22'}
assert all((e['color']=='yellow')==(e['direction']=='a_to_b') for e in edges)
assert next(e for e in edges if e['id']=='mm_p22')['color']=='yellow'
assert nodes['coal_tower_upper']['spawn_faces']==[3]
assert nodes['coal_tower_upper']['field_evidence']['spawn_faces']['decision_basis']=='USER_RULING'
assert nodes['coal_tower_upper']['field_evidence']['spawn_faces']['source_ref'][0].startswith('U01:Q05')
assert nodes['foundry_lower_floor']['name_en'] is None
assert m['spawn_rule']['eligible_sides']==['survivor','killer'] and m['spawn_rule']['exclusive_killer_room'] is None
assert m['status']=='CONFIRMED' and m['adoption_ref'].startswith('U02:')
before_path=ROOT/'work/MAP_DATA_before_macmillan.json'
if before_path.exists():
    before=read('work/MAP_DATA_before_macmillan.json')
    prior={n['id']:n for n in before['maps'][0]['nodes']}
    assert all(set(n['source_ref'])<=set(nodes[k]['source_ref']) for k,n in prior.items())
    print('[PASS] Existing MacMillan source references preserved; Q05 uses explicit user ruling.')
else:
    print('[SKIP] Pre-merge local work snapshot absent; identity invariants checked below.')
other=read('packages/game-data/MAP_DATA.json')['maps'][1]
assert other['id']=='autohaven_wreckers' and len(other['nodes'])==10 and len(other['edges'])==19
assert other['topology_status']=='CONFIRMED' and other['adoption_ref'].startswith('U02:')
manifest={s['id']:s for s in read('docs/SOURCE_MANIFEST.json')['sources']}
assert manifest['C02']['source_level']=='C' and manifest['B11']['previous_grade']=='C'
assert manifest['B11']['grade_override_scope']=='MACMILLAN_MAP_ONLY'
assert all(e['source_level']=='B' and e['status']=='CONFIRMED' for e in edges)
assert all(n['field_evidence']['name_zh']['source_level']=='D' for n in nodes.values())
assert len(read('packages/game-data/PERK_DATA.json')['perks'])==52
print('[PASS] Four directed yellow routes, unresolved fields, grade exception and base-edition scope are preserved.')
print('RESULT: All four requested structural checks and provenance safeguards passed.')
print('Scope: topology ignoring dynamic blockers; killer may break initial walls under B01 p14.')
print('This script audits map structure/provenance only; Phase1 initialization, Q01 and gameplay have separate engine tests. Japanese materials are optional.')
