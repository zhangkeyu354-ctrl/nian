"""Make 390px phone comparison sheets from browser captures."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path("output/cs-ui/polish")
hall = Image.open(root / "hall.png").convert("RGB")
for stage in ("entry", "lobby", "setup", "night", "search", "brief", "result"):
    old = root / f"{stage}-before.png"
    new = root / f"{stage}-after.png"
    if not old.exists() or not new.exists():
        continue
    canvas = Image.new("RGB", (1170, 884), "#151310")
    draw = ImageDraw.Draw(canvas)
    for index, (title, source) in enumerate((("HALL", hall), ("BEFORE", Image.open(old).convert("RGB")), ("AFTER", Image.open(new).convert("RGB")))):
        canvas.paste(source.crop((0, 0, min(390, source.width), min(844, source.height))), (index * 390, 40))
        draw.text((index * 390 + 12, 12), title, fill="#e7d9bf")
    canvas.save(root / f"{stage}-compare.jpg", quality=82, optimize=True)
