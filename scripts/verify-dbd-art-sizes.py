"""Verify the recreated DBD room images and their comparison evidence."""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps/web/public/assets/mobile/rooms"
EVIDENCE = ROOT / "docs/dbd/2026-11-23-art-and-maps/comparisons"
ROOMS = {
    "crotus": (
        "shack", "dark_wood", "courtyard", "treatment_hall", "hallway",
        "carnival_entrance", "greenhouse", "receiving_desk", "ruins", "outer_garden",
    ),
    "ormond": (
        "picnic_area", "guest_rooms", "balcony", "storage", "chalet",
        "rentals", "wooded_area", "ski_shack", "basement", "entryway",
    ),
    "macmillan": (
        "mine_depths", "mine_entrance", "foundry_upper_floor", "coal_tower_upper",
        "foundry_lower_floor", "ancient_tree", "coal_tower_ground", "scrapyard",
        "foundry_basement", "shack", "backlot",
    ),
    "autohaven": (
        "wreckers_garage_north", "maze", "scrap_pile", "main_garage",
        "wreckers_garage_south", "diner", "barn", "gas_pump", "old_cabin", "cottage",
    ),
}

total = 0
for map_name, rooms in ROOMS.items():
    for room in rooms:
        filename = f"{map_name}_{room}" if map_name in ("crotus", "ormond") else room
        asset = ASSETS / f"{filename}.webp"
        evidence = EVIDENCE / f"{map_name}-{room}-compare.png"
        assert asset.is_file(), f"missing image: {asset}"
        assert evidence.is_file(), f"missing comparison: {evidence}"
        with Image.open(asset) as image:
            assert image.format == "WEBP", f"wrong format: {asset}"
            assert image.size == (600, 400), f"wrong size: {asset}: {image.size}"
        assert asset.stat().st_size < 300_000, f"over 300 KB: {asset}"
        total += asset.stat().st_size

count = sum(map(len, ROOMS.values()))
print(f"DBD_ART_SIZES_PASS rooms={count} size=600x400 WebP total={total}B over_300KB=0 comparisons={count}")
