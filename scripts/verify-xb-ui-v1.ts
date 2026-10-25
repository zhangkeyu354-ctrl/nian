import { chromium, type Page, type BrowserContext } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { XBSnapshot } from "../packages/shared/src/xb-protocol.ts";
import { TOPICS } from "../packages/xiabaiwang/src/topics.ts";
const base = process.env.XB_TEST_URL ?? "http://127.0.0.1:3358",
  out = process.env.XB_ARTIFACT_DIR ?? "docs/xiabaiwang/ui-v1";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME,
  headless: true,
});
const errors: string[] = [],
  report: any[] = [];
const shots: string[] = [];
const states = new Map<Page, XBSnapshot>();
const sizes = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitStage(p: Page, s: string) {
  await p.locator(`.xb-world[data-stage="${s}"]`).waitFor();
}
async function stable(p: Page) {
  await p.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  const clipped = await p
    .locator(".xb-seat b,.xb-id-front b")
    .evaluateAll((els) =>
      els
        .filter((e) => e.scrollHeight > e.clientHeight + 1)
        .map((e) => e.textContent),
    );
  assert.deepEqual(clipped, [], "昵称行不能被纵向裁切");
}
async function shot(p: Page, name: string) {
  for (const size of sizes) {
    await p.setViewportSize(size);
    if (name.endsWith("titles"))
      await p
        .locator(".xb-stage")
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await stable(p);
    const path = join(out, `${name}-${size.width}x${size.height}.png`);
    await p.screenshot({ path, animations: "allow" });
    shots.push(path);
  }
  await p.setViewportSize(sizes[0]);
}
async function click(p: Page, id: string) {
  await p.waitForFunction((id) => {
    const button = document.querySelector(
      `[data-testid="${id}"]`,
    ) as HTMLButtonElement | null;
    return !!button && !button.disabled;
  }, id);
  await p
    .getByTestId(id)
    .click({ force: id === "xb-start" || id === "xb-primary" });
  await sleep(70);
}
async function doubleConfirm(p: Page, id: string) {
  await click(p, id);
  assert((await p.getByTestId(id).textContent())?.includes("再点确认"));
  await click(p, id);
}
async function skipReveal(p: Page) {
  const skip = p.getByTestId("xb-skip");
  if (await skip.count()) {
    try {
      await skip.click({ timeout: 1000 });
    } catch (error) {
      // The animation may finish between count() and the pointer click.
      // Accept only its verified terminal state, not an arbitrary click failure.
      if (
        !(await p
          .locator('[data-testid="xb-reveal"][data-done="true"]')
          .count())
      )
        throw error;
    }
  }
  await p.locator('[data-testid="xb-reveal"][data-done="true"]').waitFor();
}
function observe(p: Page) {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      const raw = String(f.payload);
      if (raw.startsWith("42[")) {
        const [event, value] = JSON.parse(raw.slice(2));
        if (event === "xb:update") states.set(p, value);
      }
    }),
  );
}
try {
  for (const n of (process.env.XB_PLAYER_COUNTS ?? "3,6,10")
    .split(",")
    .map(Number)) {
    const cycles = Number(process.env.XB_CYCLES ?? 1),
      totalRounds = n * cycles;
    const contexts: BrowserContext[] = [],
      pages: Page[] = [];
    try {
      for (let i = 0; i < n; i++) {
        const c = await browser.newContext({
          viewport: sizes[0],
          isMobile: true,
          hasTouch: true,
        });
        contexts.push(c);
        await c.addInitScript({
          content:
            "window.__xbBuzz=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:function(v){window.__xbBuzz.push(v);return true;}});",
        });
        const p = await c.newPage();
        p.setDefaultTimeout(15000);
        observe(p);
        pages.push(p);
      }
      const host = pages[0];
      await host.goto(base + "/?game=xb");
      await host.getByTestId("xb-create").waitFor();
      if (n === 3) await shot(host, "01-entry");
      await click(host, "xb-create");
      await host.getByTestId("xb-join").waitFor();
      const url = host.url();
      if (n === 3) {
        await host.getByLabel("你的昵称").fill("离线不丢的昵称");
        await contexts[0].setOffline(true);
        await host.getByTestId("xb-offline").waitFor();
        await shot(host, "02-offline-input");
        assert.equal(
          await host.getByLabel("你的昵称").inputValue(),
          "离线不丢的昵称",
        );
        await contexts[0].setOffline(false);
        await host.getByTestId("xb-join").waitFor({ state: "visible" });
        await host.getByTestId("xb-join").isEnabled();
        await sleep(1500);
        await shot(host, "03-join");
      }
      for (let i = 0; i < n; i++) {
        if (i) await pages[i].goto(url);
        const name =
          n === 10 ? `${i + 1}号这位朋友的昵称真的特别特别长` : `电台${i + 1}`;
        await pages[i].getByLabel("你的昵称").fill(name.slice(0, 16));
        await click(pages[i], "xb-join");
        await waitStage(pages[i], "lobby");
        await pages[i].getByTestId("xb-tutorial-skip").click();
      }
      if (n === 3) {
        await shot(host, "04-lobby");
        await click(host, "xb-menu");
        await shot(host, "05-menu");
        await host
          .getByRole("button", { name: "规则与所选版本", exact: true })
          .click();
        await shot(host, "06-rules");
        await host.getByRole("button", { name: "关闭面板" }).click();
      }
      if (n === 3) await pages[2].emulateMedia({ reducedMotion: "reduce" });
      assert(
        await pages[1].getByTestId("xb-cycles").isDisabled(),
        "非房主不能改圈数",
      );
      if (cycles !== 1) {
        await host.getByTestId("xb-cycles").selectOption(String(cycles));
        await pages[1].waitForFunction(
          (c) =>
            (
              document.querySelector(
                '[data-testid="xb-cycles"]',
              ) as HTMLSelectElement
            )?.value === String(c),
          cycles,
        );
        await host.reload();
        await waitStage(host, "lobby");
        assert.equal(
          await host.getByTestId("xb-cycles").inputValue(),
          String(cycles),
        );
      }
      await click(host, "xb-start");
      await waitStage(host, "deal");
      if (n === 3) await shot(host, "07-deal");
      await waitStage(host, "discussion");
      assert(
        states.get(host)!.view!.players.every((p) => p.score === 3),
        "新局初始每人3分",
      );
      for (let round = 1; round <= totalRounds; round++) {
        for (const p of pages) {
          await waitStage(p, "discussion");
          if (await p.getByTestId("xb-hint-dismiss").isVisible())
            await p.getByTestId("xb-hint-dismiss").click();
        }
        const g = pages.find(
          (p) => states.get(p)?.me === states.get(host)?.view?.guesser,
        )!;
        assert(g);
        const truth = pages.find(
          (p) =>
            states.get(p)?.view?.players.find((v) => v.id === states.get(p)?.me)
              ?.role === "truth",
        )!;
        assert(truth);
        const answer = states.get(truth)!.view!.answer!;
        const truthId = states.get(truth)!.me!;
        const truthIndex = states
          .get(host)!
          .players.findIndex((p) => p.id === truthId);
        for (const p of pages) {
          const s = states.get(p)!;
          assert.equal(!!s.view!.answer, p === truth);
          assert(!("deck" in s.view!));
          if (p !== truth) assert(!(await p.content()).includes(answer));
          await stable(p);
        }
        // Explain in seat order through the same server command as the UI.
        const explanationOrder = states.get(g)!.view!.explanationOrder;
        for (const id of explanationOrder) {
          assert.equal(states.get(g)!.view!.explainer, id);
          assert(
            (await g.getByTestId("xb-explanation-order").innerText()).includes(
              "轮到",
            ),
          );
          await click(g, "xb-explain-next");
          for (let retry = 0; states.get(g)!.view!.explainer === id; retry++) {
            assert(retry < 100, "解释队列应同步到浏览器");
            await sleep(30);
          }
        }
        assert.equal(states.get(g)!.view!.explainer, null);
        const guesserId = states.get(g)!.me!,
          liarIndex = states
            .get(host)!
            .players.findIndex((p) => p.id !== guesserId && p.id !== truthId);
        const challengeIndex = round % 2 === 0 ? truthIndex : liarIndex;
        const beforeScores = Object.fromEntries(
          states.get(host)!.view!.players.map((p) => [p.id, p.score]),
        );
        if (round === 1) {
          await shot(host, `${n}-08-discussion`);
          if (n === 3) {
            await click(truth, "xb-role");
            await shot(truth, "09-private-role");
            await truth.getByRole("button", { name: "关闭面板" }).click();
          }
        }
        await click(g, "xb-challenge");
        await click(g, "xb-seat-" + challengeIndex);
        if (n === 3 && round === 1) await shot(g, "10-challenge");
        await doubleConfirm(g, "xb-challenge-confirm");
        await Promise.all(
          pages.map((p) => p.getByTestId("xb-muted").waitFor()),
        );
        if (n === 3 && round === 1) await shot(host, "11-muted");
        if (round === 1) {
          const initial = JSON.stringify(states.get(host)!.view);
          await Promise.all(
            pages.map(async (p, i) => {
              await click(p, p === g ? "xb-poop" : "xb-primary");
              assert(await p.getByTestId("xb-seat-" + i).isDisabled());
              await click(p, "xb-seat-" + ((i + 1) % n));
              await click(p, "xb-poop-confirm");
            }),
          );
          await host
            .locator(".xb-dock>p")
            .filter({ hasText: "送来" })
            .waitFor();
          assert.equal(JSON.stringify(states.get(host)!.view), initial);
          if (n === 3) await shot(host, "12-poop");
          await sleep(1100);
          for (const p of pages)
            await p.waitForFunction(
              () => ((window as any).__xbBuzz?.length ?? 0) > 0,
              undefined,
              { timeout: 5000 },
            );
          await truth.reload();
          await waitStage(truth, "discussion");
          assert.equal(states.get(truth)!.view!.answer, answer);
          // 对断线前的公开目标草稿进行恢复验证。
          await click(g, "xb-primary");
          await click(g, "xb-seat-" + truthIndex);
          const selected = await g
            .getByTestId("xb-guess-confirm")
            .textContent();
          await contexts[pages.indexOf(g)].setOffline(true);
          await g.getByTestId("xb-offline").waitFor();
          if (n === 3) await shot(g, "13-offline-game");
          assert.equal(
            await g.getByTestId("xb-guess-confirm").textContent(),
            selected,
          );
          await contexts[pages.indexOf(g)].setOffline(false);
          await g.getByTestId("xb-offline").waitFor({ state: "hidden" });
          await click(g, "xb-cancel");
        }
        await click(g, "xb-primary");
        await click(g, "xb-seat-" + truthIndex);
        if (n === 3 && round === 1) await shot(g, "14-guess");
        await doubleConfirm(g, "xb-guess-confirm");
        await waitStage(host, "reveal");
        const resultView = states.get(host)!.view!,
          result = resultView.history.at(-1)!;
        for (const p of resultView.players) {
          const expected =
            (p.id === truthId || p.id === guesserId ? result.difficulty : 0) +
            (round % 2 === 0
              ? p.id === guesserId
                ? -3
                : 0
              : p.id === guesserId
                ? 1
                : p.id === result.challenged
                  ? -1
                  : 0);
          assert.equal(
            p.score,
            beforeScores[p.id] + expected,
            "难度分+质疑分应独立叠加",
          );
        }
        assert.deepEqual(
          result.scoring.map((step) => step.kind),
          ["guess", "challenge"],
        );
        if ((n === 3 || n === 10) && round === 1) {
          const prefix = n === 3 ? "" : "10-";
          await shot(host, prefix + "15-reveal-start");
          await sleep(900);
          await shot(host, prefix + "16-reveal-middle");
          await host
            .locator('[data-testid="xb-reveal"][data-scores="true"]')
            .waitFor();
          await shot(host, prefix + "17-reveal-score");
          await host
            .locator('[data-testid="xb-reveal"][data-done="true"]')
            .waitFor();
          if (n === 3)
            assert.equal(
              await pages[2].locator(".xb-world.xb-power-save").count(),
              1,
            );
        } else {
          for (const p of pages) await skipReveal(p);
        }
        for (const p of pages) {
          await skipReveal(p);
          assert.equal(states.get(p)!.view!.answer, answer);
        }
        await click(host, "xb-next");
        if (round < n && n === 3 && round === 1) {
          await waitStage(host, "deal");
          await host.getByTestId("xb-eyes").waitFor();
          await shot(host, "18-next-round-eyes");
        }
      }
      await waitStage(host, "over");
      await shot(host, `${n}-19-finale`);
      await host
        .locator(".xb-stage")
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
      await shot(host, `${n}-19-titles`);
      if (n === 3) {
        await host
          .getByRole("button", { name: "每轮回顾 · 把嘴硬留个档" })
          .click();
        await shot(host, "20-recap");
        await host.getByRole("button", { name: "关闭面板" }).click();
      }
      const before = states.get(host)!.view;
      await host.reload();
      await waitStage(host, "over");
      assert.deepEqual(states.get(host)!.view, before);
      await click(host, "xb-rematch");
      await waitStage(host, "lobby");
      assert.equal(states.get(host)!.players.length, n);
      report.push({
        players: n,
        rounds: totalRounds,
        cycles,
        complete: true,
        refresh: true,
        privacy: true,
        independentEffects: true,
        selfThrowRejected: true,
        longNames: n === 10,
      });
      console.log(`XB_UI_V1_PASS ${n} players ${totalRounds} rounds`);
    } catch (e) {
      writeFileSync(
        join(out, "failure.json"),
        JSON.stringify(
          {
            error: String(e),
            errors,
            pages: await Promise.all(
              pages.map(async (p) => ({
                url: p.url(),
                text: await p
                  .locator("body")
                  .innerText()
                  .catch(() => "closed"),
              })),
            ),
          },
          null,
          2,
        ),
      );
      for (let i = 0; i < pages.length; i++)
        await pages[i]
          .screenshot({ path: join(out, `failure-${n}-${i}.png`) })
          .catch(() => {});
      throw e;
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  }
  const js = readdirSync("dist/web/assets")
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join("dist/web/assets", f), "utf8"))
    .join("");
  for (const t of TOPICS)
    assert(!js.includes(t.answer), "题库不得进入浏览器产物");
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify(
      { report, shots, errors, topicCount: TOPICS.length },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
