"""Normalize the CC0 BMacZero paper-card recordings for quiet game SFX.

Input files remain in docs/black-a-510k/research/candidate-audio/bmaczero.
No external libraries are required. Run from the repository root.
"""
from pathlib import Path
import math
import struct
import wave

SOURCE = Path('docs/black-a-510k/research/candidate-audio/bmaczero')
TARGET = Path('apps/web/public/assets/black-a-510k/audio')
TARGET.mkdir(parents=True, exist_ok=True)
FILES = ('shuffle', 'shuffleandbridge', 'contact1', 'contact2', 'cut')
for name in FILES:
    with wave.open(str(SOURCE / f'{name}.wav'), 'rb') as reader:
        assert reader.getsampwidth() == 2 and reader.getnchannels() == 1
        count = reader.getnframes()
        samples = struct.unpack('<' + 'h' * count, reader.readframes(count))
        rms = math.sqrt(sum(x * x for x in samples) / count)
        # A soft baseline: user volume remains under their control.
        target_rms = 1350 if name.startswith('shuffle') else 1750
        gain = min(target_rms / max(rms, 1), 27000 / max(abs(x) for x in samples))
        fade = min(round(reader.getframerate() * .006), count // 2)
        out = []
        for i, sample in enumerate(samples):
            edge = min(1, i / max(fade, 1), (count - 1 - i) / max(fade, 1))
            out.append(max(-32768, min(32767, round(sample * gain * edge))))
        with wave.open(str(TARGET / f'{name}.wav'), 'wb') as writer:
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(reader.getframerate())
            writer.writeframes(struct.pack('<' + 'h' * count, *out))
