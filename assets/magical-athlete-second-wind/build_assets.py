"""Add original Second Wind art using the existing Chinese card production template.

Never rebuild or overwrite base-game assets. Typography helpers are loaded from
the existing generator without executing its PDF extraction or base roster loop.
Pillow handles production crops/resizing/encoding; generated alpha is preserved.
"""
from pathlib import Path
import ast
import base64
import hashlib
import html
import io
import json
import fitz
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from collections import ChainMap

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
PUBLIC = REPO / 'apps/web/public/assets/magical-athlete'
FONT = TTFont('C:/Windows/Fonts/simhei.ttf')
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
UNITS = FONT['head'].unitsPerEm
# Keep the existing Chinese/Latin typeface. Only the unsupported ä in the
# canonical name Doppelgängster uses an outline from the system Latin font.
if ord('ä') not in CMAP:
    latin_font = TTFont('C:/Windows/Fonts/arial.ttf')
    latin_scale = UNITS / latin_font['head'].unitsPerEm
    latin_glyphs = latin_font.getGlyphSet()
    glyph = latin_glyphs[latin_font.getBestCmap()[ord('ä')]]
    recording = DecomposingRecordingPen(latin_glyphs)
    glyph.draw(recording)
    class LatinFallback:
        width = glyph.width * latin_scale
        def draw(self, pen):
            recording.replay(TransformPen(pen, (latin_scale, 0, 0, latin_scale, 0, 0)))
    GLYPHS = ChainMap({'__latin_adieresis': LatinFallback()}, GLYPHS)
    CMAP[ord('ä')] = '__latin_adieresis'
TEMPLATE = REPO / 'assets/magical-athlete-production-v1/build_assets.py'
tree = ast.parse(TEMPLATE.read_text(encoding='utf-8'))
helpers = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef)
    and node.name in {'uri', 'svg', 'img', 'measure', 'lettering', 'lines'}], type_ignores=[])
exec(compile(helpers, str(TEMPLATE), 'exec'), globals())


def encode_webp(raw, destination, width=512):
    image = Image.open(io.BytesIO(raw))
    if image.width > width:
        image.thumbnail((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
    image.save(destination, 'WEBP', quality=90, method=6)


manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
for index, character in enumerate(manifest['characters']):
    cid = character['id']
    assert cid.startswith('sw_'), 'Base assets must never be overwritten'
    raw = (ROOT / character['illustration']).read_bytes()
    normalized_raw = raw
    if character.get('normalize_art_bounds'):
        normalized = Image.open(io.BytesIO(raw)).convert('RGBA')
        normalized = normalized.crop(normalized.getchannel('A').point(lambda alpha: 255 if alpha > 8 else 0).getbbox())
        normalized_buffer = io.BytesIO()
        normalized.save(normalized_buffer, 'PNG')
        normalized_raw = normalized_buffer.getvalue()
    # The existing card uses a black rounded surround with narrow race stripes.
    body = '<rect width="720" height="1032" rx="36" fill="#222"/>'
    for inset, color in [(34, '#51a045'), (39, '#ffbf20'), (44, '#e17bb5'), (49, '#61a6cd')]:
        body += f'<rect x="{inset}" y="{inset}" width="{720-2*inset}" height="{1032-2*inset}" rx="40" fill="none" stroke="{color}" stroke-width="5"/>'
    body += f'<rect x="48" y="44" width="624" height="620" rx="7" fill="{character["field"]}"/>'
    art_raw = normalized_raw if character.get('normalize_art_bounds') else (ROOT / character['token']).read_bytes()
    if character.get('card_art_mode') == 'upper_body':
        art_image = Image.open(io.BytesIO(art_raw))
        art_top = round(art_image.height * character.get('card_art_top', 0))
        art_image = art_image.crop((0, art_top, art_image.width, art_top + art_image.width))
        encoded = io.BytesIO()
        art_image.save(encoded, 'PNG')
        art_raw = encoded.getvalue()
    body += img(art_raw, 62, 172, 596, 596)
    # These coordinates, glyph outlines, line breaking and panel strokes match
    # magical-athlete-production-v1/build_assets.py exactly.
    body += f'<rect x="48" y="44" width="624" height="140" rx="7" fill="{character["field"]}"/>'
    size = min(49, 560 / max(measure(character['zh'], 49), 1) * 49)
    body += lettering(character['zh'], 360, 103, size, center=True)
    body += lettering(character['en'], 360, 148, 23, center=True)
    body += '<rect x="42" y="653" width="636" height="345" rx="125" fill="#111"/>'
    for offset, color in [(0, '#ffbf20'), (7, '#e17bb5'), (14, '#61a6cd')]:
        body += f'<rect x="{47+offset}" y="{658+offset}" width="{626-2*offset}" height="{335-2*offset}" rx="{120-offset}" fill="none" stroke="{color}" stroke-width="5"/>'
    body += '<rect x="68" y="679" width="584" height="290" rx="98" fill="white"/>'
    ability_lines = lines(character['text'], 520, 33)
    assert len(ability_lines) <= 6, (cid, ability_lines)
    top = 807 - (len(ability_lines)-1)*22
    for line_index, line in enumerate(ability_lines):
        body += lettering(line, 360, top + line_index*44, 33, center=True)
    color = ['#5e9dca', '#e881b8', '#ffc126', '#51a045', '#ff4a21'][index % 5]
    body += f'<rect x="205" y="955" width="310" height="46" rx="22" fill="{color}" stroke="#111" stroke-width="3"/>'
    body += lettering(character['powerZh'], 360, 987, 27, center=True)
    full = svg(720, 1032, body, character['zh'] + ' | ' + character['text'])
    (ROOT / 'cards').mkdir(exist_ok=True)
    (ROOT / 'cards' / f'{cid}.svg').write_text(full, encoding='utf-8')
    document = fitz.open(stream=full.encode(), filetype='svg')
    rendered = document[0].get_pixmap(matrix=fitz.Matrix(512/720, 512/720), alpha=False).tobytes('png')
    encode_webp(rendered, PUBLIC / 'cards/zh' / f'{cid}.webp')
    # Portrait framing follows the original horizontal skill-card crop. Keep
    # the head and upper torso instead of passing a square to object-fit:cover.
    portrait_rgba = Image.open(io.BytesIO(normalized_raw)).convert('RGBA')
    portrait = Image.new('RGB', portrait_rgba.size, character['field'])
    portrait.paste(portrait_rgba, mask=portrait_rgba.getchannel('A'))
    portrait_frame = character['portrait_frame']
    portrait_width = round(portrait.width * portrait_frame['width'])
    portrait_height = round(portrait_width * 172 / 234)
    left = round(portrait.width * portrait_frame['left'])
    top = round(portrait.height * portrait_frame['top'])
    portrait = portrait.crop((left, top, left + portrait_width, top + portrait_height))
    portrait.resize((234, 172), Image.Resampling.LANCZOS).save(PUBLIC / 'portraits' / f'{cid}.webp', 'WEBP', quality=90, method=6)
    token = Image.open(ROOT / character['standee']).convert('RGBA')
    assert token.getextrema()[3][0] == 0, 'Token requires genuine transparent alpha'
    # Native standee export: tight alpha bounds, 238px tall and feet at bottom.
    # Keep the actual silhouette ratio; never squeeze a square running pose.
    token = token.crop(token.getchannel('A').point(lambda alpha: 255 if alpha > 8 else 0).getbbox())
    token = token.resize((round(token.width * 238 / token.height), 238), Image.Resampling.LANCZOS)
    token.save(PUBLIC / 'tokens' / f'{cid}.png')
    character['exported_token_size'] = list(token.size)
    character['exported_portrait_size'] = [234, 172]
    character['sha256'] = hashlib.sha256(raw).hexdigest()
    character['token_sha256'] = hashlib.sha256((ROOT / character['token']).read_bytes()).hexdigest()
    character['standee_sha256'] = hashlib.sha256((ROOT / character['standee']).read_bytes()).hexdigest()

(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Built {len(manifest["characters"])} original cards, portraits and transparent tokens; base assets unchanged.')
