"""Draw Chinese item card faces from confirmed game text and repainted symbols."""

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ITEMS = ROOT / 'apps/web/public/assets/items'
TARGET = ROOT / 'apps/web/public/assets/cards/items'
SOURCE = ROOT / 'reference/items'
COMPARE = ROOT / 'docs/dbd/2026-11-23-art-and-maps/comparisons'
TARGET.mkdir(parents=True, exist_ok=True)
DATA = json.loads((ROOT / 'packages/game-data/ITEM_DATA.json').read_text(encoding='utf-8'))
FONT = 'C:/Windows/Fonts/msyh.ttc'
TITLE = ImageFont.truetype(FONT, 34)
BODY = ImageFont.truetype(FONT, 25)
SMALL = ImageFont.truetype(FONT, 18)
COPY = ImageFont.truetype(FONT, 13)
names = {
    'flashlight', 'first_aid_kit', 'toolbox', 'commodious_toolbox', 'map',
    'rainbow_map', 'dull_key', 'skeleton_key', 'broken_key', 'firecracker',
}

def wrap(draw, value, font, width):
    lines, line = [], ''
    for char in value:
        if char == '\n':
            lines.append(line)
            line = ''
            continue
        candidate = line + char
        if line and draw.textlength(candidate, font=font) > width:
            lines.append(line)
            line = char
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines

for item in DATA['definitions']:
    name = item['id']
    if name not in names:
        continue
    card = Image.new('RGB', (512, 716), '#0d0f10')
    draw = ImageDraw.Draw(card)
    # Redraw the board-game card stock, printed divisions and image panel.
    draw.rectangle((12, 12, 499, 704), fill='#273039', outline='#121719', width=8)
    draw.rectangle((24, 24, 487, 339), fill='#64747b')
    paper = Image.effect_noise((464, 316), 12).filter(ImageFilter.GaussianBlur(18)).convert('RGB')
    paper = ImageOps.colorize(paper.convert('L'), '#526169', '#73838b')
    card.paste(paper, (24, 24))
    draw = ImageDraw.Draw(card)
    draw.rectangle((24, 341, 487, 408), fill='#573b2a')
    draw.rectangle((24, 410, 487, 682), fill='#08090b')
    draw.line((24, 410, 487, 410), fill='#8b9292', width=3)
    draw.line((24, 682, 487, 682), fill='#363c3e', width=2)
    icon = Image.open(ITEMS / f'{name}.webp').convert('RGBA').resize((220, 220), Image.Resampling.LANCZOS)
    card.paste(icon, (146, 74), icon)
    draw = ImageDraw.Draw(card)
    draw.text((43, 350), item['name_zh'], font=TITLE, fill='#fffdf5')
    draw.text((43, 392), '物品', font=SMALL, fill='#c7b2a2')
    lines = wrap(draw, item['text_original_zh'], BODY, 416)
    assert len(lines) <= 7, f'text too long for {name}: {len(lines)}'
    for index, line in enumerate(lines):
        draw.text((43, 435 + index * 34), line, font=BODY, fill='#f0f0ed')
    draw.text((256, 690), '© 2022 Behaviour Interactive', font=COPY, anchor='mm', fill='#9e9f9d')
    target = TARGET / f'{name}.webp'
    card.resize((256, 358), Image.Resampling.LANCZOS).save(target, 'WEBP', quality=90, method=6)
    source = Image.open(SOURCE / f'{name}-card.png').convert('RGB')
    comparison = Image.new('RGB', (600, 440), '#303038')
    comparison.paste(ImageOps.contain(source, (290, 400)), (0, 40))
    comparison.paste(Image.open(target).resize((286, 400)), (310, 40))
    cd = ImageDraw.Draw(comparison)
    cd.text((12, 12), 'SOURCE ENGLISH CARD', fill='white')
    cd.text((312, 12), 'REPAINTED CHINESE CARD', fill='white')
    comparison.save(COMPARE / f'{name}-item-card-compare.png')
    print(name, target.stat().st_size, len(lines))
