import { chromium, devices } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertUiShot } from "./screenshot-check.ts";
const b = await chromium.launch();
mkdirSync("docs/phase2d/preview", { recursive: true });
const all: any[] = [];
const errors: string[] = [];
try {
  for (const model of ["iPhone 13", "Pixel 7"]) {
    const { defaultBrowserType, ...profile } = devices[model];
    const ctx = await b.newContext(profile),
      p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    let websockets = 0;
    p.on("websocket", (ws) => {
      if (ws.url().includes("/socket.io/")) websockets++;
    });
    for (const scene of ["plan", "move", "interact"]) {
      await p.goto("http://127.0.0.1:5173/?view=mobile-preview&scene=" + scene);
      await p.getByTestId("mobile-preview").waitFor();
      let n = 0;
      const tap = async (sel: string) => {
        await p.locator(sel).tap();
        n++;
      };
      if (scene === "plan") await tap('[data-preview-card="blue"]');
      if (scene === "interact") await tap('[data-preview-action="0"]');
      const label = model.replaceAll(" ", "_");
      const shot = await assertUiShot(
        p,
        `docs/phase2d/preview/${label}_${scene}.png`,
        '[data-testid="preview-map"]',
      );
      const small = await p
        .locator('button,[role="button"]')
        .evaluateAll((els) =>
          els
            .filter((el) => {
              const b = el.getBoundingClientRect();
              return (
                b.width > 0 &&
                b.height > 0 &&
                (b.width < 47.99 || b.height < 47.99)
              );
            })
            .map((el) => ({
              label: el.getAttribute("aria-label") ?? el.textContent,
              rect: el.getBoundingClientRect().toJSON(),
            })),
        );
      assert.deepEqual(small, [], "all prototype targets >=48px");
      assert.equal(await p.locator("select").count(), 0);
      assert(
        await p.evaluate(
          () =>
            scrollY === 0 &&
            document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      );
      if (scene === "plan") {
        assert(
          (await p.locator('[data-preview-path][data-lit="true"]').count()) > 0,
        );
        await tap('[data-testid="preview-confirm-plan"]');
      }
      if (scene === "move") await tap('[data-reachable="true"]');
      if (scene === "interact")
        await tap('[data-testid="preview-confirm-action"]');
      assert.equal(n, scene === "move" ? 1 : 2);
      const intent = JSON.parse(
        (await p
          .getByTestId("mobile-preview")
          .getAttribute("data-intended-command"))!,
      );
      assert.equal(
        intent.type,
        scene === "plan" ? "PLAN" : scene === "move" ? "MOVE" : "INTERACT",
      );
      assert(await p.evaluate(() => scrollY === 0));
      all.push({
        model,
        scene,
        taps: n,
        noPageScroll: true,
        noDropdown: true,
        targets48: true,
        screenshot: `preview/${label}_${scene}.png`,
        ...shot,
      });
    }
    await p.goto("http://127.0.0.1:5173/?view=mobile-preview");
    await p.getByRole("button", { name: "看杀手", exact: true }).tap();
    await p.locator('[data-preview-card="wait"]').tap();
    await p.locator('[data-preview-card="blue"]').tap();
    await p.getByTestId("preview-confirm-plan").tap();
    assert.equal(
      await p.getByTestId("mobile-preview").getAttribute("data-demo-taps"),
      "3",
    );
    await p.getByRole("button", { name: "查看演示角色", exact: true }).tap();
    assert.equal(await p.getByRole("dialog").count(), 1);
    await p.getByLabel("关闭角色资料", { exact: true }).tap();
    await p.getByTestId("preview-overview").tap();
    assert.equal(await p.locator("[data-preview-room]").count(), 11);
    await p.getByTestId("preview-overview").tap();
    assert.equal(websockets, 0, "prototype must not connect to a real game");
    await ctx.close();
  }
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }),
    p = await c.newPage();
  await p.goto("http://127.0.0.1:5173/?view=mobile-preview");
  await p
    .locator('[data-testid="preview-map"] > svg')
    .evaluate((el) => ((el as HTMLElement).style.visibility = "hidden"));
  let blankRejected = false;
  try {
    await assertUiShot(
      p,
      "work/phase2d/blank-negative.png",
      '[data-testid="preview-map"]',
    );
  } catch {
    blankRejected = true;
  }
  assert(blankRejected, "pixel checker must reject blank prototype map");
  await c.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    "docs/phase2d/样稿验收.json",
    JSON.stringify(
      {
        all_passed: true,
        engine:
          "Chromium with official device descriptors; not physical Safari/Android",
        records: all,
        killerPlanTaps: 3,
        blankRejected,
        realRoomConnections: 0,
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "MOBILE_PREVIEW_PASS",
    all.length,
    "views; 2/1/2 taps; killer 3 taps; 48px; no scrolling; blank rejected; no real room connection",
  );
} finally {
  await b.close();
}
