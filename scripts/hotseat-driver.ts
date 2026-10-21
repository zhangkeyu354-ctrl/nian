import type { Page } from "playwright";
import type { Command, CreateOptions } from "../packages/shared/src/types.ts";
import { strict as assert } from "node:assert";
import { tapPhoneCommand } from "./mobile-ui-driver.ts";
import { configurePhoneSetup } from "./setup-driver.ts";
export async function startUI(page: Page, o: CreateOptions) {
  await page.goto((process.env.DBD_UI_BASE ?? "http://127.0.0.1:5173") + "/?hotseat=1");
  if (await page.getByTestId("phone-setup").count()) {
    await configurePhoneSetup(page, o);
    await page.getByTestId("start").tap();
    return;
  }
  await page.getByTestId("map-select").selectOption(o.mapId);
  await page.getByTestId("seed-input").fill(String(o.seed));
  for (let i = 0; i < 4; i++)
    await page.getByTestId("survivor-" + i).selectOption(o.survivors[i]);
  await page.getByTestId("killer-select").selectOption(o.killer);
  await page.getByTestId("start").click();
}
export async function drainUI(
  page: Page,
  onDice?: () => Promise<void>,
  onEffect?: () => Promise<void>,
) {
  while (
    (await page.getByTestId("ack-dice").count()) ||
    (await page.getByTestId("ack-feedback").count())
  ) {
    if (await page.getByTestId("ack-dice").count()) {
      await onDice?.();
      await page.getByTestId("ack-dice").click();
    } else {
      await onEffect?.();
      await page.getByTestId("ack-feedback").click();
    }
  }
  if (await page.getByTestId("uncover").count())
    await page.getByTestId("uncover").click();
}
export async function openRoomSelect(page: Page) {
  const select = page.getByLabel("查看房间", { exact: true });
  if (!(await select.isVisible()))
    await page.getByLabel("显示图例与房间列表", { exact: true }).click();
  return select;
}
export async function clickUI(page: Page, c: Command) {
  if (await page.getByTestId("mobile-dock").count())
    return tapPhoneCommand(page, c);
  if (c.type === "SETUP_REVEAL" || (c.type === "SELECT" && c.propId)) {
    const target = page.locator(`[data-prop="${c.propId}"]`);
    const room = await target.evaluate((el) =>
      el.closest("[data-room-container]")!.getAttribute("data-room-container")!,
    );
    const select = page.getByLabel("查看房间", { exact: true });
    if (!(await select.isVisible()))
      await page.getByLabel("显示图例与房间列表", { exact: true }).click();
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await select.selectOption(room);
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    // Selection changes the camera asynchronously. Wait for the non-tiny view;
    // otherwise the next tap merely zooms, so no game command is submitted.
    await page.waitForFunction(
      () => {
        const svg = document.querySelector('[data-testid="board"]');
        const vp = document.querySelector(".map-viewport");
        if (!svg || !vp) return false;
        const width = vp.getBoundingClientRect().width;
        return (
          width >= 950 ||
          Number(svg.getAttribute("viewBox")!.split(" ")[2]) / width <= 1.4
        );
      },
      undefined,
      { timeout: 3000 },
    );
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await target.locator(":scope > rect").click();
    return;
  }
  if (c.type === "PLAN") {
    for (const card of c.cards as string[])
      await page.locator(`[data-card="${card}"]`).click();
    await page.getByTestId("confirm-plan").click();
    return;
  }
  if (c.type === "USE_PERK" || c.action === "power") {
    if (c.type === "USE_PERK")
      await page.locator(`[data-perk="${c.perkId}"]`).click();
    else {
      await page.locator(".power > summary").first().click();
      await page.getByTestId("power").click();
    }
    for (const [key, value] of Object.entries(c).filter(
      ([k]) => !["type", "actorId", "perkId"].includes(k),
    )) {
      if (key === "choices") {
        for (const [id, choice] of Object.entries(
          value as Record<string, string>,
        ))
          await page
            .locator(`[data-field="choices.${id}"]`)
            .selectOption(choice);
      } else {
        const field = page.locator(`[data-field="${key}"]`);
        if (await field.count()) await field.selectOption(String(value));
      }
    }
    await page.getByTestId("submit-parameters").click();
    return;
  }
  if (c.type === "SELECT" && Array.isArray(c.route)) {
    for (const r of c.route as Array<{ pathId: string; to: string }>)
      await page
        .locator(`[data-carry-path="${r.pathId}"][data-carry-to="${r.to}"]`)
        .click();
    await page.getByTestId("carry-dice").selectOption(String(c.dice));
    await page.getByTestId("confirm-carry").click();
    return;
  }
  if (c.type === "INTERACT" && c.targetId) {
    const target = page
      .locator(`[data-prop="${c.targetId}"],[data-actor="${c.targetId}"]`)
      .first();
    if (await target.count()) {
      const room = await target.evaluate((el) =>
        el
          .closest("[data-room-container]")!
          .getAttribute("data-room-container")!,
      );
      const select = page.getByLabel("查看房间", { exact: true });
      if (!(await select.isVisible()))
        await page.getByLabel("显示图例与房间列表", { exact: true }).click();
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      await select.selectOption(room);
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      // Selection changes the camera asynchronously. Wait for the non-tiny view;
      // otherwise the next tap merely zooms, so no game command is submitted.
      await page.waitForFunction(
        () => {
          const svg = document.querySelector('[data-testid="board"]');
          const vp = document.querySelector(".map-viewport");
          if (!svg || !vp) return false;
          const width = vp.getBoundingClientRect().width;
          return (
            width >= 950 ||
            Number(svg.getAttribute("viewBox")!.split(" ")[2]) / width <= 1.4
          );
        },
        undefined,
        { timeout: 3000 },
      );
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const before = JSON.parse(
        await page.evaluate(() => window.render_game_to_text()),
      ).events;
      if (await target.getAttribute("data-prop"))
        await target.locator(":scope > rect").click();
      else await target.locator(":scope > rect").click();
      // 联机模式下结果要等服务器回传；最多等 1.5 秒
      const view = async () =>
        JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      const start = await view();
      let after = start;
      if (start.online && start.events === before) {
        const t = Date.now();
        while (Date.now() - t < 1500) {
          await page.waitForTimeout(40);
          after = await view();
          if (
            after.events !== before ||
            after.online.version !== start.online.version
          )
            return;
        }
      }
      if (after.events !== before) return;
    }
  }
  const buttons = page.locator("[data-command]");
  const idx = await buttons.evaluateAll(
    (els, c) =>
      els.findIndex((el) => {
        const actual = JSON.parse(el.getAttribute("data-command")!);
        return Object.entries(c).every(
          ([k, v]) => JSON.stringify(actual[k]) === JSON.stringify(v),
        );
      }),
    c,
  );
  assert(idx >= 0, "visible control for " + JSON.stringify(c));
  await buttons.nth(idx).click();
}
