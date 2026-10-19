import type { Page } from "playwright";
import type { Command, CreateOptions } from "../packages/shared/src/types.ts";
import { strict as assert } from "node:assert";
export async function startUI(page: Page, o: CreateOptions) {
  await page.goto("http://127.0.0.1:5173/");
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
export async function clickUI(page: Page, c: Command) {
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
