import assert from "node:assert/strict";
import { io as connect, type Socket } from "socket.io-client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ndSandbox, until } from "./nd-test-harness.ts";
import { verifyNDProcessRecovery } from "./nd-process-recovery.ts";
import {
  ND_EVENTS as E,
  type NDAck,
  type NDSnapshot,
  type NDAction,
  type NDActionRequest,
} from "../packages/shared/src/nd-protocol.ts";

let box = await ndSandbox(),
  code = "",
  peers: Socket[] = [],
  claims: { token: string; playerId: string }[] = [],
  snaps: NDSnapshot[] = [];
const allSockets: Socket[] = [],
  checks: string[] = [],
  games: object[] = [];
let packetChecks = 0,
  actions = 0;
async function socket(seat: number) {
  const current = box,
    s = connect(box.base, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
  allSockets.push(s);
  s.on(E.update, (snap: NDSnapshot) => {
    current.checkSnapshot(snap, seat);
    snaps[seat] = snap;
    packetChecks++;
  });
  await new Promise<void>((r, j) => {
    s.once("connect", r);
    s.once("connect_error", j);
  });
  return s;
}
function ask(s: Socket, event: string, payload: object): Promise<NDAck> {
  return new Promise((r, j) =>
    s
      .timeout(8000)
      .emit(event, payload, (e: Error | null, a: NDAck) => (e ? j(e) : r(a))),
  );
}
async function sync() {
  for (let i = 0; i < claims.length; i++) {
    const a = await ask(peers[i], E.join, { code, token: claims[i].token });
    assert.ok(a.ok, a.error ?? "protocol action failed");
    box.checkSnapshot(a.snapshot!, i);
    snaps[i] = a.snapshot!;
    packetChecks++;
  }
}
async function act(seat: number, action: NDAction) {
  await sync();
  const s = snaps[seat],
    req: NDActionRequest = {
      code,
      token: claims[seat].token,
      version: s.version,
      seq: s.nextSeq!,
      round: s.view?.round,
      action,
    };
  const a = await ask(peers[seat], E.action, req);
  assert.ok(a.ok, a.error ?? "protocol action failed");
  box.checkSnapshot(a.snapshot!, seat);
  actions++;
  return { ack: a, req };
}
async function reject(seat: number, payload: object, label: string) {
  const before = structuredClone(box.store.rooms.get(code)!.file);
  const a = await ask(peers[seat], E.action, payload);
  assert.equal(a.ok, false, label);
  assert.ok(
    JSON.stringify(box.store.rooms.get(code)!.file) === JSON.stringify(before),
    label,
  );
  checks.push(label);
}
async function bad(
  seat: number,
  action: object,
  label: string,
  extra: object = {},
) {
  await sync();
  const s = snaps[seat];
  await reject(
    seat,
    {
      code,
      token: claims[seat].token,
      version: s.version,
      seq: s.nextSeq,
      round: s.view?.round,
      action,
      ...extra,
    },
    label,
  );
}
async function make(n: number, expert = false) {
  peers.forEach((s) => s.disconnect());
  peers = [];
  claims = [];
  snaps = [];
  for (let i = 0; i < n; i++) peers.push(await socket(i));
  const created = await ask(peers[0], E.create, {});
  assert.ok(created.ok);
  code = created.code!;
  for (let i = 0; i < n; i++) {
    const a = await ask(peers[i], E.claim, { code, name: `协议${i}` });
    assert.ok(a.ok, a.error ?? "protocol action failed");
    claims.push({ token: a.token!, playerId: a.playerId! });
    snaps[i] = a.snapshot!;
    if (i === 0)
      await act(0, {
        type: "SET_SETTINGS",
        count: n,
        seconds: 60,
        scale: n === 6 ? "normal" : "open",
        expert,
      });
  }
  await sync();
}
async function play() {
  let steps = 0;
  while (box.store.rooms.get(code)!.file.state!.phase !== "FINISHED") {
    assert.ok(steps++ < 180);
    await sync();
    const view = snaps[0].view!,
      capt = view.captain;
    if (view.phase === "CHOOSE_TOPIC")
      await act(capt, {
        type: "CHOOSE_TOPIC",
        topicId: snaps[capt].view!.choices[0].id,
      });
    else if (view.phase === "ANSWER") {
      const candidates = snaps
        .map((s, i) => (i !== capt && !view.players[i].ready ? i : -1))
        .filter((i) => i >= 0);
      const first = candidates[0];
      await act(first, {
        type: "SUBMIT_ANSWER",
        text: `协议回答${view.round}-${first}`,
      });
    } else if (view.phase === "ORDER") {
      const order = snaps
        .map((s, i) => ({ seat: i, number: s.view!.myNumber }))
        .filter((p) => p.number !== null)
        .sort((a, b) => a.number! - b.number!)
        .map((p) => p.seat);
      await act(capt, { type: "LOCK_ORDER", order });
    } else if (view.phase === "REVEAL")
      await act(capt, { type: "REVEAL_NEXT" });
    else if (view.phase === "EXPERT") {
      const target = snaps.findIndex(
        (_, i) => i !== capt && !view.revealed.some((r) => r.seat === i),
      );
      await act(capt, {
        type: "GUESS_EXACT",
        target,
        guess: snaps[target].view!.myNumber!,
      });
    } else if (view.phase === "CAPTAIN_GUESS")
      await act((capt + 1) % peers.length, {
        type: "GUESS_CAPTAIN",
        guess: snaps[capt].view!.myNumber!,
      });
    else if (view.phase === "ROUND_END")
      await act(capt, { type: "NEXT_ROUND" });
  }
}
try {
  for (const [n, expert] of [
    [4, false],
    [6, false],
    [9, false],
    [4, true],
  ] as const) {
    const firstActions = actions;
    await make(n, expert);
    await bad(
      1,
      { type: "SET_SETTINGS", seconds: 0 },
      "non-host settings rejected",
    );
    await bad(0, { type: "READY" }, "bound token mismatch rejected", {
      token: claims[1].token,
    });
    await bad(
      0,
      { type: "READY", actor: "server" },
      "client actor injection rejected",
    );
    await bad(0, { type: "READY" }, "future versions rejected", {
      version: snaps[0].version + 100,
    });
    for (let i = 0; i < n; i++) await act(i, { type: "READY" });
    await act(0, { type: "START", seed: 100 + n });
    await sync();
    const r = box.store.rooms.get(code)!;
    if (n === 6)
      assert.ok(
        r.file
          .state!.topicCards.flatMap((c) => c.questions)
          .every((q) => !q.spicy),
      );
    await bad(0, { type: "TIMEOUT" }, "client timeout rejected");
    await bad(
      0,
      { type: "READY", now: 1e15 },
      "client clock injection rejected",
    );
    await act(0, {
      type: "CHOOSE_TOPIC",
      topicId: snaps[0].view!.choices[0].id,
    });
    await bad(
      0,
      { type: "SUBMIT_ANSWER", text: "队长" },
      "captain cannot submit answer cards",
    );
    await bad(1, { type: "SUBMIT_ANSWER", text: " " }, "empty answer rejected");
    await bad(
      1,
      { type: "SUBMIT_ANSWER", text: "字".repeat(31) },
      "31-codepoint answer rejected",
    );
    const first = 1;
    const ready = await act(first, {
      type: "SUBMIT_ANSWER",
      text: "<img onerror>",
    });
    const retry = await ask(peers[first], E.action, ready.req);
    assert.ok(retry.ok);
    assert.equal(retry.changed, false);
    checks.push("accepted answer retry is idempotent");
    await bad(
      first,
      { type: "SUBMIT_ANSWER", text: "换掉" },
      "submitted answer cannot change before withdrawal",
    );
    await sync();
    assert.equal(snaps[0].view!.answers[first], null);
    assert.equal(snaps[first].view!.answers[first], "<img onerror>");
    checks.push("answer-stage peers cannot see submitted text in packets");
    const withdrawn = await act(first, { type: "WITHDRAW_ANSWER" });
    const retryWithdrawal = await ask(peers[first], E.action, withdrawn.req);
    assert.ok(retryWithdrawal.ok);
    assert.equal(retryWithdrawal.changed, false);
    await bad(
      first,
      { type: "WITHDRAW_ANSWER" },
      "withdrawal with a new seq cannot repeat",
    );
    await act(first, { type: "SUBMIT_ANSWER", text: "<img onerror>" });
    const numbers = [...r.file.state!.numbers],
      deadline = r.file.deadline!;
    box.advance(deadline - box.clock());
    await until(
      () => r.file.state!.phase !== "ANSWER",
      "server answer deadline",
    );
    assert.deepEqual(r.file.state!.numbers, numbers);
    assert.equal(r.file.state!.answers[first], "<img onerror>");
    assert.ok(
      r.file.state!.answers.every((text, i) =>
        i === 0 ? text === null : text !== null,
      ),
    );
    assert.equal(r.file.timeoutCount, 1);
    assert.equal(r.tick(box.clock() + 1), false);
    checks.push(
      "server-only deadline fills missing cards without changing numbers or submitted text",
    );
    await bad(
      first,
      { type: "WITHDRAW_ANSWER" },
      "withdrawal after sorting begins rejected",
    );
    await sync();
    assert.equal(snaps[0].view!.answers[first], "<img onerror>");
    checks.push("all card fronts become public at sorting/expert stage");
    if (!expert) {
      await sync();
      const order = snaps
        .map((s, i) => ({ i, n: s.view!.myNumber }))
        .filter((p) => p.n !== null)
        .sort((a, b) => a.n! - b.n!)
        .map((p) => p.i);
      await bad(
        1,
        { type: "UPDATE_ORDER", order },
        "non-captain cannot reorder",
      );
      await act(0, { type: "UPDATE_ORDER", order: [...order].reverse() });
      await sync();
      for (const snap of snaps)
        assert.deepEqual(snap.view!.order, [...order].reverse());
      checks.push("live draft order broadcasts identically to every seat");
      const locked = await act(0, { type: "LOCK_ORDER", order });
      await bad(
        0,
        { type: "LOCK_ORDER", order: [...order].reverse() },
        "locked order cannot be replaced",
      );
      const retryOrder = await ask(peers[0], E.action, locked.req);
      assert.ok(retryOrder.ok);
      assert.equal(retryOrder.changed, false);
      const oldNumber = r.file.state!.numbers[1],
        oldOrder = [...r.file.state!.order],
        oldSeq = r.file.seq[claims[1].playerId];
      peers[1].disconnect();
      await until(
        () => !r.connections.has(claims[1].playerId),
        "disconnect noticed",
      );
      peers[1] = await socket(1);
      const rejoin = await ask(peers[1], E.join, {
        code,
        token: claims[1].token,
      });
      assert.ok(rejoin.ok);
      assert.equal(rejoin.snapshot!.mySeat, 1);
      assert.equal(rejoin.snapshot!.view!.myNumber, oldNumber);
      assert.equal(rejoin.snapshot!.view!.answers[1], "<img onerror>");
      assert.deepEqual(rejoin.snapshot!.view!.order, oldOrder);
      assert.equal(rejoin.snapshot!.nextSeq, oldSeq + 1);
      checks.push("token reconnect preserves secret, order and seq");
      if (n === 6) {
        const persisted = structuredClone(r.file),
          dir = box.directory,
          now = box.clock();
        await box.close();
        writeFileSync(join(dir, "ZZZZ.json"), "{corrupt");
        box = await ndSandbox(dir, now);
        assert.ok(
          JSON.stringify(box.store.rooms.get(code)!.file) ===
            JSON.stringify(persisted),
          "persisted file restored exactly",
        );
        assert.ok(!box.store.rooms.has("ZZZZ"));
        peers = [];
        for (let i = 0; i < n; i++) peers.push(await socket(i));
        await sync();
        checks.push(
          "socket server/store rebuild restores the exact committed snapshot and skips corrupt files",
        );
      }
    }
    await play();
    await sync();
    const finished = box.store.rooms.get(code)!.file.state!;
    assert.equal(finished.round, 5);
    assert.equal(finished.result!.success, true);
    games.push({
      players: n,
      expert,
      rounds: finished.round,
      result: "team-success",
      actions: actions - firstActions,
    });
  }
  await make(4);
  for (let i = 0; i < 4; i++) await act(i, { type: "READY" });
  await act(0, { type: "START", seed: 77 });
  await act(0, { type: "CHOOSE_TOPIC", topicId: snaps[0].view!.choices[0].id });
  for (let i = 1; i < 4; i++)
    await act(i, { type: "SUBMIT_ANSWER", text: `持久化回答${i}` });
  await act(0, { type: "LOCK_ORDER", order: [1, 2, 3] });
  const processRecovery = await verifyNDProcessRecovery(
    box.store.rooms.get(code)!.file,
  );
  packetChecks += processRecovery.packets;
  checks.push(
    "two fresh main.ts processes restore private numbers, order and seq; reveal continues and persists",
  );
  const out = "docs/naodong-scale/ui-v3/verification";
  mkdirSync(out, { recursive: true });
  const report = {
    games,
    checks: checks.length,
    checkDetails: checks,
    packetChecks,
    processRecovery,
    failures: 0,
  };
  writeFileSync(
    join(out, "PROTOCOL.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  allSockets.forEach((s) => s.disconnect());
  await box.close();
}
