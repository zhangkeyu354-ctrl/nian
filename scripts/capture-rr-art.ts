// Generate original SVG contact sheet and review boards; no production routes added.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { ObjectArt } from "../apps/web/src/rr/Objects.tsx";
import { assertUiShot } from "./screenshot-check.ts";
const out = "docs/reflex-race/screens";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROME,
});
const page = await browser.newPage({
  viewport: { width: 1100, height: 1240 },
  deviceScaleFactor: 1,
});
const names = ["沙发", "瓶子", "书", "猫", "雪人"],
  colors = ["红", "绿", "蓝", "黄", "白"];
const cells = names
  .flatMap((name, obj) =>
    colors.map(
      (color, c) =>
        `<section><div>${renderToStaticMarkup(React.createElement(ObjectArt, { obj, color: c, size: 148 }))}</div><p>${name} · ${color}</p></section>`,
    ),
  )
  .join("");
await page.setContent(
  `<style>*{box-sizing:border-box}body{margin:0;background:#3b2e48;color:white;font:700 18px sans-serif;padding:24px}h1{margin:0 0 8px}header{height:90px}article{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}section{text-align:center}section div{background:white;border:9px solid #f4efc9;border-radius:50%;width:170px;height:170px;display:grid;place-items:center;margin:auto}p{margin:5px}</style><header><h1>眼疾手快 · 原创物品 25 种组合</h1>正面主色 / 侧面明暗 / 局部高光 · 白色圆盘检查</header><article>${cells}</article>`,
);
await assertUiShot(page, `${out}/objects-25.png`);
const data = (path: string) =>
  `data:image/${path.endsWith(".jpeg") ? "jpeg" : "png"};base64,${readFileSync(path).toString("base64")}`;
for (const size of ["390x844", "360x640"]) {
  const [w, h] = size.split("x").map(Number);
  await page.setViewportSize({ width: w * 4, height: h * 3 + 180 });
  const states = ["home", "lobby", "game", "wrong", "reveal", "over"];
  const rows = states
    .map(
      (state, i) =>
        `<section><h2>${["首页", "房间", "对局", "点错", "公布", "结算"][i]} · 改前 / 改后</h2><div><img src="${data(`${out}/before/${state}-${size}.png`)}"><img src="${data(`${out}/after/${state}-${size}.png`)}"></div></section>`,
    )
    .join("");
  await page.setContent(
    `<style>body{margin:0;padding:16px;background:#eee;font:18px sans-serif}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}h2{margin:4px}section div{display:flex}img{width:${w - 12}px;height:${h - 26}px;object-fit:contain}</style><main>${rows}</main>`,
  );
  await assertUiShot(page, `${out}/comparison-${size}.png`);
}
// Reference pixels stay local, just like reference/ itself.
await page.setViewportSize({ width: 1440, height: 1200 });
await page.setContent(
  `<style>body{margin:0;background:#eee;font:20px sans-serif}main{display:flex;gap:12px;padding:15px}section{width:calc(25% - 9px)}img{width:100%;height:1070px;object-fit:contain}h2{text-align:center}</style><main>${[
    ["参考 · 对局", "reference/reflex-race/参考_对局画面.jpeg"],
    ["原创 · 对局", `${out}/after/game-390x844.png`],
    ["参考 · 首页", "reference/reflex-race/参考_开始页.png"],
    ["原创 · 首页", `${out}/after/home-390x844.png`],
  ]
    .map(
      ([label, path]) =>
        `<section><h2>${label}</h2><img src="${data(path)}"></section>`,
    )
    .join("")}</main>`,
);
await assertUiShot(page, `${out}/reference-comparison.png`);
await browser.close();
console.log(
  "Contact sheet and comparison boards saved. Reference comparison remains local.",
);
