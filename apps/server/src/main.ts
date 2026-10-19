import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import QRCode from "qrcode";
import { RoomStore, errorText, type Room } from "./rooms.ts";
import {
  EVENTS,
  type Ack,
  type CommandRequest,
  type CreateRoomRequest,
  type RoomSnapshot,
} from "../../../packages/shared/src/protocol.ts";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const WEB = resolve(process.env.DBD_WEB_DIR ?? join(root, "dist/web"));
const DATA = resolve(process.env.DBD_DATA_DIR ?? join(root, "data/rooms"));
const allowFixedSeed = process.env.DBD_ALLOW_FIXED_SEED === "1";

export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(
      (i): i is NonNullable<typeof i> =>
        !!i && i.family === "IPv4" && !i.internal,
    )
    .map((i) => i.address);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const store = new RoomStore(DATA);
const http = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/api/info") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ port: PORT, lan: lanAddresses() }));
    return;
  }
  if (url.pathname === "/api/qr") {
    const text = url.searchParams.get("text") ?? "";
    QRCode.toString(text.slice(0, 300), { type: "svg", margin: 1 }).then(
      (svg) => {
        res.setHeader("content-type", "image/svg+xml");
        res.end(svg);
      },
      () => {
        res.statusCode = 400;
        res.end();
      },
    );
    return;
  }
  // 静态文件：只允许读取前端构建目录，原版资料目录不会被提供
  let file = normalize(join(WEB, decodeURIComponent(url.pathname)));
  if (
    !file.startsWith(WEB) ||
    !existsSync(file) ||
    statSync(file).isDirectory()
  )
    file = join(WEB, "index.html");
  if (!existsSync(file)) {
    res.statusCode = 503;
    res.end("前端尚未构建，请先运行 npm run build");
    return;
  }
  res.setHeader(
    "content-type",
    MIME[extname(file)] ?? "application/octet-stream",
  );
  if (file.includes(`${join("assets")}`) && !file.endsWith(".html"))
    res.setHeader("cache-control", "public, max-age=3600");
  res.end(readFileSync(file));
});

const io = new Server(http, { cors: { origin: true } });

function broadcast(room: Room) {
  for (const s of io.sockets.adapter.rooms.get(room.code) ?? []) {
    const sock = io.sockets.sockets.get(s);
    if (sock) sock.emit(EVENTS.update, room.snapshot(sock.data.seatId ?? null));
  }
}

io.on("connection", (socket) => {
  socket.data.seatId = null as string | null;
  const leaveSeat = () => {
    const room: Room | undefined = socket.data.room;
    if (room && socket.data.seatId) {
      room.connections.set(
        socket.data.seatId,
        Math.max(0, (room.connections.get(socket.data.seatId) ?? 1) - 1),
      );
      broadcast(room);
    }
  };
  const attach = (room: Room, seatId: string | null) => {
    if (socket.data.room && socket.data.room !== room) {
      leaveSeat();
      socket.leave(socket.data.room.code);
    }
    if (seatId && socket.data.seatId !== seatId)
      room.connections.set(seatId, (room.connections.get(seatId) ?? 0) + 1);
    socket.data.room = room;
    socket.data.seatId = seatId;
    socket.join(room.code);
  };

  socket.on(
    EVENTS.create,
    (req: CreateRoomRequest, ack: (a: Ack<{ code: string }>) => void) => {
      try {
        const room = store.create(req, allowFixedSeed);
        ack({ ok: true, code: room.code });
      } catch (e) {
        ack({ ok: false, ...errorText(e) });
      }
    },
  );

  // 加入房间；带上之前保存的 token 即可断线重连回原座位
  socket.on(
    EVENTS.join,
    (
      req: { code: string; token?: string },
      ack: (a: Ack<{ snapshot: RoomSnapshot }>) => void,
    ) => {
      const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
      if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
      const seat = room.seatByToken(req.token);
      attach(room, seat?.seatId ?? null);
      ack({ ok: true, snapshot: room.snapshot(seat?.seatId ?? null) });
      broadcast(room);
    },
  );

  socket.on(
    EVENTS.claim,
    (
      req: { code: string; seatId: string; name: string },
      ack: (a: Ack<{ token: string }>) => void,
    ) => {
      const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
      if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
      try {
        const token = room.claim(req.seatId, String(req.name ?? ""));
        store.save(room);
        attach(room, req.seatId);
        ack({ ok: true, token });
        broadcast(room);
      } catch (e) {
        ack({ ok: false, ...errorText(e) });
      }
    },
  );

  socket.on(EVENTS.command, (req: CommandRequest, ack: (a: Ack) => void) => {
    const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
    if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
    try {
      room.apply(req.token, req.version, req.command);
      store.save(room);
      ack({ ok: true });
      broadcast(room);
    } catch (e) {
      ack({ ok: false, ...errorText(e) });
    }
  });

  socket.on("disconnect", leaveSeat);
});

http.listen(PORT, HOST, async () => {
  const urls = lanAddresses().map((ip) => `http://${ip}:${PORT}/`);
  console.log("\n  黎明杀机桌游 · 联机服务器已启动");
  console.log(`  本机打开：http://localhost:${PORT}/`);
  for (const u of urls) console.log(`  同一 Wi-Fi 的手机打开：${u}`);
  if (urls[0])
    console.log(
      "\n" +
        (await QRCode.toString(urls[0], { type: "terminal", small: true })),
    );
  if (allowFixedSeed) console.log("  [测试模式] 允许固定种子");
  console.log("  关闭此窗口即停止服务器。\n");
});
