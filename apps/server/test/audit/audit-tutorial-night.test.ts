import { afterAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { io } from "socket.io-client";
import { CS_EVENTS } from "../../../../packages/shared/src/cs-protocol.ts";

// Run against the local built site and server: CS_AUDIT_BASE_URL=http://127.0.0.1:3407
const base = process.env.CS_AUDIT_BASE_URL;

describe.skipIf(!base)("上线审核：首次教学不能遮挡凶手夜晚选牌", () => {
  const socket = io(base!, { transports: ["websocket"] });
  const expertSocket = io(base!, { transports: ["websocket"] });
  afterAll(() => socket.disconnect());
  afterAll(() => expertSocket.disconnect());

  it("准备阶段未关闭教学时，进入夜晚应自动让出凶手选牌界面", async () => {
    const send = async (event: string, payload: object) => {
      const result = await socket.timeout(10_000).emitWithAck(event, payload) as { ok: boolean; code?: string; token?: string; snapshot?: { view?: { myRole: string } }; error?: string };
      if (!result.ok) throw new Error(result.error);
      return result;
    };
    const code = (await send(CS_EVENTS.create, {})).code!;
    const tokens: string[] = [];
    for (let seat = 0; seat < 4; seat++) tokens.push((await send(CS_EVENTS.claim, { code, name: `审核${seat}` })).token!);
    await send(CS_EVENTS.lobby, { code, token: tokens[0], action: { type: "start" } });
    let killer = -1;
    for (let seat = 0; seat < 4; seat++) {
      const joined = await send(CS_EVENTS.join, { code, token: tokens[seat] });
      if (joined.snapshot?.view?.myRole === "killer") killer = seat;
    }
    const expertJoin = await expertSocket.timeout(10_000).emitWithAck(CS_EVENTS.join, { code, token: tokens[0] }) as { ok: boolean; error?: string };
    if (!expertJoin.ok) throw new Error(expertJoin.error);
    expect(killer).toBeGreaterThan(0);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      await context.addInitScript(([roomCode, token]) => localStorage.setItem(`crime-scene:${roomCode}`, token), [code, tokens[killer]]);
      const page = await context.newPage();
      await page.goto(`${base}/?game=crime-scene&room=${code}`);
      await page.getByRole("dialog", { name: "新手教学" }).waitFor();
      await send(CS_EVENTS.command, { code, token: tokens[0], command: { type: "start", location: "location-1" } });
      await page.locator(".cs-night").waitFor();

      expect(await page.getByRole("dialog", { name: "新手教学" }).count()).toBe(0);
      expect(await page.locator(".cs-night .cs-card-row button").count()).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
