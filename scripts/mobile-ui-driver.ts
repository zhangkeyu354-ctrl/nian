import type { Page, Locator } from "playwright";
import type { Command } from "../packages/shared/src/types.ts";
import { strict as assert } from "node:assert";

export async function tapPhoneCommand(
  page: Page,
  c: Command,
  onTap?: (label: string) => void,
) {
  const tap = async (el: Locator) => {
    const label =
      (await el.getAttribute("data-command")) ??
      (await el.getAttribute("aria-label")) ??
      (await el.textContent()) ??
      "棋盘目标";
    await el.tap();
    onTap?.(label);
  };
  const direct = async () => {
    for (let n = 0; n < 20; n++) {
      const buttons = page.locator(".mobile-dock [data-command]:visible");
      const i = await buttons.evaluateAll(
        (els, c) =>
          els.findIndex((el) => {
            const cmd = JSON.parse(el.getAttribute("data-command")!);
            return Object.entries(c).every(
              ([k, v]) => JSON.stringify(cmd[k]) === JSON.stringify(v),
            );
          }),
        c,
      );
      if (i >= 0) {
        await tap(buttons.nth(i));
        return;
      }
      const next = page.getByLabel("下一页操作", { exact: true });
      if (!(await next.count()) || !(await next.isEnabled())) break;
      await tap(next);
    }
    throw new Error("No phone action " + JSON.stringify(c));
  };
  if (c.type === "PLAN") {
    for (const card of c.cards as string[])
      await tap(page.locator(`.mobile-dock [data-card="${card}"]`));
    await tap(page.locator(".mobile-dock [data-testid=confirm-plan]"));
    return;
  }
  if (c.type === "USE_ITEM") {
    await tap(page.getByTestId("my-items"));
    for (let n = 0; n < 20; n++) {
      const buttons = page.locator(".phone-sheet [data-command]");
      const i = await buttons.evaluateAll(
        (els, c) =>
          els.findIndex((el) => {
            const cmd = JSON.parse(el.getAttribute("data-command")!);
            return Object.entries(c).every(
              ([k, v]) => JSON.stringify(cmd[k]) === JSON.stringify(v),
            );
          }),
        c,
      );
      if (i >= 0) {
        await tap(buttons.nth(i));
        return;
      }
      const next = page
        .locator(".phone-sheet")
        .getByLabel("下一页操作", { exact: true })
        .last();
      if (!(await next.count()) || !(await next.isEnabled())) break;
      await tap(next);
    }
    throw new Error("No inventory action " + JSON.stringify(c));
  }
  if (
    c.type === "SETUP_REVEAL" ||
    (c.type === "SELECT" &&
      c.propId &&
      (await page.getByTestId("mobile-dock").getAttribute("data-stage")) ===
        "interact")
  ) {
    const prop = page.locator(`[data-prop="${c.propId}"]`);
    const room = await prop.evaluate((el) =>
      el.closest("[data-room-container]")!.getAttribute("data-room-container"),
    );
    const before = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    await tap(page.locator(`[data-room="${room}"] > rect`));
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const after = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    if (after.covered || after.events !== before.events) return;
    await direct();
    return;
  }
  if (
    (c.type === "MOVE" && c.to) ||
    (c.type === "SELECT" && c.pathId && c.to)
  ) {
    const room = String(c.to ?? c.roomId);
    const roomTarget = page.locator(`[data-room="${room}"] > rect`);
    const bounds = await roomTarget.boundingBox();
    if (bounds && (bounds.width < 48 || bounds.height < 48)) await direct();
    else await tap(roomTarget);
    return;
  }
  if (c.type === "SELECT" && Array.isArray(c.route)) {
    for (const r of c.route as Array<{ to: string }>) {
      await tap(page.locator(`[data-room="${r.to}"] > rect`));
      await page.waitForTimeout(30);
    }
    const dice = page.locator(`[data-dice-count="${c.dice}"]`);
    if ((await dice.getAttribute("aria-pressed")) !== "true") await tap(dice);
    await tap(page.locator(".mobile-dock [data-testid=confirm-carry]"));
    return;
  }
  if (
    c.type === "USE_PERK" ||
    c.action === "power" ||
    (c.type === "SELECT" && c.option === "teleport")
  ) {
    if (c.type === "USE_PERK") {
      const buttons = page.locator(`.mobile-dock [data-perk="${c.perkId}"]`);
      const index = await buttons.evaluateAll(
        (els, c) =>
          els.findIndex((el) => {
            const data = el.getAttribute("data-command");
            return (
              data &&
              Object.entries(c).every(
                ([k, v]) =>
                  JSON.stringify(JSON.parse(data)[k]) === JSON.stringify(v),
              )
            );
          }),
        c,
      );
      await tap(index >= 0 ? buttons.nth(index) : buttons.first());
    } else if (c.action === "power")
      await tap(page.locator(".mobile-dock [data-testid=power]"));
    else
      await tap(page.getByRole("button", { name: "传送并交互", exact: true }));
    if (await page.getByRole("region", { name: "选择技能路线" }).count()) {
      const roomTarget = page.locator(`[data-room="${c.to}"] > rect`);
      const bounds = await roomTarget.boundingBox();
      if (bounds && (bounds.width < 48 || bounds.height < 48)) await direct();
      else await tap(roomTarget);
      return;
    }
    if (!(await page.getByRole("dialog", { name: "选择技能目标" }).count()))
      return;
    // 完整效果列表：可能先选一组，再点完整命令
    const match = (cmd: Record<string, unknown>) =>
      Object.entries(c).every(
        ([k, v]) => JSON.stringify(cmd[k]) === JSON.stringify(v),
      );
    const sheet = page.locator(".phone-sheet");
    if (
      (await sheet.locator("[data-group]").count()) ||
      (await sheet.locator("[data-command]").count())
    ) {
      for (let n = 0; n < 40; n++) {
        const groups = sheet.locator("[data-group]");
        const gi = await groups.evaluateAll(
          (els, c) =>
            els.findIndex((el) =>
              (
                JSON.parse(el.getAttribute("data-group-commands")!) as Array<
                  Record<string, unknown>
                >
              ).some((cmd) =>
                Object.entries(c).every(
                  ([k, v]) => JSON.stringify(cmd[k]) === JSON.stringify(v),
                ),
              ),
            ),
          c,
        );
        if (gi >= 0) {
          await tap(groups.nth(gi));
          continue;
        }
        const buttons = sheet.locator("[data-command]");
        const all = await buttons.evaluateAll((els) =>
          els.map((el) => JSON.parse(el.getAttribute("data-command")!)),
        );
        const i = all.findIndex(match);
        if (i >= 0) {
          await tap(buttons.nth(i));
          return;
        }
        const next = sheet.getByLabel("下一页操作", { exact: true });
        if (!(await next.count()) || !(await next.isEnabled()))
          throw new Error("No complete parameter action " + JSON.stringify(c));
        await tap(next);
      }
    }
    const entries = Object.entries(c).flatMap(([k, v]) =>
      k === "choices"
        ? Object.entries(v as object).map(([x, y]) => [
            "choices." + x,
            String(y),
          ])
        : [[k, String(v)]],
    );
    for (let n = 0; n < 20; n++) {
      const opts = page.locator("[data-field-option]");
      if (!(await opts.count())) {
        await tap(page.locator(".phone-sheet [data-testid=submit-parameters]"));
        return;
      }
      const field = await opts.first().getAttribute("data-field-option");
      const desired = entries.find(([k]) => k === field)?.[1];
      if (desired !== undefined) {
        let found = false;
        for (let pageNo = 0; pageNo < 20; pageNo++) {
          const el = page.locator(
            `[data-field-option="${field}"][data-value="${desired}"]`,
          );
          if (await el.count()) {
            if ((await el.getAttribute("aria-pressed")) !== "true")
              await tap(el);
            found = true;
            break;
          }
          const next = page
            .locator(".phone-sheet")
            .getByLabel("下一页操作", { exact: true });
          if (!(await next.count()) || !(await next.isEnabled())) break;
          await tap(next);
        }
        assert(found, "parameter " + field + "=" + desired);
      }
      const next = page.getByRole("button", { name: "下一步", exact: true });
      if (await next.count()) await tap(next);
      else {
        await tap(page.locator(".phone-sheet [data-testid=submit-parameters]"));
        return;
      }
    }
  }
  await direct();
}
