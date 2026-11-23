"""Validate candidate map data and guard unverified maps from runtime exposure."""

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'packages/game-data/MAP_DATA.json').read_text(encoding='utf-8'))
active = {m['id'] for m in data['maps']}
assert len(active) == data['expected_total']

for candidate in data.get('candidate_maps', []):
    name = candidate['id']
    assert name not in active, f'candidate unexpectedly active: {name}'
    nodes = candidate['nodes']
    edges = candidate['edges']
    node_ids = {n['id'] for n in nodes}
    assert len(node_ids) == len(nodes) == candidate['expected_node_count']
    assert all(n.get('source_level') and n.get('source_ref') and n.get('status') for n in nodes)
    assert all(e.get('source_level') and e.get('source_ref') and e.get('status') for e in edges)
    assert all(e['from'] in node_ids and e['to'] in node_ids for e in edges)
    assert all(e['color'] in ('red', 'blue', 'green', 'yellow') for e in edges)
    assert all(e['direction'] in ('both', 'from_to', 'to_from') for e in edges)

    unchecked = [e['id'] for e in edges if e['status'] == 'CHECK_REQUIRED']
    complete = (
        candidate.get('identity_status') == 'CONFIRMED'
        and candidate.get('topology_status') == 'CONFIRMED'
        and candidate.get('expected_edge_count') is not None
        and candidate['expected_edge_count'] == len(edges)
        and not unchecked
    )
    if complete:
        degree = Counter()
        for edge in edges:
            degree[edge['from']] += 1
            degree[edge['to']] += 1
        assert all(degree[n] > 0 for n in node_ids), f'isolated room in {name}'
    else:
        assert candidate.get('runtime_enabled') is False, f'unverified map enabled: {name}'

    print(
        f"{name}: rooms={len(nodes)} routes={len(edges)} "
        f"expected_routes={candidate.get('expected_edge_count')} "
        f"identity={candidate.get('identity_status')} "
        f"topology={candidate.get('topology_status')} "
        f"unchecked_routes={len(unchecked)} runtime_enabled={candidate.get('runtime_enabled')}"
    )
