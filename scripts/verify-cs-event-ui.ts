import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { Server } from "socket.io";
import { chromium } from "playwright";
import { attachCrimeScene } from "../apps/server/src/cs-sockets.ts";
import { reduceGame } from "../packages/crime-scene/src/game.ts";

const dir = mkdtempSync(join(tmpdir(), "cs-event-ui-"));
const web = resolve("dist/web");
const http = createServer((req, res) => {
  const requested = resolve(web, `.${decodeURIComponent(req.url?.split("?")[0] ?? "/")}`);
  const safe = requested.startsWith(web) ? requested : join(web, "index.html");
  try {
    const body = readFileSync(safe === web ? join(web, "index.html") : safe);
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2" } as Record<string, string>)[extname(safe)] ?? "text/html; charset=utf-8");
    res.end(body);
  } catch { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(readFileSync(join(web, "index.html"))); }
});
const io = new Server(http);
const store = attachCrimeScene(io, dir, { maxRooms: 10, idleMs: 60000 });
await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
const address = http.address();
if (!address || typeof address === "string") throw new Error("测试服务器未启动");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
try {
  const prepare = (id: string) => {
    const room = store.create();
    const tokens = Array.from({ length: 6 }, (_, seat) => room.claim(`玩家${seat + 1}`));
    room.configure(tokens[0], { eventsEnabled: true });
    room.start(tokens[0], 1000, () => 0.25);
    let state = room.file.state!;
    state = reduceGame(state, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
    state = reduceGame(state, { type: "tick" }, 61000, () => 0);
    for (const tile of state.board!.tiles) state = reduceGame(state, { type: "mark", seat: 0, tile, option: 0 }, 62000);
    state = reduceGame(state, { type: "brief", seat: 0 }, 63000);
    for (let i = 0; i < 5; i++) state = reduceGame(state, { type: "next_speaker", seat: 0 }, 64000, () => 0.25);
    state = { ...state, orangeDeck: [id, ...state.orangeDeck.filter((tile) => tile !== id)] };
    room.file.state = state;
    room.command(tokens[0], { type: "replace", seat: 0, oldTile: state.board!.tiles[2] }, 65000);
    return { room, tokens };
  };
  const openSeat = async (code: string, token: string) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(([roomCode, seatToken]) => localStorage.setItem(`crime-scene:${roomCode}`, seatToken), [code, token]);
    const page = await context.newPage();
    await page.goto(`${base}/?game=crime-scene&room=${code}`);
    return { context, page };
  };
  const { room, tokens } = prepare("event-04");
  if (room.file.state?.phase !== "event") throw new Error("未触发错误信息事件");

  const { context, page } = await openSeat(room.file.code, tokens[0]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("heading", { name: "错误信息" }).waitFor();
  mkdirSync("output/cs-ui", { recursive: true });
  await page.screenshot({ path: "output/cs-ui/event-04-mobile.png", fullPage: true });
  await page.locator(".cs-event-panel .cs-event-choices").first().getByRole("button", { name: "死因" }).click();
  await page.locator(".cs-event-panel .cs-event-choices").nth(1).getByRole("button", { name: "重伤" }).click();
  await page.getByRole("button", { name: "移动标记" }).click();
  await page.getByRole("heading", { name: "案件板" }).waitFor();
  if (room.file.state?.phase !== "round2_search" || room.file.state.board?.markers.death !== 1) throw new Error("事件操作没有回到搜证");
  if (errors.length) throw new Error(errors.join("; "));
  console.log(JSON.stringify({ ok: true, event: "错误信息", marker: room.file.state.board.markers.death }));
  await context.close();

  for (const [id, title] of [["event-01", "秘密证供"], ["event-02", "有据可寻"], ["event-03", "扭转局势"], ["event-05", "证据排除"], ["event-06", "倒数计时"]] as const) {
    const { room: current, tokens: seatTokens } = prepare(id);
    if (id === "event-05") {
      for (let seat = 5; seat >= 1; seat--) {
        const opened = await openSeat(current.file.code, seatTokens[seat]);
        await opened.page.getByRole("heading", { name: title }).waitFor();
        const player = current.file.state!.players[seat];
        const clue = player.clues.find((card) => current.file.state!.roles[seat] !== "killer" || card !== current.file.state!.answer?.clue)!;
        await opened.page.locator(".cs-event-panel").getByRole("button", { name: clue, exact: true }).click();
        await opened.context.close();
      }
    } else {
      const seat = id === "event-01" ? current.file.state!.roles.indexOf("witness") : 0;
      const opened = await openSeat(current.file.code, seatTokens[seat]);
      await opened.page.getByRole("heading", { name: title }).waitFor();
      const choices = opened.page.locator(".cs-event-panel .cs-event-choices");
      if (id === "event-01") {
        await choices.first().locator("button").first().click();
        await opened.page.getByRole("button", { name: "秘密提交" }).click();
      } else if (id === "event-02") {
        await choices.first().locator("button").first().click();
        await choices.nth(1).locator("button").first().click();
        await opened.page.getByRole("button", { name: "确认替换" }).click();
      } else if (id === "event-03") {
        await choices.first().locator("button").first().click();
        await opened.page.getByRole("button", { name: "放下额外场景板" }).click();
      } else {
        await choices.first().locator("button").first().click();
        await choices.first().locator("button").nth(1).click();
        await opened.page.getByRole("button", { name: "替换两块板" }).click();
      }
      await opened.context.close();
    }
    if (current.file.state!.phase !== "round2_search") throw new Error(`${title}未回到搜证：${current.file.state!.phase}`);
    console.log(JSON.stringify({ ok: true, event: title }));
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
}
