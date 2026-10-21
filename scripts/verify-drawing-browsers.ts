import { chromium, type Page } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.env.DP_URL ?? "http://127.0.0.1:3011",
  out = "work/drawing-party-browser";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
const state = (p: Page) =>
  p.evaluate(() => JSON.parse((window as any).render_game_to_text()));
const phase = async (p: Page, name: string) =>
  p.waitForFunction((n) => {
    const f = (window as any).render_game_to_text;
    return f && JSON.parse(f()).phase === n;
  }, name);
async function draw(p: Page) {
  const c = p.getByLabel("绘画画布"),
    b = await c.boundingBox();
  assert(b);
  await c.scrollIntoViewIfNeeded();
  const r = (await c.boundingBox())!;
  const cd = await p.context().newCDPSession(p);
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: r.x + r.width * 0.2, y: r.y + r.height * 0.3 }],
  });
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(20);
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: r.x + r.width * (0.2 + i * 0.04),
          y: r.y + r.height * (0.3 + Math.sin(i) * 0.08),
        },
      ],
    });
  }
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cd.detach();
  await p.waitForTimeout(550);
}
try {
  for (const mode of ["tp", "fa"]) {
    const contexts = await Promise.all(
      [375, 390, 412].map((width) =>
        browser.newContext({
          viewport: { width, height: 844 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 3,
        }),
      ),
    );
    await contexts[1].addInitScript(() =>
      Object.defineProperty(crypto, "randomUUID", { value: undefined }),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    pages.forEach((p) => {
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("console", (e) => {
        if (
          e.type() === "error" &&
          !e.text().includes("net::ERR_INTERNET_DISCONNECTED")
        )
          errors.push(e.text());
      });
    });
    await pages[0].goto(base + "/?game=" + mode);
    await pages[0].getByRole("button", { name: "创建房间" }).click();
    await pages[0].getByLabel("你的昵称").fill("画家0");
    await pages[0].getByRole("button", { name: "加入这局" }).click();
    await pages[0].getByRole("button", { name: "我准备好了" }).waitFor();
    const link = pages[0].url();
    for (let i = 1; i < 3; i++) {
      await pages[i].goto(
        i === 1
          ? link.replace(
              "game=" + mode,
              "game=" + (mode === "tp" ? "fa" : "tp"),
            )
          : link,
      );
      await pages[i].waitForURL((url) => url.searchParams.get("game") === mode);
      await pages[i].getByLabel("你的昵称").fill("画家" + i);
      await pages[i].getByRole("button", { name: "加入这局" }).click();
    }
    for (const p of pages)
      await p.getByRole("button", { name: "我准备好了" }).click();
    await pages[0].getByRole("button", { name: "开始游戏" }).click();
    if (mode === "tp") {
      await phase(pages[0], "PROMPT");
      for (let i = 0; i < 3; i++) {
        await pages[i].getByLabel("给朋友写个题目").fill("戴帽子的猫" + i);
        await pages[i].getByRole("button", { name: "写好了" }).click();
      }
      await phase(pages[0], "TASK");
      await pages[0].getByLabel("绘画画布").waitFor();
      for (const p of pages) await draw(p);
      await pages[0].screenshot({
        path: out + "/tp-drawing-375.png",
        fullPage: true,
      });
      const before = await state(pages[0]);
      assert(before.view.drawing.strokes[0].points.length > 2);
      await contexts[0].setOffline(true);
      await draw(pages[0]);
      await contexts[0].setOffline(false);
      await pages[0].waitForTimeout(1300);
      await pages[0].reload();
      await pages[0].getByLabel("绘画画布").waitFor();
      await pages[0].waitForTimeout(600);
      assert.equal(
        (await state(pages[0])).view.drawing.strokes.length,
        2,
        "offline stroke lost",
      );
      await pages[0].setViewportSize({ width: 844, height: 390 });
      await pages[0].getByRole("button", { name: "专注", exact: true }).click();
      await pages[0].waitForTimeout(150);
      assert(
        await pages[0].evaluate(() => {
          const focus = document
            .querySelector(".dp-focus")!
            .getBoundingClientRect();
          return (
            focus.width === innerWidth &&
            focus.height === innerHeight &&
            [
              ...document.querySelectorAll(
                ".dp-focus .dp-paper,.dp-focus button",
              ),
            ].every((e) => {
              const b = e.getBoundingClientRect();
              return (
                b.left >= 0 &&
                b.top >= 0 &&
                b.right <= innerWidth + 1 &&
                b.bottom <= innerHeight + 1
              );
            })
          );
        }),
        "focus canvas or controls are cropped",
      );
      await pages[0].screenshot({
        path: out + "/tp-landscape.png",
        fullPage: false,
      });
      await pages[0].getByRole("button", { name: "退出专注" }).click();
      await pages[0].setViewportSize({ width: 375, height: 844 });
      for (const p of pages)
        await p.getByRole("button", { name: "画好了" }).click();
      for (let i = 0; i < 3; i++) {
        await pages[i].getByLabel("写下你的猜测").fill("猜测猫" + i);
        await pages[i].getByRole("button", { name: "写好了" }).click();
      }
      await phase(pages[0], "REVEAL");
      for (let i = 0; i < 8; i++)
        await pages[0].getByRole("button", { name: "翻开下一页" }).click();
      await pages[0].screenshot({
        path: out + "/tp-reveal.png",
        fullPage: true,
      });
      const download = pages[0].waitForEvent("download");
      await pages[0]
        .getByRole("button", { name: "保存整条传话链" })
        .first()
        .click();
      assert((await download).suggestedFilename().endsWith(".png"));
      await pages[0].getByRole("button", { name: "看完了" }).click();
      await phase(pages[0], "RESULT");
    } else {
      await phase(pages[0], "DRAW");
      const views = await Promise.all(pages.map(state));
      const fake = views.findIndex((s) => s.view.role === "fake"),
        word = views.find((s) => s.view.word)!.view.word;
      assert(fake >= 0);
      for (let turn = 0; turn < 6; turn++) {
        const p = pages[turn % 3];
        await p.waitForFunction(
          (t) =>
            JSON.parse((window as any).render_game_to_text()).view.turn === t,
          turn,
        );
        await draw(p);
        await p.waitForFunction(
          (t) =>
            JSON.parse((window as any).render_game_to_text()).view.turn > t,
          turn,
        );
      }
      await phase(pages[0], "DISCUSS");
      await pages[0].screenshot({
        path: out + "/fa-shared.png",
        fullPage: true,
      });
      for (const p of pages)
        assert.equal((await state(p)).view.drawing.strokes.length, 6);
      await pages[0].getByRole("button", { name: "开始投票" }).click();
      for (let i = 0; i < 3; i++) {
        await pages[i]
          .getByRole("button", {
            name: "画家" + (i === fake ? (i + 1) % 3 : fake),
            exact: true,
          })
          .click();
        await pages[i].getByRole("button", { name: "确认投票" }).click();
      }
      await phase(pages[fake], "OBSERVE");
      await pages[fake].getByRole("button", { name: "我想好了" }).click();
      await pages[fake].screenshot({
        path: out + "/fa-guess.png",
        fullPage: true,
      });
      assert.equal(await pages[fake].locator("canvas").count(), 0);
      await pages[fake]
        .getByRole("button", { name: word, exact: true })
        .click();
      await phase(pages[0], "RESULT");
      await pages[0].screenshot({
        path: out + "/fa-result.png",
        fullPage: true,
      });
    }
    for (const p of pages) {
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "horizontal overflow",
      );
    }
    await pages[0].getByRole("button", { name: "再来一局" }).click();
    await pages[0].getByRole("button", { name: "我准备好了" }).waitFor();
    await Promise.all(contexts.map((c) => c.close()));
    console.log("BROWSER_PASS", mode);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        passed: true,
        engines: ["Chromium"],
        simulatedWidths: [375, 390, 412],
        realDevices: false,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
