// 快速目视检查：4 个独立浏览器（手机视口）打开一局行动代号并截图
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
const PORT = 3331, base = `http://127.0.0.1:${PORT}`, out = process.argv[2] ?? ".";
const data = mkdtempSync(join(tmpdir(), "cn-look-"));
const srv = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DBD_DATA_DIR: join(data, "d"), CN_DATA_DIR: join(data, "c") },
  stdio: "ignore",
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 200; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await sleep(50); }
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pages = [];
for (let i = 0; i < 4; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  pages.push(await ctx.newPage());
}
const [a, b, c, d] = pages;
await a.goto(base + "/?game=cn");
await a.getByTestId("cn-create").click();
await a.waitForURL(/room=/);
const url = a.url();
const names = ["小红", "红二", "小蓝", "蓝二"];
for (const [i, p] of pages.entries()) {
  if (i) await p.goto(url);
  await p.getByTestId("cn-name").fill(names[i]);
  await p.getByTestId("cn-claim").click();
  await p.getByTestId(i < 2 ? "cn-join-red" : "cn-join-blue").click();
}
await a.getByTestId("cn-mode-pick").click();
await a.getByTestId("cn-captain-red").click();
await c.getByTestId("cn-captain-blue").click();
await sleep(300);
await a.screenshot({ path: join(out, "0-lobby.png"), fullPage: true });
await a.getByTestId("cn-start").click();
await a.getByTestId("cn-game").waitFor();
await sleep(500);
const turnRed = (await a.getByTestId("cn-status").innerText()).startsWith("红");
const [cap, op, ocap, oop] = turnRed ? [a, b, c, d] : [c, d, a, b];
await cap.screenshot({ path: join(out, "1-captain.png"), fullPage: true });
await op.screenshot({ path: join(out, "2-operative-wait.png"), fullPage: true });
await cap.getByTestId("cn-clue-input").fill("联想");
await cap.getByTestId("cn-num-2").click();
await cap.getByTestId("cn-send-clue").click();
await sleep(400);
await op.screenshot({ path: join(out, "3-flash.png") });
await sleep(1600);
await op.getByTestId("cn-card-3").click();
await sleep(300);
await op.screenshot({ path: join(out, "4-operative-mark.png"), fullPage: true });
console.log(await op.getByTestId("cn-card-3").evaluate((e) => { const s = getComputedStyle(e); return [e.className, s.backgroundImage.slice(0,120), s.backgroundColor, s.opacity, s.filter].join(" | "); }));
// 队员 DOM 里不得有未翻开牌的身份
const leak = await op.$$eval('[data-revealed="0"]', (els) => els.filter((e) => e.getAttribute("data-role")).length);
console.log("operative unrevealed with role:", leak);
if (leak !== 0) throw new Error("队员页面泄露了秘密身份");
await op.getByTestId("cn-reveal").click();
await sleep(800);
await oop.screenshot({ path: join(out, "5-other-team.png"), fullPage: true });
await browser.close();
srv.kill();
