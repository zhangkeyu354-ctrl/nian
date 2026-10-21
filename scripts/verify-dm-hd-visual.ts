import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { roles } from "../packages/dying-message/src/index.ts";
import { assertUiShot } from "./screenshot-check.ts";
const out = "output/dm-hd-review";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors: string[] = [],
  oldImages: string[] = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  if (/dying-message-original\/(?!table-wood)/.test(r.url()))
    oldImages.push(r.url());
});
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
  assert.equal(await p.locator(".dm-rule-role .dm-printed-card").count(), 15);
  for (const role of roles) {
    const card = p.locator(`.dm-rule-role [data-role-id="${role.roleId}"]`);
    assert.equal(await card.count(), 1);
    assert.equal(await card.locator(".dm-card-name").textContent(), role.name);
    assert.equal(
      await card.locator(".dm-card-english").textContent(),
      role.englishName,
    );
  }
  const atlasSizes = await p
    .locator(".dm-restored-portrait")
    .evaluateAll(async (list) =>
      Promise.all(
        list.map(async (el) => {
          const url = getComputedStyle(el).backgroundImage.slice(5, -2);
          const im = new Image();
          im.src = url;
          await im.decode();
          return { width: im.naturalWidth, height: im.naturalHeight };
        }),
      ),
    );
  assert(atlasSizes.every((s) => s.width >= 1200 && s.height >= 1200));
  await p.locator(".dm-rule-role").first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: out + "/role-catalogue-desktop.png" });
  await p
    .locator(".dm-rule-role")
    .first()
    .screenshot({ path: out + "/civilian-card.png" });
  await p
    .locator(".dm-rule-role")
    .last()
    .screenshot({ path: out + "/serial-killer-card.png" });
  await p.setViewportSize({ width: 360, height: 800 });
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.locator(".dm-rule-role").nth(1).scrollIntoViewIfNeeded();
  await assertUiShot(p, out + "/role-mobile.png");
  await p.goto("http://127.0.0.1:3184/?game=dm");
  await p.getByTestId("dm-create").click();
  await p.getByLabel("你的昵称").fill("清晰卡面审核");
  await p.getByRole("button", { name: "入座", exact: true }).click();
  await p.getByTestId("dm-ready").waitFor();
  await p.getByLabel("本局人数").selectOption("10");
  await p.getByTestId("dm-seat-10").waitFor();
  await assertUiShot(p, out + "/ten-seats-360.png");
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  assert.equal(
    await p.locator(".dm-seat-portrait .dm-printed-card").count(),
    0,
  );
  assert.equal(
    await p.locator('.dm-seat-portrait img[src$="/card-back.svg"]').count(),
    10,
  );
  await p.setViewportSize({ width: 1440, height: 1050 });
  await assertUiShot(p, out + "/roundtable-desktop.png");
  assert.equal(errors.length, 0);
  assert.equal(oldImages.length, 0, "No blurry photo cards may load");
  writeFileSync(
    out + "/hd-visual-validation.json",
    JSON.stringify(
      {
        roles: 15,
        atlasSizes,
        cardBack: "SVG",
        nativeCardText: true,
        widths: [360, 1440],
        horizontalOverflow: false,
        hiddenSeats: "card-back only",
        oldCardRequests: oldImages,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "HD VISUAL PASS: 15 restored roles, SVG back, native labels, no old photo cards, mobile and desktop",
  );
} finally {
  await browser.close();
}
