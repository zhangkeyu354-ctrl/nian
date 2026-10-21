// 眼疾手快浏览器整局验收：4 部手机（390×844 触屏）+ 1 部小屏（360×640），真实服务器进程。
// 先 npm run build。可用 PW_CHROME 指定已安装的 Chromium。
// 覆盖：大厅入口 → 建房 → 扫码链接加入 → 房主设目标分 → 开局 → 所有人同时看到同一张图 →
//      点错 −1（按钮抖动、本张锁定）→ 别人点对 +1 → 公布答案 → 打到目标分 → 结算 → 再来一局。
//      检查 5 个按钮和圆盘都完整显示在屏幕内（不需要滚动），没有页面报错。
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, type Page } from "playwright";
import { solve, type Obj } from "../packages/reflex-race/src/engine.ts";

const PORT = 3332;
const base = `http://127.0.0.1:${PORT}`;
const out = process.env.RR_SCREEN_DIR ?? "docs/reflex-race/screens";
mkdirSync(out, { recursive: true });
const data = mkdtempSync(join(tmpdir(), "rr-web-"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let server: ChildProcess | undefined = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/main.ts"],
  {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DBD_DATA_DIR: join(data, "dbd"),
      RR_DATA_DIR: join(data, "rr"),
      RR_TIMING: "1500,8000,900",
    },
    stdio: ["ignore", "ignore", "inherit"],
  },
);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(base + "/api/health")).ok) break;
  } catch {}
  if (i > 300) throw new Error("服务器未启动");
  await sleep(50);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROME,
  args: ["--no-sandbox", "--disable-gpu"],
});
const sizes = [
  { width: 390, height: 844 },
  { width: 390, height: 844 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];
const pages: Page[] = [];
for (const viewport of sizes) {
  const ctx = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  pages.push(await ctx.newPage());
}
const errors: string[] = [];
pages.forEach((p, i) => {
  p.on("pageerror", (e) => errors.push(`手机${i + 1}: ${e.message}`));
  p.on(
    "console",
    (m) => m.type() === "error" && errors.push(`手机${i + 1}: ${m.text()}`),
  );
});
const step = (m: string) => console.log("  ✓ " + m);
const shot = (p: Page, name: string) =>
  p.screenshot({ path: `${out}/${name}.png` });

/** 读出屏幕上的图（只用玩家能看到的信息） */
async function readCard(p: Page) {
  await p.getByTestId("rr-items").waitFor();
  return p.evaluate(() => ({
    no: Number(
      document
        .querySelector("[data-testid=rr-game]")!
        .getAttribute("data-card"),
    ),
    items: [...document.querySelectorAll(".rr-item")].map((e) => ({
      obj: Number(e.getAttribute("data-obj")),
      color: Number(e.getAttribute("data-color")),
    })),
  }));
}
const scoreOf = async (p: Page) =>
  p.evaluate(() =>
    [...document.querySelectorAll("[data-testid=rr-scores] li")].map((li) =>
      Number(li.querySelector("b")!.textContent),
    ),
  );
/** 元素完整落在视口内 */
async function inView(p: Page, sel: string) {
  return p.evaluate((sel) => {
    const vw = innerWidth,
      vh = innerHeight;
    return [...document.querySelectorAll(sel)].every((e) => {
      const r = e.getBoundingClientRect();
      return (
        r.top >= 0 &&
        r.left >= 0 &&
        r.bottom <= vh + 0.5 &&
        r.right <= vw + 0.5 &&
        r.width > 40
      );
    });
  }, sel);
}

try {
  const [host, ...guests] = pages;
  await host.goto(base);
  await shot(host, "00-hall");
  await host.getByTestId("open-rr").click();
  await host.getByTestId("rr-create").waitFor();
  await shot(host, "01-home");
  await host.getByTestId("rr-create").click();
  await host.getByTestId("rr-name").fill("房主");
  await host.getByTestId("rr-claim").click();
  const code = (await host.getByTestId("rr-code").textContent())!.trim();
  for (const [i, g] of guests.entries()) {
    await g.goto(`${base}/?game=rr&room=${code}`);
    await g.getByTestId("rr-name").fill("朋友" + (i + 1));
    await g.getByTestId("rr-claim").click();
  }
  await host.locator(".rr-quick button", { hasText: /^3$/ }).click();
  for (const p of pages)
    await p.getByTestId("rr-target").filter({ hasText: "3" }).waitFor();
  await host.getByText("开始（4 人）").waitFor();
  await shot(host, "02-lobby");
  step(`建房 ${code}，4 部手机加入，房主把目标分设为 3，所有人同步看到`);

  await host.getByTestId("rr-start").click();
  await pages[1].getByTestId("rr-ready").waitFor();
  await shot(pages[1], "03-ready");
  const cards = await Promise.all(pages.map(readCard));
  for (const c of cards) assert.deepEqual(c, cards[0], "所有手机看到同一张图");
  for (const [i, p] of pages.entries()) {
    assert.ok(await inView(p, ".rr-btn"), `手机${i + 1}：5 个按钮完整显示`);
    assert.ok(
      await inView(p, "[data-testid=rr-plate]"),
      `手机${i + 1}：圆盘完整显示`,
    );
    assert.equal(
      await p.evaluate(
        () => document.scrollingElement!.scrollHeight <= innerHeight + 1,
      ),
      true,
    );
  }
  await shot(pages[0], "04-card-390x844");
  await shot(pages[3], "05-card-360x640");
  step(
    "开局：准备 → 4 部手机同时显示同一张图；按钮和圆盘在 390×844、360×640 上都完整显示，不用滚动",
  );

  // 第 1 张：朋友1 点错，朋友2 点对
  let ans = solve(cards[0].items as { obj: Obj; color: Obj }[])!;
  const wrong = (ans + 1) % 5;
  await pages[1].getByTestId("rr-btn-" + wrong).tap();
  await pages[1].locator(".rr-btn.wrong .minus").waitFor();
  await shot(pages[1], "06-wrong");
  assert.equal(
    await pages[1].getByTestId("rr-btn-" + ans).isDisabled(),
    true,
    "点错后本张不能再点",
  );
  await pages[2].getByTestId("rr-btn-" + ans).tap();
  for (const p of pages) await p.getByTestId("rr-verdict").waitFor();
  await pages[0].locator(".rr-btn.answer").waitFor();
  await shot(pages[0], "07-reveal");
  const s1 = await scoreOf(pages[0]);
  assert.deepEqual(s1, [0, -1, 1, 0]);
  step(
    "朋友1 点错：按钮变红抖动、显示 −1、本张锁定；朋友2 点对 +1；所有人看到公布和正确答案",
  );

  // 之后由小屏手机（朋友3）连续抢 3 张拿下
  for (let k = 0; k < 3; k++) {
    await pages[3].waitForFunction((n) => {
      const g = document.querySelector("[data-testid=rr-game]");
      return (
        g &&
        Number(g.getAttribute("data-card")) > n &&
        document.querySelector("[data-testid=rr-items]")
      );
    }, k + 1);
    const c = await readCard(pages[3]);
    ans = solve(c.items as { obj: Obj; color: Obj }[])!;
    await pages[3].getByTestId("rr-btn-" + ans).tap();
    if (k < 2) await pages[3].getByTestId("rr-verdict").waitFor();
  }
  for (const p of pages) await p.getByTestId("rr-over").waitFor();
  await shot(pages[3], "08-over-winner");
  await shot(pages[0], "09-over-host");
  assert.match(
    (await pages[3].getByTestId("rr-over").textContent())!,
    /你赢了/,
  );
  assert.match(
    (await pages[1].getByTestId("rr-over").textContent())!,
    /朋友3 赢了/,
  );
  step("朋友3 先到 3 分：所有人弹出结算（排名、对错次数），赢家看到「你赢了」");

  await host.getByTestId("rr-again").click();
  for (const p of pages)
    await p
      .getByTestId("rr-ready")
      .or(p.getByTestId("rr-items"))
      .first()
      .waitFor();
  assert.deepEqual(await scoreOf(pages[2]), [0, 0, 0, 0]);
  step("房主「再来一局」：分数清零，直接开下一局");

  assert.deepEqual(errors, [], "页面没有报错");
  step("全程没有页面报错");
  console.log(`\n眼疾手快浏览器验收全部通过，截图在 ${out}/`);
} finally {
  await browser.close();
  server.kill();
  server = undefined;
}
process.exit(0);
