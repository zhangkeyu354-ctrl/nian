import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { expect, it } from "vitest";
import { attachMenace, TARoomStore } from "../../../apps/server/src/ta-rooms.ts";
import { TA_EVENTS } from "../../shared/src/ta-protocol.ts";

it("同一广播版本一致，房间重启后版本继续递增", async () => {
  const dir = mkdtempSync(join(tmpdir(), "menace-room-"));
  const http = createServer();
  const server = new Server(http);
  const rooms = attachMenace(server, dir, { maxRooms: 4, idleMs: 60_000 });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("未取得测试端口");
  const client = io(`http://127.0.0.1:${address.port}`);
  try {
    const created = await client.timeout(2000).emitWithAck(TA_EVENTS.create, {});
    const code = created.code;
    const broadcast = new Promise<number>((resolve) => client.once(TA_EVENTS.update, (snapshot) => resolve(snapshot.version)));
    const joined = await client.timeout(2000).emitWithAck(TA_EVENTS.join, { code });
    expect(await broadcast).toBe(joined.snapshot.version);
    const joinedAgain = await client.timeout(2000).emitWithAck(TA_EVENTS.join, { code });
    expect(joinedAgain.snapshot.version).toBe(joined.snapshot.version + 1);
    const restored = new TARoomStore(dir).rooms.get(code)!;
    expect(restored.snapshot(null).version).toBe(joinedAgain.snapshot.version);
    expect(rooms.rooms.get(code)?.snapshot(null).version).toBe(joinedAgain.snapshot.version);
  } finally {
    client.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
