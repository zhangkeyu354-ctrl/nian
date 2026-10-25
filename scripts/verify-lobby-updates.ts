import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
import { assertUiShot } from "./screenshot-check.ts";

const out = "output/lobby-updates";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [width, height] of [[390, 844], [390, 664], [1366, 768]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(process.env.DBD_TEST_BASE_URL ?? "http://127.0.0.1:5187");
    const trigger = page.getByRole("button", {name: "更新公告", exact: true});
    await trigger.waitFor();
    const bounds = (await trigger.boundingBox())!;
    assert(bounds.y >= 0 && bounds.y + bounds.height <= height, "公告按钮首屏可见");
    const dialog = page.getByRole("dialog", { name: "更新公告" });
    assert.equal(await dialog.isVisible(), false);
    await assertUiShot(page, `${out}/${width}x${height}-closed.png`);
    await trigger.click();
    assert(await dialog.isVisible());
    assert.equal(await dialog.locator("article").count(), 2);
    assert(await dialog.getByText("瞎掰王", { exact: false }).isVisible());
    assert(await dialog.getByText("魔法运动员", { exact: false }).isVisible());
    assert(await dialog.getByRole("heading", {name: "手机讨论更宽敞，领奖台不再被遮挡"}).isVisible());
    assert(await page.getByText("修复香蕉有时绊不倒路过选手的问题。", { exact: false }).isVisible());
    const box = (await dialog.boundingBox())!;
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, "弹窗完整可见");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "没有横向溢出");
    await assertUiShot(page, `${out}/${width}x${height}-open.png`);
    await page.getByRole("button", { name: "关闭更新公告" }).click();
    assert.equal(await dialog.isVisible(), false);
    await trigger.press("Enter");
    assert(await dialog.isVisible());
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false);
    assert(await trigger.evaluate(el => el === document.activeElement), "关闭后焦点回到按钮");
    assert.deepEqual(errors, []);
    console.log(`LOBBY_UPDATES_PASS ${width}x${height}`);
    await page.close();
  }
} finally { await browser.close(); }
