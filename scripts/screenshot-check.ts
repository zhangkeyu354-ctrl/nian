// 截图验收：不只检查文件存在，而是检查棋盘真的被画出来了。
// 1) 等待所有房间插画/道具图片解码完成；2) DOM 中完整落在棋盘视口内的房间与路线图标数量；
// 3) 对截图像素做统计：棋盘区域内"非背景色"像素比例必须足够高，空白/纯色画面判定失败。
import type { Page } from "playwright";
import { strict as assert } from "node:assert";

export async function waitForBoardImages(p: Page) {
  await p.evaluate(async () => {
    const hrefs = [
      ...document.querySelectorAll("[data-testid=board] image"),
    ].map((e) => e.getAttribute("href") || "");
    await Promise.all(
      [...new Set(hrefs)].filter(Boolean).map(async (h) => {
        const img = new Image();
        img.src = h;
        try {
          await img.decode();
        } catch {
          /* 缺图由回退机制处理 */
        }
      }),
    );
  });
  await p.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

export async function visibleCounts(p: Page) {
  return p.evaluate(() => {
    const vp = document.querySelector(".map-viewport")!.getBoundingClientRect();
    // 必须同时落在棋盘视口和浏览器窗口内，才算"截图里看得见"
    const L = Math.max(vp.left, 0),
      T = Math.max(vp.top, 0),
      R = Math.min(vp.right, innerWidth),
      B = Math.min(vp.bottom, innerHeight);
    return {
      rooms: [...document.querySelectorAll("[data-room] > rect")]
        .map((el) => el.getBoundingClientRect())
        .filter(
          (b) =>
            b.width > 0 &&
            b.left >= L - 1 &&
            b.right <= R + 1 &&
            b.top >= T - 1 &&
            b.bottom <= B + 1,
        ).length,
      routes: [...document.querySelectorAll("[data-route-icon]")]
        .map((el) => el.getBoundingClientRect())
        .filter(
          (b) =>
            b.width > 0 &&
            b.left >= L - 1 &&
            b.right <= R + 1 &&
            b.top >= T - 1 &&
            b.bottom <= B + 1,
        ).length,
      viewport: { x: vp.x, y: vp.y, width: vp.width, height: vp.height },
    };
  });
}

/** 对截图中棋盘视口区域做像素统计，返回非背景像素比例与亮度标准差 */
export async function pixelStats(
  p: Page,
  png: Buffer,
  rect: { x: number; y: number; width: number; height: number },
) {
  const b64 = png.toString("base64");
  return p.evaluate(
    async ({ b64, rect }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const scale = img.naturalWidth / window.innerWidth;
      const c = document.createElement("canvas");
      const w = Math.max(1, Math.floor(rect.width * scale)),
        h = Math.max(1, Math.floor(rect.height * scale));
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.drawImage(img, rect.x * scale, rect.y * scale, w, h, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const lum: number[] = [];
      for (let i = 0; i < d.length; i += 16)
        lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      const sorted = [...lum].sort((a, b) => a - b);
      const bg = sorted[Math.floor(sorted.length * 0.3)];
      const busy = lum.filter((v) => Math.abs(v - bg) > 18).length / lum.length;
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      const std = Math.sqrt(
        lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length,
      );
      return { busy, std };
    },
    { b64, rect },
  );
}

/** 全图模式下的完整验收：房间数、路线图标数、像素内容 */
export async function assertFullBoardShot(
  p: Page,
  path: string,
  expected: { rooms: number; routes: number },
) {
  const vpEl = p.locator(".map-viewport");
  const box = (await vpEl.boundingBox())!;
  const winH = await p.evaluate(() => innerHeight);
  if (box.y < 0 || box.y + box.height > winH)
    await vpEl.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await waitForBoardImages(p);
  const counts = await visibleCounts(p);
  assert.equal(counts.rooms, expected.rooms, `可见房间数 ${path}`);
  assert.equal(counts.routes, expected.routes, `可见路线图标数 ${path}`);
  const png = await p.screenshot({ path, animations: "disabled" });
  // 截图坐标以视口为准：视口区域必须在屏幕内
  const r = counts.viewport;
  const rect = {
    x: Math.max(0, r.x),
    y: Math.max(0, r.y),
    width: Math.min(
      r.width,
      (await p.evaluate(() => innerWidth)) - Math.max(0, r.x),
    ),
    height: Math.min(
      r.height,
      (await p.evaluate(() => innerHeight)) - Math.max(0, r.y),
    ),
  };
  const px = await pixelStats(p, png, rect);
  assert(
    px.busy > 0.06 && px.std > 12,
    `棋盘区域像素内容不足（疑似空白）${path} ${JSON.stringify(px)}`,
  );
  return { ...counts, pixels: px };
}
/** UI/partial-board evidence for audits and explicitly labelled prototypes.
 * This does not claim that a local camera view contains the entire map.
 * Full-map screenshots must continue to use assertFullBoardShot. */
export async function assertUiShot(
  p: Page,
  path: string,
  regionSelector: string = "body",
  animations: "disabled" | "allow" = "disabled",
) {
  await waitForBoardImages(p);
  await p.evaluate(() => document.fonts.ready);
  const box = (await p.locator(regionSelector).boundingBox())!;
  const win = await p.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const x = Math.max(0, box.x),
    y = Math.max(0, box.y);
  // Fixed dialogs can extend outside a short body box. Body evidence means
  // the visible viewport; selected board regions still use their clipped box.
  const rect =
    regionSelector === "body"
      ? { x: 0, y: 0, width: win.w, height: win.h }
      : {
          x,
          y,
          width: Math.min(box.x + box.width, win.w) - x,
          height: Math.min(box.y + box.height, win.h) - y,
        };
  assert(
    rect.width > 20 && rect.height > 20,
    "Evidence region must be visible",
  );
  const png = await p.screenshot({ path, animations });
  const pixels = await pixelStats(p, png, rect);
  assert(
    pixels.busy > 0.025 && pixels.std > 6,
    `UI evidence is blank: ${path} ${JSON.stringify(pixels)}`,
  );
  return {
    scope: "Visible UI / prototype region, not a full-map-count claim",
    region: rect,
    pixels,
  };
}
