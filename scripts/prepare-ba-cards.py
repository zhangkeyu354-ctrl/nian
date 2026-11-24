"""Build compact 3x phone card faces from the CC0 Public Domain Playing Cards pack.

Run from the repository root after downloading the source archive recorded in
docs/black-a-510k/ASSET_RESEARCH.md. Keeps per-file provenance in JSON.
"""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
from PIL import Image
from urllib.request import urlopen

ARCHIVE = Path('docs/black-a-510k/research/austin-cc0-deck.zip')
COMMIT = '3765067c32fcef42a30e87022332db729658e7cd'
SOURCE_URL = 'https://codeload.github.com/AustinGabriel/Public-Domain-and-CC0-Playing-Cards/zip/refs/heads/main'
SOURCE_SHA256 = '967902bd40667f7369376d5979bf12aac7125de4b0e1927cf81c48752f6a659a'
OUTPUT = Path('apps/web/public/assets/black-a-510k/cards')
OUTPUT.mkdir(parents=True, exist_ok=True)
PREFIX = 'Public-Domain-and-CC0-Playing-Cards-main/'
RANKS = {'2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9','10':'10','ace':'A','jack':'J','queen':'Q','king':'K'}
SUITS = {'diamonds':'D','clubs':'C','hearts':'H','spades':'S'}
rows=[]
if not ARCHIVE.exists():
    ARCHIVE.parent.mkdir(parents=True,exist_ok=True)
    with urlopen(SOURCE_URL,timeout=60) as response:
        ARCHIVE.write_bytes(response.read())
if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()!=SOURCE_SHA256:
    raise ValueError('source archive checksum mismatch')
with ZipFile(ARCHIVE) as archive:
    for suit,code in SUITS.items():
        for source_rank,rank in RANKS.items():
            name=f'{PREFIX}png cards/card fronts/{suit}/{source_rank} of {suit}.png'
            original=archive.read(name)
            image=Image.open(BytesIO(original)).convert('RGBA')
            image=image.resize((168,235),Image.Resampling.LANCZOS)
            destination=OUTPUT/f'{rank}{code}.webp'
            image.save(destination,'WEBP',quality=91,method=6)
            rows.append({'id':rank+code,'source_filename':name.removeprefix(PREFIX),'source_sha256':hashlib.sha256(original).hexdigest(),'path':str(destination).replace('\\','/'),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
    name=f'{PREFIX}png cards/card backs/card back blue.png'
    original=archive.read(name)
    image=Image.open(BytesIO(original)).convert('RGBA').resize((168,235),Image.Resampling.LANCZOS)
    destination=OUTPUT/'back.webp';image.save(destination,'WEBP',quality=91,method=6)
    rows.append({'id':'BACK','source_filename':name.removeprefix(PREFIX),'source_sha256':hashlib.sha256(original).hexdigest(),'path':str(destination).replace('\\','/'),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
    (OUTPUT/'LICENSE-CC0.txt').write_bytes(archive.read(PREFIX+'LICENSE'))
manifest={'source_url':'https://github.com/AustinGabriel/Public-Domain-and-CC0-Playing-Cards','author':'AustinGabriel','commit':'3765067c32fcef42a30e87022332db729658e7cd','download_date':'2026-11-24','license':'CC0-1.0','license_evidence':str(OUTPUT/'LICENSE-CC0.txt').replace('\\','/'),'modification':'resized PNG from 1500x2100 to 168x235 using LANCZOS; encoded WebP quality 91','assets':rows}
Path('docs/black-a-510k/cards-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('cards',len(rows),'total bytes',sum(row['bytes'] for row in rows))
