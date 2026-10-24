import { it, expect } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { attachXiabaiwang } from "../src/xb-rooms.ts";
import {
  XB_EVENTS as E,
  type XBSnapshot,
} from "../../../packages/shared/src/xb-protocol.ts";
const delay = (n: number) => new Promise((r) => setTimeout(r, n));
const ask = async (s: Socket, e: string, p: object): Promise<any> => {
  await delay(55);
  return new Promise((res, rej) =>
    s.timeout(3000).emit(e, p, (err: any, r: any) => (err ? rej(err) : res(r))),
  );
};
it("娱乐请求不会限制紧接着的合法规则操作", async () => {
  const http = createServer();
  const server = new Server(http);
  const store = attachXiabaiwang(
    server,
    mkdtempSync(join(tmpdir(), "xb-independent-")),
    { maxRooms: 2, idleMs: 60000 },
  );
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const socket = io("http://127.0.0.1:" + (http.address() as any).port, {
    transports: ["websocket"],
  });
  try {
    await new Promise<void>((r) => socket.on("connect", r));
    const { code } = await ask(socket, E.create, {});
    const a = await ask(socket, E.join, { code, name: "甲" });
    const room = store.rooms.get(code)!;
    room.join("乙");
    room.join("丙");
    expect(
      (await ask(socket, E.command, { command: { type: "START" } })).ok,
    ).toBe(true);
    await delay(55);
    const reply: any = await new Promise((resolve) =>
      socket.emit(E.poop, { target: room.file.state!.truth }, (effect: any) => {
        expect(effect.ok).toBe(true);
        socket.emit(
          E.command,
          {
            command: {
              type: "SPEAK",
              target: room.player(a.token)!.id,
              round: 1,
            },
          },
          resolve,
        );
      }),
    );
    expect(reply.ok).toBe(true);
  } finally {
    socket.disconnect();
    store.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it("真实Socket.IO：3～10人完整对局、并发互动、秘密隔离、刷新恢复与过期提交", async () => {
  const http = createServer();
  const server = new Server(http);
  const dir = mkdtempSync(join(tmpdir(), "xb-test-"));
  const store = attachXiabaiwang(server, dir, { maxRooms: 20, idleMs: 60000 });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + (http.address() as any).port;
  const sockets: Socket[] = [];
  const connect = async () => {
    const s = io(url, { transports: ["websocket"], forceNew: true });
    sockets.push(s);
    await new Promise<void>((r) => s.on("connect", r));
    return s;
  };
  try {
    for (let n = 3; n <= 10; n++) {
      const clients: {
        socket: Socket;
        token: string;
        view: XBSnapshot | null;
        effects: number;
      }[] = [];
      const first = await connect();
      const created = await ask(first, E.create, {});
      expect(created.ok).toBe(true);
      for (let i = 0; i < n; i++) {
        const socket = i === 0 ? first : await connect();
        const c = {
          socket,
          token: "",
          view: null as XBSnapshot | null,
          effects: 0,
        };
        clients.push(c);
        socket.on(E.update, (s) => (c.view = s));
        socket.on(E.effects, () => c.effects++);
        const joined = await ask(socket, E.join, {
          code: created.code,
          name: `玩家${i}`,
        });
        expect(joined.ok).toBe(true);
        c.token = joined.token;
      }
      expect(
        (await ask(first, E.command, { command: { type: "START" } })).ok,
      ).toBe(true);
      await delay(70);
      const room = store.rooms.get(created.code)!;
      for (let round = 1; round <= n; round++) {
        const state = room.file.state!;
        const guesser = clients.find((c) => c.view!.me === state.guesser)!;
        for (const c of clients) {
          const v = c.view!.view!;
          expect(!!v.answer).toBe(c.view!.me === state.truth);
          expect(v).not.toHaveProperty("deck");
          expect(v).not.toHaveProperty("seed");
          if (c.view!.me !== state.truth)
            expect(JSON.stringify({ ...v, history: [] })).not.toContain(
              state.topic.answer,
            );
        }
        const liar = clients.find(
          (c) => c.view!.me !== state.guesser && c.view!.me !== state.truth,
        )!;
        expect(
          (
            await ask(liar.socket, E.command, {
              command: { type: "CHALLENGE", target: state.truth, round },
            })
          ).ok,
        ).toBe(false);
        const target = round % 2 === 0 ? state.truth : liar.view!.me;
        expect(
          (
            await ask(guesser.socket, E.command, {
              command: { type: "CHALLENGE", target, round },
            })
          ).ok,
        ).toBe(true);
        expect(
          (
            await ask(guesser.socket, E.command, {
              command: { type: "CHALLENGE", target, round },
            })
          ).ok,
        ).toBe(false);
        if (round === 1) {
          const before = JSON.stringify(room.file);
          const results = await Promise.all(
            clients.map((c, i) =>
              ask(c.socket, E.poop, { target: clients[(i + 1) % n].view!.me }),
            ),
          );
          expect(results.every((r) => r.ok)).toBe(true);
          // 聚合器120ms仅是调度间隔，负载下不能把固定180ms睡眠当成送达保证。
          // 保持3秒实际送达上限，等待每个客户端真的收到事件再断言。
          const effectDeadline=Date.now()+3000;
          while(!clients.every(c=>c.effects>0)&&Date.now()<effectDeadline) await delay(10);
          expect(clients.every((c) => c.effects > 0)).toBe(true);
          expect(JSON.stringify(room.file)).toBe(before);
          expect(
            (await ask(liar.socket, E.poop, { target: state.truth })).ok,
          ).toBe(false);
          // 真正断开并用新连接恢复，秘密角色不重新分配。
          const old = clients[1];
          old.socket.disconnect();
          const replacement = await connect();
          replacement.on(E.update, (s) => (old.view = s));
          old.socket = replacement;
          const restored = await ask(replacement, E.join, {
            code: created.code,
            token: old.token,
          });
          expect(restored.ok).toBe(true);
          expect(restored.snapshot.me).toBe(room.player(old.token)!.id);
          expect(restored.snapshot.view).toEqual(room.snapshot(old.token).view);
        }
        const before = { ...room.file.state!.scores };
        expect(
          (
            await ask(guesser.socket, E.command, {
              command: { type: "GUESS", target: state.truth, round },
            })
          ).ok,
        ).toBe(true);
        expect(
          room.file.state!.scores[state.guesser] - before[state.guesser],
        ).toBe(state.topic.difficulty + (target === state.truth ? -3 : 1));
        expect(
          (
            await ask(guesser.socket, E.command, {
              command: { type: "GUESS", target: state.truth, round },
            })
          ).ok,
        ).toBe(false);
        expect(
          (await ask(first, E.command, { command: { type: "NEXT", round } }))
            .ok,
        ).toBe(true);
        if (round < n)
          expect(
            (
              await ask(guesser.socket, E.command, {
                command: { type: "GUESS", target: state.truth, round },
              })
            ).ok,
          ).toBe(false);
      }
      expect(room.file.state!.phase).toBe("over");
      expect(room.file.state!.history).toHaveLength(n);
      clients.forEach((c) => c.socket.disconnect());
    }
  } finally {
    sockets.forEach((s) => s.disconnect());
    store.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
  // 八种人数、52轮及重连均串行，160题存档较大；单次ACK仍严格限制3秒。
}, 120000);
