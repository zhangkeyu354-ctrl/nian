import {
  COLORS,
  type Drawing,
} from "../../../../packages/drawing-party/src/index.ts";
export function paint(canvas: HTMLCanvasElement, d: Drawing, limit = Infinity) {
  const g = canvas.getContext("2d")!;
  g.setTransform(canvas.width / 1024, 0, 0, canvas.width / 1024, 0, 0);
  g.fillStyle = "white";
  g.fillRect(0, 0, 1024, 1024);
  let used = 0;
  for (const s of d.strokes) {
    const pts = s.points
      .slice(0, Math.max(0, limit - used))
      .map((p) => [p[0], (p[1] * canvas.height) / canvas.width, p[2]]);
    used += s.points.length;
    if (!pts.length) continue;
    g.strokeStyle = COLORS[s.color] ?? COLORS[0];
    g.fillStyle = g.strokeStyle;
    g.lineWidth = s.width;
    g.lineCap = "round";
    g.lineJoin = "round";
    if (pts.length === 1) {
      g.beginPath();
      g.arc(pts[0][0], pts[0][1], s.width / 2, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++)
      g.quadraticCurveTo(
        pts[i][0],
        pts[i][1],
        (pts[i][0] + pts[i + 1][0]) / 2,
        (pts[i][1] + pts[i + 1][1]) / 2,
      );
    g.lineTo(pts.at(-1)![0], pts.at(-1)![1]);
    g.stroke();
  }
}
export function downloadDrawing(d: Drawing, name = "画作") {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 1024;
  paint(c, d);
  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, "image/png");
}
