import { chromium } from "playwright";
import { io } from "socket.io-client";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.env.XB_TEST_URL ?? "http://127.0.0.1:3394";
const out = "docs/xiabaiwang/art-v4/word-change";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROME,
});
const sockets = Array.from({ length: 3 }, () =>
  io(base, { transports: ["websocket"] }),
);
const states: any[] = [];
const send = (i: number, event: string, data: any) =>
  new Promise<any>((resolve, reject) =>
    sockets[i]
      .timeout(8000)
      .emit(event, data, (e: any, r: any) =>
        e ? reject(e) : r.ok ? resolve(r) : reject(Error(r.error)),
      ),
  );
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
try {
  await Promise.all(
    sockets.map((s) => new Promise<void>((r) => s.on("connect", () => r()))),
  );
  console.log("WORD connected");
  const { code } = await send(0, "xb:create", {});
  const tokens = [];
  for (let i = 0; i < 3; i++) {
    tokens.push(
      (await send(i, "xb:join", { code, name: `换词朋友${i + 1}` })).token,
    );
    sockets[i].on("xb:update", (s) => (states[i] = s));
  }
  console.log("WORD room", code);
  const contexts = await Promise.all(
    tokens.map(() =>
      b.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      }),
    ),
  );
  for (let i = 0; i < 3; i++)
    await contexts[i].addInitScript(
      ({ code, token }) => {
        localStorage.setItem("xb-token:" + code, token);
        localStorage.setItem("xb-onboarding-v3", "1");
        for (const r of ["guesser", "truth", "bluffer"])
          localStorage.setItem("xb-role-hint-v3:" + r, "1");
      },
      { code, token: tokens[i] },
    );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const errors: string[] = [];
  for (const p of pages) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(20000);
    await p.goto(base + "/?game=xb&room=" + code);
  }
  console.log("WORD pages joined");
  const host = pages[0];
  await host.getByTestId("xb-start").click({ force: true });
  await Promise.all(
    pages.map((p) => p.locator('.xb-world[data-stage="discussion"]').waitFor()),
  );
  console.log("WORD discussion");
  const old = structuredClone(states[0].view),
    priorRoles = states.map(
      (s) => s.view.players.find((p: any) => p.id === s.me)?.role,
    );
  assert(await host.getByTestId("xb-topic-category").innerText());
  await pages[1].getByTestId("xb-request-word").click();
  await host.getByTestId("xb-swap-word").waitFor();
  console.log("WORD requested");
  assert(await pages[1].getByTestId("xb-request-word").isDisabled());
  assert.equal(await pages[1].getByTestId("xb-swap-word").count(), 0);
  await assert.rejects(
    send(1, "xb:command", { command: { type: "SWAP_TOPIC", round: 1 } }),
    /房主/,
  );
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await host.setViewportSize(size);
    await host.getByTestId("xb-swap-word").scrollIntoViewIfNeeded();
    await host.screenshot({
      path: `${out}/request-${size.width}x${size.height}.png`,
    });
  }
  await host.setViewportSize({ width: 390, height: 844 });
  await host.getByTestId("xb-swap-word").click();
  await Promise.all(pages.map((p) => p.getByTestId("xb-eyes-open").waitFor()));
  console.log("WORD swapped");
  assert.notEqual(states[0].view.question, old.question);
  assert.equal(new Set(states.map((s) => s.readUntil)).size, 1);
  for (const s of states) {
    assert.deepEqual(
      s.view.players.map((p: any) => p.score),
      [3, 3, 3],
    );
    assert.equal(s.view.round, 1);
    assert.deepEqual(s.wordRequests, []);
  }
  for (let i = 0; i < 3; i++) {
    assert.equal(
      states[i].view.players.find((p: any) => p.id === states[i].me)?.role,
      priorRoles[i],
    );
  }
  const truthIndex = states.findIndex((s) => s.view.answer);
  assert(truthIndex >= 0);
  const answer = states[truthIndex].view.answer;
  for (const p of pages) await p.getByTestId("xb-eyes-open").click();
  for (let i = 0; i < 3; i++)
    assert.equal(
      (await pages[i].getByTestId("xb-private-reading").innerText()).includes(
        answer,
      ),
      i === truthIndex,
    );
  await Promise.all(
    pages.map((p) => p.getByTestId("xb-eyes").waitFor({ state: "hidden" })),
  );
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await host.setViewportSize(size);
    await host.locator(".xb-paper").scrollIntoViewIfNeeded();
    assert(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await host.screenshot({
      path: `${out}/new-word-${size.width}x${size.height}.png`,
    });
  }
  const topic = states[0].view.question;
  await pages[1].reload();
  await pages[1].locator('.xb-world[data-stage="discussion"]').waitFor();
  assert.equal(states[1].view.question, topic);
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/report.json",
    JSON.stringify(
      {
        complete: true,
        hostApproval: true,
        themeHint: true,
        commonReadWindow: true,
        rolesPreserved: true,
        scoresPreserved: true,
        answerPrivate: true,
        reconnect: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("XB_WORD_CHANGE_PASS");
} finally {
  sockets.forEach((s) => s.disconnect());
  await b.close();
}
