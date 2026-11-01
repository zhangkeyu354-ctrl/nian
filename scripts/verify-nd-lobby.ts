import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { assertUiShot } from "./screenshot-check.ts";
const base = process.env.ND_TEST_URL ?? "http://127.0.0.1:3000",
  out = "docs/naodong-scale/stage5";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROME,
});
const checks: string[] = [],
  errors: string[] = [];
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  const box = p.getByTestId("game-nd");
  await box.scrollIntoViewIfNeeded();
  assert.equal(await box.count(), 1);
  checks.push("首页唯一脑洞量表游戏盒可见");
  assert.ok((await box.innerText()).includes("脑洞量表"));
  await box.locator("img").evaluate(async (e) => {
    await (e as HTMLImageElement).decode();
  });
  checks.push("中文标题和官方盒装图加载");
  await assertUiShot(p, out + "/hall-390x844.png");
  await p.getByTestId("open-nd").click();
  assert.equal(new URL(p.url()).searchParams.get("game"), "nd");
  await p.getByRole("button", { name: "创建房间", exact: true }).waitFor();
  checks.push("点击进入 /?game=nd 正式入口");
  await assertUiShot(p, out + "/entry-390x844.png");
  await p.getByLabel("你的昵称").fill("阶段五验收");
  await p.getByRole("button", { name: "创建房间", exact: true }).click();
  await p.getByRole("button", { name: "复制邀请链接", exact: true }).waitFor();
  assert.match(
    new URL(p.url()).searchParams.get("room") ?? "",
    /^[A-Z2-9]{4}$/,
  );
  checks.push("真实服务器创建房间并入座");
  assert.equal(errors.length, 0);
  await p.getByRole("button", { name: "菜单", exact: true }).click();
  await p.getByRole("button", { name: "退出房间", exact: true }).click();
  await p.getByRole("button", { name: "创建房间", exact: true }).waitFor();
  checks.push("大厅离座返回入口");
  writeFileSync(
    out + "/LOBBY.json",
    JSON.stringify(
      { checks, passed: checks.length, failed: errors.length, errors },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ passed: checks.length, failed: errors.length, checks }),
  );
} finally {
  await browser.close();
}
