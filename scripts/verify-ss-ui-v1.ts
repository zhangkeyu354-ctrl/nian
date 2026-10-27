import { chromium, devices, type Page } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { SSRoom } from "../apps/server/src/ss-rooms.ts";
import {
  createSS,
  reduceSS,
  EVENTS,
  type SSState,
  type EventId,
  type Command,
} from "../packages/soda-smugglers/src/index.ts";
import { withHands } from "../packages/soda-smugglers/test/helpers.ts";
import { eventCopy } from "../apps/web/src/ss/ui-model.ts";
import { assertUiShot } from "./screenshot-check.ts";
import { measureContrast } from "./ss-pixel-contrast.ts";
const out = "docs/soda-smugglers/ui-v1";
mkdirSync(out, { recursive: true });
const root = mkdtempSync(join(tmpdir(), "ss-ui4-"));
const data = join(root, "ss");
mkdirSync(data);
const caps = "23456789";
let serial = 0;
function code() {
  let n = serial++;
  return "V" + caps[(n >> 6) & 7] + caps[(n >> 3) & 7] + caps[n & 7];
}
const names = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    n === 8
      ? `长名字旅客张三李赵${i + 1}`
      : i === 0
        ? "十个字的缉私警长名字"
        : `旅客 ${i + 1}`,
  );
function act(s: SSState, body: Record<string, unknown>, actor = s.guard) {
  return reduceSS(s, {
    ...body,
    actor,
    seq: (s.seq[String(actor)] ?? 0) + 1,
    now: 1000,
  } as Command);
}
function pack(s: SSState) {
  for (let i = 0; i < s.players.length; i++)
    if (i !== s.guard && !s.players[i].submitted) {
      const h = s.players[i].hand;
      const n = s.event === "holiday" ? 3 : 2;
      s = act(s, { type: "SUBMIT", luggage: h.slice(0, n), bribe: h[n] }, i);
    }
  return s;
}
function seedFor(event: EventId) {
  for (let seed = 1; seed < 300; seed++)
    if (createSS(names(3), { seed, events: true }).event === event) return seed;
  throw Error("event seed missing");
}
function stateAt(phase: SSState["phase"], n = 3, event?: EventId) {
  let s = createSS(names(n), {
    seed: event ? seedFor(event) : 7,
    events: !!event,
    firstGuard: 0,
    now: 1000,
  });
  if (phase === "PACK") return s;
  for (;;) {
    if (s.phase === "PACK") s = pack(s);
    else if (
      s.phase === "BRIBE" ||
      s.phase === "INSPECT" ||
      s.phase === "ARREST"
    )
      s = act(s, { type: "ADVANCE" });
    else if (s.phase === "ROUND_END") {
      if (phase === "ROUND_END") return s;
      s = act(s, { type: "NEXT_ROUND" });
    }
    if (s.phase === phase) return s;
  }
}
function makeFixture(state: SSState | null, n = 3, used = n) {
  const c = code();
  const r = SSRoom.create(c, data);
  r.file.count = n;
  r.file.events = state?.options.events ?? false;
  r.file.seconds = state?.options.seconds ?? 0;
  const claims = names(n)
    .slice(0, used)
    .map((x) => r.claim(x));
  r.file.state = state;
  r.file.version++;
  r.save();
  return { code: c, claims };
}
const fixtures = {
  lobby: makeFixture(null, 8, 6),
  pack: makeFixture(stateAt("PACK", 3, "holiday")),
  bribe: makeFixture(stateAt("BRIBE")),
  inspect: makeFixture(stateAt("INSPECT")),
  arrest: makeFixture(stateAt("ARREST")),
  round: makeFixture(stateAt("ROUND_END")),
  finish: makeFixture(stateAt("FINISHED")),
  max: makeFixture(stateAt("PACK", 8), 8),
  maxLobby: makeFixture(null, 8, 8),
};
const maxFixtures = Object.fromEntries((["PACK", "BRIBE", "INSPECT", "ARREST", "ROUND_END", "FINISHED"] as const).map(phase => [phase, makeFixture(stateAt(phase, 8), 8)]));
const eventFixtures = Object.fromEntries(
  EVENTS.map((e) => [e, makeFixture(stateAt("PACK", 3, e))]),
) as Record<EventId, ReturnType<typeof makeFixture>>;
function arrestFixture(kind: "caught" | "wrong" | "impartial") {
  const event = kind === "impartial" ? "impartial" : undefined;
  let s = createSS(names(3), {
    seed: event ? seedFor(event) : 4,
    events: !!event,
    firstGuard: 0,
    now: 1000,
  });
  s = withHands(s, [
    [],
    kind === "caught" ? [3, 2, 0, 0, 1] : [0, 1, 0, 2, 2],
    [0, 0, 1, 1, 1],
  ]);
  s = pack(s);
  s = act(act(s, { type: "ADVANCE" }), { type: "ADVANCE" });
  return makeFixture(s);
}
const dragDesk = makeFixture(stateAt("PACK")),
  dragTouch = makeFixture(stateAt("PACK"));
const arrests = {
  caught: arrestFixture("caught"),
  wrong: arrestFixture("wrong"),
  impartial: arrestFixture("impartial"),
};
const finder = createServer();
await new Promise<void>((r) => finder.listen(0, "127.0.0.1", r));
const port = (finder.address() as any).port;
await new Promise<void>((r) => finder.close(() => r()));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/main.ts"],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      SS_DATA_DIR: data,
      DBD_DATA_DIR: join(root, "dbd"),
      RK_DATA_DIR: join(root, "rk"),
      DM_DATA_DIR: join(root, "dm"),
      MA_DATA_DIR: join(root, "ma"),
      CN_DATA_DIR: join(root, "cn"),
      RR_DATA_DIR: join(root, "rr"),
      XB_DATA_DIR: join(root, "xb"),
      DP_DATA_DIR: join(root, "dp"),
      WT_DISABLE: "1",
    },
  },
);
let serverLog = "";
server.stdout!.on("data", (b) => (serverLog += b));
server.stderr!.on("data", (b) => (serverLog += b));
const screenshots: {
  file: string;
  name: string;
  width: number;
  height: number;
  scope: string;
}[] = [];
const checks: string[] = [];
const accessibility: unknown[] = [];
const pixelContrast: Array<{name:string; tested:number; passed:number; untested:string[]; failures: Array<{text:string;ratio:number;foreground:string;background:string}>}> = [];
const errors: string[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function connect(
  f: ReturnType<typeof makeFixture>,
  seat: number,
  width: number,
  height: number,
  options: { identity?: boolean; touch?: boolean } = {},
) {
  const ctx = await browser!.newContext({
    viewport: { width, height },
    isMobile: !!options.touch,
    hasTouch: !!options.touch,
  });
  await ctx.addInitScript(
    ({ code, token }) => localStorage.setItem("ss:" + code, token),
    { code: f.code, token: f.claims[seat].token },
  );
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${base}/?game=ss&room=${f.code}`);
  await p.waitForFunction(
    () => !!JSON.parse(window.render_game_to_text?.() ?? "null")?.mySeat,
  );
  if (!options.identity) {
    const x = p.getByTestId("ss-identity-close");
    if (await x.isVisible().catch(() => false)) await x.click();
  }
  return { ctx, p };
}
async function audit(p: Page, name: string) {
  const report = await p.evaluate(() => {
    const root = document.documentElement;
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".ss-world button:not([disabled])",
      ),
    ].filter((x) => {
      const r = x.getBoundingClientRect(),
        c = getComputedStyle(x);
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        c.visibility !== "hidden"
      );
    });
    return {
      horizontal: root.scrollWidth > innerWidth + 1,
      oversized: [...document.querySelectorAll<HTMLElement>(".ss-world *")]
        .filter((x) => {
          const r = x.getBoundingClientRect();
          return (
            r.width > innerWidth + 1 && getComputedStyle(x).position !== "fixed"
          );
        })
        .slice(0, 8)
        .map((x) => x.className),
      small: buttons
        .filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width < 43.5 || r.height < 43.5;
        })
        .map(
          (x) => x.getAttribute("data-testid") || x.textContent?.slice(0, 18),
        ),
      primary: [...document.querySelectorAll(".ss-dock-wrap .ss-primary")]
        .length,
      seatErrors: [...document.querySelectorAll<HTMLElement>(".ss-seat-bottom")].flatMap(el => [ ...(el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().bottom > el.closest('.ss-seat')!.getBoundingClientRect().bottom + 1 ? [el.textContent] : []), ...[...el.querySelectorAll<HTMLElement>("span")].filter(x => x.scrollWidth > x.clientWidth + 1 || x.getBoundingClientRect().height > parseFloat(getComputedStyle(x).lineHeight) + 3 || x.getBoundingClientRect().right > el.getBoundingClientRect().right + 1 || x.getBoundingClientRect().bottom > el.closest('.ss-seat')!.getBoundingClientRect().bottom + 1).map(x => x.textContent)]),
      nameErrors: [...document.querySelectorAll<HTMLElement>(".ss-seat-top strong")].filter(x => getComputedStyle(x).whiteSpace !== 'nowrap' || x.getBoundingClientRect().height > parseFloat(getComputedStyle(x).lineHeight) + 3).map(x=>x.textContent),
    };
  });
  assert.equal(report.horizontal, false, `${name} horizontal scroll`);
  assert.deepEqual(report.oversized, [], `${name} oversized`);
  assert.deepEqual(report.small, [], `${name} buttons smaller than 44px`);
  if (report.seatErrors.length) { await p.screenshot({path:"tmp/ss-research/seat-failure.png"}); console.log("SEAT_FAILURE",name,JSON.stringify(report)); }
  assert.deepEqual(report.seatErrors, [], `${name} status wraps or clips`);
  assert.deepEqual(report.nameErrors, [], `${name} name wraps`);
  if (await p.locator(".ss-dock-wrap").count())
    assert.equal(report.primary, 1, `${name} one primary action`);
  checks.push(`${name}: overflow, tap sizes, primary`);
}
async function shot(p: Page, filename: string, name: string, scope = "场景") {
  if (!filename.includes("identity") && !filename.startsWith("reveal-"))
    await p
      .locator(".dm-banner")
      .waitFor({ state: "hidden", timeout: 5000 })
      .catch(() => {});
  await audit(p, name);
  await p.addScriptTag({path: require.resolve("axe-core/axe.min.js")});
  const a11y = await p.evaluate(async () => {
    const results = await (window as any).axe.run(document.querySelector(".ss-world"), {runOnly:{type:"rule",values:["color-contrast"]}});
    const text = [...document.querySelectorAll<HTMLElement>(".ss-world *")].filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility === "visible").map(el => ({text:el.textContent?.trim().slice(0,40),px:parseFloat(getComputedStyle(el).fontSize)}));
    return {textCount:text.length,below17:text.filter(t=>t.px<17), contrastFailures:results.violations.flatMap((v:any)=>v.nodes.map((n:any)=>({target:n.target,summary:n.failureSummary}))), contrastIncomplete:results.incomplete.flatMap((v:any)=>v.nodes.map((n:any)=>({target:n.target,summary:n.failureSummary}))), contrastPassed:results.passes.reduce((n:number,v:any)=>n+v.nodes.length,0)};
  });
  accessibility.push({name,...a11y});
  pixelContrast.push({name,...await measureContrast(p, ".ss-world")});
  const stage=p.getByTestId("ss-stage");
  if (await stage.count()) {
    const scroll = await stage.evaluate(el => ({top:el.scrollTop,rest:el.scrollHeight-el.clientHeight-el.scrollTop}));
    if (scroll.rest > 10) {
      await stage.evaluate(el => {el.scrollTop=el.scrollHeight}); await p.waitForTimeout(100);
      pixelContrast.push({name:`${name} · 舞台滚动到底`,...await measureContrast(p,".ss-world")});
      await stage.evaluate((el,top)=>{el.scrollTop=top;},scroll.top);
    }
  }
  await assertUiShot(p, `${out}/${filename}.png`);
  const v = p.viewportSize()!;
  screenshots.push({
    file: `${filename}.png`,
    name,
    width: v.width,
    height: v.height,
    scope,
  });
}
try {
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  browser = await chromium.launch({ headless: true });
  for (const [filename, title, f, seat, identity] of [
    ["lobby", "大厅与房主设置", fixtures.lobby, 0, false],
    ["identity", "翻牌：本轮职务", fixtures.pack, 1, true],
    ["pack", "秘密装包", fixtures.pack, 1, false],
    ["bribe", "声明与语音谈判", fixtures.bribe, 0, false],
    ["inspect", "检查手提箱", fixtures.inspect, 0, false],
    ["arrest", "选择逮捕", fixtures.arrest, 0, false],
    ["round", "下一位警长与本轮回顾", fixtures.round, 0, false],
    ["finish", "终局领奖台与回顾", fixtures.finish, 0, false],
  ] as const) {
    for (const [suffix, w, h] of [
      ["portrait", 390, 844],
      ["landscape", 844, 390],
    ] as const) {
      const { ctx, p } = await connect(f, seat, w, h, { identity });
      if (identity) await p.getByTestId("ss-identity").waitFor();
      else if (filename === "finish")
        await p.getByTestId("ss-result").waitFor();
      else await p.getByTestId("ss-stage").waitFor();
      await shot(
        p,
        `${suffix}-${filename}`,
        `${title} · ${suffix === "portrait" ? "竖屏" : "横屏"}`,
      );
      await ctx.close();
    }
  }
  {
    const { ctx, p } = await connect(fixtures.round, 0, 390, 844);
    await p.getByTestId("ss-next-round").click();
    await p.getByTestId("ss-identity-close").click({ timeout: 1200 }).catch(() => {});
    await p
      .locator(".dm-banner")
      .filter({ hasText: "下一位缉私警长" })
      .waitFor();
    pixelContrast.push({name:"下一位缉私警长横幅",...await measureContrast(p, ".dm-banner")});
    await assertUiShot(p, `${out}/next-guard-banner.png`);
    screenshots.push({
      file: "next-guard-banner.png",
      name: "下一位缉私警长横幅",
      width: 390,
      height: 844,
      scope: "阶段横幅",
    });
    checks.push("下一位缉私警长横幅");
    await ctx.close();
  }
  for (const [scene,fixture,seat,identity] of [["LOBBY",fixtures.maxLobby,0,false],["IDENTITY",fixtures.max,1,true]] as const) {
    for (const [suffix,w,h] of [["portrait",390,844],["landscape",844,390]] as const) {
      const {ctx,p}=await connect(fixture,seat,w,h,{identity});
      if (identity) await p.getByTestId("ss-identity").waitFor();
      else {
        assert.match(await p.locator(".ss-stage-title .ss-kicker").innerText(), /^房间/);
        assert.match(await p.locator(".ss-event-setting").innerText(), /关/);
        await p.getByTestId("ss-events").click();
        await p.locator(".ss-event-setting").getByText("开", {exact:true}).waitFor();
        await p.waitForFunction(() => !(document.querySelector('[data-testid="ss-events"]') as HTMLInputElement).disabled);
        await p.getByTestId("ss-events").click();
        await p.locator(".ss-event-setting").getByText("关", {exact:true}).waitFor();
        const fits = await p.getByTestId("ss-first-guard").evaluate((el:HTMLSelectElement) => { const c=document.createElement("canvas").getContext("2d")!; const st=getComputedStyle(el); c.font=`${st.fontWeight} ${st.fontSize} ${st.fontFamily}`; return c.measureText(el.selectedOptions[0].textContent ?? "").width <= el.clientWidth - 30; });
        assert(fits, "首位警长姓名不应被截断");
      }
      await shot(p,`max-${scene.toLowerCase()}-${suffix}`,`8人长名字 ${scene} · ${suffix}`); await ctx.close();
    }
  }
  for (const phase of ["PACK", "BRIBE", "INSPECT", "ARREST", "ROUND_END", "FINISHED"] as const) {
    for (const [suffix,w,h] of [["portrait",390,844],["landscape",844,390]] as const) {
      const {ctx,p} = await connect(maxFixtures[phase], phase === "PACK" ? 1 : 0, w, h);
      await p.getByTestId("ss-stage").waitFor();
      await p.waitForTimeout(2000);
      assert.equal(await p.locator(".ss-seatstrip .ss-seat").count(), 8);
      const titles = {PACK:"秘密装包",BRIBE:"受贿与讨论",INSPECT:"检查手提箱",ARREST:"决定逮捕",ROUND_END:"本轮结束",FINISHED:"本局结束"};
      assert.equal(await p.getByTestId("ss-phase").innerText(), titles[phase]);
      const kicker = await p.locator(".ss-stage-title .ss-kicker").innerText();
      if (phase === "ROUND_END") { assert.equal(kicker, "结算完成"); assert(await p.getByTestId("ss-scroll-hint").isVisible()); }
      if (phase === "FINISHED") assert.equal(kicker, "最终结果");
      if (["BRIBE","INSPECT","ARREST"].includes(phase)) {
        const buttonText=await p.locator(".ss-dock-wrap .ss-primary").innerText();
        const expected={BRIBE:"接受 2号 的受贿",INSPECT:"检查 2号",ARREST:"逮捕 2号"} as Record<string,string>;
        assert.equal(buttonText.trim(),expected[phase],`主按钮座位号 ${phase}`);
      }
      if (phase === "BRIBE") { assert.equal(await p.locator(".ss-bribe-card").count(), 7); assert.equal(await p.locator(".ss-bribe-card img").count(),7); }
      if (["BRIBE","INSPECT","ARREST"].includes(phase)) assert.match(await p.getByTestId("ss-budget").innerText(), /受贿.*检查.*逮捕/s);
      if (phase === "PACK" && suffix === "portrait") { const widths=await p.locator(".ss-hand button").evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().width)); assert(widths.every(x=>x>=100)); }
      await shot(p, `max-${phase.toLowerCase()}-${suffix}`, `8人长名字 ${phase} · ${suffix}`);
      if (phase === "ROUND_END" && suffix === "portrait") {
        const stage=p.getByTestId("ss-stage");
        assert(await stage.evaluate(el => el.scrollHeight > el.clientHeight), "轮末舞台必须可滚动");
        await stage.evaluate(el => {el.scrollTop=el.scrollHeight});
        await p.waitForTimeout(200);
        const fits=await p.locator(".ss-round-summary").evaluate(el=>{const s=el.closest(".ss-stage")!.getBoundingClientRect(),r=el.getBoundingClientRect();return r.top<s.bottom && r.bottom<=s.bottom+1;});
        assert(fits, "滚动后本轮回顾不能被座位条遮挡");
        await shot(p,"max-round_end-scrolled-portrait","8人轮末滚动查看本轮回顾");
      }
      await ctx.close();
    }
  }
  for (const event of EVENTS) {
    const { ctx, p } = await connect(eventFixtures[event], 1, 390, 844);
    const banner = p.getByTestId("ss-event-banner");
    await banner.waitFor();
    assert((await banner.innerText()).includes(eventCopy[event].summary));
    await shot(p, `event-${event}`, `事件：${eventCopy[event].title}`);
    await banner.click();
    assert(
      (
        await p
          .getByRole("dialog", { name: eventCopy[event].title })
          .innerText()
      ).includes(eventCopy[event].text),
    );
    checks.push(`事件${eventCopy[event].title}中文卡面与完整文字`);
    const peer = await connect(eventFixtures[event], 0, 390, 844);
    assert(
      (await peer.p.getByTestId("ss-event-banner").innerText()).includes(
        eventCopy[event].summary,
      ),
    );
    checks.push(`事件${eventCopy[event].title}不同座位均可见`);
    await peer.ctx.close();
    await ctx.close();
  }
  for (const [kind, title, expected] of [
    ["caught", "抓到走私", "抓到了！"],
    ["wrong", "误捕赔偿", "误捕 · 放行"],
    ["impartial", "铁面无私误捕", "铁面无私 · 误捕"],
  ] as const) {
    const { ctx, p } = await connect(arrests[kind], 0, 390, 844);
    await p.getByTestId("ss-seat-1").click();
    if (kind === "impartial") await p.getByTestId("ss-mode-event").click();
    await p
      .getByTestId(
        `${kind === "impartial" ? "ss-event-arrest" : "ss-arrest"}-1`,
      )
      .click();
    await p.getByTestId("ss-reveal-title").waitFor();
    assert.equal(await p.getByTestId("ss-reveal-title").innerText(), expected);
    const detail = await p.getByTestId("ss-reveal").innerText();
    assert(
      detail.includes(
        kind === "caught" ? "抓到走私" : kind === "wrong" ? "赔 2" : "不赔",
      ),
    );
    await shot(p, `reveal-${kind}`, title);
    await p.getByTestId("ss-skip").click();
    checks.push(`${title}文字、揭晓与跳过`);
    await ctx.close();
  }
  {
    const { ctx, p } = await connect(fixtures.max, 1, 390, 844);
    await p.getByTestId("ss-seatstrip").waitFor();
    assert.equal(await p.locator(".ss-seat").count(), 8);
    assert(
      (await p.getByTestId("ss-seat-0").innerText()).includes(names(8)[0]),
    );
    await shot(p, "max-seats", "最大人数与长名字");
    await ctx.setOffline(true);
    await p.getByTestId("ss-disconnect").waitFor();
    await shot(p, "disconnect", "断线重连提示");
    await ctx.setOffline(false);
    await ctx.close();
  }
  {
    const { ctx, p } = await connect(fixtures.max, 1, 844, 390);
    await shot(p, "landscape-max-seats", "横屏最大人数与长名字");
    const metrics = await p
      .getByTestId("ss-seatstrip")
      .evaluate((el) => ({ height: el.clientHeight, scroll: el.scrollHeight }));
    assert(
      metrics.scroll <= metrics.height + 1,
      "landscape eight-seat strip should fit without clipping",
    );
    await ctx.close();
  }
  {
    const { ctx, p } = await connect(fixtures.bribe, 0, 1280, 800);
    await shot(p, "desktop-1280", "电脑 1280×800");
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const p = await ctx.newPage();
    await p.goto(base + "/");
    const box = p.locator('[data-game="ss"]');
    await p.getByTestId("game-ss").waitFor();
    await p.getByTestId("game-ss").scrollIntoViewIfNeeded();
    assert(
      (await p.getByTestId("game-ss").innerText()).includes(
        "汽水走私犯 Soda Smugglers",
      ),
    );
    pixelContrast.push({name:"首页官方游戏盒",...await measureContrast(p, "body")});
    await assertUiShot(p, `${out}/homepage-box.png`);
    screenshots.push({
      file: "homepage-box.png",
      name: "首页官方游戏盒",
      width: 390,
      height: 844,
      scope: "首页",
    });
    checks.push("首页入口与官方包装");
    await ctx.close();
  }
  // Desktop drag, and a real CDP touch drag after the 150ms hold.
  {
    const { ctx, p } = await connect(dragDesk, 1, 390, 844);
    const card = p.locator('[data-testid^="ss-card-"]').first();
    await card.dragTo(p.getByTestId("ss-drop-luggage"));
    assert.equal(await card.getAttribute("aria-pressed"), "true");
    assert.equal(
      await p.getByTestId("ss-drop-luggage").locator("img").count(),
      1,
    );
    checks.push("mouse drag to luggage");
    await ctx.close();
  }
  {
    const { ctx, p } = await connect(dragTouch, 1, 390, 844, { touch: true });
    const card = p.locator('[data-testid^="ss-card-"]').first();
    const from = (await card.boundingBox())!,
      to = (await p.getByTestId("ss-drop-bribe").boundingBox())!;
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: from.x + from.width / 2, y: from.y + from.height / 2 },
      ],
    });
    await p.waitForTimeout(180);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await p.waitForTimeout(100);
    assert.equal(await card.getAttribute("aria-pressed"), "true");
    assert.equal(
      await p.getByTestId("ss-drop-bribe").locator("img").count(),
      1,
    );
    checks.push("touch hold and drag to bribe");
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  const a11yRows = accessibility as Array<{below17:unknown[];contrastFailures:unknown[];contrastIncomplete:unknown[]}>;
  const a11ySummary = {below17:a11yRows.reduce((n,r)=>n+r.below17.length,0), contrastFailures:a11yRows.reduce((n,r)=>n+r.contrastFailures.length,0), contrastIncomplete:a11yRows.reduce((n,r)=>n+r.contrastIncomplete.length,0)};
  writeFileSync(
    `${out}/audit.json`,
    JSON.stringify(
      {
        screenshots,
        accessibility,
        pixelContrast,
        pixelContrastSummary: {tested:pixelContrast.reduce((n,r)=>n+r.tested,0), passed:pixelContrast.reduce((n,r)=>n+r.passed,0), failed:pixelContrast.reduce((n,r)=>n+r.failures.length,0), untested:pixelContrast.reduce((n,r)=>n+r.untested.length,0)},
        accessibilitySummary: a11ySummary,
        accessibilityStatus: (a11ySummary.below17 || a11ySummary.contrastFailures || a11ySummary.contrastIncomplete) ? "unresolved" : "passed",
        checks,
        passed: checks.length,
        layoutFailed: 0,
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("SS_PIXEL_CONTRAST", JSON.stringify({tested:pixelContrast.reduce((n,r)=>n+r.tested,0), passed:pixelContrast.reduce((n,r)=>n+r.passed,0), failed:pixelContrast.reduce((n,r)=>n+r.failures.length,0), untested:pixelContrast.reduce((n,r)=>n+r.untested.length,0)}));
  console.log("SS_A11Y_UNRESOLVED", JSON.stringify(a11ySummary));
  if (a11ySummary.below17 || pixelContrast.some(r=>r.failures.length || r.untested.length)) process.exitCode = 1;
  console.log(
    "SS_LAYOUT_CHECKS_PASS",
    JSON.stringify({ screenshots: screenshots.length, checks: checks.length }),
  );
} finally {
  await browser?.close();
  const done = new Promise<void>((r) => server.once("exit", () => r()));
  server.kill();
  await done;
  writeFileSync(join(root, "server.log"), serverLog);
  if (errors.length) console.error("PAGE_ERRORS", errors);
}

