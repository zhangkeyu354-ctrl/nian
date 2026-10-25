import { gameScope } from "../packages/drawing-party/src/index.ts";
import { io, type Socket } from "socket.io-client";
import { strict as assert } from "node:assert";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
const ss: Socket[] = [],
  latencies: number[] = [];
let wireBytes = 0;
const req = (s: Socket, e: string, p: any) =>
  new Promise<any>((resolve, reject) => {
    const start = performance.now();
    s.timeout(5000).emit(e, p, (err: any, r: any) => {
      if (err || !r?.ok) return reject(err ?? Error(r?.error));
      if (e === "dp:stroke") {
        latencies.push(performance.now() - start);
        wireBytes += Buffer.byteLength(JSON.stringify(p));
      }
      resolve(r);
    });
  });
try {
  for (let i = 0; i < 8; i++) {
    const s = io(process.env.DP_URL ?? "http://127.0.0.1:3011", {
      transports: ["websocket"],
      forceNew: true,
    });
    ss.push(s);
    await new Promise<void>((r) => s.once("connect", () => r()));
  }
  const { code } = await req(ss[0], "dp:create", { mode: "tp", count: 8 }),
    seats: any[] = [];
  for (let i = 0; i < 8; i++) {
    await req(ss[i], "dp:join", { code });
    seats.push(await req(ss[i], "dp:claim", { code, name: "压力" + i }));
  }
  let op = 0;
  const action = async (i: number, a: any) => {
    const snap = (await req(ss[i], "dp:join", { code, token: seats[i].token }))
        .snapshot,
      v = snap.view;
    return req(ss[i], "dp:action", {
      code,
      token: seats[i].token,
      scope: v ? gameScope(v) : "lobby",
      op: String(++op),
      action: a,
    });
  };
  for (let i = 0; i < 8; i++) await action(i, { type: "READY" });
  await action(0, { type: "START" });
  for (let i = 0; i < 8; i++) await action(i, { type: "THEME_VOTE", theme: 6 });
  await new Promise((r) => setTimeout(r, 1900));
  for (let i = 0; i < 8; i++)
    await action(i, { type: "TEXT", text: "测试" + i });
  const views = await Promise.all(
    ss.map((s, i) => req(s, "dp:join", { code, token: seats[i].token })),
  );
  const received = ss.map(() => 0);
  ss.forEach((s, i) => s.on("dp:ink", () => received[i]++));
  const begin = performance.now();
  for (let seq = 0; seq < 25; seq++) {
    const scheduled = begin + seq * 200;
    await new Promise((r) =>
      setTimeout(r, Math.max(0, scheduled - performance.now())),
    );
    await Promise.all(
      ss.map((s, i) => {
        const v = views[i].snapshot.view;
        return req(s, "dp:stroke", {
          code,
          token: seats[i].token,
          scope: gameScope(v),
          chunk: {
            id: "load-" + i,
            seq,
            color: i,
            width: 8,
            points: Array.from({ length: 12 }, (_, j) => [
              (seq * 12 + j) % 1024,
              100 + i * 30,
              seq * 200 + j * 16,
            ]),
            end: seq === 24,
          },
        });
      }),
    );
  }
  received.forEach((n) => assert.equal(n, 25));
  latencies.sort((a, b) => a - b);
  const result = {
    environment: "local Windows Node; 8 socket clients, not Render",
    players: 8,
    batchHz: 5,
    pointsPerBatch: 12,
    packets: latencies.length,
    durationMs: Math.round(performance.now() - begin),
    jsonPayloadBytes: wireBytes,
    ackMedianMs: latencies[Math.floor(latencies.length * 0.5)],
    ackP95Ms: latencies[Math.floor(latencies.length * 0.95)],
    ackMaxMs: latencies.at(-1),
    privateDeltaCounts: received,
  };
  mkdirSync("work/drawing-party-load", { recursive: true });
  writeFileSync(
    "work/drawing-party-load/result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  ss.forEach((s) => s.disconnect());
}
