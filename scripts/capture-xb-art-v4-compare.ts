import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertUiShot } from "./screenshot-check.ts";
const base = process.env.XB_TEST_URL ?? "http://127.0.0.1:3359",
  out = "docs/xiabaiwang/art-v4/compare";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({
    executablePath: process.env.PW_CHROME,
    headless: true,
  }),
  errors: string[] = [];
try {
  for (const game of ["dm", "tp"]) {
    const pages: Page[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await b.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const p = await c.newPage();
      p.setDefaultTimeout(20000);
      p.on("pageerror", (e) => errors.push(e.message));
      pages.push(p);
    }
    const host = pages[0];
    await host.goto(base + "/?game=" + game);
    if (game === "dm") await host.getByTestId("dm-create").click();
    else await host.getByRole("button", { name: /^创建房间/ }).click();
    let url = host.url();
    for (const [i, p] of pages.entries()) {
      if (i) await p.goto(url);
      await p.getByLabel("你的昵称").fill("电台朋友" + (i + 1));
      await p
        .getByRole("button", {
          name: game === "dm" ? "入座" : /^加入这局/,
          exact: true,
        })
        .click();
      await (
        game === "dm"
          ? p.getByTestId("dm-ready")
          : p.getByRole("button", { name: "我准备好了", exact: true })
      ).waitFor();
      if (i === 0) url = host.url();
    }
    for (const size of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await host.setViewportSize(size);
      await host.evaluate(() => document.fonts.ready);
      await host.waitForTimeout(600);
      await assertUiShot(
        host,
        `${out}/${game}-lobby-${size.width}x${size.height}.png`,
        "body",
        "allow",
      );
    }
    for (const p of pages) await p.context().close();
  }
  if (errors.length) throw Error(errors.join("\n"));
  writeFileSync(
    out + "/capture-report.json",
    JSON.stringify(
      { phase: "待开局大厅", playersEach: 3, liveBrowser: true, errors },
      null,
      2,
    ),
  );
  console.log("XB_COMPARE_CAPTURE_PASS");
} finally {
  await b.close();
}
