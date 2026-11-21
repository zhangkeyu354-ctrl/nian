import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.CS_TEST_BASE_URL ?? "http://127.0.0.1:3407";
const playerCount = Number(process.env.CS_TEST_PLAYERS ?? 4);
if (![4, 8, 12].includes(playerCount)) throw new Error("CS_TEST_PLAYERS 必须为 4、8 或 12");
const out = join(process.cwd(), "output", "cs-ui", `${playerCount}-players`);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
const contexts = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByTestId("cart-crime-scene").click();
  await page.getByTestId("open-crime-scene").click();
  await page.getByPlaceholder("输入昵称").waitFor();
  await page.getByRole("button", { name: "规则" }).click();
  await page.getByRole("heading", { name: "案件手册" }).waitFor();
  await page.getByRole("button", { name: "关闭规则" }).click();
  await page.getByPlaceholder("输入昵称").fill("房主");
  await page.screenshot({ path: join(out, "entry-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "创建房间" }).click();
  await page.getByText("玩家席位").waitFor();
  const code = (await page.locator(".cs-lobby-code b").innerText()).trim();
  await page.screenshot({ path: join(out, "lobby-mobile.png"), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error("手机大厅横向溢出");
  const playerPages = [page];
  for (let i = 1; i < playerCount; i++) {
    const participant = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    contexts.push(participant);
    const guest = await participant.newPage();
    guest.on("pageerror", (error) => errors.push(error.message));
    await guest.goto(`${base}/?game=crime-scene&room=${code}`, { waitUntil: "networkidle" });
    await guest.getByPlaceholder("输入昵称").fill(`玩家${i + 1}`);
    await guest.getByRole("button", { name: "加入", exact: true }).click();
    await guest.getByText("玩家席位").waitFor();
    playerPages.push(guest);
  }
  await page.getByText(`${playerCount}/12`).waitFor();
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.getByText("案发地点", { exact: true }).waitFor();
  await page.screenshot({ path: join(out, "setup-mobile.png"), fullPage: true });
  await page.locator(".cs-locations button").first().click();
  await page.getByText("夜幕降临…").waitFor();
  await page.screenshot({ path: join(out, "night-mobile.png"), fullPage: true });
  let killer = -1;
  let witness = -1;
  let solver = -1;
  for (let i = 1; i < playerPages.length; i++) {
    const role = playerPages[i].locator(".cs-role");
    await role.dispatchEvent("pointerdown");
    if (i === 1) { await playerPages[i].waitForTimeout(400); await playerPages[i].screenshot({ path: join(out, "identity-mobile.png") }); }
    const label = await role.innerText();
    await role.dispatchEvent("pointerup");
    if (label.includes("凶手")) killer = i;
    if (label.includes("目击者")) witness = i;
    if (solver < 0 && label.includes("调查员")) solver = i;
  }
  if (killer < 0) throw new Error("未找到凶手视角");
  const killerPage = playerPages[killer];
  await killerPage.locator(".cs-night .cs-card-row").first().locator("button").first().click();
  await killerPage.locator(".cs-night .cs-card-row").nth(1).locator("button").first().click();
  await killerPage.getByRole("button", { name: "确认作案证据" }).click();
  await killerPage.getByText("证据已选定").waitFor();
  await page.getByText("案件板").waitFor({ timeout: 75_000 });
  await page.screenshot({ path: join(out, "search-mobile.png"), fullPage: true });
  for (let i = 0; i < 6; i++) {
    if (i === 0) {
      await page.locator(".cs-tile").nth(i).locator(".cs-tile-expand").click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: join(out, "board-zoom-mobile.png") });
      await page.locator(".cs-board-dialog-options button").first().click();
    } else await page.locator(".cs-tile").nth(i).locator(".cs-tile-options button").first().click();
    await page.getByRole("button", { name: "确认放下" }).click();
  }
  await page.getByRole("button", { name: "开始简报" }).click();
  await page.getByText("当前发言").waitFor();
  await page.screenshot({ path: join(out, "brief-mobile.png"), fullPage: true });
  if (solver < 0) throw new Error("未找到调查员视角");
  const solverPage = playerPages[solver];
  await solverPage.getByRole("button", { name: "我要破案" }).click();
  await solverPage.waitForTimeout(300);
  await solverPage.screenshot({ path: join(out, "solve-mobile.png") });
  await solverPage.locator(".cs-targets button").filter({ hasText: `玩家${killer + 1}` }).click();
  await solverPage.locator(".cs-solve-dialog .cs-card-row").first().locator("button").first().click();
  await solverPage.locator(".cs-solve-dialog .cs-card-row").nth(1).locator("button").first().click();
  await solverPage.getByRole("button", { name: "提交指认" }).click();
  if (playerCount > 5) {
    if (witness < 0) throw new Error("多人局缺少目击者");
    await killerPage.getByRole("heading", { name: "目击者反杀" }).waitFor();
    await killerPage.waitForTimeout(300);
    await killerPage.screenshot({ path: join(out, "hunt-mobile.png") });
    await killerPage.locator(".cs-hunt-targets button").filter({ hasText: `玩家${witness + 1}` }).click();
    await killerPage.getByRole("button", { name: "提交最终指认" }).click();
    await killerPage.getByRole("heading", { name: "凶手逍遥法外" }).waitFor();
  }
  await solverPage.getByRole("heading", { name: playerCount > 5 ? "凶手逍遥法外" : "案件侦破" }).waitFor();
  await solverPage.waitForTimeout(850);
  await solverPage.screenshot({ path: join(out, "result-mobile.png"), fullPage: true });
  await page.getByRole("heading", { name: playerCount > 5 ? "凶手逍遥法外" : "案件侦破" }).waitFor();
  const stageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (stageOverflow) throw new Error("调查或简报页面横向溢出");
  if (errors.length) throw new Error(`页面异常：${errors.join("; ")}`);
  console.log(JSON.stringify({ ok: true, code, playerCount, killer, witness, solver, screenshots: ["entry-mobile.png", "lobby-mobile.png", "setup-mobile.png", "identity-mobile.png", "night-mobile.png", "search-mobile.png", "board-zoom-mobile.png", "brief-mobile.png", "solve-mobile.png", ...(playerCount > 5 ? ["hunt-mobile.png"] : []), "result-mobile.png"], overflow: false }));
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
