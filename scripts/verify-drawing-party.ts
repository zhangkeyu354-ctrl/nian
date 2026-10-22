import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
const url = process.env.DP_URL ?? "http://127.0.0.1:3011";
const sockets: Socket[] = [];
const connect = async () => {
  const s = io(url, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  await new Promise<void>((r, j) => {
    s.once("connect", () => r());
    s.once("connect_error", j);
  });
  return s;
};
const req = (s: Socket, e: string, p: object) =>
  new Promise<any>((resolve, reject) =>
    s
      .timeout(5000)
      .emit(e, p, (err: any, a: any) => (err ? reject(err) : resolve(a))),
  );
const ok = async (s: Socket, e: string, p: object) => {
  await new Promise((r) => setTimeout(r, 110));
  const a = await req(s, e, p);
  assert(a.ok, a.error);
  return a;
};
try {
  for (const mode of ["tp", "fa"]) {
    for (let n = 3; n <= 10; n++) {
      const clients = await Promise.all(Array.from({ length: n }, connect));
      const { code } = await ok(clients[0], "dp:create", { mode, count: n });
      const seats: any[] = [];
      let op = 0;
      for (let i = 0; i < n; i++) {
        await ok(clients[i], "dp:join", { code });
        seats.push(
          await ok(clients[i], "dp:claim", { code, name: "玩家" + i }),
        );
      }
      const snap = async (i = 0) =>
        (await ok(clients[i], "dp:join", { code, token: seats[i].token }))
          .snapshot;
      const action = async (i: number, action: object) => {
        const s = await snap(i),
          v = s.view;
        return ok(clients[i], "dp:action", {
          code,
          token: seats[i].token,
          op: String(++op),
          scope: v ? [v.id, v.phase, v.step, v.turn].join(":") : "lobby",
          action,
        });
      };
      for (let i = 0; i < n; i++) await action(i, { type: "READY" });
      await action(0, { type: "START" });
      if (mode === "fa")
        for (let i = 0; i < n; i++)
          await action(i, { type: "CATEGORY_VOTE", category: 2 });
      const ids = seats.map((x) => x.snapshot.me);
      if (mode === "tp") {
        for (let i = 0; i < n; i++)
          await action(i, { type: "TEXT", text: "秘密中文" + i });
        for (let step = 1; step <= n - (n % 2); step++) {
          if (step % 2) {
            const inkEvents = clients.map(() => 0);
            clients.forEach((s, i) => s.on("dp:ink", () => inkEvents[i]++));
            await Promise.all(
              clients.map(async (s, i) => {
                const v = (await snap(i)).view,
                  scope = [v.id, v.phase, v.step, v.turn].join(":");
                for (let seq = 0; seq < 3; seq++) {
                  const a = await ok(s, "dp:stroke", {
                    code,
                    token: seats[i].token,
                    scope,
                    chunk: {
                      id: "line" + step + "-" + i,
                      seq,
                      color: i,
                      width: 8,
                      points: [[100 + seq * 100, 100 + seq * 50, seq * 100]],
                      end: seq === 2,
                    },
                  });
                  assert.equal(a.revision, seq + 1);
                }
              }),
            );
            await new Promise((r) => setTimeout(r, 60));
            inkEvents.forEach((x) =>
              assert.equal(x, 3, "private ink leaked to another player"),
            );
            clients.forEach((s) => s.removeAllListeners("dp:ink"));
            const before = (await snap(0)).view;
            clients[0].disconnect();
            clients[0] = await connect();
            const restored = await snap(0);
            assert.equal(restored.view.drawing.strokes[0].points.length, 3);
            const twin = await connect();
            await ok(twin, "dp:join", { code, token: seats[0].token });
            const denied = await req(clients[0], "dp:action", {
              code,
              token: seats[0].token,
              op: "old-tab",
              scope: [before.id, before.phase, before.step, before.turn].join(
                ":",
              ),
              action: { type: "SUBMIT" },
            });
            assert.equal(denied.ok, false);
            twin.disconnect();
            await snap(0);
            for (let i = 0; i < n; i++) await action(i, { type: "SUBMIT" });
          } else
            for (let i = 0; i < n; i++)
              await action(i, { type: "TEXT", text: "猜测" + step + "-" + i });
        }
        assert.equal((await snap()).view.phase, "REVEAL");
        for (let j = 0; j < n * (n - (n % 2) + 1); j++)
          await action(0, { type: "NEXT" });
        assert.equal((await snap()).view.phase, "RESULT");
      } else {
        let fake = -1,
          word = "";
        for (let i = 0; i < n; i++) {
          const v = (await snap(i)).view;
          if (v.role === "fake") {
            fake = i;
            assert(!v.word);
          } else word = v.word;
          assert(!v.fakeId);
        }
        for (let turn = 0; turn < 2 * n; turn++) {
          const i = turn % n,
            v = (await snap(i)).view,
            scope = [v.id, v.phase, v.step, v.turn].join(":");
          const denied = await req(clients[(i + 1) % n], "dp:stroke", {
            code,
            token: seats[(i + 1) % n].token,
            scope,
            chunk: {
              id: "bad",
              seq: 0,
              color: 0,
              width: 8,
              points: [[1, 2, 0]],
              end: true,
            },
          });
          assert.equal(denied.ok, false);
          await ok(clients[i], "dp:stroke", {
            code,
            token: seats[i].token,
            scope,
            chunk: {
              id: "ignored",
              seq: 0,
              color: 0,
              width: 28,
              points: [
                [turn * 20, turn * 30, 0],
                [turn * 20 + 10, turn * 30 + 10, 100],
              ],
              end: true,
            },
          });
        }
        assert.equal((await snap()).view.phase, "DISCUSS");
        assert.equal((await snap()).view.drawing.strokes.length, 2 * n);
        await action(0, { type: "FINISH_DISCUSSION" });
        for (let i = 0; i < n; i++)
          await action(i, {
            type: "VOTE",
            target: ids[i === fake ? (i + 1) % n : fake],
          });
        assert.equal((await snap(fake)).view.phase, "OBSERVE");
        await action(fake, { type: "BEGIN_GUESS" });
        assert.equal((await snap(fake)).view.options.length, 18);
        await action(fake, { type: "GUESS", answer: word });
        assert.equal((await snap()).view.winner, "fake");
      }
      await action(0, { type: "RESTART" });
      assert.equal((await snap()).view, null);
      clients.forEach((s) => s.disconnect());
      console.log("PASS", mode, n, "players");
    }
  }
} finally {
  sockets.forEach((s) => s.disconnect());
}
