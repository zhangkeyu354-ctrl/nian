import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const dir = "output/playwright/phase2c/private-comparison";
mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 2200, height: 1500 } });
for (const [seed, name, photo] of [
  [1701, "麦克米伦庄园", "macmillan_cn_retail_xhs.jpg"],
  [2903, "废车场", "autohaven_cn_retail_xhs.png"],
] as const) {
  const data = (file: string) =>
    `data:image/${file.endsWith(".jpg") ? "jpeg" : "png"};base64,` +
    readFileSync(file).toString("base64");
  const html = `<!doctype html><meta charset="utf-8"><title>${name} · 实物与数字棋盘</title><style>body{background:#172023;color:#e9dec0;font:22px/1.6 'Microsoft YaHei',sans-serif;margin:0;padding:35px}h1{margin:0;font-size:34px}p{color:#adb8b0}main{display:grid;grid-template-columns:1fr 1fr;gap:28px}figure{margin:0;min-width:0}figcaption{padding:14px 0;color:#e5cd8c}img{width:100%;height:auto;display:block}section{border-top:1px solid #626452;margin-top:24px;padding-top:18px}.retail{overflow:hidden;${seed === 2903 ? "aspect-ratio:1.05;" : ""}}.retail img{${seed === 2903 ? "transform:translateY(-31%);" : ""}}small{font-size:17px;line-height:1.8;color:#b8bdaa}</style><h1>${name} · 中文版实物照片与 Phase 2C</h1><p>左：已入库实物照片　｜　右：真实热座中局，种子 ${seed}、第76条命令后。两侧不是同一对局状态。</p><main><figure><figcaption>中文版实物 · ${photo}</figcaption><div class="retail"><img src="${data("reference/maps/" + photo)}"></div><section><small>此照片仅用于本次用户要求的本地对比。${seed === 2903 ? "浏览器展示裁去照片截图外围黑边，未重画、未透视校正。" : "照片原有反光与下沿裁切保留。"}<br>数字版房间场景、动作剪影、头像与道具均为原创；场景内容与官方美术不同。比较布局、连接关系、路线动作与方向、出生刻痕、图案轨道和道具可读性。<br>规则图数据、房间ID和路线ID均保持不变；本图不用于声称复刻官方美术。</small></section></figure><figure><figcaption>数字棋盘 · 两图完整中局截图均单独提供</figcaption><img src="${data(`output/playwright/phase2c/${seed}_电脑_中局.png`)}"></figure></main>`;
  writeFileSync(`${dir}/${name}_实物对比.html`, html);
  await p.setContent(html);
  await p
    .locator("img")
    .evaluateAll((els) =>
      Promise.all(els.map((el) => (el as HTMLImageElement).decode())),
    );
  await p.screenshot({ path: `${dir}/${name}_实物对比.png`, fullPage: true });
  console.log("COMPARISON", name);
}
await b.close();
