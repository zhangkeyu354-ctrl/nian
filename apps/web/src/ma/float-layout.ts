export interface FloatBox {
  x: number;
  y: number;
  width: number;
}
/** Fixed screen-sized labels; geometry only, never a rule or animation timer. */
export function layoutFloats(
  labels: (FloatBox & { id: string })[],
  width: number,
  height: number,
) {
  const placed = new Map<string, FloatBox>(),
    gap = 10,
    h = 26;
  for (const item of labels) {
    const w = Math.min(item.width, Math.max(20, width - 8));
    const x = Math.max(w / 2 + 4, Math.min(width - w / 2 - 4, item.x)),
      base = Math.max(h + 4, Math.min(height - 4, item.y));
    let best: FloatBox = { x, y: base, width: w };
    const overlaps = (a: FloatBox) =>
      [...placed.values()].some(
        (b) =>
          Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
          Math.abs(a.y - b.y) < h + gap,
      );
    let found = false;
    for (let lane = 0; lane < 20 && !found; lane++)
      for (const direction of [-1, 1]) {
        const y = base + direction * lane * (h + gap);
        if (y < h + 4 || y > height - 4) continue;
        const candidate = { x, y, width: w };
        if (!overlaps(candidate)) {
          best = candidate;
          found = true;
          break;
        }
      }
    placed.set(item.id, best);
  }
  return placed;
}
