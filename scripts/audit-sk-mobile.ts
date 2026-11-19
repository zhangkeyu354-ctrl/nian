// 骷髅王手机体验审计：1 名真人 + 人机，逐阶段截图并自动检查遮挡、溢出、点击区域、卡顿
import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = mkdtempSync(join(tmpdir(), "sk-audit-"));
const out = "docs/skull-king/audit";
mkdirSync(out, { recursive: true });
const finder = createServer();
await new Promise<void>((r) => finder.listen(0, "127.0.0.1", r));
const port = (finder.address() as any).port;
await new Promise<void>((r) => finder.close(() => r()));
const base = `http://127.0.0.1:${port}`;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const env: Record<string, string> = { ...(process.env as any), PORT: String(port), HOST: "127.0.0.1", WT_DISABLE: "1" };
for (const k of ["SK", "DU", "SS", "DBD", "RK", "DM", "MA", "CN", "RR", "XB", "DP", "KB", "ND", "TA", "BF"]) env[k + "_DATA_DIR"] = join(root, k.toLowerCase());
const child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], { env, stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await delay(200); }
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const issues: string[] = [];
const seenShots = new Set<string>();
const scenarios = [
  { name: "2p-360", n: 2, w: 360, h: 640, toggles: ["克拉肯", "白鲸", "战利品", "海盗技能"], rascal: false },
  { name: "4p-390", n: 4, w: 390, h: 844, toggles: ["克拉肯", "白鲸", "战利品", "海盗技能"], rascal: true },
  { name: "6p-360", n: 6, w: 360, h: 640, toggles: ["海盗技能"], rascal: false },
  { name: "8p-360", n: 8, w: 360, h: 640, toggles: ["克拉肯", "白鲸", "战利品", "海盗技能"], rascal: false },
  { name: "8p-414", n: 8, w: 414, h: 896, toggles: [], rascal: false },
];
const stats: Record<string, any> = {};
async function check(p: Page, tag: string) {
  const r = await p.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const bad: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) bad.push("页面横向溢出 " + document.documentElement.scrollWidth);
    const rect = (s: string) => [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect());
    for (const r of rect('[data-testid="sk-hand"] .sk-card')) if (r.left < -1 || r.right > vw + 1) bad.push("手牌超出屏幕");
    const vis = (r: DOMRect) => r.width > 0 && r.height > 0;
    const play = document.querySelector('[data-testid="sk-play"]')?.getBoundingClientRect();
    const hand = document.querySelector('[data-testid="sk-hand"]')?.getBoundingClientRect();
    if (hand && hand.bottom > vh + 2) bad.push("手牌被挤出屏幕底部");
    for (const sel of ['[data-testid="sk-bid-go"]', '[data-testid="sk-play"]', '[data-testid="sk-next"]']) {
      const e = document.querySelector(sel); if (!e) continue;
      const r = e.getBoundingClientRect();
      if (r.height < 40) bad.push(sel + " 按钮太小 " + Math.round(r.height));
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cy > vh || cy < 0) { bad.push(sel + " 按钮在屏幕外 y=" + Math.round(cy)); continue; }
      const top = document.elementFromPoint(cx, cy);
      if (top && !e.contains(top)) bad.push(sel + " 被遮挡：" + (top.className || top.tagName));
    }
    const st = document.querySelector('[data-testid="sk-status"]')?.getBoundingClientRect();
    if (st && vis(st) && (st.bottom > vh || st.top < 0)) bad.push("状态提示不在屏幕内");
    const legal = [...document.querySelectorAll('[data-testid="sk-hand"] button.sk-card:not(.dim)')];
    for (const e of legal) {
      const r = e.getBoundingClientRect(), cx = Math.min(r.left + 10, vw - 2), cy = r.top + r.height / 2;
      const t = document.elementFromPoint(cx, cy);
      if (t && !e.contains(t) && !(t as HTMLElement).closest?.(".sk-card")) bad.push("手牌点不到：" + ((t as HTMLElement).className || t.tagName));
    }
    for (const e of document.querySelectorAll('.sk-bid-btn')) { const r = e.getBoundingClientRect(); if (r.width < 36) bad.push("下注按钮太小 " + Math.round(r.width)); }
    for (const e of document.querySelectorAll('.sk-pl-name, .sk-pl-bid')) { const el = e as HTMLElement; if (el.scrollWidth > el.clientWidth + 2) bad.push("座位文字被截断：" + el.textContent); }
    return bad;
  });
  for (const b of r) issues.push(`[${tag}] ${b}`);
  return r;
}
for (const sc of scenarios) {
  const ctx = await browser.newContext({ viewport: { width: sc.w, height: sc.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.addInitScript("window.__name = (f) => f");
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
  await p.goto(base + "/?game=sk");
  await p.fill('[data-testid="sk-name"]', "我是船长名字很长");
  await p.click('[data-testid="sk-create"]');
  await p.click(`[data-testid="sk-count-${sc.n}"]`);
  if (sc.rascal) { await p.click('.sk-chip:has-text("无赖计分")'); await delay(200); await p.click('.sk-toggle:has-text("炮弹")'); }
  for (const t of sc.toggles) { await p.click(`.sk-toggle:has-text("${t}")`); await delay(120); }
  await p.click('.sk-chip:has-text("速战速决")'); // 5 轮每轮 5 张（审计用，缩短时间）
  for (let i = 1; i < sc.n; i++) { await p.click('[data-testid="sk-add-bot"]'); await delay(120); }
  await p.click('[data-testid="sk-ready"]');
  await check(p, sc.name + " 房间");
  await p.screenshot({ path: `${out}/${sc.name}-00-room.png`, fullPage: true });
  await p.click('[data-testid="sk-start"]');
  const t0 = Date.now();
  const lat: number[] = [];
  let actions = 0, done = false, last = "", idleSince = Date.now(), rounds = 0;
  const shot = async (k: string) => { const key = sc.name + k; if (seenShots.has(key)) return; seenShots.add(key); await p.screenshot({ path: `${out}/${sc.name}-${k}.png` }); };
  let firstBanner = true, cnt = 0;
  while (!done && Date.now() - t0 < 420_000) {
    await delay(150);
    const text = (await p.textContent("body")) ?? "";
    if (text !== last) { last = text; idleSince = Date.now(); }
    if (Date.now() - idleSince > 15000) { issues.push(`[${sc.name}] 画面 15 秒没变化，可能卡住`); await shot("stuck"); break; }
    const banner = p.locator('[data-testid="sk-trick-banner"]');
    if (await banner.count()) {
      const kind = (await banner.getAttribute("class")) ?? "";
      if (kind.includes("kraken")) await shot("kraken");
      else if (kind.includes("whale")) await shot("whale");
      else if ((await p.locator(".sk-capture").count())) await shot("mermaid");
      else if ((await p.locator(".sk-badge-item").count())) await shot("bonus");
      else if (firstBanner) { firstBanner = false; await delay(400); await shot("trick"); }
      // 不点：观察自动消失 + 人机是否在横幅期间继续
      cnt++;
      if (cnt % 3 === 0) await banner.click().catch(() => {});
      continue;
    }
    if (await p.locator('[data-testid="sk-bid-reveal"]').count()) { await delay(300); await shot("reveal"); continue; }
    if (await p.locator('[data-testid="sk-bid-go"]').count()) {
      await check(p, sc.name + " 下注");
      await shot("bid");
      const btns = p.locator(".sk-bid-btn"); const n = await btns.count();
      await btns.nth(Math.min(1, n - 1)).click();
      const s = Date.now(); await p.click('[data-testid="sk-bid-go"]');
      await p.waitForSelector('[data-testid="sk-bid-go"]', { state: "detached", timeout: 5000 }).catch(() => issues.push(`[${sc.name}] 下注后按钮没反应`));
      lat.push(Date.now() - s); actions++; continue;
    }
    const shotPanel = p.locator('[data-testid="sk-shot-panel"] button');
    if (await shotPanel.count()) { await shot("shot"); await shotPanel.last().click(); actions++; continue; }
    const ab = p.locator('[data-testid="sk-ability"]');
    if (await ab.count()) {
      const txt = (await ab.textContent()) ?? "";
      const who = txt.match(/你的 (\S+) 赢/)?.[1] ?? "x";
      await check(p, sc.name + " 技能");
      await shot("ability-" + who);
      const cards = p.locator('[data-testid="sk-ability"] .sk-peek button.sk-card');
      if (await cards.count()) { const need = +(txt.match(/选 (\d)/)?.[1] ?? 2); for (let i = 0; i < need; i++) await cards.nth(i).click(); }
      await p.locator('[data-testid="sk-ability"] button.sk-btn:not(:disabled)').last().click(); actions++; continue;
    }
    const tigSheet = p.locator('[data-testid="sk-tig-pirate"]');
    if (await tigSheet.count()) { await shot("tigress"); await tigSheet.click(); continue; }
    const legal = p.locator('[data-testid="sk-hand"] button.sk-card:not(.dim)');
    if (await legal.count()) {
      const dim = p.locator('[data-testid="sk-hand"] button.sk-card.dim');
      if (await dim.count() && !seenShots.has(sc.name + "follow")) {
        await dim.first().click(); await delay(200);
        if (!(await p.locator(".sk-err").count())) issues.push(`[${sc.name}] 点不能出的牌没有提示`);
        await shot("follow");
      }
      await check(p, sc.name + " 出牌");
      await legal.last().click(); await delay(150);
      await shot("select");
      await check(p, sc.name + " 选牌后");
      const s = Date.now();
      await p.click('[data-testid="sk-play"]');
      if (await p.locator('[data-testid="sk-tig-pirate"]').count()) { await shot("tigress"); await p.click('[data-testid="sk-tig-pirate"]'); }
      await p.waitForSelector('[data-testid="sk-play"]', { state: "detached", timeout: 5000 }).catch(() => issues.push(`[${sc.name}] 出牌后没反应`));
      lat.push(Date.now() - s); actions++; continue;
    }
    const next = p.locator('[data-testid="sk-next"]');
    if (await next.count()) {
      await check(p, sc.name + " 结算");
      const txt = (await next.textContent()) ?? "";
      if (txt.includes("再来")) { await shot("final"); await p.locator(".sk-sheet").evaluate((e) => (e.scrollTop = 99999)); await shot("final-bottom"); done = true; break; }
      rounds++;
      await shot("round-end");
      await next.click(); continue;
    }
  }
  // 看看规则与计分表
  await p.click('[data-testid="sk-next"]').catch(() => {});
  stats[sc.name] = { done, rounds, actions, avgLatencyMs: Math.round(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length)), maxLatencyMs: Math.max(0, ...lat), seconds: Math.round((Date.now() - t0) / 1000), errors };
  if (!done) issues.push(`[${sc.name}] 没打完`);
  for (const e of errors) issues.push(`[${sc.name}] 页面报错 ${e}`);
  await ctx.close();
}
// 规则页与计分表截图
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript("window.__name = (f) => f");
  await p.goto(base + "/?game=sk"); await p.click("text=规则说明"); await delay(300);
  await p.screenshot({ path: `${out}/rules.png` });
  await p.goto(base + "/"); await delay(800);
  await p.locator("text=骷髅王 Skull King").first().scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${out}/hall.png` });
  await ctx.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify({ stats, issues: [...new Set(issues)] }, null, 1));
console.log(JSON.stringify({ stats, issues: [...new Set(issues)].slice(0, 60) }, null, 1));
await browser.close();
child.kill();
