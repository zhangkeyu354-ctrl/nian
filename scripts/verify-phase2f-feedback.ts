import { chromium, devices } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { clickUI, drainUI } from "./hotseat-driver.ts";
import { assertUiShot } from "./screenshot-check.ts";
const browser = await chromium.launch();
const out = "docs/phase2f/evidence/feedback";
mkdirSync(out, { recursive: true });
const results: any[] = [];
try {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  await ctx.addInitScript(() =>
    localStorage.setItem(
      "dbd-visual-settings",
      JSON.stringify({
        animations: true,
        art: true,
        sound: false,
        vibration: false,
      }),
    ),
  );
  const p = await ctx.newPage(),
    errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto("http://127.0.0.1:5173/test/experience.html?case=move");
  await p.getByTestId("mobile-dock").waitFor();
  const c = await p.evaluate(() => (window as any).__command);
  // Record inside the browser so IPC scheduling cannot miss a 500ms animation.
  await p.evaluate(`(() => {
    window.__motionSamples = [];
    requestAnimationFrame(function sample() {
      const el = document.querySelector('[data-moving-actor]');
      const transform = el?.querySelector(':scope > g')?.getAttribute('transform');
      if (transform) window.__motionSamples.push({transform, path: el.getAttribute('data-motion-path')});
      if (window.__motionSamples.length < 40) requestAnimationFrame(sample);
    });
  })()`);
  await p.evaluate(() => (window as any).__receive());
  await p.waitForFunction(() => new Set((window as any).__motionSamples.map((s: any) => s.transform)).size > 1);
  const samples = await p.evaluate(() => (window as any).__motionSamples);
  assert(samples.length > 1, "positioned animation frames captured");
  assert(samples.every((s: any) => s.path === c.pathId), "server route preserved");
  results.push({ motionFrames: samples });
  results.push(await assertUiShot(p, `${out}/移动途中.png`));
  await p.locator('[data-moving-actor]').waitFor({state: 'detached'});
  for (const kind of ["injury", "hook", "complete", "repair"]) {
    console.log("FEEDBACK_CASE", kind);
    await p.goto(
      `http://127.0.0.1:5173/test/experience.html?case=${kind}${kind === "injury" ? "&observer=victim" : ""}`,
    );
    await p.getByTestId("mobile-dock").waitFor();
    await p.evaluate(() => (window as any).__receive());
    await p.waitForTimeout(100);
    if (kind === "injury") {
      await p.getByTestId("injury-stamp").waitFor();
      results.push(await assertUiShot(p, `${out}/injury.png`));
    }
    if (kind === "repair") await p.locator("[data-contact]").first().waitFor();
    else {
      await drainUI(p);
      await p.getByTestId("major-notice").waitFor();
    }
    assert.equal(
      await p
        .locator(".major-notice")
        .evaluateAll((es) =>
          es.every((e) => getComputedStyle(e).pointerEvents === "none"),
        ),
      true,
    );
    results.push(await assertUiShot(p, `${out}/${kind === "injury" ? "injury_notice" : kind}.png`));
  }
  await p.goto("http://127.0.0.1:5173/test/experience.html?case=move&reject=1");
  await p.getByTestId("mobile-dock").waitFor();
  await clickUI(p, await p.evaluate(() => (window as any).__command));
  await p.locator(".send-status").waitFor();
  await p.getByRole("alert").filter({ hasText: "操作被拒绝" }).waitFor();
  assert.equal(await p.evaluate(() => (window as any).__sent.length), 1);
  results.push(await assertUiShot(p, `${out}/拒绝原因.png`));
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.goto("http://127.0.0.1:5173/test/experience.html?case=move");
  await p.getByTestId("mobile-dock").waitFor();
  await p.evaluate(() => (window as any).__receive());
    await p.waitForTimeout(100);
  assert.equal(
    await p.locator("[data-moving-actor]").count(),
    0,
    "reduced motion is immediate",
  );
  assert.deepEqual(errors, []);
  await ctx.close();
  results.push({
    motion: true,
    spatialContact: true,
    ownerInjury: true,
    notices: true,
    rejected: true,
    reducedMotion: true,
    errors,
  });
} finally {
  await browser.close();
}
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log("PHASE2F_FEEDBACK_PASS");




