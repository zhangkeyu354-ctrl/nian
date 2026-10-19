"""Supplemental research consistency audit; no game behavior tests."""
from collections import Counter
from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


checks=0


def check(value,label):
    global checks
    assert value,label
    checks+=1
    print('[PASS]',label)


manifest=read('docs/SOURCE_MANIFEST.json')
sources={s['id']:s for s in manifest['sources']}
stats=read('docs/PHASE_0_STATS.json')
check(len(sources)==stats['sources_total'],'source registry reconciles to current statistics')
check(sources['C06']['source_level']=='C' and '用户明确指令' in sources['C06']['note'],
      'BGG prop grade preserves the explicit user override rather than assuming official authorship')
props=read('packages/game-data/PROP_DATA.json')
by_category=Counter()
for prop in props['types']:by_category[prop['category_id']]+=prop['quantity']
check(dict(by_category)=={p['id']:p['quantity'] for p in props['categories']},
      'subtype sums reconcile independently to all four prop categories')
check(all(p['physical_japanese_status']=='CHECK_REQUIRED' for p in props['types']),
      'adopted prop counts do not falsely certify the user physical edition')
data=read('docs/BGG_CARD_QUOTES.json')
quotes=data['quotes']
check(len(quotes)==data['verbatim_quote_card_count']==6 and len({q['id'] for q in quotes})==6,
      '6 unique quoted-skill records')
check(Counter(q['source_level'] for q in quotes)=={'D':5,'C':1},'quotes graded by speaker: 1 C, 5 D')
check(quotes[2]['source_level']=='C' and quotes[3]['source_level']=='D'
      and quotes[2]['source_ref']==quotes[3]['source_ref'],
      'same-thread official and player quotations retain different grades')
check(sum('OUT_OF_SCOPE' in q['edition_scope'] for q in quotes)==2,'2 expansion-preview quotations remain out of base scope')
check(data['exhaustive'] is False and data['item_quote_count']==0,
      'access limitation and zero obtained item quotations remain explicit')
budgets=Counter()
for q in quotes:
    check(q['source_id'] in sources and q['source_ref']==[sources[q['source_id']]['url']],q['id']+' source URL resolves')
    budgets[q['source_id']]+=len(q['verbatim_excerpt_en'].split())
check(all(n<=25 for n in budgets.values()),'short quotation budget <=25 words per source page')
check(all(q['status']=='CHECK_REQUIRED' and not q['adopted_into_formal_effects'] for q in quotes),
      'partial or secondary quotations do not silently become complete formal effects')
perks=read('packages/game-data/PERK_DATA.json')['perks']
check(len(perks)==52 and sum(p['status']=='CONFIRMED' for p in perks)==2,
      'formal perk inventory remains 52 slots and 2 confirmed effects')
automa=read('docs/AUTOMA_REVIEW.json')
check(automa['thread_url'] is None and automa['thread_body_read'] is False
      and automa['thread_to_tool_link_verified'] is False,
      'unread automa thread and candidate association are not falsely certified')
check(automa['observed_content_categories']['original_52_perk_card_database']=='NOT_ESTABLISHED'
      and automa['observed_content_categories']['complete_map_nodes_and_edges']=='NOT_OBSERVED_IN_INSPECTED_UI',
      'automa inventory records observation scope without claiming absent data')
missing=(ROOT/'docs/MISSING_RESOURCES.md').read_text(encoding='utf-8')
check('已解决与无需重拍' in missing and '本盒' in missing and 'BGG未完成' in missing
      and '用户没有日文实物' in missing and 'Q08' in missing,
      'photo list removes solved counts and distinguishes physical-edition evidence from network gaps')
comparison=(ROOT/'docs/RULESPAL_COMPARISON.md').read_text(encoding='utf-8')
check(all(f'RP{i:02d}' in comparison for i in range(1,8))
      and 'Q01' in comparison and 'Q02' in comparison,
      'comparison records 7 differences and does not invent resolutions to Q01/Q02')
for path in ['docs/PHASE_0_SUPPLEMENT_REPORT.md','docs/BGG_CARD_QUOTE_REVIEW.md','docs/AUTOMA_REVIEW.md']:
    check((ROOT/path).is_file(),path+' exists')
print(f'\nRESULT: {checks} supplemental research checks passed. Engine tests run separately with npm test.')
