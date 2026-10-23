/** 使用本地已启动服务。XB_TEST_URL 默认3348，数据与生产隔离。 */
import { chromium, type Page, type BrowserContext } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TOPICS } from "../packages/xiabaiwang/src/topics.ts";
const base = process.env.XB_TEST_URL ?? "http://127.0.0.1:3348";
const out = "output/playwright/xiabaiwang";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
const report: object[] = [];
async function click(p: Page, name: string) {
  await p.getByRole("button", { name, exact: true }).click();
}
async function has(p: Page, text: string) {
  await p.getByText(text, { exact: true }).first().waitFor();
}
async function noOverflow(p: Page) {
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "手机横向溢出",
  );
}
try {
  for (
    let n = Number(process.env.XB_MIN_PLAYERS ?? 3);
    n <= Number(process.env.XB_MAX_PLAYERS ?? 10);
    n++
  ) {
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    try {
      for (let i = 0; i < n; i++) {
        const c = await browser.newContext({
          viewport: { width: i === 0 ? 390 : 360, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
        contexts.push(c);
        const p = await c.newPage();
        p.on("pageerror", (e) => errors.push(e.message));
        pages.push(p);
      }
      const host = pages[0];
      await host.goto(base + "/?game=xb");
      await click(host, "创建房间");
      await host.getByRole("textbox", { name: "你的昵称" }).waitFor();
      const roomURL = host.url();
      for (let i = 0; i < n; i++) {
        if (i) await pages[i].goto(roomURL);
        await pages[i]
          .getByRole("textbox", { name: "你的昵称" })
          .fill(`测试${i + 1}`);
        await click(pages[i], "进入房间");
        await has(pages[i], `等待朋友 · ${i + 1}/10`);
      }
      await click(host, "开始游戏");
      for (let round = 1; round <= n; round++) {
        const g = pages[round - 1];
        await has(g, "你的身份：猜测者");
        const truthIndex = (
          await Promise.all(
            pages.map((p) => p.locator(".xb-role").textContent()),
          )
        ).findIndex((s) => s?.includes("老实人"));
        assert(truthIndex >= 0);
        const truth = pages[truthIndex];
        await truth.locator(".xb-answer").waitFor();
        const answer = await truth.locator(".xb-answer p").textContent();
        assert(answer);
        for (let i = 0; i < n; i++) {
          await noOverflow(pages[i]);
          if (i !== truthIndex) {
            assert.equal(await pages[i].locator(".xb-answer").count(), 0);
            assert(!(await pages[i].content()).includes(answer));
          }
        }
        const mutedIndex =
          round % 2 === 0
            ? truthIndex
            : pages.findIndex((_, i) => i !== truthIndex && i !== round - 1);
        await click(g, "📢 你在放屁！");
        await click(g, `选择 测试${mutedIndex + 1}`);
        if (n === 3 && round === 1) {
          await g.keyboard.press("Escape");
          assert.equal(await g.getByRole("dialog").count(), 0);
          await click(g, `选择 测试${mutedIndex + 1}`);
        }
        await click(g, "确认");
        await Promise.all(pages.map((p) => p.locator(".xb-mute").waitFor()));
        assert(
          await g
            .getByRole("button", {
              name: "📢 你在放屁！（已使用）",
              exact: true,
            })
            .isDisabled(),
        );
        if (round === 1) {
          const before = await g.locator(".xb-question").textContent();
          await Promise.all(
            pages.map(async (p, i) => {
              await click(p, "💩 扔粑粑");
              await click(p, `选择 测试${((i + 1) % n) + 1}`);
              await click(p, "确认");
            }),
          );
          for (const p of pages)
            await p
              .locator(".xb-notice")
              .filter({ hasText: "扔了💩" })
              .waitFor();
          assert.equal(await g.locator(".xb-question").textContent(), before);
          await host.screenshot({
            path: join(out, `${n}-discussion.png`),
            fullPage: true,
          });
          await truth.reload();
          await has(truth, "你的身份：老实人");
          assert.equal(
            await truth.locator(".xb-answer p").textContent(),
            answer,
          );
          await host.getByRole("checkbox", { name: "互动动画" }).uncheck();
          assert.equal(await host.locator(".xb-poop").count(), 0);
        }
        await click(g, "🎯 指认真正的老实人");
        await click(g, `选择 测试${truthIndex + 1}`);
        await click(g, "确认");
        for (const p of pages) {
          await has(p, "本轮已揭晓");
          assert.equal(await p.locator(".xb-answer p").textContent(), answer);
          assert.equal(
            await p.getByText("身份保密", { exact: true }).count(),
            0,
          );
        }
        await click(host, round === n ? "查看最终排名" : "开始下一轮");
      }
      await has(host, "本局结束 · 最终排名");
      await host.screenshot({
        path: join(out, `${n}-final.png`),
        fullPage: true,
      });
      await host.reload();
      await has(host, "本局结束 · 最终排名");
      if (n === 3) {
        for (const [width, height] of [
          [320, 568],
          [844, 390],
        ]) {
          await host.setViewportSize({ width, height });
          await noOverflow(host);
          await host.screenshot({
            path: join(out, `responsive-${width}.png`),
            fullPage: true,
          });
        }
      }
      report.push({
        players: n,
        rounds: n,
        result: "PASS",
        refresh: true,
        secret: true,
        challenge: true,
        effects: true,
      });
      writeFileSync(
        join(out, "report.json"),
        JSON.stringify({ report, errors }, null, 2),
      );
      writeFileSync(
        join(out, `${n}-report.json`),
        JSON.stringify(report.at(-1), null, 2),
      );
      console.log(`XB_BROWSER_PASS ${n} players ${n} rounds`);
    } catch (e) {
      const failure = {
        players: n,
        error: String(e),
        errors,
        pages: await Promise.all(
          pages.map(async (p) => ({
            url: p.url(),
            text: await p
              .locator("body")
              .innerText()
              .catch(() => "unavailable"),
          })),
        ),
      };
      writeFileSync(
        join(out, "failure.json"),
        JSON.stringify(failure, null, 2),
      );
      for (let i = 0; i < pages.length; i++)
        await pages[i]
          .screenshot({
            path: join(out, `failure-${n}-${i}.png`),
            fullPage: true,
          })
          .catch(() => {});
      throw e;
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  // 服务端题库正文不可打包进浏览器。
  const chunks = readdirSync("dist/web/assets")
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join("dist/web/assets", f), "utf8"))
    .join("");
  for (const topic of TOPICS)
    assert(!chunks.includes(topic.answer), `浏览器打包泄露题库：${topic.id}`);
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify({ report, errors }, null, 2),
  );
} finally {
  await browser.close();
}
