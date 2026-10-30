import { expect, it } from "vitest";
import { layoutFloats } from "../src/ma/float-layout.ts";
it("nearby labels remain inside the board and do not overlap", () => {
  const labels = Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    x: 30 + i * 12,
    y: 140,
    width: 130,
  }));
  const placed = layoutFloats(labels, 360, 500);
  const boxes = [...placed.values()];
  expect(boxes).toHaveLength(6);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    expect(a.x - a.width / 2).toBeGreaterThanOrEqual(4);
    expect(a.x + a.width / 2).toBeLessThanOrEqual(356);
    expect(a.y - 26).toBeGreaterThanOrEqual(4);
    for (const b of boxes.slice(i + 1))
      expect(
        Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
          Math.abs(a.y - b.y) >= 26,
      ).toBe(true);
  }
});
