"""One-time transcription of the user supplied Crime Scene card list.

No external rule text or art is used. Fails loudly if list sizes drift.
"""
import json
import re
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit("用法: python scripts/build-crime-scene-data.py <用户原始需求文本路径>")
source = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / "data" / "crime-scene"
body = source.read_text(encoding="utf-8")
out.mkdir(parents=True, exist_ok=True)

def save(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def section(start, end):
    return body.split(start, 1)[1].split(end, 1)[0]

def terms(text):
    return [x.strip() for x in re.split("[、，]", text.strip()) if x.strip()]

clues = terms(section("### 2.1 线索牌（200）", "> 注：原资料“麻雀”").strip())
means = terms(section("### 2.2 手段牌（90）", "> 注：原资料“工作”").strip())
assert len(clues) == 200, ("clues", len(clues))
assert len(means) == 90, ("means", len(means))
assert len(set(clues)) == len(clues) and len(set(means)) == len(means)
save("clues.json", [{"id": f"clue-{i:03}", "name": name} for i, name in enumerate(clues, 1)])
save("means.json", [{"id": f"means-{i:03}", "name": name} for i, name in enumerate(means, 1)])

tile_body = section("### 2.3 场景板（26 + 6 事件）", "---\n\n## 3.")
tiles = []
death = re.search(r"\*\*死因（紫）\*\*：([^\n]+)", tile_body).group(1)
tiles.append({"id": "death", "kind": "death", "title": "死因", "options": terms(death)})
for index, choices in re.findall(r"^  ([1-4])\. ([^\n]+)", tile_body, re.M):
    tiles.append({"id": f"location-{index}", "kind": "location", "title": "案发地点", "options": terms(choices)})
orange = tile_body.split("**线索板（橙，21）**", 1)[1].split("- **事件板", 1)[0]
for i, (title, choices) in enumerate(re.findall(r"^  - ([^：\n]+)：([^\n]+)", orange, re.M), 1):
    entry = {"id": f"scene-{i:02}", "kind": "scene", "title": title, "options": terms(choices)}
    if title in ("案发日子", "作案时长"):
        entry["needsVerify"] = True
    tiles.append(entry)
events = ["秘密证供", "有据可寻", "扭转局势", "错误信息", "证据排除", "倒数计时"]
tiles.extend({"id": f"event-{i:02}", "kind": "event", "title": title} for i, title in enumerate(events, 1))
assert len(tiles) == 32, len(tiles)
assert all(len(t["options"]) == 6 for t in tiles if "options" in t)
save("tiles.json", tiles)

roles = [
    ("forensic", "鉴证专家", "good"), ("investigator", "调查员", "good"),
    ("killer", "凶手", "evil"), ("accomplice", "帮凶", "evil"),
    ("witness", "目击者", "good"),
]
save("roles.json", [{"id": id_, "name": name, "side": side} for id_, name, side in roles])
print(f"生成 {len(clues)} 线索、{len(means)} 手段、{len(tiles)} 场景/事件、{len(roles)} 身份")
