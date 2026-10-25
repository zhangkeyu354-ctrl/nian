import { assertUiShot } from "./screenshot-check.ts";
import { chromium, type Page } from "playwright";
import { io, type Socket } from "socket.io-client";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { gameScope } from "../packages/drawing-party/src/index.ts";
const url = process.env.DP_URL ?? "http://127.0.0.1:3015",
  out = "docs/drawing-party/public-verdict-screens";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(),
  sockets: Socket[] = [],
  metrics: any[] = [];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const req = (s: Socket, e: string, p: any) =>
  new Promise<any>((resolve, reject) =>
    s
      .timeout(8000)
      .emit(e, p, (err: any, r: any) =>
        err || !r?.ok ? reject(err ?? Error(r?.error)) : resolve(r),
      ),
  );
const state = (p: Page) =>
  p.evaluate(() => JSON.parse((window as any).render_game_to_text()));
async function screens(p: Page, label: string) {
  for (const size of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 390, height: 844 },
  ]) {
    await p.setViewportSize(size);
    await pause(1800);
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      label + " horizontal overflow",
    );
    const result = await p.evaluate(() => {
      const root = document.querySelector(
        ".tp-award-panel,.tp-theme-ballot,.tp-verdict",
      );
      const bad = root
        ? [...root.querySelectorAll("button")]
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return (
                r.width > 0 &&
                r.height > 0 &&
                (r.x < 0 ||
                  r.y < 0 ||
                  r.right > innerWidth ||
                  r.bottom > innerHeight)
              );
            })
            .map((b) => b.textContent)
        : [];
      const sheet = document
        .querySelector(".st-album-page")
        ?.getBoundingClientRect();
      return {
        bad,
        paper: sheet ? { width: sheet.width, height: sheet.height } : null,
      };
    });
    metrics.push({ label, ...size, ...result });
    if (label === "award" || label === "award-result") {
      const before = metrics.find(
        (m) => m.label === "reveal-before-award" && m.width === size.width,
      );
      assert(
        result.paper!.width * result.paper!.height >=
          before.paper.width * before.paper.height * 0.5,
        "voting paper shrank below half",
      );
    }
    writeFileSync(out + "/metrics.json", JSON.stringify(metrics, null, 2));
    assert.deepEqual(result.bad, [], label + " offscreen buttons");
    await assertUiShot(p, `${out}/${label}-${size.width}x${size.height}.png`);
  }
  await p.setViewportSize({ width: 844, height: 390 });
}
try {
  const n = 10,
    ss: Socket[] = [],
    seats: any[] = [];
  let op = 0;
  for (let i = 0; i < n; i++) {
    const s = io(url, { transports: ["websocket"], forceNew: true });
    sockets.push(s);
    ss.push(s);
    await new Promise<void>((r) => s.once("connect", r));
  }
  const { code } = await req(ss[0], "dp:create", { mode: "tp", count: n });
  for (let i = 0; i < n; i++) {
    await req(ss[i], "dp:join", { code });
    seats.push(await req(ss[i], "dp:claim", { code, name: "朋友" + (i + 1) }));
  }
  const snap = async (i = 1) =>
    (await req(ss[i], "dp:join", { code, token: seats[i].token })).snapshot;
  const action = async (i: number, a: any) => {
    await pause(90);
    const v = (await snap(i)).view;
    return req(ss[i], "dp:action", {
      code,
      token: seats[i].token,
      scope: v ? gameScope(v) : "lobby",
      op: String(++op),
      action: a,
    });
  };
  for (let i = 0; i < n; i++) await action(i, { type: "READY" });
  await action(0, { type: "START" });
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(
    ({ code, token }) => localStorage.setItem("dp-token-" + code, token),
    { code, token: seats[0].token },
  );
  const p = await ctx.newPage(),
    errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url + "/?game=tp&room=" + code);
  await p.getByTestId("drawing-studio").waitFor();
  await screens(p, "theme");
  assert.equal(await p.locator(".tp-theme-grid button").count(), 7);
  for (let i = 1; i < n; i++) await action(i, { type: "THEME_VOTE", theme: 4 });
  await p.getByRole("button", { name: "歌词", exact: true }).click();
  await p.waitForFunction(
    () =>
      JSON.parse((window as any).render_game_to_text()).phase ===
      "THEME_RESULT",
  );
  await assertUiShot(p, out + "/theme-banner.png", "body", "allow");
  await p.getByLabel("给朋友写个题目").waitFor();
  await screens(p, "prompt");
  assert.equal(
    await p.getByLabel("给朋友写个题目").getAttribute("placeholder"),
    "写一句你想到的歌词",
  );
  for (let i = 1; i < n; i++)
    await action(i, { type: "TEXT", text: "小鸡" });
  await p.getByLabel("给朋友写个题目").fill("小鸡");
  await p.getByRole("button", { name: "写好了", exact: true }).click();
  for (let step = 1; step <= n; step++) {
    await p.waitForFunction(
      (s) => JSON.parse((window as any).render_game_to_text()).view?.step === s,
      step,
    );
    for (let i = 1; i < n; i++)
      await action(
        i,
        step % 2 ? { type: "SUBMIT" } : { type: "TEXT", text: step===n ? "恐龙" : "猜测" + step },
      );
    if (step % 2) await p.getByRole("button", { name: "画好了" }).click();
    else {
      await p.getByLabel("写下你的猜测").fill(step===n ? "恐龙" : "我的猜测" + step);
      await p.getByRole("button", { name: "写好了", exact: true }).click();
    }
  }
  await p.waitForFunction(
    () => JSON.parse((window as any).render_game_to_text()).phase === "REVEAL",
  );
  await screens(p, "reveal-before-award");
  for (let chain = 0; chain < n; chain++) {
    for (let j = 0; j < n; j++)
      await p.getByRole("button", { name: "翻开下一页" }).click();
    await p.getByLabel("传达成功判断", { exact: true }).waitFor();
    if (chain === 0) await screens(p, "verdict");
    for (let i = 1; i < n; i++) {
      await action(i, {
        type: "VERDICT_VOTE",
        chain,
        choice: i % 2 ? "success" : "offtrack",
      });
      if (chain === 0 && i === 1)
        await p
          .getByRole("row")
          .filter({ hasText: "朋友2" })
          .getByRole("cell", { name: "成功", exact: true })
          .waitFor();
    }
    await p.getByRole("button", { name: "成功", exact: true }).click();
    if (chain === 0) await screens(p, "verdict-result");
    await p.getByRole("button", { name: "选 MVP 与坑货" }).click();
    await p.getByRole("region", { name: "本轮奖项投票" }).waitFor();
    if (chain === 0) {
      await screens(p, "award");
      await p.reload();
      await p.getByRole("region", { name: "本轮奖项投票" }).waitFor();
      await p.getByRole("button", { name: "查看第1页", exact: true }).click();
      assert.equal((await state(p)).phase, "AWARD");
    }
    const v = (await snap()).view;
    for (let i = 1; i < n; i++) {
      await action(i, {
        type: "AWARD_VOTE",
        chain,
        mvp: seats[(i + 1) % n].snapshot.me,
        dud: seats[(i + 1) % n].snapshot.me,
      });
      if (chain === 0 && i === 1) {
        await p
          .getByRole("button", { name: "公开投票明细", exact: true })
          .click();
        const row = p
          .getByRole("dialog", { name: "公开投票明细" })
          .getByRole("row")
          .filter({ hasText: "朋友2" });
        assert.equal(
          await row.getByRole("cell", { name: "朋友3", exact: true }).count(),
          2,
        );
        await p.getByRole("button", { name: "关闭明细", exact: true }).click();
      }
    }
    await p.getByRole("button", { name: "MVP：朋友2", exact: true }).click();
    await p.getByRole("button", { name: "坑货：朋友2", exact: true }).click();
    await p.getByRole("button", { name: "确认投票", exact: true }).click();
    await p.getByLabel("本轮奖项公布").waitFor();
    if (chain === 0) {
      await screens(p, "award-result");
      await p
        .getByRole("button", { name: "公开投票明细", exact: true })
        .click();
      await p.getByRole("dialog", { name: "公开投票明细" }).waitFor();
      await assertUiShot(p, out + "/public-votes.png");
      assert(
        (
          await p.getByRole("dialog", { name: "公开投票明细" }).innerText()
        ).includes("朋友2"),
      );
      await p.getByRole("button", { name: "关闭明细", exact: true }).click();
    }
    await p
      .getByRole("button", {
        name: chain === n - 1 ? "查看全场结算" : "翻开下一本",
      })
      .click();
  }
  await p.getByRole("dialog", { name: "本局结算" }).waitFor();
  await pause(2000);
  await screens(p, "total-result");
  assert.equal((await state(p)).view.awardResults.length, 10);
  assert.deepEqual(errors, []);
  writeFileSync(out + "/metrics.json", JSON.stringify(metrics, null, 2));
  console.log("TP_THEME_AWARD_UI_PASS", JSON.stringify(metrics));
  await ctx.close();
} finally {
  sockets.forEach((s) => s.disconnect());
  await browser.close();
}
