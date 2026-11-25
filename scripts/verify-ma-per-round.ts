// 逐轮选图浏览器验收：两部手机，房主开启「每场开始前再选」，开局后选图，再选角，确认比赛地图
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const PORT = 3341, BASE = `http://127.0.0.1:${PORT}`, out = "output/per-round";
const data = mkdtempSync(join(tmpdir(), "ma-pr-"));
const server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DBD_DATA_DIR: join(data, "dbd"), MA_DATA_DIR: join(data, "ma") },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; ; i++) { try { if ((await fetch(`${BASE}/api/info`)).ok) break; } catch {} if (i > 300) throw new Error("服务器未启动"); await new Promise((r) => setTimeout(r, 50)); }
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const errors: string[] = [];
const phone = async () => { const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
try {
  const host = await phone();
  await host.goto(BASE + "/?view=old-hall");
  await host.getByTestId("open-ma").click();
  await host.getByTestId("ma-create").click();
  await host.waitForURL(/room=/);
  const guest = await phone();
  await guest.goto(host.url());
  for (const [p, n] of [[host, "房主"], [guest, "客人"]] as const) {
    await p.getByTestId("ma-name").fill(n); await p.getByTestId("ma-claim").click(); await p.getByTestId("ma-code").waitFor();
  }
  assert.equal(await guest.getByTestId("ma-track-mode-perRound").isDisabled(), true, "客人不能改选图方式");
  await host.getByTestId("ma-track-mode-perRound").click();
  await guest.locator('[data-testid="ma-track-mode-perRound"][aria-checked="true"]').waitFor();
  await host.getByTestId("ma-deal-random").click();
  await host.getByTestId("ma-track-mode-perRound").scrollIntoViewIfNeeded();
  await host.screenshot({ path: `${out}/lobby-phone.png` });
  await host.getByTestId("ma-start").click();
  await host.getByTestId("ma-track-pick").waitFor();
  await guest.getByTestId("ma-track-pick").waitFor();
  assert.equal(await guest.getByTestId("ma-pick-track-wild").isDisabled(), true, "客人只能看");
  assert.equal(await host.getByTestId("ma-pick-track-twisty-twirl").isDisabled(), true, "未验收地图仍锁定");
  assert.equal(await guest.locator(".ma-cards").count(), 0, "锁图前不能选角");
  await host.screenshot({ path: `${out}/pick-host-phone.png` });
  await guest.screenshot({ path: `${out}/pick-guest-phone.png` });
  await host.getByTestId("ma-pick-track-wild").click();
  for (const p of [host, guest]) {
    await p.locator(".ma-cards").waitFor();
    assert.match(await p.locator(".ma-stage h2").first().innerText(), /第 1 场 · 狂野/);
  }
  await guest.screenshot({ path: `${out}/choose-after-lock-phone.png` });
  for (const p of [host, guest]) await p.getByRole("button", { name: "派它上场" }).first().click();
  await host.locator(".ma-game.phase-race").waitFor({ timeout: 15000 });
  await host.waitForTimeout(1500);
  await host.screenshot({ path: `${out}/race1-phone.png` });
  await host.setViewportSize({ width: 1280, height: 800 });
  assert.deepEqual(errors, []);
  console.log("PER_ROUND_BROWSER_PASS");
} finally { await browser.close(); server.kill(); }
