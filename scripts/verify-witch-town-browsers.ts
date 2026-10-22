/**
 * Full-game phone-browser check for 女巫镇.
 *   WT_URL=http://127.0.0.1:3420 WT_PLAYERS=4 PW_CHROME=/path/to/chromium npx tsx scripts/verify-witch-town-browsers.ts
 * N phone-sized pages create/join one room, ready up, then a simple bot plays every
 * prompt through the real UI until the game ends. Also does one reload and one
 * offline/online cycle mid-game, collects console errors and per-phase screenshots.
 */
import { chromium, type Page, type Browser } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const BASE = process.env.WT_URL ?? "http://127.0.0.1:3420";
const N = Number(process.env.WT_PLAYERS ?? 4);
const SHOTS = process.env.WT_SHOTS ?? `docs/witch-town/validation/screens/live-${N}p`;
const MAX_MS = Number(process.env.WT_MAX_MS ?? 15 * 60_000);
const VIEW = { width: Number(process.env.WT_W ?? 390), height: Number(process.env.WT_H ?? 844) };
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const errors: string[] = [];
const shot = new Set<string>();
const overflow: string[] = [];

async function snapPhase(page: Page, i: number) {
  const key = await page.evaluate(() => {
    const w = document.querySelector("[data-testid=wt-world]") as HTMLElement | null;
    const h = document.querySelector("[data-testid=wt-hint]")?.textContent ?? "";
    return `${w?.dataset.phase}|${h.replace(/[0-9０-９]+号\S*/g, "").slice(0, 14)}`;
  });
  const bad = await page.evaluate(() => {
    const boxes = ".wt-entry-card,.wt-personal,.wt-dock,.wt-modal,.wt-seat,.wt-top";
    return [...document.querySelectorAll(".wt-world *")].filter(e => {
      if ((e as HTMLElement).closest(".wt-fly,.wt-bump,.wt-confetti,.wt-smoke-fx,.wt-phase-banner,.wt-fx-black,.wt-fx-reveal,.wt-table-wood")) return false;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
      if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) return true;
      const box = e.parentElement?.closest(boxes) as HTMLElement | null; if (!box || getComputedStyle(box).overflow !== "visible") return false;
      const b = box.getBoundingClientRect(); return r.right > b.right + 2 || r.left < b.left - 2 || r.bottom > b.bottom + 2;
    }).map(e => `${(e as HTMLElement).className || e.tagName}`.slice(0, 50)).slice(0, 5);
  });
  if (bad.length) overflow.push(`${key}: ${bad.join(" | ")}`);
  if (shot.has(key) || shot.size > 60) return;
  shot.add(key);
  await page.screenshot({ path: `${SHOTS}/${String(shot.size).padStart(2, "0")}-p${i + 1}-${key.replace(/[^a-zA-Z0-9一-龥]+/g, "_")}.png` });
}

const fxShot = new Set<string>();
async function snapFx(page: Page, i: number) {
  for (const [sel, name] of [[".wt-fx-reveal.is-witch", "fx-witch"], [".wt-fx-reveal:not(.is-witch)", "fx-reveal"], [".wt-fx-black", "fx-black"], [".wt-fly", "fx-fly"]] as const)
    if (!fxShot.has(name) && await page.locator(sel).count()) { fxShot.add(name); await page.screenshot({ path: `${SHOTS}/${name}-p${i + 1}.png` }); }
}
async function click(page: Page, sel: string) { const el = page.locator(sel).first(); if (await el.count() && await el.isEnabled().catch(() => false)) { await el.click({ timeout: 2000 }).catch(() => {}); return true; } return false; }

const stuck = new Map<number, number>();
async function step(page: Page, i: number): Promise<"over" | "acted" | "idle"> {
  const phase = await page.getAttribute("[data-testid=wt-world]", "data-phase").catch(() => null);
  if (phase === "over") return "over";
  const active = await page.locator(".wt-dock-active").count();
  if (!active) {
    if (Math.random() < .03 && await click(page, "[data-testid=wt-hourglass]")) return "acted";
    return "idle";
  }
  if (await click(page, "[data-testid=wt-follow]")) return "acted"; // witches converge on an ally's target
  // choices that need a card / tile first
  const picks = page.locator("[data-testid^=wt-pick-]:not([aria-pressed=true])");
  if (await picks.count() && !(await page.locator("[data-testid^=wt-pick-][aria-pressed=true]").count())) { await picks.nth(Math.floor(Math.random() * await picks.count())).click().catch(() => {}); return "acted"; }
  const pickable = page.locator(".wt-seat.wt-pickable:not(.wt-selected)");
  const selected = await page.locator(".wt-seat.wt-selected").count();
  const hint = (await page.textContent("[data-testid=wt-hint]").catch(() => "")) ?? "";
  if (await pickable.count() && (selected === 0 || /接收者/.test(hint))) { await pickable.nth(Math.floor(Math.random() * await pickable.count())).click().catch(() => {}); return "acted"; }
  const panelCards = page.locator(".wt-event-panel .wt-loot-cards button:not([aria-pressed=true])");
  if (await panelCards.count() && !(await page.locator(".wt-event-panel .wt-loot-cards button[aria-pressed=true]").count())) { await panelCards.first().click().catch(() => {}); return "acted"; }
  if (await click(page, "[data-testid=wt-end]")) return "acted";
  if (await page.locator("[data-testid=wt-draw]").count()) {
    const hand = page.locator(".wt-hand .wt-card:not([data-kind=conspiracy]):not([data-kind=night])");
    if (await hand.count() && Math.random() < .6) {
      await hand.nth(Math.floor(Math.random() * await hand.count())).click().catch(() => {});
      if (await click(page, "[data-testid=wt-use-card]")) return "acted";
      await page.keyboard.press("Escape").catch(() => {});
      await click(page, ".wt-sheet-close");
    }
    await click(page, "[data-testid=wt-draw]"); return "acted";
  }
  if (await page.locator("[data-testid=wt-ability-yes]").count()) { await click(page, Math.random() < .5 ? "[data-testid=wt-ability-yes]" : ".wt-dock-buttons button:not(.wt-primary)"); return "acted"; }
  if (await page.locator("[data-testid=wt-confess]").count() && Math.random() < .5) { return "idle"; } // sometimes don't confess
  const primary = page.locator(".wt-dock-buttons .wt-primary:not([disabled])");
  if (await primary.count()) { await primary.first().click().catch(() => {}); stuck.set(i, 0); return "acted"; }
  const n = (stuck.get(i) ?? 0) + 1; stuck.set(i, n);
  if (n > 6) { await click(page, ".wt-dock-buttons button:not(.wt-primary)"); stuck.set(i, 0); } // cancel a dead-end selection
  return "idle";
}

async function main() {
  const browser: Browser = await chromium.launch({ executablePath: process.env.PW_CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const pages: Page[] = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on("console", m => { if (m.type() === "error") errors.push(`p${i + 1}: ${m.text()}`); });
    p.on("pageerror", e => errors.push(`p${i + 1}: ${e.message}`));
    pages.push(p);
  }
  const host = pages[0];
  await host.goto(`${BASE}/?game=wt`);
  await host.fill("[data-testid=wt-name]", "玩家1");
  await host.locator(".wt-seg button", { hasText: new RegExp(`^${N}$`) }).click();
  await host.click("[data-testid=wt-create]");
  await host.waitForURL(/room=/);
  const room = new URL(host.url()).searchParams.get("room")!;
  await host.screenshot({ path: `${SHOTS}/00-lobby-host.png` });
  for (let i = 1; i < N; i++) {
    await pages[i].goto(`${BASE}/?game=wt&room=${room}`);
    await pages[i].waitForSelector("[data-testid=wt-world][data-phase=lobby]");
    await pages[i].fill("[data-testid=wt-name]", `玩家${i + 1}`);
    await pages[i].click("[data-testid=wt-claim]");
    await pages[i].waitForSelector("[data-testid=wt-ready]", { timeout: 20_000 }).catch(async () => { await pages[i].screenshot({ path: `${SHOTS}/join-fail-p${i + 1}.png` }); console.log("join retry", i + 1, (await pages[i].textContent("body"))?.slice(0, 200)); await pages[i].click("[data-testid=wt-claim]"); await pages[i].waitForSelector("[data-testid=wt-ready]", { timeout: 30_000 }); });
  }
  for (const p of pages) await p.click("[data-testid=wt-ready]");
  await host.waitForSelector("[data-testid=wt-start]:not([disabled])");
  await host.screenshot({ path: `${SHOTS}/00-lobby-full.png` });
  await host.click("[data-testid=wt-start]");
  const t0 = Date.now();
  let reloaded = false, offlined = false, turns = 0;
  while (Date.now() - t0 < MAX_MS) {
    let over = false;
    for (let i = 0; i < N; i++) {
      const r = await step(pages[i], i);
      if (r === "over") over = true;
      if (r === "acted") { turns++; await snapPhase(pages[i], i); }
      await snapFx(pages[i], i);
    }
    if (over) break;
    if (!reloaded && turns > 25) { reloaded = true; await pages[1].reload(); await pages[1].waitForSelector("[data-testid=wt-world][data-phase]"); }
    if (!offlined && turns > 45) { offlined = true; const c = pages[2 % N].context(); await c.setOffline(true); await new Promise(r => setTimeout(r, 2500)); await c.setOffline(false); }
    await new Promise(r => setTimeout(r, 120));
  }
  const phase = await host.getAttribute("[data-testid=wt-world]", "data-phase");
  await new Promise(r => setTimeout(r, 3500));
  for (let i = 0; i < N; i++) await pages[i].screenshot({ path: `${SHOTS}/99-result-p${i + 1}.png` });
  // privacy probe: no page's DOM shows another seat's hidden tryal kinds before the end is checked by protocol tests; here we only confirm the game finished.
  const summary = { players: N, room, finished: phase === "over", actions: turns, ms: Date.now() - t0, reloaded, offlined, overflow: [...new Set(overflow)].slice(0, 30), consoleErrors: errors.filter(e => !/WebSocket|ERR_INTERNET_DISCONNECTED|net::|AudioContext/.test(e)) };
  writeFileSync(`${SHOTS}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  await browser.close();
  if (!summary.finished || summary.consoleErrors.length || summary.overflow.length) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
