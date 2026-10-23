// 请留遗言 8 人局：名犬保护提示、两名杀手悄悄话与同伴标记、连环杀手两名被害者按顺序各自留遗言。
import { chromium, type Page } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
const base = process.env.DM_URL ?? "http://127.0.0.1:3184";
const out = process.env.DM_SCREEN_DIR ?? "output/dm-teamplay";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROME,
});
const pages: Page[] = [];
for (let i = 0; i < 8; i++) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  pages.push(await ctx.newPage());
}
const errors: string[] = [];
pages.forEach((p) =>
  p.on("pageerror", (e) => errors.push(e.message + " @ " + (e.stack ?? "").split("\n").slice(1, 4).join(" | "))),
);
const st = (p: Page) =>
  p.evaluate(() => JSON.parse((window as any).render_game_to_text()));
const phase = (p: Page, ph: string) =>
  p.waitForFunction(
    (ph) =>
      typeof (window as any).render_game_to_text === "function" &&
      JSON.parse((window as any).render_game_to_text()).view?.phase === ph,
    ph,
  );
const shot = (p: Page, name: string, delay = 600) =>
  p.waitForTimeout(delay).then(() => p.screenshot({ path: out + "/" + name + ".png" }));
try {
  const host = pages[0];
  await host.goto(base + "/?game=dm");
  await host.getByTestId("dm-create").click();
  await host.getByLabel("你的昵称").fill("朋友1");
  await host.getByRole("button", { name: "入座", exact: true }).click();
  await host.getByTestId("dm-ready").waitFor();
  await host.getByLabel("本局人数").selectOption("8");
  await host.getByTestId("dm-seat-8").waitFor();
  const code = (await st(host)).code;
  for (let i = 1; i < 8; i++) {
    await pages[i].goto(base + "/?game=dm&room=" + code);
    await pages[i].getByLabel("你的昵称").fill("朋友" + (i + 1));
    await pages[i].getByRole("button", { name: "入座", exact: true }).click();
    await pages[i].getByTestId("dm-ready").waitFor();
  }
  await host.waitForFunction(
    () => JSON.parse((window as any).render_game_to_text()).seats?.length === 8,
  );
  await host.getByLabel("杀手 2", { exact: true }).selectOption("serial-killer");
  await host.waitForTimeout(400);
  await host.getByLabel("无罪 1", { exact: true }).selectOption("wonder-dog");
  await host.waitForTimeout(400);
  for (const p of pages) await p.getByTestId("dm-ready").click();
  await host.getByTestId("dm-start").click();
  await phase(host, "NIGHT_PREPARATION");
  let views = await Promise.all(pages.map(st));
  const idx = (role: string) => views.findIndex((s) => s.view.me.roleId === role);
  const seatOf = (i: number) =>
    views[i].view.players.find((p: any) => p.id === views[i].view.me.id).seat;
  const dog = idx("wonder-dog"),
    k1 = idx("killer"),
    k2 = idx("serial-killer");
  const civs = views
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s.view.me.roleId === "civilian")
    .map(([, i]) => i);
  // 名犬：中央横幅 + 底部「保护 X号」+ 盾牌
  await pages[dog].getByText("🐕 名犬", { exact: true }).waitFor();
  await pages[dog].getByTestId("dm-seat-" + seatOf(civs[0])).click();
  await pages[dog]
    .getByTestId("dm-prepare")
    .getByText("保护 " + seatOf(civs[0]) + "号")
    .waitFor();
  await shot(pages[dog], "1-dog-protect", 200);
  await pages[dog].getByTestId("dm-prepare").click();
  await phase(pages[k1], "KILLER_SELECTION");
  // 杀手悄悄话：两人都能看到；平民看不到
  const [a, b] = [civs[1], civs[2]].map(seatOf);
  await pages[k1].getByTestId("dm-chat").waitFor();
  assert.equal(await pages[civs[1]].getByTestId("dm-chat").count(), 0);
  await pages[k1].getByLabel("悄悄话内容").fill(`选${a}号和${b}号`);
  await pages[k1].getByTestId("dm-chat-send").click();
  await pages[k2].getByTestId("dm-chat").getByText(`选${a}号和${b}号`).waitFor();
  await pages[k1].getByTestId("dm-seat-" + a).click();
  await pages[k1].getByTestId("dm-seat-" + b).click();
  await pages[k1].getByTestId("dm-kill").click();
  // 同伴标记出现在座位上
  await pages[k2]
    .getByTestId("dm-seat-" + a)
    .locator(".dm-mate-pick")
    .waitFor();
  await pages[k2].getByLabel("悄悄话内容").fill("好");
  await pages[k2].getByTestId("dm-chat-send").click();
  await pages[k1].getByTestId("dm-chat").getByText("你还能说 1 句", { exact: false }).waitFor();
  await shot(pages[k2], "2-killer-chat-marks", 300);
  // 第二名杀手按 b、a 顺序提交 → b 先留遗言
  await pages[k2].getByTestId("dm-seat-" + b).click();
  await pages[k2].getByTestId("dm-seat-" + a).click();
  await pages[k2].getByTestId("dm-kill").click();
  await phase(pages[civs[2]], "VICTIM_EVIDENCE");
  views = await Promise.all(pages.map(st));
  assert.equal(views[civs[2]].view.active, true);
  assert.equal(views[civs[1]].view.active, false);
  assert.deepEqual(views[civs[2]].view.evidenceTurn.step, 1);
  assert.equal(await pages[civs[2]].getByTestId("dm-chat").count(), 0);
  await pages[civs[2]].locator(".dm-card-no").first().waitFor();
  await pages[civs[2]].locator("[data-card]").nth(3).click();
  await shot(pages[civs[2]], "3-first-victim-numbered", 300);
  await pages[civs[2]].getByTestId("dm-evidence-confirm").click();
  await pages[civs[1]].waitForFunction(
    () => JSON.parse((window as any).render_game_to_text()).view.active === true,
  );
  views = await Promise.all(pages.map(st));
  assert.equal(views[civs[1]].view.evidenceTurn.step, 2);
  await pages[civs[1]].locator("[data-card]").nth(0).click();
  await pages[civs[1]].getByTestId("dm-evidence-confirm").click();
  // 假遗言阶段：悄悄话额度重置
  await phase(pages[k1], "KILLER_FAKE_EVIDENCE");
  await pages[k1].getByTestId("dm-chat").getByText("你还能说 2 句", { exact: false }).waitFor();
  for (const k of [k1, k2]) {
    await pages[k].locator("[data-card]").nth(0).click();
    await pages[k].locator("[data-card]").nth(1).click();
    await pages[k].getByTestId("dm-evidence-confirm").click();
  }
  await Promise.all(pages.map((p) => phase(p, "INVESTIGATION")));
  const s = await st(host);
  assert.equal(s.view.history[0].cards.length, 4);
  for (let i = 0; i < 8; i++) {
    const w = await pages[i].evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    assert(w, "横向溢出 " + i);
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("DM teamplay PASS", code);
} finally {
  await browser.close();
}
