import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { chromium, type Page } from "playwright";
import { botMove, CHARACTERS, createGame, reduce, type State } from "../packages/menace/src/index.ts";
import type { TARoomFile } from "../apps/server/src/ta-rooms.ts";

const data = mkdtempSync(join(tmpdir(), "menace-flow-"));
const evidence = process.env.TA_FLOW_EVIDENCE ?? join(tmpdir(), "menace-flow-evidence");
mkdirSync(evidence, { recursive: true });
const port = process.env.TA_FLOW_PORT ?? "3195";
const base = `http://127.0.0.1:${port}/?game=ta`;
const token = (seat: number) => `flow-${seat}`;
function save(code: string, state: State, isBot = (_: number) => false) {
  const players = state.players.map((p) => ({ playerId: `p${p.seat}`, name: `船员${p.seat + 1}`, token: token(p.seat), bot: isBot(p.seat) }));
  const room: TARoomFile = { game: "menace", code, stage: "game", hostId: "p0", players, mode: "basic", round: 1,
    seed: 11, lineup: players.map(p => p.playerId), commands: [], snapshot: state, createdAt: new Date().toISOString() };
  writeFileSync(join(data, code + ".json"), JSON.stringify(room));
}
function setup() {
  let s = createGame(4, 11);
  while (s.phase === "setup") {
    const p = s.players.find(player => !player.character && player.choices.length)!;
    s = reduce(s, { t: "choose", seat: p.seat, name: p.choices[0] });
  }
  s.players.forEach((p, i) => { p.agenda = i === 3 ? "butcher" : "loyal"; });
  s.oxygen = 16;
  s.energy = 10;
  return s;
}
const reveal = setup();
reveal.phase = "resolve"; reveal.stage = "reveal"; reveal.resStart = reveal.energy;
reveal.queue = [{ seat: 1, card: { id: 901, type: "basic_repair" } }];
save("LAST", reveal);
const deaths = setup();
deaths.phase = "accuse";
deaths.players[1].wounds = ["flesh", "flesh"];
deaths.players[2].wounds = ["flesh", "flesh"];
save("DEAD", deaths);
const scan = setup();
scan.players[0].character = "cecilia";
assert.ok(scan.players[0].character);
scan.played = [{ seat: 1, card: { id: 902, type: "panic" } }];
save("SCAN", scan);
const rush = setup();
rush.players[0].character = Object.keys(CHARACTERS).find(key => CHARACTERS[key].ab.includes("rush"))!;
rush.players[0].deck[0].type = "basic_repair";
save("RUSH", rush);
const blood = setup();
blood.players[0].character = Object.keys(CHARACTERS).find(key => CHARACTERS[key].ab.includes("bloodwork"))!;
blood.players[1].hand[0].type = "basic_repair";
save("BLOD", blood);
const wound = setup();
wound.players[0].character = Object.keys(CHARACTERS).find(key => CHARACTERS[key].ab.includes("laser_pistol"))!;
wound.woundDeck.unshift("flesh");
save("HURT", wound);
const botReveal = structuredClone(reveal);
botReveal.leader = 1;
botReveal.queue.push({ seat: 0, card: { id: 903, type: "basic_repair" } });
save("GATE", botReveal, seat => seat === 1);
const ending = setup();
ending.phase = "over"; ending.winner = "crew"; ending.winners = [0, 1, 2];
save("ENDS", ending);
save("LOSS", { ...ending, winner: "menace", winners: [3], oxygen: 0 });
let exile = setup();
exile.phase = "vote";
exile.players[3].revealed = true;
for (let seed = 1; seed <= 200; seed++) {
  exile.rng = seed;
  let candidate = exile;
  for (const seat of [0, 1, 2, 3]) candidate = botMove(candidate, seat);
  if (candidate.players[3].exiled) break;
  if (seed === 200) throw new Error("未找到可复现的全人机放逐场景");
}
save("VOTE", exile, () => true);
for (const count of [4, 8]) save(`FULL${count}`, createGame(count, 11), seat => seat !== 0);

const server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], {
  env: { ...process.env, PORT: port, TA_DATA_DIR: data }, stdio: "inherit",
});
const browser = await chromium.launch({ executablePath: process.env.CH || undefined });
try {
  for (let attempt = 0; ; attempt++) {
    if (await fetch(base).then(r => r.ok).catch(() => false)) break;
    if (attempt === 80) throw new Error("服务未启动");
    await wait(250);
  }
  async function open(code: string, seat = 0, blockVideo = false) {
    const page = await browser.newPage({ viewport: { width: 390, height: 640 } });
    await page.addInitScript(({ code, token }) => localStorage.setItem("ta-seat-" + code, token), { code, token: token(seat) });
    if (blockVideo) await page.addInitScript(() => {
      Object.defineProperty(HTMLVideoElement.prototype, "currentTime", { get: () => 0 });
      HTMLVideoElement.prototype.play = () => Promise.reject(new DOMException("拒绝播放", "NotAllowedError"));
    });
    await page.goto(base + "&room=" + code);
    await page.locator(".ta-game").waitFor();
    return page;
  }
  const shot = (page: Page, label: string) => page.screenshot({ path: join(evidence, label + ".png"), animations: "disabled" });
  const button = (page: Page, text: string) => page.getByRole("button", { name: text, exact: true });
  async function playVideo(page: Page, kind: string, label: string, name: string) {
    const overlay = page.locator(`[data-scene="${kind}"]`);
    const video = overlay.locator("video");
    await overlay.getByRole("heading", { name, exact: true }).waitFor();
    assert.equal(await video.evaluate((v: HTMLVideoElement) => v.autoplay && v.muted && v.playsInline && v.hasAttribute("muted") && v.hasAttribute("webkit-playsinline")), true);
    await page.waitForFunction(kind => {
      const v = document.querySelector<HTMLVideoElement>(`[data-scene="${kind}"] video`);
      return v && v.currentTime > 0.1;
    }, kind, { timeout: 5000 });
    await shot(page, label + "-播放中");
    await overlay.getByRole("button", { name: "跳过演出", exact: true }).click();
  }
  async function focused() {
    const last = await open("LAST");
    await last.getByRole("button", { name: /揭示下一张/ }).click();
    await last.locator('[data-scene="reveal"]').getByText("基础维修", { exact: true }).waitFor();
    assert.match(await last.locator(".ta-top b").innerText(), /匿名结算/);
    await shot(last, "01-最后一张牌");
    await button(last, "跳过演出").click();
    const floating = last.getByRole("status").filter({ hasText: "氧气 -1" });
    await floating.getByText("能量 +1", { exact: true }).waitFor();
    assert.equal(await floating.evaluate(element => getComputedStyle(element).pointerEvents), "none");
    await wait(200);
    await last.screenshot({ path: join(evidence, "02-资源结算.png") });
    await button(last, "结束本回合").waitFor();
    await last.close();

    const dead = await open("DEAD");
    await button(dead, "结束本回合").click();
    const resource = dead.locator('[data-scene="resource"]');
    await resource.waitFor();
    await playVideo(dead, "death", "03-第一次阵亡", "船员2 阵亡");
    await playVideo(dead, "death", "04-第二次阵亡", "船员3 阵亡");
    await dead.close();

    const injured = await open("HURT");
    await injured.getByRole("button", { name: /雷射枪/ }).click();
    await button(injured, "船员2").click();
    await injured.locator('[data-scene="resource"]').waitFor();
    await injured.locator('[data-scene="wound"]').getByText("皮肉伤", { exact: true }).waitFor();
    await shot(injured, "04a-受伤抽牌");
    await injured.close();

    const gated = await open("GATE");
    const first = gated.locator('[data-scene="reveal"]');
    await first.waitFor();
    const firstElement = await first.elementHandle();
    await wait(750);
    assert.equal(await firstElement?.evaluate(element => element.isConnected), true);
    const during = JSON.parse(readFileSync(join(data, "GATE.json"), "utf8")) as TARoomFile;
    assert.equal(during.snapshot?.queue.length, 1, "客户端尚未确认时人机提前揭牌");
    assert.match(await gated.locator(".ta-top b").innerText(), /匿名结算/);
    await shot(gated, "04b-人机等待揭示");
    await first.getByRole("button", { name: "跳过演出" }).click();
    await gated.locator('[data-scene="resource"]').waitFor();
    await first.waitFor();
    assert.equal(await firstElement?.evaluate(element => element.isConnected), false);
    await gated.close();

    const scanner = await open("SCAN");
    const observer = await open("SCAN", 1);
    await scanner.locator(".ta-seat.me").click();
    const portrait = scanner.locator(".ta-detail .ta-gc.tall img");
    await portrait.waitFor();
    assert.equal(await portrait.evaluate(image => getComputedStyle(image).objectFit), "contain");
    await shot(scanner, "04c-角色详情立绘");
    await scanner.mouse.click(8, 8);
    await scanner.getByRole("button", { name: /安全检查/ }).click();
    await button(scanner, "船员2").click();
    const privateCard = scanner.locator('[data-scene="private"]');
    await privateCard.getByText("惊慌！", { exact: true }).waitFor();
    assert.equal(await observer.locator('[data-scene="private"]').count(), 0);
    await shot(scanner, "05-安全检查本人");
    await shot(observer, "06-安全检查他人");
    await button(scanner, "关闭牌面").click();
    await scanner.close();
    await observer.close();

    const sprinter = await open("RUSH");
    const other = await open("RUSH", 1);
    await sprinter.getByRole("button", { name: /矫健身手/ }).click();
    await sprinter.locator('[data-scene="private"]').getByText("基础维修", { exact: true }).waitFor();
    await shot(sprinter, "05a-矫健身手本人");
    assert.equal(await other.locator('[data-scene="private"]').count(), 0);
    await button(sprinter, "关闭牌面").click();
    await button(sprinter, "暗置打出").click();
    await sprinter.getByText("矫健身手 · 已将牌暗置打出").waitFor();
    await sprinter.close();
    await other.close();

    const doctor = await open("BLOD");
    const patient = await open("BLOD", 1);
    await doctor.getByRole("button", { name: /抽血检验/ }).click();
    await button(doctor, "船员2").click();
    await patient.locator(".ta-panel.alert .ta-card").first().click();
    for (const viewer of [doctor, patient]) {
      await viewer.locator('[data-scene="private"]').getByText("基础维修", { exact: true }).waitFor();
    }
    await shot(doctor, "05b-抽血公开牌面");
    await doctor.close();
    await patient.close();

    const vote = await open("VOTE");
    await vote.locator('[data-scene="resource"]').waitFor();
    await playVideo(vote, "exile", "07-全人机投票放逐", "船员4 被放逐");
    await vote.close();

    const end = await open("ENDS");
    await playVideo(end, "ending", "08-结局", "船员胜利");
    await button(end, "再来一局").waitFor();
    await shot(end, "09-结算页");
    await end.close();
    const loss = await open("LOSS");
    await playVideo(loss, "ending", "09a-失败结局", "内鬼胜利");
    await button(loss, "再来一局").waitFor();
    await loss.close();
    const blocked = await open("ENDS", 0, true);
    await blocked.getByRole("heading", { name: "船员胜利", exact: true }).waitFor();
    await button(blocked, "再来一局").waitFor();
    await shot(blocked, "10-拒绝播放仍显示结算");
    await blocked.close();
    console.log("指定流程通过");
  }
  async function full(count: number) {
    const page = await open(`FULL${count}`);
    const deadline = Date.now() + 240000;
    let actions = 0;
    try {
      while (Date.now() < deadline) {
        if (await button(page, "再来一局").isVisible()) {
          await shot(page, `整局-${count}人-结算`);
          console.log(`${count} 人整局到达结算页，普通点击 ${actions} 次`);
          return;
        }
        const candidates = [
          page.locator(".ta-sequence-skip"), page.locator(".ta-chars .ta-primary"),
          page.getByRole("button", { name: /揭示下一张/ }), button(page, "结束本回合"), button(page, "弃权"),
          page.locator(".ta-zoom .ta-primary"), page.locator("nav.ta-hand .ta-card"),
          button(page, "抽一张牌"), button(page, "跳过"), page.locator(".ta-panel.alert button"),
        ];
        for (const locator of candidates) {
          const target = locator.first();
          if (!await target.isVisible() || !await target.isEnabled()) continue;
          if (locator === candidates[6] && !await page.getByText("选择一项行动", { exact: true }).isVisible()) continue;
          try { await target.click({ timeout: 800 }); actions++; } catch { /* 人机更新后重新定位 */ }
          break;
        }
        await wait(180);
      }
      throw new Error(`${count} 人整局超时，已点击 ${actions} 次：${await page.locator(".ta-top").innerText()}`);
    } finally {
      await page.close();
    }
  }
  if (process.argv.includes("--full")) await Promise.all([full(4), full(8)]);
  else await focused();
  console.log("截图目录", evidence);
} finally {
  await browser.close();
  server.kill();
}
