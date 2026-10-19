"""Audit Phase 0 research files; does not test or implement the game."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--allow-missing-reference', action='store_true')
args = parser.parse_args()
passed = 0


def check(condition: bool, label: str) -> None:
    global passed
    if not condition:
        raise AssertionError(label)
    passed += 1
    print(f'[PASS] {label}')


def read(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding='utf-8-sig'))


def walk(value: object):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


required = ['AGENTS.md', '.gitignore', 'docs/SOURCE_MANIFEST.json', 'docs/SEARCH_LOG.md',
            'docs/RULE_MATRIX.md', 'docs/RULE_QUESTIONS.md', 'docs/HOUSE_RULES.md',
            'docs/MISSING_RESOURCES.md', 'docs/PHASE_0_REPORT.md', 'docs/PHASE_1_PLAN.md']
check(all((ROOT / path).is_file() for path in required), 'required research documents exist')
data_files = sorted((ROOT / 'packages/game-data').glob('*.json'))
all_json = sorted((ROOT / 'docs').glob('*.json')) + data_files
parsed = {path: json.loads(path.read_text(encoding='utf-8-sig')) for path in all_json}
check(len(data_files) == 9 and all(isinstance(value, dict) for value in parsed.values()),
      f'{len(all_json)} JSON documents parse; 9 game-data research files')

manifest = read('docs/SOURCE_MANIFEST.json')
ids = {source['id'] for source in manifest['sources']}
expected_sources = read('docs/PHASE_0_STATS.json')['sources_total']
check(len(ids) == len(manifest['sources']) == expected_sources, f'{expected_sources} source IDs are unique')
for path in data_files:
    document = parsed[path]
    collection_keys = [key for key in ['characters','maps','perks','physical_cards','definitions','categories','types',
                                     'separate_components','card_types','terms','dice','rules'] if key in document]
    for key in collection_keys:
        rows = document[key]
        check(len({row['id'] for row in rows}) == len(rows), f'{path.name}/{key}: unique IDs')
        for row in rows:
            assert {'source_level','source_ref','status'} <= row.keys(), (path, row.get('id'))
    for record in walk(document):
        if 'status' not in record or 'source_ref' not in record:
            continue
        assert record['status'] in {'CONFIRMED','CHECK_REQUIRED','CONFLICT'}, (path, record)
        assert record['source_level'] in {'A','B','C','D',None}, (path, record)
        if record['status'] == 'CONFIRMED':
            user_ruling = (record.get('decision_basis')=='USER_RULING'
                           and record.get('ruling_id')=='Q05'
                           and any(ref.startswith('U01:') for ref in record['source_ref'])
                           and next(s for s in manifest['sources'] if s['id']=='U01')['source_kind']=='USER_RULING')
            accepted_cn = (record.get('adoption_basis')=='USER_ACCEPTED_CN_RETAIL'
                           and record.get('adoption_ref','').startswith('U02:')
                           and any(s['id']=='U02' and s['source_kind']=='USER_RULING' for s in manifest['sources']))
            assert (record['source_level'] in {'A','B','C'} or user_ruling or accepted_cn) and record['source_ref'], (path,record)
        for reference in record['source_ref']:
            assert reference.split(':',1)[0] in ids, (path,reference)
        if record.get('translation_status'):
            assert record['translation_status'] in {'DRAFT','OFFICIAL_ZH_PRINT'}, (path,record)
            if record['translation_status']=='OFFICIAL_ZH_PRINT':
                evidence=record.get('field_evidence',{}).get('name_zh',record.get('name_evidence'))
                assert evidence['source_level']=='D' and (evidence['status']=='CHECK_REQUIRED' or evidence.get('adoption_ref','').startswith('U02:'))
check(True, 'valid provenance; printed Chinese transcriptions retain D evidence and are not APPROVED')

chars = read('packages/game-data/CHARACTER_DATA.json')['characters']
check(len(chars) == 13 and sum(c['side']=='survivor' for c in chars)==7 and sum(c['side']=='killer' for c in chars)==6,
      'character inventory is 7 survivors + 6 killers')
perks = read('packages/game-data/PERK_DATA.json')['perks']
check(len(perks)==52 and sum(p['side']=='survivor' for p in perks)==28 and sum(p['side']=='killer' for p in perks)==24,
      'perk inventory is 28 + 24, including explicitly unidentified slots')
check(sum(p['effect'] is not None and p['status']=='CONFIRMED' for p in perks)==2,
      'exactly 2 perk effects confirmed; unknown effects are not substituted')
items = read('packages/game-data/ITEM_DATA.json')
check(len(items['physical_cards'])==16 and len(items['definitions'])==10
      and all(i['definition_id'] in {d['id'] for d in items['definitions']}
              and i['source_level']=='D' and i['mapping_status']=='CONFIRMED' and i['adoption_ref'].startswith('U02:') for i in items['physical_cards']),
      '16 photo-observed item slots map to 10 definitions, explicitly adopted under U02')
movement = read('packages/game-data/MOVEMENT_CARD_DATA.json')
check(sum(c['copies'] for c in movement['card_types'])==21 and len(movement['card_types'])==5,
      'movement counts 5+5+5+5+1=21')
props = read('packages/game-data/PROP_DATA.json')
check(sum(c['quantity'] for c in props['categories'])==44 and props['separate_components'][0]['quantity']==4,
      'prop category counts total 44; 4 walls remain separate')
expected_props = {'generator':8,'exit_gate':2,'hook':5,'hex_totem':5,'chest':6,'locker':6,'pallet':6,'crow':6}
check({p['id']:p['quantity'] for p in props['types']} == expected_props
      and all(p['source_level']=='C' and p['quantity_status']=='CONFIRMED' and p['source_ref']==['C06:Standard Edition / 44 Props'] for p in props['types']),
      '8 prop subtype quantities reconcile to user-specified C06 evidence and total 44')
maps = read('packages/game-data/MAP_DATA.json')['maps']
check(len(maps)==2 and len(maps[0]['edges'])==22 and maps[0]['topology_status']=='CONFIRMED'
      and all(e['status']=='CONFIRMED' and 'B11:' in ' '.join(e['source_ref']) for e in maps[0]['edges'])
      and len(maps[1]['edges'])==19 and maps[1]['topology_status']=='CONFIRMED'
      and all(e['source_level']=='D' and e['status']=='CONFIRMED' and e['adoption_ref'].startswith('U02:') for e in maps[1]['edges']),
      'MacMillan 22 paths; Autohaven 19 icons explicitly adopted under U02, provenance retained')
components = read('docs/COMPONENT_AUDIT.json')
check(len(components['items'])==20 and all(x['charter_quantity']==x['observed_quantity'] for x in components['items'])
      and components['card_total']['charter']==89 and not components['conflicts'],
      '20 component count rows reconcile to charter and 89-card official total')
rules = read('packages/game-data/RULE_DATA.json')['rules']
stats = read('docs/PHASE_0_STATS.json')
check(len(rules)==stats['rules_total'] and sum(r['status']=='CONFIRMED' for r in rules)==stats['rules_confirmed'],
      'rule research totals reconcile to current statistics')

verified = 0
skipped = 0
for source in manifest['sources']:
    relative = source['local_path']
    if not relative:
        continue
    path = ROOT / relative
    if not path.is_file() and args.allow_missing_reference:
        skipped += 1
        print(f'[SKIP] missing original reference permitted: {relative}')
        continue
    payload = path.read_bytes()
    assert len(payload)==source['bytes'] and hashlib.sha256(payload).hexdigest()==source['sha256'], relative
    verified += 1
check(verified+skipped==sum(bool(s['local_path']) for s in manifest['sources']),
      f'original file hash audit: {verified} verified, {skipped} explicitly skipped')

if (ROOT / '.git').is_dir():
    for path in [s['local_path'] for s in manifest['sources'] if s['local_path']]:
        result = subprocess.run(['git','check-ignore','--',path], cwd=ROOT,capture_output=True,text=True,check=False)
        assert result.returncode==0, path
    probe_paths = ['reference/photos/privacy-probe.png','reference/rulebooks/privacy-probe.pdf',
                   'reference/perks/privacy-probe.jpg','private.sqlite','private.db-wal','node_modules/probe.js']
    for path in probe_paths:
        result = subprocess.run(['git','check-ignore','--',path],cwd=ROOT,capture_output=True,text=True,check=False)
        assert result.returncode==0,path
    check(True,'Git ignores original materials, databases and dependencies (including uncreated probe paths)')
    remote = subprocess.run(['git','remote'],cwd=ROOT,capture_output=True,text=True,check=True)
    tracked = subprocess.run(['git','ls-files','reference'],cwd=ROOT,capture_output=True,text=True,check=True)
    check(not remote.stdout.strip() and not tracked.stdout.strip(), 'no Git remote or tracked original reference files')
else:
    print('[SKIP] Git repository checks: this extracted copy has no .git directory')
check(not list((ROOT/'apps').rglob('*.ts')) and not list((ROOT/'apps').rglob('*.tsx'))
      and (ROOT/'packages/game-engine/src/index.ts').exists(), 'authorized Phase1 engine exists; no UI/network implementation')
print(f'\nRESULT: {passed} research audit checks passed. Engine tests run separately with npm test.')
