// Four isolated identities; actions use the real UI, secret choices are read only from captains' DOM.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, type Page } from "playwright";
import { assertUiShot } from "./screenshot-check.ts";

const base = "http://127.0.0.1:3341";
const out = "docs/codenames/screens";
mkdirSync(out, { recursive: true });
const data = mkdtempSync(join(tmpdir(), "cn-ui-"));
const server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], {
  env: { ...process.env, PORT: "3341", HOST: "127.0.0.1", CN_TIMING: "20,30,10",
    DBD_DATA_DIR: join(data, "dbd"), MA_DATA_DIR: join(data, "ma"), CN_DATA_DIR: join(data, "cn") },
  stdio: ["ignore", "ignore", "inherit"],
});
const browser = await chromium.launch();
const errors: string[] = [];
const evidence: unknown[] = [];
const pages: Page[] = [];
const wait = async (fn: () => Promise<boolean>, ms = 8000) => {
  const end = Date.now() + ms;
  while (!(await fn())) { assert.ok(Date.now() < end, "UI condition timed out"); await new Promise(r => setTimeout(r, 50)); }
};
async function shot(p: Page, name: string) {
  await p.evaluate(() => scrollTo(0, 0));
  evidence.push({ name, ...await assertUiShot(p, `${out}/${name}.png`) });
}
async function click(p: Page, id: string) { await p.getByTestId(id).click(); }
async function status() { return (await pages[0].getByTestId("cn-status").innerText()).startsWith("红") ? "red" : "blue"; }
async function captain(team: string) {
  for (const p of pages) if ((await p.getByTestId("cn-role").innerText()).includes(`你是${team === "red" ? "红" : "蓝"}队队长`)) return p;
  throw Error("Missing captain");
}
async function operative(team: string) {
  for (const p of pages) if ((await p.getByTestId("cn-role").innerText()).includes(`你是${team === "red" ? "红" : "蓝"}队猜词`)) return p;
  throw Error("Missing operative");
}
async function privacy() {
  for (const p of pages) {
    if (!(await p.getByTestId("cn-role").innerText()).includes("队长："))
      assert.equal(await p.locator('.cn-card[data-revealed="0"][data-role]:not([data-role=""])').count(), 0);
    assert.equal(await p.locator(".cn-card").count(), 25);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Horizontal overflow");
  }
}
async function clue(n: string) {
  const t = await status(); const p = await captain(t);
  await p.getByTestId("cn-clue-input").fill("联络暗语");
  await click(p, "cn-num-" + n); await click(p, "cn-send-clue");
  await (await operative(t)).getByTestId("cn-reveal").waitFor();
  await (await operative(t)).locator(".cn-flash").waitFor();
  return t;
}
async function reveal(team: string, role: string) {
  const cap = await captain(team), op = await operative(team);
  const card = cap.locator(`.cn-card[data-revealed="0"][data-role="${role}"]`).first();
  const id = (await card.getAttribute("data-testid"))!;
  await click(op, id);
  await wait(async () => (await op.getByTestId(id).locator(".cn-marks").count()) === 1);
  assert.equal(await op.getByTestId(id).getAttribute("data-revealed"), "0", "Mark must not reveal");
  await click(op, "cn-reveal");
  await wait(async () => (await op.getByTestId(id).getAttribute("data-revealed")) === "1");
}
try {
  await wait(async () => { try { return (await fetch(base + "/api/health")).ok; } catch { return false; } }, 15000);
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext({ viewport: i < 2 ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
    const p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.message)); pages.push(p);
  }
  await pages[0].goto(base + "/"); await click(pages[0], "open-cn"); await click(pages[0], "cn-create");
  await pages[0].waitForURL(/room=/); const url = pages[0].url();
  for (let i = 0; i < 4; i++) {
    const p = pages[i]; if (i) await p.goto(url);
    await p.getByTestId("cn-name").fill(["红队长", "红队员", "蓝队长", "蓝队员"][i]);
    await click(p, "cn-claim"); await p.getByTestId("cn-start").or(p.getByText("等房主开始游戏…")).waitFor();
    await click(p, "cn-join-" + (i < 2 ? "red" : "blue"));
  }
  await click(pages[0], "cn-mode-pick");
  await click(pages[0], "cn-captain-red"); await click(pages[2], "cn-captain-blue");
  await wait(async () => await pages[0].getByTestId("cn-start").isEnabled());
  await click(pages[0], "cn-start");
  for (const p of pages) await p.getByTestId("cn-board").waitFor();
  await privacy();
  // Four-character words and a maximum-length clue must fit on a narrow screen.
  evidence.push(await pages[1].evaluate(() => {
    const el = document.querySelector('.cn-word')!;
    const original = el.textContent;
    el.textContent = '圣诞老人';
    const text = el.getBoundingClientRect(), card = el.parentElement!.getBoundingClientRect();
    const fits = text.left >= card.left && text.right <= card.right;
    el.textContent = original;
    return { fourCharacterWordFits: fits };
  }));
  assert.ok((evidence.at(-1) as { fourCharacterWordFits: boolean }).fourCharacterWordFits, 'Four-character word clipped');
  for (let i = 0; i < 4; i++) await shot(pages[i], ["red-captain", "red-operative", "blue-captain", "blue-operative"][i]);
  const before = await pages[1].getByTestId("cn-role").innerText();
  await pages[1].reload(); await pages[1].getByTestId("cn-role").waitFor();
  assert.equal(await pages[1].getByTestId("cn-role").innerText(), before);
  let t = await clue("1"); const op = await operative(t);
  assert.ok(await op.getByTestId("cn-end-turn").isDisabled());
  await shot(op, "clue-flash");
  await click(op, "cn-extra"); await click(op, "cn-extra");
  await wait(async () => await op.getByTestId("cn-extra").isDisabled());
  await reveal(t, t); await reveal(t, t);
  await wait(async () => (await status()) !== t);
  t = await clue("0");
  assert.match(await (await operative(t)).getByTestId("cn-guesses-left").innerText(), /不限/);
  await reveal(t, t); await click(await operative(t), "cn-end-turn");
  await wait(async () => (await status()) !== t);
  // Observe genuine countdown and server-driven clue timeout.
  const timed = await status();
  await pages[0].locator(".cn-timer.hurry").waitFor({ timeout: 22000 });
  await shot(pages[0], "last-ten-seconds");
  await wait(async () => (await status()) !== timed, 16000);
  t = await clue("inf"); await privacy(); await reveal(t, "assassin");
  for (const p of pages) await p.getByTestId("cn-result").waitFor();
  await shot(pages[1], "result"); await click(pages[0], "cn-next");
  await pages[0].getByTestId("cn-mode-random").waitFor(); await click(pages[0], "cn-mode-random");
  await click(pages[0], "cn-start");
  for (const p of pages) await p.getByTestId("cn-board").waitFor();
  await privacy(); t = await clue("inf");
  const goals = await (await captain(t)).locator(`.cn-card[data-role="${t}"]`).count();
  for (let i = 0; i < goals; i++) await reveal(t, t);
  for (const p of pages) await p.getByTestId("cn-result").waitFor();
  await shot(pages[1], "random-captain-win");
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log("CN_BROWSERS_PASS", JSON.stringify({ contexts: 4, phones: 2, games: 2, goals, privacy: true, refresh: true, timeout: true }));
} finally { await browser.close(); server.kill(); }
