"""Regenerate the browser manifest from complete 512/1024 card pairs."""

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
cards = root / "apps/web/public/assets/crime-scene/cards"
manifest = root / "apps/web/src/cs/card-art.json"
available = sorted(
    path.name.removesuffix("-512.webp")
    for path in cards.glob("*-512.webp")
    if (cards / path.name.replace("-512.webp", "-1024.webp")).is_file()
)
manifest.write_text(json.dumps(available, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{len(available)}/290 card illustrations have both sizes")
