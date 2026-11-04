// 按需加载的 Pixi 全屏特效；只在大招时载入，失败时静默跳过。
export type FxKind = "flashback" | "panic" | "boss" | "crit";
const COLORS: Record<FxKind, number[]> = { flashback: [0xffd36b, 0xffffff], panic: [0xe0523f, 0xa58bd6], boss: [0xa58bd6, 0xe0523f], crit: [0xffe7a8, 0xffffff] };
export async function playFx(kind: FxKind) {
  try {
    const { Application, Graphics } = await import("pixi.js");
    const app = new Application(); await app.init({ width: innerWidth, height: innerHeight, backgroundAlpha: 0, antialias: false, resolution: 1 });
    const c = app.canvas; c.style.cssText = "position:fixed;inset:0;z-index:40;pointer-events:none"; document.body.appendChild(c);
    const cx = innerWidth / 2, cy = innerHeight * .4, ring = new Graphics(), parts: any[] = []; app.stage.addChild(ring);
    for (let i = 0; i < 70; i++) { const g = new Graphics().circle(0, 0, 1.5 + Math.random() * 3.5).fill(COLORS[kind][i % 2]); g.x = cx; g.y = cy; const a = Math.random() * 6.28, sp = 2 + Math.random() * 8; app.stage.addChild(g); parts.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }); }
    let t = 0; app.ticker.add(() => { t++; ring.clear().circle(cx, cy, t * 11).stroke({ width: Math.max(1, 12 - t / 3), color: COLORS[kind][0], alpha: Math.max(0, 1 - t / 40) }); for (const p of parts) { p.g.x += p.vx; p.g.y += p.vy; p.vy += .1; p.g.alpha = Math.max(0, 1 - t / 48); } if (t > 50) { app.destroy(true, { children: true }); } });
  } catch { /* 无 WebGL 时跳过 */ }
}
