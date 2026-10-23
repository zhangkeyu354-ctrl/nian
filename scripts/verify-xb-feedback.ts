import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.goto(
    (process.env.XB_TEST_URL ?? "http://127.0.0.1:3358") + "/?game=xb",
  );
  const button = page.getByTestId("xb-create");
  await button.waitFor();
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(
    "window.__xbFeedback=null;document.addEventListener('pointerdown',function(){var t=performance.now();requestAnimationFrame(function(){window.__xbFeedback={firstFrameMs:performance.now()-t};});},{once:true});",
  );
  const box = await button.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  const result = (await page.evaluate(
    "({firstFrameMs:window.__xbFeedback.firstFrameMs,transform:getComputedStyle(document.querySelector('[data-testid=xb-create]')).transform})",
  )) as { firstFrameMs: number; transform: string };
  assert(result.firstFrameMs <= 100, `反馈帧超过100ms：${result.firstFrameMs}`);
  assert(result.transform.startsWith("matrix(0.96"), result.transform);
  await page.mouse.up();
  await page.getByTestId("xb-join").waitFor();
  mkdirSync("docs/xiabaiwang/ui-v1", { recursive: true });
  writeFileSync(
    "docs/xiabaiwang/ui-v1/feedback.json",
    JSON.stringify(result, null, 2),
  );
  console.log("XB_FEEDBACK_PASS", JSON.stringify(result));
} finally {
  await browser.close();
}
