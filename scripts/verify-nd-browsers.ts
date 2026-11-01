import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page, type BrowserContext } from "playwright";
import { ndSandbox, until } from "./nd-test-harness.ts";
import type {
  NDSnapshot,
  NDAction,
  NDAck,
} from "../packages/shared/src/nd-protocol.ts";

const box = await ndSandbox();
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PW_CHROME ??
    (process.platform === "win32"
      ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
      : undefined),
});
const out = "docs/naodong-scale/stage3";
mkdirSync(join(out, "screens"), { recursive: true });
const errors: string[] = [],
  checks: string[] = [],
  games: object[] = [];
let packetChecks = 0,
  domChecks = 0,
  actions = 0;
let contexts: BrowserContext[] = [],
  pages: Page[] = [],
  code = "";
function inspectPacket(value: unknown, seat: number) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) inspectPacket(item, seat);
    return;
  }
  const o = value as Record<string, unknown>;
  if (
    typeof o.code === "string" &&
    typeof o.version === "number" &&
    "view" in o
  ) {
    box.checkSnapshot(o as unknown as NDSnapshot, seat);
    packetChecks++;
    return;
  }
  if (typeof o.ok === "boolean")
    assert.ok(
      Object.keys(o).every((k) =>
        [
          "ok",
          "error",
          "changed",
          "snapshot",
          "code",
          "token",
          "playerId",
        ].includes(k),
      ),
      "ack must not carry extra secret fields",
    );
  for (const child of Object.values(o)) inspectPacket(child, seat);
}
async function open(seat: number) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (ws) =>
    ws.on("framereceived", (event) => {
      try {
        const text = String(event.payload);
        if (!/^4[23]/.test(text)) return;
        const start = text.indexOf("[");
        if (start >= 0) inspectPacket(JSON.parse(text.slice(start)), seat);
      } catch (e) {
        errors.push(
          e instanceof Error ? e.message : "packet validation failed",
        );
      }
    }),
  );
  await page.goto(box.base);
  await page.waitForFunction(() => (window as any).nd?.online);
  return page;
}
const snapshot = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(document.getElementById("view")!.textContent!) as NDSnapshot,
  );
async function sync() {
  const version = box.store.rooms.get(code)!.file.version;
  await Promise.all(
    pages.map((p) =>
      p.waitForFunction(
        ({ code, version }) =>
          (window as any).nd.snapshot?.code === code &&
          (window as any).nd.snapshot.version >= version,
        { code, version },
      ),
    ),
  );
  const all = await Promise.all(pages.map(snapshot));
  all.forEach((s, i) => {
    box.checkSnapshot(s, i);
    domChecks++;
  });
  return all;
}
async function clickAction(seat: number, action: object, expected = true) {
  await sync();
  const p = pages[seat];
  await p.evaluate(() => ((window as any).nd.last = null));
  await p.locator("#command").fill(JSON.stringify(action));
  await p.locator("#send").click();
  await p.waitForFunction(() => (window as any).nd.last !== null);
  const a = await p.evaluate(() => (window as any).nd.last as NDAck);
  assert.equal(a.ok, expected, a.error ?? "unexpected action response");
  actions++;
  return a;
}
async function stateCheck() {
  const all = await sync();
  assert.equal(
    errors.length,
    0,
    "packet/DOM/script checks: " + errors.join(" | "),
  );
  return all;
}
async function complete() {
  let step = 0;
  while (box.store.rooms.get(code)!.file.state!.phase !== "FINISHED") {
    assert.ok(step++ < 160);
    const all = await stateCheck(),
      v = all[0].view!,
      capt = v.captain;
    if (v.phase === "CHOOSE_TOPIC")
      await clickAction(capt, {
        type: "CHOOSE_TOPIC",
        topicId: all[capt].view!.choices[0].id,
      });
    else if (v.phase === "ANSWER") {
      const members = all
        .map((s, i) =>
          s.view!.myNumber !== null && !v.players[i].ready ? i : -1,
        )
        .filter((i) => i >= 0);
      await clickAction(members.includes(capt) ? capt : members[0], {
        type: "READY",
      });
    } else if (v.phase === "ORDER") {
      // Test controller aggregates separate private client views; no hidden numbers
      // are ever injected into a browser. Only a list of seat indices is submitted.
      const order = all
        .map((s, i) => ({ i, n: s.view!.myNumber }))
        .filter((p) => p.n !== null)
        .sort((a, b) => a.n! - b.n!)
        .map((p) => p.i);
      await clickAction(capt, { type: "LOCK_ORDER", order });
    } else if (v.phase === "REVEAL")
      await clickAction(capt, { type: "REVEAL_NEXT" });
    else if (v.phase === "ROUND_END")
      await clickAction(capt, { type: "NEXT_ROUND" });
    else throw Error("unexpected basic phase");
  }
}
try {
  for (const n of [4, 6, 9]) {
    contexts = [];
    pages = [];
    const startActions = actions;
    for (let i = 0; i < n; i++) pages.push(await open(i));
    await pages[0].locator("#create").click();
    await pages[0].waitForFunction(() => (window as any).nd.code.length === 4);
    code = await pages[0].evaluate(() => (window as any).nd.code as string);
    for (let i = 0; i < n; i++) {
      await pages[i].locator("#code").fill(code);
      await pages[i].locator("#name").fill(`浏览器${i}`);
      await pages[i].locator("#claim").click();
      await pages[i].waitForFunction(
        () => (window as any).nd.token.length === 64,
      );
      if (i === 0) {
        // Other connected test pages have not claimed yet, so set capacity directly
        // through the real browser socket before using the all-seat sync helper.
        const a = await pages[0].evaluate(
          async (n) =>
            (window as any).nd.act({
              type: "SET_SETTINGS",
              count: n,
              seconds: 60,
              scale: n === 6 ? "normal" : "open",
            }),
          n,
        );
        assert.ok(a.ok);
      }
    }
    await clickAction(1, { type: "SET_SETTINGS", seconds: 0 }, false);
    checks.push(`${n}: non-host settings rejected`);
    for (let i = 0; i < n; i++) await clickAction(i, { type: "READY" });
    await clickAction(0, { type: "START", seed: 200 + n });
    let all = await stateCheck();
    await clickAction(0, {
      type: "CHOOSE_TOPIC",
      topicId: all[0].view!.choices[0].id,
    });
    await clickAction(0, { type: "TIMEOUT" }, false);
    await clickAction(0, { type: "READY", seat: 1 }, false);
    checks.push(`${n}: illegal server/seat commands rejected`);
    const first = n === 9 ? 1 : 0;
    if (n !== 9) await clickAction(1, { type: "READY" }, false);
    await clickAction(first, { type: "READY" });
    await clickAction(first, { type: "READY" }, false);
    checks.push(`${n}: locked answer cannot be resubmitted`);
    const room = box.store.rooms.get(code)!,
      prior = JSON.stringify(room.file.state);
    box.advance(room.file.deadline! - box.clock());
    await pages[first].waitForFunction(
      () => (window as any).nd.snapshot.expired,
    );
    assert.equal(JSON.stringify(room.file.state), prior);
    assert.equal(room.file.timeoutCount, 1);
    checks.push(
      `${n}: automatic server timeout preserves secret and locked response`,
    );
    all = await stateCheck();
    for (let i = 0; i < n; i++)
      if (all[i].view!.myNumber !== null && !room.file.state!.ready.includes(i))
        await clickAction(i, { type: "READY" });
    all = await stateCheck();
    const order = all
      .map((s, i) => ({ i, n: s.view!.myNumber }))
      .filter((p) => p.n !== null)
      .sort((a, b) => a.n! - b.n!)
      .map((p) => p.i);
    await clickAction(0, { type: "LOCK_ORDER", order });
    await clickAction(
      0,
      { type: "LOCK_ORDER", order: [...order].reverse() },
      false,
    );
    checks.push(`${n}: locked sort cannot be edited`);
    const own = all[1].view!.myNumber,
      seq = room.file.seq[room.file.players[1].id];
    await pages[1].evaluate(() => (window as any).nd.disconnect());
    await until(
      () => !room.connections.has(room.file.players[1].id),
      "browser disconnect",
    );
    const rejoined = await pages[1].evaluate(async () =>
      (window as any).nd.resume(),
    );
    assert.ok(rejoined.ok);
    assert.equal(rejoined.snapshot.view.myNumber, own);
    assert.deepEqual(rejoined.snapshot.view.order, order);
    assert.equal(rejoined.snapshot.nextSeq, seq + 1);
    checks.push(`${n}: token reconnect preserves number, order and seq`);
    await pages[2].reload();
    await pages[2].waitForFunction(() => (window as any).nd.online);
    await stateCheck();
    checks.push(`${n}: reload rejoins the same seat`);
    await pages[1].screenshot({
      path: join(out, "screens", `${n}-before-reveal.png`),
      fullPage: true,
    });
    await complete();
    all = await stateCheck();
    assert.equal(all[0].view!.round, 5);
    assert.equal(all[0].view!.result!.success, true);
    await pages[0].screenshot({
      path: join(out, "screens", `${n}-finished.png`),
      fullPage: true,
    });
    games.push({
      players: n,
      rounds: 5,
      result: "team-success",
      actions: actions - startActions,
      isolatedBrowserContexts: n,
    });
    for (const ctx of contexts) await ctx.close();
    contexts = [];
  }
  assert.deepEqual(errors, []);
  const report = {
    games,
    checks: checks.length,
    checkDetails: checks,
    packetChecks,
    domChecks,
    scriptOrPrivacyErrors: errors.length,
    failures: 0,
    scope:
      "Real browser Socket.IO fixture, not production UI. Only seat order is injected by a controller aggregating separate legal private views.",
  };
  writeFileSync(
    join(out, "BROWSERS.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser.close();
  await box.close();
}
