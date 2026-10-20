// 魔法运动员联机验收：4 部手机尺寸浏览器从首页进入 → 建房 → 加入 → 选秀 → 四场比赛打完。
// 每一步只点界面上真实的按钮；检查没有页面错误、只有该决定的人看得到选项、四场都结束。
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, type Page } from "playwright";

const PORT = 3331;
const BASE = `http://127.0.0.1:${PORT}`;
const out = "output/ma-browsers";
mkdirSync(out, { recursive: true });
const data = mkdtempSync(join(tmpdir(), "ma-ui-"));
const server: ChildProcess = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DBD_DATA_DIR: join(data, "dbd"), MA_DATA_DIR: join(data, "ma") },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/api/info`)).ok) break;
  } catch {}
  if (i > 200) throw new Error("服务器未启动");
  await new Promise((r) => setTimeout(r, 50));
}

const browser = await chromium.launch();
const errors: string[] = [];
const phone = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
try {
  const host = await phone();
  await host.goto(BASE + "/");
  await host.getByTestId("open-ma").click();
  await host.getByTestId("ma-create").click();
  await host.waitForURL(/room=/);
  const url = host.url();
  const pages: Page[] = [host];
  for (const p of [host, await phone(), await phone(), await phone()]) {
    if (p !== host) {
      await p.goto(url);
      pages.push(p);
    }
    await p.getByTestId("ma-name").fill("选手" + pages.indexOf(p));
    await p.getByTestId("ma-claim").click();
    await p.getByTestId("ma-code").waitFor();
  }
  await host.getByTestId("ma-start").click();
  await host.locator(".ma-order").waitFor();
  await host.screenshot({ path: `${out}/1_选秀.png`, fullPage: true });

  let steps = 0;
  let races = 0;
  for (;;) {
    assert.ok(++steps < 4000, "对局没有在 4000 步内结束");
    if (await host.locator(".ma-final").count()) break;
    let acted = false;
    for (const p of pages) {
      const pick = p.locator('[data-testid^="pick-"]').first();
      const opt = p.locator(".ma-decide.you .ma-options button").first();
      if (await opt.count()) {
        await opt.click();
        acted = true;
      } else if ((await pick.count()) && !(await p.locator(".ma-banner", { hasText: "你派出了" }).count())) {
        await pick.click();
        acted = true;
      } else continue;
      if (process.env.MA_DEBUG) console.log(steps, pages.indexOf(p), Date.now() % 100000);
      await p.waitForTimeout(60);
      break;
    }
    if (!acted) {
      await host.waitForTimeout(150);
      continue;
    }
    // 待决定事项只有决定人看得到选项：别人的面板里不能有选项按钮
    for (const q of pages)
      assert.equal(await q.locator(".ma-decide:not(.you) .ma-options button").count(), 0, "旁人看到了别人的选项");
    const sub = host.locator(".ma-infield-sub");
    const raceNow = (await sub.count()) ? await sub.textContent() : null;
    if (raceNow && !raceNow.includes(String(races))) {
      races++;
      await host.screenshot({ path: `${out}/2_第${races}场.png`, fullPage: true });
    }
  }
  await host.screenshot({ path: `${out}/3_最终成绩.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log("MA_BROWSERS_PASS", JSON.stringify({ players: pages.length, steps, racesSeen: races }));
} finally {
  await browser.close();
  server.kill();
}
