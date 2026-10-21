import { chromium, type Page } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertUiShot } from "./screenshot-check.ts";
const base = process.env.DM_URL ?? "http://127.0.0.1:3184";
const out = process.env.DM_SCREEN_DIR ?? "docs/dying-message/screens";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const contexts = await Promise.all(
  Array.from({ length: 4 }, () =>
    browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
  ),
);
const pages = await Promise.all(contexts.map((c) => c.newPage()));
const errors: string[] = [];
pages.forEach((p) => {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
});
const state = (p: Page) =>
  p.evaluate(() => JSON.parse((window as any).render_game_to_text()));
const wait = async (p: Page, phase: string) =>
  p.waitForFunction((phase) => {
    if (typeof (window as any).render_game_to_text !== "function") return false;
    const s = JSON.parse((window as any).render_game_to_text());
    return s.view?.phase === phase;
  }, phase);
const shot = async (p: Page, name: string) =>
  assertUiShot(p, out + "/" + name + ".png");
try {
  await pages[0].goto(base);
  await pages[0].getByTestId("open-dm").click();
  await pages[0].getByTestId("dm-create").click();
  await pages[0].getByLabel("你的昵称").fill("朋友1");
  await pages[0].getByRole("button", { name: "入座", exact: true }).click();
  await pages[0].getByTestId("dm-ready").waitFor();
  const code = (await state(pages[0])).code;
  await pages[0].getByLabel("本局人数").selectOption("10");
  await pages[0].getByTestId("dm-seat-10").waitFor();
  await shot(pages[0], "lobby-10-seats");
  await pages[0].getByLabel("本局人数").selectOption("4");
  for (let i = 1; i < 4; i++) {
    await pages[i].goto(base + "/?game=dm&room=" + code);
    await pages[i].getByLabel("你的昵称").fill("朋友" + (i + 1));
    await pages[i].getByRole("button", { name: "入座", exact: true }).click();
    await pages[i].getByTestId("dm-ready").waitFor();
  }
  await pages[0].getByText("调整本局角色组合", { exact: true }).click();
  await pages[0]
    .getByLabel("角色卡 2", { exact: true })
    .selectOption("private-detective");
  await pages[0]
    .getByRole("button", { name: "保存角色组合", exact: true })
    .click();
  await pages[0].getByText("当前角色：杀手、私家侦探、市民、市民").waitFor();
  for (const p of pages) await p.getByTestId("dm-ready").click();
  await pages[0].getByTestId("dm-start").click();
  await Promise.all(pages.map((p) => wait(p, "KILLER_SELECTION")));
  let views = await Promise.all(pages.map(state));
  const killer = views.findIndex((s) => s.view.me.roleId === "killer"),
    detective = views.findIndex(
      (s) => s.view.me.roleId === "private-detective",
    ),
    victim = views.findIndex((s) => s.view.me.roleId === "civilian");
  for (const s of views)
    assert.equal(s.view.players.filter((p: any) => p.roleId).length, 1);
  await pages[killer]
    .getByRole("button", { name: "查看我的秘密角色", exact: true })
    .click();
  await shot(pages[killer], "killer-roundtable");
  const victimSeat = views[victim].view.players.find(
    (p: any) => p.id === views[victim].view.me.id,
  ).seat;
  await pages[killer].getByTestId("dm-seat-" + victimSeat).click();
  await pages[killer].getByTestId("dm-kill").click();
  await wait(pages[victim], "VICTIM_EVIDENCE");
  await pages[victim].getByTestId("dm-killers").waitFor();
  assert((await state(pages[victim])).view.killers.length === 1);
  assert((await state(pages[detective])).view.killers.length === 0);
  await shot(pages[victim], "victim-sees-killer");
  await pages[victim].locator("[data-card]").first().click();
  await pages[victim].getByTestId("dm-evidence-confirm").click();
  await wait(pages[detective], "SPECIAL_INFORMATION");
  await pages[detective].getByTestId("dm-info-ack").click();
  await wait(pages[killer], "KILLER_FAKE_EVIDENCE");
  await pages[killer].locator("[data-card]").nth(0).click();
  await pages[killer].locator("[data-card]").nth(1).click();
  await pages[killer].getByTestId("dm-evidence-confirm").click();
  await Promise.all(pages.map((p) => wait(p, "INVESTIGATION")));
  views = await Promise.all(pages.map(state));
  for (const s of views) {
    assert.equal(s.view.history[0].cards.length, 3);
    assert(!("truth" in s.view.history[0]));
  }
  const survivor = pages.find((_, i) => i !== victim)!;
  await survivor.reload();
  await wait(survivor, "INVESTIGATION");
  await shot(survivor, "speech-and-evidence");
  await survivor.getByLabel("放大公开遗言 1", { exact: true }).click();
  await survivor.getByRole("dialog").waitFor();
  await shot(survivor, "evidence-zoom");
  await survivor.getByRole("button", { name: "关闭大图", exact: true }).click();
  await survivor.getByRole("dialog").waitFor({ state: "hidden" });
  const order: number[] = [];
  for (let i = 0; i < 3; i++) {
    const v = (await state(survivor)).view;
    const speaker = pages.findIndex(
      (_, j) => views[j].view.me.id === v.speaker,
    );
    order.push(
      views[speaker].view.players.find((p: any) => p.id === v.speaker).seat,
    );
    await pages[speaker].getByTestId("dm-speech-end").click();
    if (i < 2)
      await survivor.waitForFunction(
        (id) =>
          JSON.parse((window as any).render_game_to_text()).view.speaker !== id,
        v.speaker,
      );
  }
  assert.deepEqual(
    order,
    [1, 2, 3, 4].filter((n) => n !== victimSeat),
  );
  await Promise.all(pages.map((p) => wait(p, "FIRST_VOTE")));
  const killerSeat = views[killer].view.players.find(
    (p: any) => p.id === views[killer].view.me.id,
  ).seat;
  for (let i = 0; i < 4; i++) {
    if (i === victim) continue;
    await pages[i].getByTestId("dm-seat-" + killerSeat).click();
    await pages[i].getByTestId("dm-vote").click();
  }
  await wait(pages[killer], "DEFENSE");
  await pages[killer].getByTestId("dm-defense-end").click();
  await Promise.all(pages.map((p) => wait(p, "SECOND_VOTE")));
  for (let i = 0; i < 4; i++) {
    if (i === victim) continue;
    await pages[i].getByTestId("dm-seat-" + killerSeat).click();
    await pages[i].getByTestId("dm-vote").click();
  }
  await Promise.all(pages.map((p) => wait(p, "GAME_OVER")));
  await shot(pages[0], "innocent-victory");
  assert.equal((await state(pages[0])).view.winner, "INNOCENT");
  for (const p of pages)
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  await pages[0].getByTestId("dm-restart").click();
  await pages[0].getByTestId("dm-ready").waitFor();
  assert.equal((await state(pages[0])).view, null);
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(
    out + "/validation.json",
    JSON.stringify(
      {
        pass: true,
        players: 4,
        code,
        roles: "random, host configured detective",
        speechOrder: order,
        refreshRestored: true,
        privacy: true,
        twoVotes: true,
        winner: "INNOCENT",
        restart: true,
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("DM browser full-game PASS " + code);
} finally {
  await browser.close();
}
