import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME,
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173/test/xb-audio.html");
  await page.waitForFunction(
    () => typeof (window as any).measureXBAudio === "function",
  );
  const results = await page.evaluate(() => (window as any).measureXBAudio());
  mkdirSync("docs/xiabaiwang/ui-v3", { recursive: true });
  writeFileSync(
    "docs/xiabaiwang/ui-v3/audio-report.json",
    JSON.stringify(
      {
        metric:
          "48kHz offline rendering; maximum 50ms RMS and absolute peak, relative to turn prompt",
        results,
      },
      null,
      2,
    ),
  );
  for (const row of results) {
    assert(row.rmsRatio <= 1.5, `${row.cue} loudness ${row.rmsRatio}`);
    assert(row.peakRatio <= 1.5, `${row.cue} peak ${row.peakRatio}`);
  }
  console.log("XB_AUDIO_PASS " + JSON.stringify(results));
} finally {
  await browser.close();
}
