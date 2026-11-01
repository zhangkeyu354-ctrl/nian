import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { Server } from "socket.io";
import { chromium, type Page, type BrowserContext } from "playwright";
import { attachNaodongScale } from "../apps/server/src/nd-rooms.ts";
import {
  viewForND,
  type NDState,
} from "../packages/naodong-scale/src/index.ts";
import type { NDSnapshot } from "../packages/shared/src/nd-protocol.ts";
import { assertUiShot } from "./screenshot-check.ts";
const out = process.env.ND_UI_OUT ?? "docs/naodong-scale/ui-v3";
mkdirSync(out, { recursive: true });
let clock = Date.now();
const http = createServer((req, res) => {
  const path = resolve(
    "dist/web",
    (req.url ?? "/").split("?")[0].replace(/^\//, ""),
  );
  const file =
    existsSync(path) && extname(path) ? path : resolve("dist/web/index.html");
  if (!file.startsWith(resolve("dist/web"))) {
    res.statusCode = 403;
    res.end();
    return;
  }
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
  };
  res.setHeader(
    "Content-Type",
    mime[extname(file)] ?? "application/octet-stream",
  );
  res.end(readFileSync(file));
});
const io = new Server(http);
const store = attachNaodongScale(io, mkdtempSync(join(tmpdir(), "nd-ui-")), {
  maxRooms: 100,
  idleMs: 86400000,
  allowFixedSeed: false,
  clock: () => clock,
  tickMs: 10,
});
const versions = new Map<string, NDState | null>();
io.on("connection", (socket) =>
  socket.onAnyOutgoing((event, s: NDSnapshot) => {
    if (event === "nd:update")
      versions.set(
        `${s.code}:${s.version}`,
        structuredClone(store.rooms.get(s.code)!.file.state),
      );
  }),
);
await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PW_CHROME ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const errors: string[] = [],
  checks: string[] = [],
  screens: object[] = [],
  games: object[] = [];
let packetChecks = 0,
  layoutChecks = 0,
  domPrivacyChecks = 0;
let contexts: BrowserContext[] = [],
  pages: Page[] = [],
  snaps: (NDSnapshot | undefined)[] = [];
async function until(fn: () => boolean) {
  for (let i = 0; i < 1000; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("UI state wait timed out");
}
async function open(i: number) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(c);
  const p = await c.newPage();
  pages.push(p);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      try {
        const raw = String(f.payload);
        if (!/^4[23]/.test(raw)) return;
        const offset = raw.indexOf("[");
        if (offset < 0) return;
        const payload = JSON.parse(raw.slice(offset));
        const inspect = (value: any): void => {
          if (!value || typeof value !== "object") return;
          if (Array.isArray(value)) {
            for (const child of value) inspect(child);
            return;
          }
          if (
            typeof value.code === "string" &&
            typeof value.version === "number" &&
            "view" in value
          ) {
            const s = value as NDSnapshot;
            if (s.mySeat === i && (!snaps[i] || s.version >= snaps[i]!.version))
              snaps[i] = s;
            if (s.view) {
              const authoritative = versions.get(`${s.code}:${s.version}`);
              assert.ok(authoritative);
              assert.deepEqual(
                s.view,
                viewForND(authoritative, s.mySeat),
                "private projection mismatch",
              );
              assert.ok(s.players.every((p) => !("token" in p)));
              if (s.view.phase === "ANSWER")
                for (
                  let seat = 0;
                  seat < authoritative.answers.length;
                  seat++
                ) {
                  const text: string | null = authoritative.answers[seat];
                  if (seat === i || text === null) continue;
                  assert.equal(
                    s.view.answers[seat],
                    null,
                    "other answer must be null in ANSWER",
                  );
                  if (text !== authoritative.answers[i])
                    assert.ok(
                      !JSON.stringify(payload).includes(JSON.stringify(text)),
                      "other answer leaked in event or acknowledgement",
                    );
                }
              packetChecks++;
            }
          }
          for (const child of Object.values(value)) inspect(child);
        };
        inspect(payload);
      } catch (e) {
        errors.push(String(e));
      }
    }),
  );
  await p.addInitScript("globalThis.__name = (fn) => fn;");
  await p.addInitScript(() => {
    (window as any).__ndTicks = 0;
    const original = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (
      ...args: Parameters<OscillatorNode["start"]>
    ) {
      if (this.type === "square") {
        // 同一次发声在部分 Chromium 里会触发两次 start 钩子，50ms 内的算同一声。
        const now = performance.now();
        if (now - ((window as any).__ndLastSquare ?? -1e9) > 50)
          (window as any).__ndTicks++;
        (window as any).__ndLastSquare = now;
      }
      return original.apply(this, args);
    };
  });
  await p.goto(url + "/?game=nd");
  return p;
}
async function synced() {
  await until(() => snaps.every((s) => s && s.version === snaps[0]?.version));
}
async function primary(i: number) {
  const before = snaps[i]!.version;
  await pages[i].locator(".nd-primary").click();
  await until(() => snaps[i]!.version > before);
  await synced();
}
async function capture(p: Page, key: string) {
  await p.waitForTimeout(120);
  const layout = await p.evaluate(() => ({
    w: innerWidth,
    h: innerHeight,
    scroll: document.documentElement.scrollWidth,
    primary: document.querySelectorAll(".nd-action .nd-primary").length,
    missing: [...document.images].filter(
      (im) => !im.complete || im.naturalWidth === 0,
    ).length,
  }));
  assert.ok(layout.scroll <= layout.w + 1, `horizontal overflow ${key}`);
  assert.ok(layout.primary <= 1);
  assert.equal(layout.missing, 0);
  let seatRailHeight: number | null = null,
    stageEndGap: number | null = null,
    topicLines: number | null = null;
  if (await p.locator(".nd-layout").count()) {
    const compact = await p
      .locator(".nd-seats")
      .evaluate((e) => e.getBoundingClientRect().height);
    seatRailHeight = compact;
    assert.ok(
      layout.w >= 1000 || compact <= 72,
      `seat rail too tall ${key}: ${compact}`,
    );
    if (layout.w === 390) {
      const bottom = await p.evaluate(() => {
        const stage = document
            .querySelector(".nd-stage")!
            .getBoundingClientRect(),
          end = document
            .querySelector("[data-nd-stage-end]")!
            .getBoundingClientRect();
        return { last: end.bottom, limit: stage.bottom };
      });
      stageEndGap = bottom.limit - bottom.last;
      // Answer-card lists may scroll; the last item must be reachable, never covered by the action dock.
      assert.ok(Number.isFinite(bottom.last) && Number.isFinite(bottom.limit));
    }
    if (
      key.includes("order-") ||
      key.includes("reveal-") ||
      key.includes("round-end-")
    ) {
      assert.equal(
        await p.locator(".nd-topic-summary").count(),
        1,
        `topic must remain visible ${key}`,
      );
      const rows = await p.locator(".nd-topic-summary").evaluate((e) => {
        const c = getComputedStyle(e);
        return (
          (e.getBoundingClientRect().height -
            parseFloat(c.paddingTop) -
            parseFloat(c.paddingBottom) -
            parseFloat(c.borderTopWidth) -
            parseFloat(c.borderBottomWidth)) /
          parseFloat(c.lineHeight)
        );
      });
      topicLines = rows;
      assert.ok(rows <= 3.1, `topic longer than 3 lines ${key}`);
    }
  }
  if (layout.w === 1280 && (await p.locator(".nd-sidebar").count())) {
    const b = await p.locator(".nd-sidebar").boundingBox();
    assert.ok(
      b &&
        Math.abs(b.width - 320) < 1 &&
        Math.abs(b.height - (layout.h - 52)) < 2,
      `desktop sidebar ${key}`,
    );
  }
  if (key.includes("review-")) {
    const b = await p.locator(".nd-modal").boundingBox();
    assert.ok(
      b &&
        Math.abs(b.x + b.width / 2 - layout.w / 2) < 2 &&
        Math.abs(b.y + b.height / 2 - layout.h / 2) < 2,
      `centered recap ${key}`,
    );
  }
  const tiny = await p
    .locator(".nd-world")
    .evaluate((e) =>
      [...e.querySelectorAll("*")]
        .filter(
          (x) =>
            x.textContent?.trim() &&
            getComputedStyle(x).display !== "none" &&
            parseFloat(getComputedStyle(x).fontSize) < 12,
        )
        .map((x) => x.className),
    );
  assert.deepEqual(tiny, [], `text below 12px ${key}`);
  let portraitMaxBlank: number | null = null;
  if (layout.w === 390 && (await p.locator(".nd-stage").count())) {
    portraitMaxBlank = await p.locator(".nd-stage").evaluate((stage) => {
      const bounds = stage.getBoundingClientRect();
      const intervals: number[][] = [];
      const walk = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const node = walk.currentNode;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects())
          if (
            r.width > 0 &&
            r.height > 0 &&
            r.bottom > bounds.top &&
            r.top < bounds.bottom
          )
            intervals.push([
              Math.max(r.top, bounds.top),
              Math.min(r.bottom, bounds.bottom),
            ]);
      }
      for (const node of stage.querySelectorAll(
        "img,svg,textarea,.nd-writing-card,.nd-flip,[data-order-seat],.nd-wait-card-grid,.nd-answer-progress span",
      )) {
        const r = node.getBoundingClientRect();
        if (r.width && r.height)
          intervals.push([
            Math.max(r.top, bounds.top),
            Math.min(r.bottom, bounds.bottom),
          ]);
      }
      intervals.sort((a, b) => a[0] - b[0]);
      let end = bounds.top,
        max = 0;
      for (const [top, bottom] of intervals) {
        max = Math.max(max, top - end);
        end = Math.max(end, bottom);
      }
      return Math.max(max, bounds.bottom - end);
    });
    assert.ok(
      portraitMaxBlank <= 120,
      `portrait blank over 120px ${key}: ${portraitMaxBlank}`,
    );
  }
  layoutChecks++;
  const evidence = await assertUiShot(p, join(out, key + ".png"), "body");
  screens.push({
    key,
    ...layout,
    seatRailHeight,
    stageEndGap,
    topicLines,
    portraitMaxBlank,
    evidence,
  });
}
async function screenPhase(n: number, key: string, i = 0) {
  for (const vp of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await pages[i].setViewportSize(vp);
    await capture(pages[i], `${n}-${key}-${vp.width}x${vp.height}`);
    if (key === "order" || key === "round-end" || key === "reveal-before") {
      const container = pages[i].locator(
        key === "order" ? ".nd-order" : ".nd-stage",
      );
      if (
        await container.evaluate((e) => e.scrollHeight > e.clientHeight + 2)
      ) {
        await container.evaluate((e) => {
          e.scrollTop = e.scrollHeight;
        });
        await capture(
          pages[i],
          `${n}-${key}-scroll-end-${vp.width}x${vp.height}`,
        );
        await container.evaluate((e) => {
          e.scrollTop = 0;
        });
      }
    }
  }
  await pages[i].setViewportSize({ width: 390, height: 844 });
}
async function menu(p: Page, label: string) {
  await p.getByRole("button", { name: "菜单", exact: true }).click();
  await p.getByRole("button", { name: label, exact: true }).click();
}
async function closeMenu(p: Page) {
  await p.getByRole("button", { name: "关闭菜单" }).click();
}
async function answer(n: number, shot: boolean) {
  await until(() => snaps[0]?.view?.phase === "ANSWER");
  const cap = snaps[0]!.view!.captain,
    first = (cap + 1) % n;
  if (shot) {
    assert.equal(await pages[cap].locator("textarea").count(), 0);
    await screenPhase(n, "captain-waiting", cap);
    for (let seat = 0; seat < n; seat++) {
      if (seat === cap) continue;
      const badge = pages[seat].locator(".nd-number-badge b");
      assert.equal(
        await badge.textContent(),
        String(snaps[seat]!.view!.myNumber),
      );
      assert.ok(await badge.isVisible());
      domPrivacyChecks++;
    }
    const p = pages[first],
      input = p.getByRole("textbox", { name: "答题卡回答" });
    await screenPhase(n, "writing-card", first);
    await p.waitForTimeout(3100);
    assert.equal(
      await p.locator(".nd-number-badge b").textContent(),
      String(snaps[first]!.view!.myNumber),
    );
    await p.getByRole("button", { name: "遮住我的数字", exact: true }).click();
    assert.equal(await p.locator(".nd-number-badge b").textContent(), "●");
    await capture(p, `${n}-writing-number-hidden-390x844`);
    await p.getByRole("button", { name: "显示我的数字", exact: true }).click();
    await input.fill("字".repeat(31));
    assert.equal(
      await p.locator(".nd-action button").first().isDisabled(),
      true,
    );
    await p.getByText("最多 30 字", { exact: true }).waitFor();
    await input.fill("草稿重连后还在");
    await p.reload();
    await p.getByRole("textbox", { name: "答题卡回答" }).waitFor();
    assert.equal(
      await p.getByRole("textbox", { name: "答题卡回答" }).inputValue(),
      "草稿重连后还在",
    );
    checks.push(
      `${n}: draft survives reload; 31 characters cannot submit; own number stays visible and can be hidden`,
    );
    // Playwright has no operating-system phone keyboard. Exercise its visualViewport geometry explicitly.
    await p.getByRole("textbox", { name: "答题卡回答" }).focus();
    await p.evaluate(() => {
      Object.defineProperty(visualViewport!, "height", {
        configurable: true,
        get: () => 480,
      });
      visualViewport!.dispatchEvent(new Event("resize"));
      const panel = document.createElement("div");
      panel.id = "nd-test-keyboard";
      panel.textContent = "软键盘区域（自动化几何模拟）";
      Object.assign(panel.style, {
        position: "fixed",
        left: "0",
        right: "0",
        top: "480px",
        bottom: "0",
        background: "#dedfdf",
        color: "#33434a",
        padding: "48px 20px",
        textAlign: "center",
        font: "17px system-ui",
        zIndex: "100",
      });
      document.body.append(panel);
    });
    await p.locator(".nd-keyboard").waitFor();
    const geometry = await p.evaluate(() => ({
      button: document
        .querySelector(".nd-action button")!
        .getBoundingClientRect().bottom,
      input: document.querySelector("textarea")!.getBoundingClientRect().bottom,
      topic: document
        .querySelector(".nd-topic-summary")!
        .getBoundingClientRect().top,
    }));
    assert.ok(
      geometry.button <= 480 && geometry.input <= 480 && geometry.topic >= 52,
      JSON.stringify(geometry),
    );
    await capture(p, `${n}-writing-keyboard-simulated-390x844`);
    await p.evaluate(() => {
      document.getElementById("nd-test-keyboard")?.remove();
      delete (visualViewport as any).height;
      visualViewport!.dispatchEvent(new Event("resize"));
      (document.activeElement as HTMLElement)?.blur();
    });
    const text = n === 4 ? "<img onerror>" : `私密答题卡${n}-${first}`;
    await p.getByRole("textbox", { name: "答题卡回答" }).fill(text);
    await primary(first);
    await p.locator(".nd-submitted-answer").waitFor();
    assert.equal(await p.locator(".nd-submitted-answer").textContent(), text);
    assert.equal(await p.locator(".nd-submitted-answer img").count(), 0);
    for (let seat = 0; seat < n; seat++)
      if (seat !== first) {
        assert.equal(snaps[seat]!.view!.answers[first], null);
        assert.ok(
          !(await pages[seat].locator("body").innerText()).includes(text),
        );
      }
    await screenPhase(n, "submitted-card", first);
    await p
      .getByRole("button", { name: "已提交 · 撤回修改", exact: true })
      .click();
    await p.getByRole("textbox", { name: "答题卡回答" }).waitFor();
    assert.equal(
      await p.getByRole("textbox", { name: "答题卡回答" }).inputValue(),
      text,
    );
    await primary(first);
    await p.reload();
    await p.locator(".nd-submitted-answer").waitFor();
    assert.equal(await p.locator(".nd-submitted-answer").textContent(), text);
    checks.push(
      `${n}: typed submit/withdraw/edit, submitted reconnect, literal XSS, peer DOM and network text privacy`,
    );
    if (n === 9) {
      await p.emulateMedia({ reducedMotion: "reduce" });
      const remaining = Number(await p.locator(".nd-timer b").textContent());
      await p.evaluate(
        (delta) => {
          (window as any).__ndOriginalNow = Date.now;
          const original = Date.now;
          Date.now = () => original() + delta;
        },
        (remaining - 11) * 1000,
      );
      await p.waitForFunction(
        () => document.querySelector(".nd-timer b")?.textContent === "10",
      );
      await p.waitForTimeout(100);
      const ticks = await p.evaluate(() => (window as any).__ndTicks);
      await p.waitForFunction(
        () => document.querySelector(".nd-timer b")?.textContent === "8",
      );
      await p.waitForTimeout(100);
      assert.equal(
        (await p.evaluate(() => (window as any).__ndTicks)) - ticks,
        2,
        "one tick per second in reduced motion",
      );
      assert.equal(
        await p
          .locator(".nd-timer")
          .evaluate((e) => getComputedStyle(e).animationName),
        "none",
      );
      await menu(p, "音效：开");
      await closeMenu(p);
      const muted = await p.evaluate(() => (window as any).__ndTicks);
      await p.waitForTimeout(1200);
      assert.equal(await p.evaluate(() => (window as any).__ndTicks), muted);
      await capture(p, "9-last-ten-seconds-reduced-motion");
      await menu(p, "音效：关");
      await closeMenu(p);
      await p.evaluate(() => {
        Date.now = (window as any).__ndOriginalNow;
      });
      await p.emulateMedia({ reducedMotion: "no-preference" });
      checks.push(
        "9: one tick each second, mute skips audio, reduced motion preserves sound without animation",
      );
      clock += 60001;
      await until(() => snaps[0]?.view?.phase === "ORDER");
      assert.ok(
        snaps[0]!.view!.answers.filter((t) => t === "（没写）").length ===
          n - 2,
      );
      checks.push(
        "9: server deadline publishes missing cards and advances to sorting",
      );
    }
  }
  for (let seat = 0; seat < n; seat++) {
    if (
      seat === cap ||
      snaps[0]!.view!.phase !== "ANSWER" ||
      snaps[seat]!.view!.players[seat].ready
    )
      continue;
    await pages[seat]
      .getByRole("textbox", { name: "答题卡回答" })
      .fill(`回答${n}人第${snaps[seat]!.view!.round}轮${seat}号`);
    await primary(seat);
  }
  await until(() => ["ORDER", "EXPERT"].includes(snaps[0]!.view!.phase));
}
async function sort(n: number, shot: boolean, descending = false) {
  const cap = snaps[0]!.view!.captain,
    p = pages[cap];
  const desired = snaps
    .map((s, i) => ({ i, n: s!.view!.myNumber }))
    .filter((s) => s.i !== cap && s.n !== null)
    .sort((a, b) => (descending ? b.n! - a.n! : a.n! - b.n!))
    .map((s) => s.i);
  if (shot) {
    await screenPhase(n, "order", cap);
    await screenPhase(n, "order-spectator", (cap + 1) % n);
    assert.ok(
      await pages[(cap + 1) % n]
        .locator("[data-order-seat]")
        .first()
        .isDisabled(),
    );
    const buttons = p.locator("[data-order-seat]");
    const a = Number(await buttons.nth(0).getAttribute("data-order-seat")),
      b = Number(await buttons.nth(1).getAttribute("data-order-seat"));
    await buttons.nth(0).click();
    await buttons.nth(1).click();
    assert.equal(
      Number(await buttons.nth(0).getAttribute("data-order-seat")),
      b,
    );
    assert.equal(
      Number(await buttons.nth(1).getAttribute("data-order-seat")),
      a,
    );
    await synced();
    assert.deepEqual(
      snaps[(cap + 1) % n]!.view!.order,
      await p
        .locator("[data-order-seat]")
        .evaluateAll((es) =>
          es.map((e) => Number((e as HTMLElement).dataset.orderSeat)),
        ),
    );
    checks.push(
      `${n}: tap swaps order and all other seats synchronize read-only fronts`,
    );
    const liveOrder = snaps[(cap + 1) % n]!.view!.order;
    await pages[(cap + 1) % n].waitForFunction(
      (expected) =>
        JSON.stringify(
          [...document.querySelectorAll("[data-order-seat]")].map((e) =>
            Number((e as HTMLElement).dataset.orderSeat),
          ),
        ) === JSON.stringify(expected),
      liveOrder,
    );
    // Touch-compatible pointer drag uses the visible handle, leaving the card body available to scroll.
    await p.waitForFunction(
      () =>
        !(document.querySelector("[data-order-seat]") as HTMLButtonElement)
          ?.disabled,
    );
    const beforeDragVersion = snaps[cap]!.version;
    const from = await buttons
        .nth(0)
        .locator("[data-nd-drag-handle]")
        .boundingBox(),
      to = await buttons.nth(1).boundingBox();
    assert.ok(from && to);
    const touch = await p.context().newCDPSession(p);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: from.x + from.width / 2, y: from.y + from.height / 2 },
      ],
    });
    for (let k = 1; k <= 8; k++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x:
              from.x +
              from.width / 2 +
              ((to.x + to.width / 2 - from.x - from.width / 2) * k) / 8,
            y:
              from.y +
              from.height / 2 +
              ((to.y + to.height / 2 - from.y - from.height / 2) * k) / 8,
          },
        ],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
    await until(() => snaps[cap]!.version > beforeDragVersion);
    await synced();
    await p.waitForFunction(
      (expected) =>
        Number(
          (document.querySelector("[data-order-seat]") as HTMLElement)?.dataset
            .orderSeat,
        ) === expected,
      a,
    );
    assert.equal(
      Number(await buttons.nth(0).getAttribute("data-order-seat")),
      a,
    );
    checks.push(`${n}: mobile touch drag moves order`);
  }
  let current = await p
    .locator("[data-order-seat]")
    .evaluateAll((els) =>
      els.map((e) => Number((e as HTMLElement).dataset.orderSeat)),
    );
  for (let k = 0; k < desired.length; k++) {
    if (current[k] === desired[k]) continue;
    await p.locator(`[data-order-seat="${current[k]}"]`).click();
    await p.locator(`[data-order-seat="${desired[k]}"]`).click();
    const j = current.indexOf(desired[k]);
    [current[k], current[j]] = [current[j], current[k]];
  }
  await primary(cap);
  assert.deepEqual(snaps[cap]!.view!.order, desired);
  await until(() => snaps[0]!.view!.phase === "REVEAL");
}
try {
  for (const n of [4, 6, 9]) {
    contexts = [];
    pages = [];
    snaps = [];
    for (let i = 0; i < n; i++) await open(i);
    await pages[0].getByLabel("你的昵称").fill("小王今天不想上班了");
    await pages[0]
      .getByRole("button", { name: "创建房间", exact: true })
      .click();
    await until(() => !!snaps[0]?.code);
    const code = snaps[0]!.code;
    await pages[0].getByLabel("人数", { exact: true }).selectOption(String(n));
    await until(() => snaps[0]!.settings.count === n);
    await pages[0].getByLabel("计时", { exact: true }).selectOption("60");
    await until(() => snaps[0]!.settings.seconds === 60);
    for (let i = 1; i < n; i++) {
      await pages[i]
        .getByLabel("你的昵称")
        .fill(
          [
            "小李准备下班",
            "阿陈今天吃火锅",
            "小赵想去旅行",
            "大橘带着零食",
            "小周不想早起",
            "阿林喜欢下雨",
            "小吴刚喝完茶",
            "小郑还没吃饭",
          ][i - 1] + "甲乙丙",
        );
      await pages[i].getByLabel("房间号（加入朋友时填写）").fill(code);
      await pages[i]
        .getByRole("button", { name: "加入房间", exact: true })
        .click();
      await until(() => snaps[i]?.mySeat === i);
    }
    await synced();
    await pages[0].getByText("人齐了，等房主开始", { exact: true }).waitFor();
    await screenPhase(n, "lobby");
    assert.equal(await pages[0].locator(".nd-seats .nd-me").count(), 1);
    assert.equal(await pages[0].locator(".nd-seats .nd-crown").count(), 1);
    if (n === 9) {
      const overflow = await pages[0]
        .locator(".nd-seats")
        .evaluate((e) => e.scrollWidth > e.clientWidth);
      assert.ok(overflow, "9p seat rail must scroll horizontally");
    }
    await pages[0].locator(".nd-seats button").first().click();
    assert.equal(await pages[0].locator(".nd-full-players li").count(), n);
    const names = await pages[0]
      .locator(".nd-full-players strong")
      .allTextContents();
    assert.deepEqual(
      names,
      snaps[0]!.players.map((p) => p.name),
    );
    await screenPhase(n, "full-players");
    await closeMenu(pages[0]);
    checks.push(
      `${n}: compact rail, crown, self mark and complete roster dialog`,
    );
    for (let i = 0; i < n; i++) await primary(i);
    await primary(0);
    await screenPhase(n, "choose-topic");
    await pages[0].locator(".nd-choices>button").first().click();
    await screenPhase(n, "choose-topic-selected");
    assert.equal(
      await pages[0].locator(".nd-primary").textContent(),
      "就选题目 A",
    );
    assert.equal(
      await pages[0].locator(".nd-choices > button.selected").count(),
      1,
    );
    checks.push(`${n}: topic selection labels and bright confirmation`);
    await primary(0);
    await answer(n, true);
    // Reconnect by a real page reload, preserving the same credential and own number.
    const mine = snaps[1]!.view!.myNumber;
    const oldVersion = snaps[1]!.version;
    snaps[1] = undefined;
    await pages[1].reload();
    await until(
      () => snaps[1]?.mySeat === 1 && (snaps[1]?.version ?? -1) >= oldVersion,
    );
    await pages[1].locator(".nd-sort,.nd-expert").waitFor();
    assert.equal(snaps[1]!.view!.myNumber, mine);
    checks.push(`${n}: reload reconnect preserves seat and number`);
    await sort(n, true);
    await screenPhase(n, "reveal-before");
    await primary(snaps[0]!.view!.captain);
    await until(() => snaps[0]!.view!.revealed.length >= 1);
    assert.ok((await pages[0].locator(".nd-flip-inner.turned").count()) >= 1);
    await screenPhase(n, "reveal-first");
    await capture(pages[0], `${n}-reveal-middle-390x844`);
    await until(() => snaps[0]!.view!.phase === "ROUND_END");
    await screenPhase(n, "round-end");
    await menu(pages[0], "规则速览");
    await screenPhase(n, "rules");
    await closeMenu(pages[0]);
    await menu(pages[0], "本局回顾");
    await screenPhase(n, "review");
    await closeMenu(pages[0]);
    for (let round = 2; round <= 5; round++) {
      await primary(snaps[0]!.view!.captain);
      const cap = snaps[0]!.view!.captain;
      await until(() => snaps[cap]!.view!.choices.length === 2);
      await pages[cap].locator(".nd-choices>button").first().click();
      await primary(cap);
      await answer(n, false);
      await sort(n, false);
      await pages[cap]
        .getByRole("button", { name: "跳过", exact: true })
        .click();
      await until(() =>
        ["ROUND_END", "FINISHED"].includes(snaps[0]!.view!.phase),
      );
      await synced();
    }
    assert.equal(snaps[0]!.view!.result?.success, true);
    assert.equal(await pages[0].locator(".nd-result-gauge.success").count(), 1);
    await pages[0].waitForTimeout(150);
    if (await pages[0].locator(".nd-confetti").count()) {
      await pages[0].screenshot({
        path: join(out, `${n}-success-celebration.png`),
        animations: "allow",
      });
      await pages[0]
        .getByRole("button", { name: "跳过动画", exact: true })
        .click();
      assert.equal(await pages[0].locator(".nd-confetti").count(), 0);
      checks.push(`${n}: celebration can be skipped`);
    }
    await screenPhase(n, "finished");
    games.push({ players: n, rounds: snaps[0]!.view!.round, success: true });
    if (n === 9) {
      await pages[0].setViewportSize({ width: 1280, height: 800 });
      await capture(pages[0], "9-desktop-1280x800");
      await pages[0].setViewportSize({ width: 390, height: 844 });
      await contexts[0].setOffline(true);
      await pages[0].locator(".nd-disconnected").waitFor();
      await capture(pages[0], "9-disconnected-390x844");
      await contexts[0].setOffline(false);
      await pages[0].locator(".nd-disconnected").waitFor({ state: "hidden" });
      await primary(0);
      for (let i = 0; i < n; i++) await primary(i);
      await primary(0);
      for (let round = 1; round <= 2; round++) {
        const cap = snaps[0]!.view!.captain;
        await until(() => snaps[cap]!.view!.choices.length === 2);
        await pages[cap].locator(".nd-choices>button").first().click();
        await primary(cap);
        await answer(n, false);
        await sort(n, false, true);
        await pages[cap]
          .getByRole("button", { name: "跳过", exact: true })
          .click();
        await until(() =>
          ["ROUND_END", "FINISHED"].includes(snaps[0]!.view!.phase),
        );
        if (round === 1) {
          await screenPhase(n, "wrong-reveal");
          await primary(cap);
        }
      }
      assert.equal(snaps[0]!.view!.result?.success, false);
      assert.equal(await pages[0].locator(".nd-result-gauge.empty").count(), 1);
      await screenPhase(n, "team-failed");
      games.push({ players: 9, rounds: snaps[0]!.view!.round, success: false });
      checks.push("9: red cross and immediate cooperative defeat");
    }
    if (n === 4) {
      await primary(0);
      await pages[0].getByLabel("玩法", { exact: true }).selectOption("true");
      await until(() => snaps[0]!.settings.expert);
      for (let i = 0; i < n; i++) await primary(i);
      await primary(0);
      for (let round = 1; round <= 5; round++) {
        const cap = snaps[0]!.view!.captain;
        await until(() => snaps[cap]!.view!.choices.length === 2);
        await pages[cap].locator(".nd-choices>button").first().click();
        await primary(cap);
        await answer(n, false);
        if (round === 1) await screenPhase(n, "expert-guess", cap);
        for (const target of Array.from({ length: n }, (_, i) => i).filter(
          (i) => i !== cap,
        )) {
          await pages[cap].locator(`[data-target-seat="${target}"]`).click();
          await pages[cap]
            .locator(".nd-number-grid button")
            .filter({
              hasText: new RegExp(`^${snaps[target]!.view!.myNumber}$`),
            })
            .click();
          if (round === 1 && target === (cap + 1) % n) {
            await screenPhase(n, "expert-guess-selected", cap);
            assert.ok(
              (await pages[cap].locator(".nd-primary").textContent())?.includes(
                `确认：${target + 1}号 `,
              ),
            );
            checks.push(
              "4: selected expert teammate and exact number in confirmation",
            );
          }
          await primary(cap);
        }
        assert.equal(snaps[0]!.view!.phase, "CAPTAIN_GUESS");
        const submitter = (cap + 1) % n;
        if (round === 1)
          await screenPhase(n, "expert-captain-guess", submitter);
        await pages[submitter]
          .locator(".nd-number-grid button")
          .filter({ hasText: new RegExp(`^${snaps[cap]!.view!.myNumber}$`) })
          .click();
        await primary(submitter);
        if (round < 5) await primary(cap);
      }
      assert.equal(snaps[0]!.view!.result?.success, true);
      await screenPhase(n, "expert-finished");
      games.push({ players: 4, expert: true, rounds: 5, success: true });
      checks.push(
        "4: expert targets and common captain guess complete five rounds",
      );
    }
    for (const c of contexts) await c.close();
  }
  const errorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const errorPage = await errorContext.newPage();
  await errorPage.goto(url + "/?game=nd");
  await errorPage.getByLabel("你的昵称").fill("连接测试");
  await errorPage.getByLabel("房间号（加入朋友时填写）").fill("ZZZZ");
  await errorPage
    .getByRole("button", { name: "加入房间", exact: true })
    .click();
  await errorPage.locator(".nd-error").waitFor();
  await capture(errorPage, "rejection-chinese-feedback");
  await errorContext.close();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url);
  await p.locator(".box-nd").scrollIntoViewIfNeeded();
  await capture(p, "homepage-box-390x844");
  await p.close();
  assert.equal(errors.length, 0, JSON.stringify(errors));
  writeFileSync(
    join(out, "REPORT.json"),
    JSON.stringify(
      {
        games,
        checks,
        packetChecks,
        layoutChecks,
        domPrivacyChecks,
        screens,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      games,
      checks,
      packetChecks,
      layoutChecks,
      domPrivacyChecks,
      screens: screens.length,
      errors,
    }),
  );
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
  store.close();
  await new Promise<void>((r) => io.close(() => r()));
}
