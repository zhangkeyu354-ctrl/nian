import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { io } from "socket.io-client";
const base = process.env.WT_URL ?? "http://127.0.0.1:3447";
const out = `docs/witch-town/validation/screens/mobile-fix-1027/${process.env.CHECK_LABEL ?? "after"}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results: any[] = [];
try {
  for (const width of [375, 390]) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 667 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    for (const game of ["tp", "fa", "dm", "wt"]) {
      await page.goto(`${base}/?game=${game}`);
      await page.waitForTimeout(1200);
      const selector =
        game === "dm"
          ? ".dm-sound"
          : game === "wt"
            ? ".wt-top > a"
            : ".lb-seg button";
      await page.locator(selector).first().waitFor();
      const targets = await page.locator(selector).evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return { label: e.textContent, w: r.width, h: r.height };
        }),
      );
      results.push({
        width,
        game,
        check: "44px targets",
        targets,
        pass: targets.every((r) => r.w >= 44 && r.h >= 44),
      });
      if (game === "wt") {
        await page.locator("[data-testid=wt-code]").fill("AUDIT123");
        await ctx.setOffline(true);
        await page.waitForFunction(() =>
          document
            .querySelector(".wt-entry-status")
            ?.textContent?.includes("中断"),
        );
        const buttons = await page
          .locator("[data-testid=wt-create],[data-testid=wt-join]")
          .evaluateAll((es) =>
            es.map((e) => ({
              disabled: (e as HTMLButtonElement).disabled,
              text: e.textContent,
            })),
          );
        results.push({
          width,
          game,
          check: "offline create and join",
          buttons,
          pass: buttons.every(
            (b) => b.disabled && b.text === "正在连接服务器…",
          ),
        });
        await page.screenshot({
          path: `${out}/offline-create-join-${width}.png`,
        });
        await ctx.setOffline(false);
        await page.goto(`${base}/?game=wt&room=AUDIT123`);
        await page.locator("[data-testid=wt-claim]").waitFor();
        await page.waitForFunction(() =>
          document
            .querySelector(".wt-entry-status")
            ?.textContent?.includes("已连接"),
        );
        await ctx.setOffline(true);
        await page.waitForFunction(() =>
          document
            .querySelector(".wt-entry-status")
            ?.textContent?.includes("中断"),
        );
        const claim = page.locator("[data-testid=wt-claim]");
        const disabled = await claim.isDisabled(),
          text = await claim.textContent();
        results.push({
          width,
          game,
          check: "offline claim",
          pass: disabled && text === "正在连接服务器…",
          disabled,
          text,
        });
        await page.screenshot({
          path: `${out}/offline-entrance-claim-${width}.png`,
        });
        await ctx.setOffline(false);
        const socket = io(base, { transports: ["websocket"] });
        try {
          await new Promise<void>((res, rej) => {
            socket.once("connect", res);
            socket.once("connect_error", rej);
          });
          const room = await new Promise<string>((res, rej) =>
            socket
              .timeout(5000)
              .emit("wt:create", { capacity: 4 }, (e: any, r: any) =>
                e
                  ? rej(e)
                  : r?.ok
                    ? res(r.data.code)
                    : rej(new Error(r?.error)),
              ),
          );
          await page.goto(`${base}/?game=wt&room=${room}`);
          await page
            .locator("[data-testid=wt-world][data-phase=lobby]")
            .waitFor();
          await page.locator("[data-testid=wt-claim]").waitFor();
          await ctx.setOffline(true);
          await page.waitForTimeout(300);
          const lobbyButton = page.locator("[data-testid=wt-claim]");
          results.push({
            width,
            game,
            check: "offline real lobby claim",
            pass:
              (await lobbyButton.isDisabled()) &&
              (await lobbyButton.textContent()) === "正在连接服务器…",
          });
        } finally {
          socket.disconnect();
        }
      }
      await page.screenshot({ path: `${out}/${game}-${width}.png` });
      await ctx.setOffline(false);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/controls.json`, JSON.stringify(results, null, 2));
}
console.log(
  JSON.stringify({
    checks: results.length,
    passed: results.filter((x) => x.pass).length,
    failed: results.filter((x) => !x.pass),
  }),
);
assert(
  results.every((x) => x.pass),
  "Mobile control regression",
);
