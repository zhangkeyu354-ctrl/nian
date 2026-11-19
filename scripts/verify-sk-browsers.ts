// 骷髅王：两部手机竖屏真实点击打完整局（双人局 + 灰胡子幽灵，开启全部扩展与海盗技能）
import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = mkdtempSync(join(tmpdir(), "sk-browsers-"));
const out = "docs/skull-king/screens";
mkdirSync(out, { recursive: true });
const finder = createServer();
await new Promise<void>((r) => finder.listen(0, "127.0.0.1", r));
const port = (finder.address() as any).port;
await new Promise<void>((r) => finder.close(() => r()));
const base = `http://127.0.0.1:${port}`;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const env: Record<string, string> = { ...process.env as any, PORT: String(port), HOST: "127.0.0.1", WT_DISABLE: "1" };
for (const k of ["SK", "DU", "SS", "DBD", "RK", "DM", "MA", "CN", "RR", "XB", "DP", "KB", "ND", "TA", "BF"]) env[k + "_DATA_DIR"] = join(root, k.toLowerCase());
const child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
child.stdout!.on("data", (d) => (logs += d));
child.stderr!.on("data", (d) => (logs += d));
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await delay(200);
}
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const errors: string[] = [];
const phone = async () => {
  const ctx = await browser.newContext({ actionTimeout: 4000, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
  return p;
};
try {
  const a = await phone(), b = await phone();
  await a.goto(base + "/?game=sk");
  await a.fill('[data-testid="sk-name"]', "船长");
  await a.click('[data-testid="sk-create"]');
  const code = (await a.textContent('[data-testid="sk-room-code"]'))!.trim();
  await a.click('[data-testid="sk-count-2"]');
  for (const t of ["克拉肯", "白鲸", "战利品", "海盗技能"]) { await a.click(`.sk-toggle:has-text("${t}")`); await delay(150); }
  await b.goto(base + "/?game=sk&room=" + code);
  await b.fill('[data-testid="sk-name"]', "大副");
  await b.click('[data-testid="sk-claim"]');
  await b.click('[data-testid="sk-ready"]');
  await a.click('[data-testid="sk-ready"]');
  await a.screenshot({ path: out + "/sk-room.png", fullPage: true });
  await a.click('[data-testid="sk-start"]');
  let shots = 0, plays = 0, bids = 0;
  const step = async (p: Page, tag: string) => {
    const tut = p.locator('[data-testid="sk-tut-next"]');
    if (await tut.count()) { if (tag === "a" && !shots) await p.screenshot({ path: out + "/sk-tutorial.png" }); await tut.click(); return true; }
    const banner = p.locator('[data-testid="sk-trick-banner"], [data-testid="sk-bid-reveal"]');
    if (await banner.count()) { if (shots < 3 && tag === "a" && plays > 4) { await p.screenshot({ path: `${out}/sk-banner-${shots++}.png` }); } await delay(300); return true; }
    if (await p.locator('[data-testid="sk-bid-go"]').count()) {
      const btns = p.locator('[data-testid^="sk-bid-"]:not([data-testid="sk-bid-go"]):not([data-testid="sk-bid-panel"]):not([data-testid="sk-bid-reveal"])');
      const n = await btns.count();
      await btns.nth(Math.min(1, n - 1)).click();
      if (bids === 4 && tag === "a") await p.screenshot({ path: out + "/sk-bid.png" });
      await p.click('[data-testid="sk-bid-go"]'); bids++; return true;
    }
    const ab = p.locator('[data-testid="sk-ability"] button:not(:disabled)');
    if (await ab.count()) {
      const cards = p.locator('[data-testid="sk-ability"] .sk-peek button.sk-card');
      if (await cards.count()) { const need = (await p.textContent('[data-testid="sk-ability"] .sk-sub'))!.match(/选 (\d)/)?.[1] ?? "2"; for (let i = 0; i < +need; i++) await cards.nth(i).click(); }
      await p.screenshot({ path: `${out}/sk-ability-${tag}.png` });
      await ab.last().click(); return true;
    }
    const legal = p.locator('[data-testid="sk-hand"] button.sk-card:not(.dim)');
    if (await legal.count()) {
      await legal.first().click({ position: { x: 12, y: 50 } });
      if (plays === 20 && tag === "a") await p.screenshot({ path: out + "/sk-select.png" });
      await p.click('[data-testid="sk-play"]');
      const tig = p.locator('[data-testid="sk-tig-pirate"]');
      if (await tig.count()) await tig.click();
      plays++; return true;
    }
    const next = p.locator('[data-testid="sk-next"]');
    if (await next.count()) {
      const txt = await next.textContent();
      if (txt?.includes("再来")) return "done";
      if (tag === "a") await p.screenshot({ path: out + `/sk-round-end.png` });
      await next.click(); return true;
    }
    return false;
  };
  const t0 = Date.now();
  let done = false;
  while (!done && Date.now() - t0 < 420_000) {
    for (const [p, tag] of [[a, "a"], [b, "b"]] as const) {
      const r = await step(p, tag).catch(() => false);
      if (r === "done") done = true;
    }
    await delay(120);
  }
  await a.screenshot({ path: out + "/sk-finished.png" });
  await b.screenshot({ path: out + "/sk-finished-guest.png" });
  if (!done) throw Error("没打完整局");
  if (errors.length) throw Error("页面报错：" + errors.join("\n"));
  console.log(`骷髅王双人浏览器整局通过：下注 ${bids} 次，出牌 ${plays} 次，用时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
} catch (e) {
  console.error(e, logs.slice(-2000));
  process.exitCode = 1;
} finally {
  await browser.close();
  child.kill();
}
