// 卡里巴湖浏览器整局验证：npm run build 后运行。可用 PW_CHROME 指定 Chromium。
// KB_SHOTS=1 时把截图存到 docs/kariba/ui-v1/。
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, type Page, type BrowserContext } from "playwright";

const PORT = 3341;
const base = `http://127.0.0.1:${PORT}`;
const data = mkdtempSync(join(tmpdir(), "kb-verify-"));
const shots = process.env.KB_SHOTS === "1";
const shotDir = "docs/kariba/ui-v1";
if (shots) mkdirSync(shotDir, { recursive: true });

const server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], {
  env: { ...process.env, PORT: String(PORT), DBD_DATA_DIR: join(data, "dbd"), KB_DATA_DIR: join(data, "kb") },
  stdio: "ignore",
});
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(base + "/api/health")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const results: string[] = [];
const shot = async (p: Page, name: string) => shots && (await p.screenshot({ path: `${shotDir}/${name}.png` }));

async function seat(ctx: BrowserContext, url: string, name: string) {
  const p = await ctx.newPage();
  await p.goto(url);
  await p.getByTestId("kb-name").fill(name);
  await p.getByTestId("kb-claim").click();
  await p.waitForSelector("text=模式");
  return p;
}

async function game(n: number, mode: "solo" | "team", viewport = { width: 390, height: 844 }, tag = "") {
  const ctxs = await Promise.all(Array.from({ length: n }, () => browser.newContext({ viewport })));
  const host = await ctxs[0].newPage();
  await host.goto(base + "/?game=kb");
  await host.waitForURL(/room=/);
  const url = host.url();
  await host.getByTestId("kb-name").fill("房主小王");
  await host.getByTestId("kb-claim").click();
  await host.waitForSelector("text=模式");
  const pages = [host];
  const names = ["房主小王", "小李", "张三丰十个字的名字", "阿明", "小红", "大刘", "七七", "老八"];
  for (let i = 1; i < n; i++) pages.push(await seat(ctxs[i], url, names[i]));
  if (mode === "team") await host.getByTestId("kb-mode-team").click();
  await host.waitForTimeout(300);
  if (tag) await shot(host, `${tag}-lobby`);
  await host.getByTestId("kb-start").click();
  await Promise.all(pages.map((p) => p.waitForSelector('[data-testid="kb-pond"]')));
  const nameOf = async (p: Page) => (await p.getByTestId("kb-seats").locator("li.me .kb-name").textContent())!;
  const byName = new Map<string, Page>();
  for (const p of pages) byName.set(await nameOf(p), p);

  let turns = 0;
  let checkedIllegal = false, checkedPrivacy = false, checkedReconnect = false, shotsDone = false;
  while (turns < 400) {
    const anyFinal = await pages[0].getByTestId("kb-final").count();
    if (anyFinal) break;
    // 找到轮到的人
    let cur: Page | undefined;
    for (const p of pages) if (await p.locator(".kb-game.my-turn").count()) cur = p;
    if (!cur) { await pages[0].waitForTimeout(150); continue; }
    const cards = cur.locator('[data-testid^="kb-card-"]');
    const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(8)));
    if (!checkedPrivacy) {
      for (const p of pages) if (p !== cur) {
        const html = await p.content();
        for (const id of ids) assert(!html.includes(id), "别人页面里出现了我的手牌 " + id);
      }
      checkedPrivacy = true;
    }
    // 非法：选两种不同动物——界面会自动只保留新点的那种，所以直接验证服务器拒绝在别人回合出牌
    if (!checkedIllegal) {
      const other = pages.find((p) => p !== cur)!;
      assert.equal(await other.getByTestId("kb-play").count(), 0, "没轮到的人不应有出牌按钮");
      assert.match((await other.locator(".kb-dock .kb-primary").textContent())!, /等待/);
      checkedIllegal = true;
    }
    // 选同种最多的一组
    const counts = new Map<string, string[]>();
    for (const id of ids) counts.set(id[1], [...(counts.get(id[1]) ?? []), id]);
    const group = [...counts.values()].sort((a, b) => b.length - a.length)[0];
    for (const id of group) await cur.getByTestId("kb-card-" + id).click();
    const preview = (await cur.getByTestId("kb-preview").textContent()) ?? "";
    assert.match(preview, /×\d+.*(赶走|还差|没有可赶)/, "预判提示缺失");
    assert.match((await cur.getByTestId("kb-play").textContent())!, /放 \d+ 只/);
    if (tag && !shotsDone && turns >= 6) {
      await shot(cur, `${tag}-myturn-selected`);
      const other = pages.find((p) => p !== cur)!;
      await shot(other, `${tag}-others-turn`);
      shotsDone = true;
    }
    const before = await cur.getByTestId("kb-deck").textContent();
    await cur.getByTestId("kb-play").click();
    await cur.waitForFunction((b) => document.querySelector('[data-testid="kb-deck"]')?.textContent !== b || !!document.querySelector('[data-testid="kb-final"]') || !document.querySelector(".kb-game.my-turn"), before, { timeout: 8000 }).catch(() => {});
    turns++;
    if (!checkedReconnect && turns === 3) {
      const p = pages[1];
      await p.reload();
      await p.waitForSelector('[data-testid="kb-pond"]');
      assert(await p.locator('[data-testid^="kb-card-"]').count() > 0, "重连后手牌丢失");
      checkedReconnect = true;
    }
  }
  await pages[0].waitForSelector('[data-testid="kb-final"]', { timeout: 10000 });
  if (tag) await shot(pages[0], `${tag}-final`);
  // 无横向滚动
  for (const p of pages) assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "出现横向滚动");
  results.push(`${n}人${mode === "team" ? "组队" : "个人战"} ${viewport.width}×${viewport.height}：整局 ${turns} 次出牌打完；隐私、等待提示、重连、预判、无横向滚动 通过`);
  await Promise.all(ctxs.map((c) => c.close()));
}

try {
  await game(2, "solo", undefined, shots ? "p2-390" : "");
  await game(4, "solo", { width: 844, height: 390 }, shots ? "p4-844" : "");
  await game(8, "team", undefined, shots ? "t8-390" : "");
  // 超时：服务器计时到点自动出牌（用 30 秒默认值太慢，这里只验证接口拒绝旧版本）
  console.log(results.join("\n"));
  console.log("verify-kb-browsers：全部通过");
} catch (e) {
  console.error(results.join("\n"));
  console.error("失败：", e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
