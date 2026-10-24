/** Real server restores engine-generated fixtures; no mocked websocket or manual score edits. */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium } from "playwright";
import { createGame, act, viewFor } from "../packages/xiabaiwang/src/engine.ts";
import { TOPICS } from "../packages/xiabaiwang/src/topics.ts";
import { assertUiShot } from "./screenshot-check.ts";

const data = mkdtempSync(join(tmpdir(), "xb-scoring-ui-")),
  out = "docs/xiabaiwang/scoring";
mkdirSync(out, { recursive: true });
const players = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  name: `${i + 1}号特别长名字的电台朋友`,
}));
let final: ReturnType<typeof createGame> | undefined, reveal: typeof final;
let fixtureSeed = 0;
for (let seed = 1; seed < 500; seed++) {
  let s = createGame(players, seed, TOPICS.slice(0, 20), 2);
  while (s.phase !== "over") {
    const liars = s.players.filter(
      (p) => p.id !== s.guesser && p.id !== s.truth,
    );
    const liar = liars[(s.round - 1) % liars.length].id;
    s = act(s, s.guesser, {
      type: "CHALLENGE",
      target: s.truth,
      round: s.round,
    });
    s = act(s, s.guesser, { type: "GUESS", target: liar, round: s.round });
    if (s.round === 20) reveal = structuredClone(s);
    s = act(s, s.host, { type: "NEXT", round: s.round });
  }
  if (
    viewFor(s, null).winners.length >= 2 &&
    Object.values(s.scores).some((v) => v < 0)
  ) {
    final = s;
    fixtureSeed = seed;
    break;
  }
}
assert(final && reveal, "need naturally generated tie and negative scores");
const people = players.map((p, i) => ({
  ...p,
  token: `scoring-fixture-token-${i}`,
}));
const discussion = createGame(players, 1);
for (const [code, state] of [
  ["SCOR01", reveal],
  ["SCOR02", final],
  ["SCOR03", discussion],
] as const) {
  writeFileSync(
    join(data, code + ".json"),
    JSON.stringify({
      code,
      players: people,
      state,
      version: 50,
      cycles: state.cycles,
      discussionAt: Date.now(),
      usedTopics: [state.topic.id],
    }),
  );
}
const port = 3360,
  base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/main.ts"],
  {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DBD_DATA_DIR: join(data, "dbd"),
      XB_DATA_DIR: data,
    },
    stdio: ["ignore", "ignore", "inherit"],
  },
);
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base + "/api/info")).ok) break;
    } catch {}
    if (i > 200) throw Error("fixture server startup");
    await new Promise((r) => setTimeout(r, 50));
  }
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await ctx.addInitScript(
    "for(const c of ['SCOR01','SCOR02','SCOR03'])localStorage.setItem('xb-token:'+c,'scoring-fixture-token-0');localStorage.setItem('xb-sound','off');",
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const sizes = [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto(base + "/?game=xb&room=SCOR01");
    await page.getByTestId("xb-reveal").waitFor();
    await page.evaluate(
      "window.__scoreSequence=[];window.__scoreTimer=setInterval(()=>{const e=document.querySelector('[data-testid=xb-reveal]');if(e){const n=Number(e.getAttribute('data-settlement'));if(n>=0&&window.__scoreSequence.at(-1)!==n)window.__scoreSequence.push(n)}},30);",
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="xb-reveal"]')
          ?.getAttribute("data-settlement") === "0",
    );
    await page.getByTestId("xb-settlement-guess").scrollIntoViewIfNeeded();
    await assertUiShot(
      page,
      join(out, `01-guess-${size.width}.png`),
      "body",
      "allow",
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="xb-reveal"]')
          ?.getAttribute("data-settlement") === "1",
    );
    await page.getByTestId("xb-settlement-challenge").scrollIntoViewIfNeeded();
    await assertUiShot(
      page,
      join(out, `02-challenge-${size.width}.png`),
      "body",
      "allow",
    );
    await page.getByTestId("xb-settlement-total").waitFor();
    await page.getByTestId("xb-settlement-total").scrollIntoViewIfNeeded();
    await assertUiShot(
      page,
      join(out, `03-total-${size.width}.png`),
      "body",
      "allow",
    );
    assert.deepEqual(
      await page.evaluate(
        "clearInterval(window.__scoreTimer);window.__scoreSequence",
      ),
      [0, 1, 2],
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="xb-reveal"]')
          ?.getAttribute("data-done") === "true",
    );
    await page.getByTestId("xb-settlement").scrollIntoViewIfNeeded();
    await assertUiShot(
      page,
      join(out, `03-total-settled-${size.width}.png`),
      "body",
      "allow",
    );
    await page.reload();
    await page.getByTestId("xb-skip").click();
    assert.equal(await page.getByTestId("xb-settlement-total").count(), 1);
    await page.goto(base + "/?game=xb&room=SCOR02");
    await page.getByTestId("xb-finale").waitFor();
    assert(
      (await page.getByTestId("xb-winners").innerText()).includes("共同获胜"),
    );
    const winners: string[] = viewFor(final!, null).winners;
    assert.equal(
      await page
        .getByTestId("xb-podium-level-1")
        .locator(".xb-podium-player")
        .count(),
      winners.length,
    );
    assert((await page.locator(".xb-seat .xb-debt").count()) > 0);
    for (const el of await page.locator(".xb-seat .xb-debt").all()) {
      const color = await el
        .locator("..")
        .locator("strong")
        .evaluate((e) => getComputedStyle(e).color);
      assert.equal(color, "rgb(255, 141, 132)");
    }
    await page.getByTestId("xb-channel-banner").waitFor({ state: "hidden" });
    await page.getByTestId("xb-podium-level-1").scrollIntoViewIfNeeded();
    const bottoms = await page
      .getByTestId("xb-podium-level-1")
      .locator(".xb-podium-player")
      .evaluateAll((els) =>
        els.map((e) => Math.round(e.getBoundingClientRect().bottom)),
      );
    assert.equal(new Set(bottoms).size, 1, "同级冠军应并排站在相同高度");
    await assertUiShot(
      page,
      join(out, `04-tied-podium-${size.width}.png`),
      "body",
      "allow",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.goto(base + "/?game=xb&room=SCOR03");
    await page.waitForFunction(
      () =>
        document.querySelector(".xb-world")?.getAttribute("data-stage") ===
        "discussion",
    );
    assert(
      (await page.locator(".xb-paper").innerText()).includes(
        `本题 ${discussion.topic.difficulty} 分`,
      ),
    );
    assert((await page.getByTestId("xb-role").innerText()).includes("想想"));
    await assertUiShot(
      page,
      join(out, `05-question-${size.width}.png`),
      "body",
      "allow",
    );
    await page.getByTestId("xb-menu").click();
    await page
      .getByRole("button", { name: "规则与所选版本", exact: true })
      .click();
    const card = page.getByTestId("xb-scoring-reference");
    assert((await card.innerText()).includes("每人初始 3 分"));
    for (const id of ["HR-XB-01", "HR-XB-02", "HR-XB-03"])
      assert((await card.innerText()).includes(id));
    await assertUiShot(
      page,
      join(out, `06-rules-${size.width}.png`),
      "body",
      "allow",
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    join(out, "ui-report.json"),
    JSON.stringify(
      {
        complete: true,
        fixtures: "10人两圈20轮真实引擎指令生成，无手改分数",
        initialSeed: fixtureSeed,
        winners: viewFor(final, null).winners,
        scores: final.scores,
        sequence: ["guess", "challenge", "total"],
        sizes,
        skip: true,
        negativeBadge: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("XB_SCORING_UI_PASS");
} finally {
  await browser.close();
  server.kill();
}
