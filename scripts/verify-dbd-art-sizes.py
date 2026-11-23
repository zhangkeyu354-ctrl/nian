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

cover_dir = ROOT / "apps/web/public/assets/maps"
cover_names = ("macmillan_estate", "autohaven_wreckers", "crotus_prenn_asylum", "ormond")
cover_total = 0
for cover_name in cover_names:
    asset = cover_dir / f"{cover_name}_cover.webp"
    evidence = EVIDENCE / f"{cover_name}-cover-compare.png"
    assert asset.is_file() and evidence.is_file(), f"missing cover/evidence: {cover_name}"
    with Image.open(asset) as image:
        assert image.format == "WEBP" and image.size == (768, 512), f"wrong cover: {asset}"
    assert asset.stat().st_size < 300_000, f"over 300 KB: {asset}"
    cover_total += asset.stat().st_size
print(f"DBD_ART_SIZES_PASS covers=4 size=768x512 WebP total={cover_total}B over_300KB=0 comparisons=4")

portrait_names = (
    "trapper", "wraith", "hillbilly", "nurse", "hag", "doctor",
    "dwight", "meg", "claudette", "jake", "nea", "ace", "feng_min",
)
portrait_root = ROOT / "apps/web/public/assets/mobile"
portrait_total = 0
for name in portrait_names:
    thumb = portrait_root / f"portrait_{name}.webp"
    detail = portrait_root / "portrait-detail" / f"portrait_{name}.webp"
    evidence = EVIDENCE / f"{name}-portrait-compare.png"
    assert thumb.is_file() and detail.is_file() and evidence.is_file(), f"missing portrait: {name}"
    with Image.open(thumb) as image:
        assert image.format == "WEBP" and image.size == (256, 256), f"wrong thumb: {thumb}"
        assert image.mode == "RGBA" and image.getchannel("A").getextrema()[0] == 0
    with Image.open(detail) as image:
        assert image.format == "WEBP" and image.width == 512, f"wrong detail: {detail}"
        assert image.mode == "RGBA" and image.getchannel("A").getextrema()[0] == 0
    assert thumb.stat().st_size < 300_000 and detail.stat().st_size < 300_000
    portrait_total += thumb.stat().st_size + detail.stat().st_size
print(f"DBD_ART_SIZES_PASS portraits=13 thumbs=256x256 details_width=512 WebP total={portrait_total}B over_300KB=0 comparisons=13")

hall_dir = ROOT / "apps/web/public/assets/hall"
hall_total = 0
for kind, expected in (("card", (1200, 900)), ("wide", (1600, 900))):
    asset = hall_dir / f"dbd-{kind}.webp"
    evidence = EVIDENCE / f"dbd-{kind}-compare.png"
    assert asset.is_file() and evidence.is_file(), f"missing hall art: {kind}"
    with Image.open(asset) as image:
        assert image.format == "WEBP" and image.size == expected, f"wrong hall art: {asset}"
    assert asset.stat().st_size < 300_000, f"over 300 KB: {asset}"
    hall_total += asset.stat().st_size
print(f"DBD_ART_SIZES_PASS hall=2 sizes=1200x900,1600x900 WebP total={hall_total}B over_300KB=0 comparisons=2")

tokens = (
    "generator", "hook", "crow", "pallet", "locker", "chest",
    "hex_totem", "exit_gate", "wall", "madness",
)
token_total = 0
for name in tokens:
    asset = portrait_root / f"{name}.webp"
    evidence = EVIDENCE / f"{name}-token-compare.png"
    assert asset.is_file() and evidence.is_file(), f"missing token: {name}"
    with Image.open(asset) as image:
        assert image.format == "WEBP" and image.size == (256, 256), f"wrong token: {asset}"
        assert image.mode == "RGBA" and image.getchannel("A").getextrema()[0] == 0
    assert asset.stat().st_size < 300_000, f"over 300 KB: {asset}"
    token_total += asset.stat().st_size
print(f"DBD_ART_SIZES_PASS tokens=10 size=256x256 transparent WebP total={token_total}B over_300KB=0 comparisons=10")
