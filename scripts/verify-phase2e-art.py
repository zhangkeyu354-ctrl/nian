"""Validate saved generated originals and compressed derivatives; never edit originals."""
from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'assets/manifest.json').read_text(encoding='utf-8'))
catalog = manifest['illustrations']
records = json.loads((root / 'docs/phase2e/GENERATION.json').read_text(encoding='utf-8'))
assert len(records) == 17 and len({r['id'] for r in records}) == 17
assert len(catalog) == 22 and all(e['source'] == 'AI 生成' for e in catalog)
assert (root / 'assets/manifest.json').read_bytes() == (root / 'apps/web/public/assets/manifest.json').read_bytes()
assert catalog == json.loads((root / 'apps/web/src/illustrations.json').read_text(encoding='utf-8'))
results = []
for record in records:
    entry = next(e for e in catalog if e['id'] == record['id'])
    original = root / entry['original_file']
    derivative = root / 'apps/web/public/assets' / entry['file']
    assert entry['provider'] == 'built-in image_gen'
    assert entry['official_reference_input'] is False
    assert entry['generation_prompt'] == record['prompt']
    with Image.open(original) as im:
        assert im.format == 'PNG' and list(im.size) == entry['original_size']
        alpha = im.convert('RGBA').getchannel('A')
        if entry['category'] == 'maps':
            assert im.width > im.height and alpha.getextrema() == (255, 255)
        else:
            assert im.mode == 'RGBA' and alpha.getextrema() == (0, 255)
        original_size = list(im.size)
    with Image.open(derivative) as im:
        assert im.format == 'WEBP' and list(im.size) == entry['size']
        limit = (256, 256) if entry['category'] == 'items' else (768, 512)
        assert im.width <= limit[0] and im.height <= limit[1]
        if entry['transparent']:
            assert im.convert('RGBA').getchannel('A').getextrema() == (0, 255)
    raw = derivative.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == entry['sha256']
    assert len(raw) == entry['bytes']
    assert (root / 'apps/web/public/assets' / entry['svg']).is_file()
    results.append(dict(id=entry['id'], original_size=original_size, webp_size=entry['size'],
                        bytes=len(raw), transparent=entry['transparent'], regenerated=record['regenerated'],
                        original_sha256=hashlib.sha256(original.read_bytes()).hexdigest(), passed=True))
(root / 'docs/phase2e/ASSET_CHECKS.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('PHASE2E_ART_PASS: 17 originals, 22 AI entries, 0 placeholders, dimensions/alpha/hash/fallback paths verified')
