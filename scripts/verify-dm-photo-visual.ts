import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { roles } from "../packages/dying-message/src/index.ts";
import { assertUiShot } from "./screenshot-check.ts";
const out = "output/dm-photo-review";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors: string[] = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto("http://127.0.0.1:3184/?game=dm");
  await p.getByTestId("dm-create").waitFor();
  await p
    .locator(".dm-home img")
    .evaluate((img: HTMLImageElement) => img.decode());
  await assertUiShot(p, out + "/home-desktop.png");
  await p.getByRole("button", { name: "玩法与角色", exact: true }).click();
  for (const d of await p.locator(".dm-rules details").all())
    await d.locator("summary").click();
  const imgs = p.locator(".dm-rule-role img");
  assert.equal(await imgs.count(), 15);
  await imgs.evaluateAll(async (list) => {
    for (const img of list as HTMLImageElement[]) img.loading = "eager";
    await Promise.all((list as HTMLImageElement[]).map((img) => img.decode()));
  });
  for (const role of roles)
    assert.equal(
      await p
        .locator('.dm-rule-role img[src$="/' + role.roleId + '.webp"]')
        .count(),
      1,
    );
  await p.locator(".dm-rules").scrollIntoViewIfNeeded();
  await assertUiShot(p, out + "/original-role-catalogue.png");
  await p.screenshot({
    path: out + "/original-role-catalogue-full.png",
    fullPage: true,
  });
  await p.setViewportSize({ width: 360, height: 800 });
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.goto("http://127.0.0.1:3184/?game=dm");
  await p.getByTestId("dm-create").click();
  await p.getByLabel("你的昵称").fill("照片还原审核");
  await p.getByRole("button", { name: "入座", exact: true }).click();
  await p.getByTestId("dm-ready").waitFor();
  await p.getByLabel("本局人数").selectOption("10");
  await p.getByTestId("dm-seat-10").waitFor();
  await assertUiShot(p, out + "/ten-seats-360.png");
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  assert.equal(
    await p
      .locator('.dm-seat-portrait img:not([src$="/card-back.webp"])')
      .count(),
    0,
  );
  await p.setViewportSize({ width: 1440, height: 1050 });
  await assertUiShot(p, out + "/roundtable-desktop.png");
  for (const id of [...roles.map((r) => r.roleId), "card-back", "table-wood"]) {
    const response = await p.request.get(
      "http://127.0.0.1:3184/assets/dying-message-original/" + id + ".webp",
    );
    assert.equal(response.headers()["content-type"], "image/webp");
  }
  assert.equal(await p.locator('img[src*="dying-message-ui-v2"]').count(), 0);
  assert.equal(errors.length, 0);
  writeFileSync(
    out + "/photo-visual-validation.json",
    JSON.stringify(
      {
        originalRoles: 15,
        originalCardBack: true,
        originalTableTexture: true,
        generatedReplacementAssetsUsed: 0,
        allOriginalImagesLoad: true,
        seats: "4–10",
        hiddenSeats: "card-back only",
        widths: [360, 1440],
        horizontalOverflow: false,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PHOTO VISUAL PASS 15 roles, original cardback, 360/1440, no generated replacements",
  );
} finally {
  await browser.close();
}
