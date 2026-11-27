import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createFeedback } from "./feedback.ts";
import { extname, join, normalize, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import QRCode from "qrcode";
import { attachDrawingParty } from "./drawing-rooms.ts";
import { RoomStore, errorText, type Room } from "./rooms.ts";
import { attachMagicalAthlete } from "./ma-rooms.ts";
import { attachSodaSmugglers } from "./ss-rooms.ts";
import { attachDnup } from "./du-rooms.ts";
import { attachSkullKing } from "./sk-rooms.ts";
import { attachRummikub } from "./rk-rooms.ts";
import { attachDyingMessage } from "./dm-rooms.ts";
import { attachCodenames } from "./cn-rooms.ts";
import { attachReflexRace } from "./rr-rooms.ts";
import { attachXiabaiwang } from "./xb-rooms.ts";
import { attachWitchTown } from "./wt-rooms.ts";
import { attachNaodongScale } from "./nd-rooms.ts";
import { attachKariba } from "./kb-rooms.ts";
import { attachBlackA510K } from "./ba-rooms.ts";
import { attachBossFighters } from "./bf-rooms.ts";
import { attachMenace } from "./ta-rooms.ts";
import { attachCrimeScene } from "./cs-sockets.ts";
import {
  EVENTS,
  type Ack,
  type CommandRequest,
  type CreateRoomRequest,
  type LobbyRequest,
  type RoomSnapshot,
} from "../../../packages/shared/src/protocol.ts";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const PUBLIC_ASSETS = resolve(join(root, "apps/web/public/assets"));
const WEB = resolve(process.env.DBD_WEB_DIR ?? join(root, "dist/web"));
const DATA = resolve(process.env.DBD_DATA_DIR ?? join(root, "data/rooms"));
const allowFixedSeed = process.env.DBD_ALLOW_FIXED_SEED === "1";
/** 外网链接（例如一键隧道生成的 https 地址）；设置后邀请二维码优先使用它 */
const PUBLIC_URL = (
  process.env.DBD_PUBLIC_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  ""
).replace(/\/+$/, "");
/** 长时间无人操作的房间自动清理（默认 24 小时）；同时存在的房间上限 */
const ROOM_IDLE_MS = Number(process.env.DBD_ROOM_IDLE_HOURS ?? 24) * 3600_000;
const feedback = createFeedback(resolve(process.env.FEEDBACK_FILE ?? join(DATA, "../feedback.jsonl")));
const MAX_ROOMS = Number(process.env.DBD_MAX_ROOMS ?? 200);
const VERSION = (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) || "local";

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
  ".woff": "font/woff",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

const store = new RoomStore(DATA);
const http = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  // 只私下分享给朋友：不让搜索引擎收录
  res.setHeader("x-robots-tag", "noindex, nofollow");
  if (url.pathname === "/api/health") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: true,
        version: VERSION,
        // 当前连着游戏的人数（大厅不连）：自动部署只在 0 时进行，避免打断正在玩的人
        online: io.of("/").sockets.size,
        // 正在玩什么：每个有人连着的房间一行（只给游戏名和人数，不给房间号和昵称）
        playing: livePlaying(),
        // 30 分钟内有人操作过的房间里连着的人数：自动部署看这个，挂着不动的页面不再挡住更新
        active: livePlaying().filter((p) => p.idleMinutes < 30).reduce((n, p) => n + p.players, 0),
        assetCdn: { ok: ASSET_CDN.ok, local: ASSET_CDN.local.slice(0, 12), remote: ASSET_CDN.remote.slice(0, 12), error: ASSET_CDN.error },
        rooms: store.rooms.size,
        maRooms: maStore.rooms.size,
        cnRooms: cnStore.rooms.size,
        dmRooms: dmStore.rooms.size,
        rkRooms: rkStore.rooms.size,
        ssRooms: ssStore.rooms.size,
        duRooms: duStore.rooms.size,
        skRooms: skStore.rooms.size,
        rrRooms: rrStore.rooms.size,
        xbRooms: xbStore.rooms.size,
        dpRooms: dpStore.rooms.size,
        ndRooms: ndStore.rooms.size,
        kbRooms: kbStore.rooms.size,
        baRooms: baStore.rooms.size,
        bfRooms: bfStore.rooms.size,
        taRooms: taStore.rooms.size,
        csRooms: csStore.rooms.size,
        ...(wtStore
          ? { witchTown: { milestone: "M5_PHONE_UI", rooms: wtStore.size, fullGame: true } }
          : {}),
      }),
    );
    return;
  }
  if (url.pathname === "/api/feedback") {
    void feedback.handle(req, res, url);
    return;
  }
  if (url.pathname === "/api/find-room") {
    // 大厅统一的「输入房间号加入」：告诉前端这个房间号属于哪个游戏
    res.setHeader("content-type", "application/json; charset=utf-8");
    const code = (url.searchParams.get("code") ?? "").trim();
    const up = code.toUpperCase();
    const games: string[] = [];
    const has = (m: { has?: (k: string) => boolean } | null | undefined) => !!m?.has && (m.has(code) || m.has(up));
    if (has(store.rooms)) games.push("dbd");
    const pairs: [string, { rooms: Map<string, unknown> }][] = [
      ["ma", maStore], ["cn", cnStore], ["dm", dmStore], ["rk", rkStore], ["ss", ssStore], ["du", duStore], ["sk", skStore],
      ["rr", rrStore], ["xb", xbStore], ["nd", ndStore], ["kb", kbStore], ["bf", bfStore], ["ta", taStore], ["crime-scene", csStore],
    ];
    for (const [g, st] of pairs) if (has(st.rooms)) games.push(g);
    const dp = (dpStore.rooms as Map<string, { file?: { mode?: string } }>).get(code) ?? (dpStore.rooms as Map<string, { file?: { mode?: string } }>).get(up);
    if (dp) games.push(dp.file?.mode === "fa" ? "fa" : "tp");
    if (wtStore?.hasRoom(code)) games.push("wt");
    res.end(JSON.stringify({ code: up, games }));
    return;
  }
  if (url.pathname === "/robots.txt") {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("User-agent: *\nDisallow: /\n");
    return;
  }
  if (url.pathname === "/api/info") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        port: PORT,
        lan: lanAddresses(),
        publicUrl: PUBLIC_URL || null,
      }),
    );
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
  const missing = !file.startsWith(WEB) || !existsSync(file) || statSync(file).isDirectory();
  // 带扩展名的资源找不到时返回 404，绝不能用页面顶替（旧页面请求已不存在的脚本会变成白屏）
  if (missing && extname(url.pathname)) {
    res.statusCode = 404;
    res.setHeader("cache-control", "no-store");
    res.end("not found");
    return;
  }
  // 图片、音效等素材（含 /assets/ 下直接放的黎明杀机图片；构建产物 js/css 不在 public 里，不会被转发）：GitHub Pages 上的版本和本机完全一致时，转发过去（省 Render 流量）
  if (!missing && ASSET_CDN.ok && (/^\/assets\/[^/]+\/./.test(url.pathname) || /^\/fonts\/[^/]+$/.test(url.pathname) || (/^\/assets\/[^/]+$/.test(url.pathname) && existsSync(join(PUBLIC_ASSETS, decodeURIComponent(url.pathname.slice(8))))))) {
    res.statusCode = 302;
    res.setHeader("location", ASSET_CDN.base + url.pathname);
    res.setHeader("cache-control", "public, max-age=3600");
    res.end();
    return;
  }
  if (missing) file = join(WEB, "index.html");
  if (!existsSync(file)) {
    res.statusCode = 503;
    res.end("前端尚未构建，请先运行 npm run build");
    return;
  }
  res.setHeader(
    "content-type",
    MIME[extname(file)] ?? "application/octet-stream",
  );
  // 省流量（Render 免费方案每月 5GB）：
  // - 构建产物文件名带哈希，长期缓存；美术等资源缓存 7 天；页面本身每次都检查新版
  // - ETag：文件没变时只回 304，不重传内容
  // - 文本类文件 gzip 压缩（结果缓存在内存里）
  const st = statSync(file);
  const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  res.setHeader("etag", etag);
  // 页面本身不让任何浏览器留副本：微信内置浏览器会无视 no-cache，一直显示旧页面（2026-11-21 用户遇到）。
  // index.html 只有几 KB，脚本和样式文件名带哈希，仍然长期缓存，不影响流量。
  if (file.endsWith(".html")) {
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("pragma", "no-cache");
    res.setHeader("expires", "0");
  }
  else if (/-[A-Za-z0-9_-]{8}\.(js|css)$/.test(file))
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  else res.setHeader("cache-control", "public, max-age=604800, stale-while-revalidate=86400");
  if (req.headers["if-none-match"] === etag && !file.endsWith(".html")) {
    res.statusCode = 304;
    res.end();
    return;
  }
  const textLike = /\.(js|mjs|css|html|json|svg|txt|webmanifest|map)$/.test(file);
  if (textLike && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    let gz = GZIP_CACHE.get(file);
    if (!gz || gz.etag !== etag) {
      gz = { etag, body: gzipSync(readFileSync(file), { level: 9 }) };
      GZIP_CACHE.set(file, gz);
    }
    res.setHeader("content-encoding", "gzip");
    res.setHeader("vary", "accept-encoding");
    res.end(gz.body);
    return;
  }
  res.end(readFileSync(file));
});

/**
 * 素材 CDN（GitHub Pages）：.github/workflows/assets-pages.yml 把 apps/web/public/assets 发布到 Pages，
 * 并写 fingerprint.txt。这里算出本机素材的指纹，每 5 分钟比对一次；一致才转发，否则自己提供。
 * ASSET_CDN_BASE=off 可关闭。
 */
const ASSET_CDN = { base: (process.env.ASSET_CDN_BASE ?? "https://zhangkeyu354-ctrl.github.io/nian").replace(/\/$/, ""), ok: false, local: "", remote: "", error: "" };
if (ASSET_CDN.base !== "off") {
  setTimeout(async () => {
    try {
      const { assetFingerprint } = await import("../../../scripts/asset-fingerprint.mjs");
      ASSET_CDN.local = assetFingerprint(resolve(root, "apps/web/public"));
    } catch (e) {
      console.warn("素材指纹计算失败，不使用 CDN", e);
      ASSET_CDN.error = "fingerprint: " + String(e).slice(0, 120);
      return;
    }
    const check = async () => {
      try {
        const r = await fetch(ASSET_CDN.base + "/fingerprint.txt?t=" + Date.now(), { signal: AbortSignal.timeout(10_000) });
        const remote = r.ok ? (await r.text()).trim() : "";
        ASSET_CDN.remote = remote || "HTTP " + r.status;
        ASSET_CDN.error = "";
        const ok = remote === ASSET_CDN.local;
        if (ok !== ASSET_CDN.ok) console.log(ok ? "素材 CDN 已启用" : "素材 CDN 版本不一致，暂由本机提供", ASSET_CDN.base);
        ASSET_CDN.ok = ok;
      } catch (e) {
        ASSET_CDN.ok = false;
        ASSET_CDN.error = "fetch: " + String(e).slice(0, 120);
      }
    };
    await check();
    setInterval(check, 5 * 60_000).unref();
  }, 2000).unref();
}
const GZIP_CACHE = new Map<string, { etag: string; body: Buffer }>();
const io = new Server(http, { cors: { origin: true } });
io.of('/').setMaxListeners(32);
// 记录每个房间最后一次有人操作的时间（任何游戏事件都算），给健康检查判断「挂着没人玩」
const lastActive = new Map<string, number>();
// /site：每个页面都连的提示频道（网站要重启时推送），不参与游戏
io.of("/site");
io.on("connection", (socket) => {
  // 只算真正的游戏操作；进房/重连/认领座位/心跳不算（手机切后台再回来会自动重连，不能当成「在玩」）
  socket.onAny((event: string) => {
    if (/(^|:)(join|claim|create|ping|update)$/.test(event)) return;
    const now = Date.now();
    for (const r of socket.rooms) if (r !== socket.id) lastActive.set(r, now);
  });
});
// Each enabled game installs one connection/disconnect handler. Keep a finite
// budget above the current multi-game count instead of disabling leak warnings.
const GAME_LISTENER_LIMIT = 18;
io.of("/").setMaxListeners(GAME_LISTENER_LIMIT);
io.on("connection", (socket) => socket.setMaxListeners(GAME_LISTENER_LIMIT));
/** 女巫镇：M5 手机界面完成，默认开启（WT_DISABLE=1 可关闭）。张数为候选59，房间内已提示待核实。 */
const wtStore = process.env.WT_DISABLE !== "1"
  ? attachWitchTown(
      io,
      resolve(process.env.WT_DATA_DIR ?? join(DATA, "../wt-rooms")),
      { maxRooms: MAX_ROOMS, allowCandidateCounts: process.env.WT_ALLOW_CANDIDATE_COUNTS !== "0" },
    )
  : null;
const dpStore = attachDrawingParty(io, resolve(process.env.DP_DATA_DIR ?? join(DATA, "../dp-rooms")));
/** 第二款游戏：魔法运动员（独立房间与存档，事件名带 ma: 前缀） */
const dmStore = attachDyingMessage(
  io,
  resolve(process.env.DM_DATA_DIR ?? join(DATA, "../dm-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);
const taStore = attachMenace(
  io,
  resolve(process.env.TA_DATA_DIR ?? join(DATA, "../ta-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);
const csStore = attachCrimeScene(
  io,
  resolve(process.env.CS_DATA_DIR ?? join(DATA, "../cs-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);
const kbStore = attachKariba(
  io,
  resolve(process.env.KB_DATA_DIR ?? join(DATA, "../kb-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);
const baStore = attachBlackA510K(
  io,
  resolve(process.env.BA_DATA_DIR ?? join(DATA, "../ba-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);
const bfStore = attachBossFighters(
  io,
  resolve(process.env.BF_DATA_DIR ?? join(DATA, "../bf-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);
const ndStore = attachNaodongScale(
  io,
  resolve(process.env.ND_DATA_DIR ?? join(DATA, "../nd-rooms")),
  {
    maxRooms: MAX_ROOMS,
    idleMs: ROOM_IDLE_MS,
    allowFixedSeed: process.env.ND_ALLOW_FIXED_SEED === "1",
  },
);
const rkStore = attachRummikub(
  io,
  resolve(process.env.RK_DATA_DIR ?? join(DATA, '../rk-rooms')),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS, allowFixedSeed: process.env.RK_ALLOW_FIXED_SEED === '1' },
);
const ssStore = attachSodaSmugglers(
  io,
  resolve(process.env.SS_DATA_DIR ?? join(DATA, "../ss-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS, allowFixedSeed: process.env.SS_ALLOW_FIXED_SEED === "1" },
);
const duStore = attachDnup(
  io,
  resolve(process.env.DU_DATA_DIR ?? join(DATA, "../du-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS, allowFixedSeed: process.env.DU_ALLOW_FIXED_SEED === "1" },
);
const skStore = attachSkullKing(
  io,
  resolve(process.env.SK_DATA_DIR ?? join(DATA, "../sk-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS, allowFixedSeed: process.env.SK_ALLOW_FIXED_SEED === "1" },
);
const maStore = attachMagicalAthlete(
  io,
  resolve(process.env.MA_DATA_DIR ?? join(DATA, "../ma-rooms")),
  {
    maxRooms: MAX_ROOMS,
    idleMs: ROOM_IDLE_MS,
  },
);

/** 第三款游戏：行动代号（独立房间与存档，事件名带 cn: 前缀） */
const cnStore = attachCodenames(
  io,
  resolve(process.env.CN_DATA_DIR ?? join(DATA, "../cn-rooms")),
  {
    maxRooms: MAX_ROOMS,
    idleMs: ROOM_IDLE_MS,
  },
);

/** 第五款游戏：眼疾手快（独立房间与存档，事件名带 rr: 前缀） */
const rrStore = attachReflexRace(
  io,
  resolve(process.env.RR_DATA_DIR ?? join(DATA, "../rr-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);

const xbStore = attachXiabaiwang(io, resolve(process.env.XB_DATA_DIR ?? join(DATA, '../xb-rooms')), {maxRooms:MAX_ROOMS,idleMs:ROOM_IDLE_MS});

const dbdBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleDbdBot(room: Room) {
  const previous = dbdBotTimers.get(room.code);
  if (previous) clearTimeout(previous);
  dbdBotTimers.delete(room.code);
  if (![...room.connections.values()].some(count => count > 0) || !room.hasBotWork()) return;
  const version = room.file.commands.length;
  const stage = room.file.stage;
  const timer = setTimeout(() => {
    dbdBotTimers.delete(room.code);
    if (store.rooms.get(room.code) !== room || room.file.stage !== stage ||
        room.file.commands.length !== version || ![...room.connections.values()].some(count => count > 0)) return;
    try {
      if (!room.botStep()) return;
      store.save(room);
      broadcast(room);
    } catch (e) {
      console.warn("黎明杀机人机未能行动", room.code, e instanceof Error ? e.message : e);
    }
  }, 1000 + Math.floor(Math.random() * 1001));
  timer.unref();
  dbdBotTimers.set(room.code, timer);
}

function broadcast(room: Room) {
  for (const s of io.sockets.adapter.rooms.get(room.code) ?? []) {
    const sock = io.sockets.sockets.get(s);
    if (sock) sock.emit(EVENTS.update, room.snapshot(sock.data.seatId ?? null));
  }
  scheduleDbdBot(room);
}

/** 房间里还有人连着就不清理 */
const busy = (code: string) =>
  (io.sockets.adapter.rooms.get(code)?.size ?? 0) > 0;
setInterval(() => {
  const removed = store.prune(ROOM_IDLE_MS, busy);
  if (removed) console.log(`清理闲置房间 ${removed} 个`);
}, 30 * 60_000).unref();

io.on("connection", (socket) => {
  socket.data.seatId = null as string | null;
  // 简单限流：每个连接 10 秒内最多 120 次请求，超出的直接忽略
  let windowStart = Date.now(),
    count = 0;
  socket.use((_packet, next) => {
    if (_packet[0] === "dp:stroke") return next(); // Drawing endpoint has independent limits
    const now = Date.now();
    if (now - windowStart > 10_000) ((windowStart = now), (count = 0));
    if (++count > 120) return next(new Error("RATE_LIMIT"));
    next();
  });
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
        if (store.rooms.size >= MAX_ROOMS) {
          store.prune(ROOM_IDLE_MS, (code) => busy(code));
          if (store.rooms.size >= MAX_ROOMS) throw new Error("TOO_MANY_ROOMS");
        }
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
      const me = room.idByToken(req.token);
      attach(room, me);
      ack({ ok: true, snapshot: room.snapshot(me) });
      broadcast(room);
    },
  );

  socket.on(
    EVENTS.claim,
    (
      req: { code: string; seatId?: string; name: string },
      ack: (a: Ack<{ token: string }>) => void,
    ) => {
      const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
      if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
      try {
        const token = room.claim(req.seatId, String(req.name ?? ""));
        store.save(room);
        attach(room, room.idByToken(token));
        ack({ ok: true, token });
        broadcast(room);
      } catch (e) {
        ack({ ok: false, ...errorText(e) });
      }
    },
  );

  // 房间内（对局开始前）的操作：选阵营、报名控两名、改人数、开始、选角色
  socket.on(EVENTS.lobby, (req: LobbyRequest, ack: (a: Ack) => void) => {
    const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
    if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
    try {
      room.lobby(req.token, req.action);
      store.save(room);
      ack({ ok: true });
      broadcast(room);
    } catch (e) {
      ack({ ok: false, ...errorText(e) });
    }
  });
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
  console.log(
    "\n  桌游合集（黎明杀机 · 魔法运动员 · 行动代号 · 请留遗言 · 眼疾手快）· 联机服务器已启动（版本 " +
      VERSION +
      "）",
  );
  console.log(`  本机打开：http://localhost:${PORT}/`);
  if (PUBLIC_URL) {
    console.log(`\n  ★ 外网链接（手机流量、外地朋友都能打开）：${PUBLIC_URL}/`);
    console.log(
      "\n" +
        (await QRCode.toString(PUBLIC_URL + "/", {
          type: "terminal",
          small: true,
        })),
    );
  } else {
    for (const u of urls) console.log(`  同一 Wi-Fi 的手机打开：${u}`);
    if (urls[0])
      console.log(
        "\n" +
          (await QRCode.toString(urls[0], { type: "terminal", small: true })),
      );
  }
  if (allowFixedSeed) console.log("  [测试模式] 允许固定种子");
  console.log("  关闭此窗口即停止服务器。\n");
  // 自己叫醒自己：Render 免费版 15 分钟没有外部访问就休眠。
  // GitHub 定时任务经常不准时，所以服务器每 9 分钟从外网地址访问自己一次（只在 Render 上开启）。
  if (process.env.RENDER_EXTERNAL_URL && process.env.SELF_PING !== "0") {
    const ping = () =>
      fetch(process.env.RENDER_EXTERNAL_URL!.replace(/\/+$/, "") + "/api/health", { signal: AbortSignal.timeout(20_000) })
        .then((r) => r.status !== 200 && console.warn("self-ping HTTP " + r.status))
        .catch((e) => console.warn("self-ping 失败", String(e)));
    setInterval(ping, 9 * 60_000).unref();
  }
});

const STARTED_AT = Date.now();
// 健康检查用：按 Socket.IO 房间统计「哪个游戏的房间里连着几个人」
const GAME_PREFIX: Record<string, string> = {
  ba: "双黑A五十K", bf: "魔王试炼", cn: "行动代号", cs: "犯罪现场", dm: "请留遗言", dp: "绘画派对", du: "反转王牌", kb: "卡里巴湖",
  ma: "魔法运动员", nd: "脑洞量表", rk: "拉密", rr: "眼疾手快", sk: "骷髅王", ss: "汽水走私犯", ta: "我们之中的威胁",
  xb: "瞎掰王", wt: "女巫镇",
};
function livePlaying() {
  const out: Array<{ game: string; players: number; idleMinutes: number }> = [];
  const now = Date.now();
  for (const [name, members] of io.sockets.adapter.rooms) {
    if (io.sockets.sockets.has(name)) continue; // 每个连接自带的私有房间
    const m = /^([a-z]{2}):/.exec(name);
    // 服务器重启后还没人操作过的房间，从重启时刻算起
    const idleMinutes = Math.floor((now - (lastActive.get(name) ?? STARTED_AT)) / 60000);
    out.push({ game: m ? GAME_PREFIX[m[1]] ?? m[1] : "黎明杀机", players: members.size, idleMinutes });
  }
  return out.sort((a, b) => b.players - a.players);
}

// 部署新版本时 Render 会给旧服务器发 SIGTERM，再等约 30 秒才强制关掉：
// 先通过 /site 频道（每个页面都连着，不算进在线人数）推送「网站正在更新」，15 秒后再退出
process.on("SIGTERM", () => {
  io.of("/site").emit("notice", "网站正在更新新版本，马上会断开，当前对局会中断；稍等 1 分钟后刷新页面即可");
  console.log("收到 SIGTERM：已提示玩家，15 秒后退出");
  setTimeout(() => process.exit(0), 15000);
});
