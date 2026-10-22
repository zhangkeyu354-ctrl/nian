import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  createWitchTown,
  viewForWitchTown,
  reduceWitchTown,
  upgradeWitchTown,
  type WTState,
} from "../../../packages/witch-town/src/index.ts";
import {
  WT_EVENTS,
  type WTActionRequest,
  type WTRoomSnapshot,
} from "../../../packages/shared/src/wt-protocol.ts";

function fail(code: string): never {
  throw new Error(code);
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
interface WTSeat {
  id: string;
  name: string;
  tokenHash: string;
  ready: boolean;
}
interface RoomFile {
  schemaVersion: 1;
  game: "witch-town";
  code: string;
  capacity: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  hostId: string | null;
  players: WTSeat[];
  state: WTState | null;
  receipts: Record<string, { signature: string; version: number }>;
}
interface WTStoreOptions {
  allowCandidateCounts?: boolean;
  maxRooms?: number;
  idleMs?: number;
}

/** Server-authoritative snapshots on disk; synchronous transactions serialize commands
 * within the existing single-process Node service. No await occurs between check/write. */
export class WTRoomStore {
  private rooms = new Map<string, RoomFile>();
  readonly connections = new Map<string, Map<string, number>>();
  readonly loadErrors: string[] = [];
  constructor(
    private dir: string,
    private options: WTStoreOptions = {},
  ) {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir).filter((n) =>
      /^[A-F0-9]{8}\.json$/.test(n),
    )) {
      try {
        const r = JSON.parse(readFileSync(join(dir, name), "utf8")) as RoomFile;
        if (
          r.schemaVersion !== 1 ||
          r.game !== "witch-town" ||
          `${r.code}.json` !== name ||
          !Array.isArray(r.players) ||
          !Number.isInteger(r.version)
        )
          fail("BAD_SAVE");
        if (r.state) r.state = upgradeWitchTown(r.state);
        this.rooms.set(r.code, r);
      } catch {
        this.loadErrors.push(name);
      }
    }
  }
  get size() {
    return this.rooms.size;
  }
  private room(code: unknown) {
    return (
      (typeof code === "string" && this.rooms.get(code)) ||
      fail("ROOM_NOT_FOUND")
    );
  }
  private seat(r: RoomFile, token: unknown) {
    if (typeof token !== "string" || !token || token.length > 128)
      fail("BAD_CREDENTIAL");
    return (
      r.players.find((p) => p.tokenHash === hash(token)) ??
      fail("BAD_CREDENTIAL")
    );
  }
  private save(r: RoomFile) {
    const file = join(this.dir, `${r.code}.json`),
      temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(r), { mode: 0o600, flush: true });
    renameSync(temp, file);
    this.rooms.set(r.code, r);
  }
  create(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 4 || capacity > 12)
      fail("BAD_CAPACITY");
    if (this.rooms.size >= (this.options.maxRooms ?? 200))
      fail("TOO_MANY_ROOMS");
    let code: string;
    do {
      code = randomBytes(4).toString("hex").toUpperCase();
    } while (this.rooms.has(code));
    const now = Date.now();
    this.save({
      schemaVersion: 1,
      game: "witch-town",
      code,
      capacity,
      version: 0,
      createdAt: now,
      updatedAt: now,
      hostId: null,
      players: [],
      state: null,
      receipts: {},
    });
    return code;
  }
  claim(code: string, name: unknown) {
    const r = structuredClone(this.room(code));
    if (r.state) fail("ALREADY_STARTED");
    if (r.players.length >= r.capacity) fail("ROOM_FULL");
    if (typeof name !== "string" || !name.trim() || name.trim().length > 24)
      fail("BAD_NAME");
    const token = randomBytes(24).toString("base64url"),
      id = randomBytes(12).toString("hex");
    r.players.push({
      id,
      name: name.trim(),
      tokenHash: hash(token),
      ready: false,
    });
    r.hostId ??= id;
    r.version++;
    r.updatedAt = Date.now();
    this.save(r);
    return { playerId: id, token };
  }
  action(code: string, token: string, req: WTActionRequest) {
    const current = this.room(code),
      me = this.seat(current, token);
    if (
      !req ||
      typeof req.requestId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(req.requestId) ||
      !Number.isInteger(req.version) ||
      !req.action ||
      typeof req.action !== "object"
    )
      fail("BAD_REQUEST");
    const key = `${me.id}:${req.requestId}`,
      signature = JSON.stringify({ version: req.version, action: req.action });
    const old = current.receipts[key];
    if (old) {
      if (old.signature !== signature) fail("REQUEST_ID_REUSED");
      return old.version;
    }
    if (req.version !== current.version) fail("STALE_VERSION");
    const r = structuredClone(current),
      seat = r.players.find((p) => p.id === me.id)!;
    if (req.action.type === "READY") {
      if (r.state) fail("ALREADY_STARTED");
      if (typeof req.action.ready !== "boolean") fail("BAD_REQUEST");
      seat.ready = req.action.ready;
    } else if (req.action.type === "START") {
      if (me.id !== r.hostId) fail("HOST_ONLY");
      if (r.state) fail("ALREADY_STARTED");
      if (r.players.length < 4) fail("NEED_FOUR_PLAYERS");
      if (r.players.some((p) => !p.ready)) fail("NOT_READY");
      r.state = createWitchTown(
        {
          players: r.players.map((p) => ({ id: p.id, name: p.name })),
          countsProfile: this.options.allowCandidateCounts
            ? "candidate-59"
            : "official-standard",
          allowCandidateCounts: this.options.allowCandidateCounts,
        },
        () => randomInt(0x100000000) / 0x100000000,
      );
    } else {
      if (!r.state) fail("NOT_STARTED");
      r.state = reduceWitchTown(r.state, me.id, req.action);
    }
    // Secret dawn ballots merge serially but do not advance the public revision.
    // Otherwise the revision gap itself reveals how many witch holders voted.
    if (!(req.action.type === "DAWN_TARGET" && r.state?.phase === "dawn"))
      r.version++;
    r.updatedAt = Date.now();
    r.receipts[key] = { signature, version: r.version };
    this.save(r);
    return r.version;
  }
  snapshot(code: string, token: string | null): WTRoomSnapshot {
    const r = this.room(code),
      me = token === null ? null : this.seat(r, token);
    return {
      game: "witch-town",
      code: r.code,
      capacity: r.capacity,
      version: r.version,
      stage: r.state ? "game" : "lobby",
      mySeat: me?.id ?? null,
      players: r.players.map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        host: p.id === r.hostId,
        connected: (this.connections.get(code)?.get(p.id) ?? 0) > 0,
      })),
      view: r.state ? viewForWitchTown(r.state, me?.id ?? null) : null,
      milestone: "M2_DAY_ENGINE",
    };
  }
  connected(code: string, id: string, delta: number) {
    let m = this.connections.get(code);
    if (!m) this.connections.set(code, (m = new Map()));
    m.set(id, Math.max(0, (m.get(id) ?? 0) + delta));
  }
}

export function attachWitchTown(
  io: Server,
  dir: string,
  options: WTStoreOptions = {},
) {
  const store = new WTRoomStore(dir, options);
  const bindings = new Map<
    string,
    { code: string; token: string | null; playerId: string | null }
  >();
  const broadcast = (code: string, witchesOnly = false) => {
    for (const [id, b] of bindings)
      if (
        b.code === code &&
        (!witchesOnly || store.snapshot(code, b.token).view?.private?.everWitch)
      )
        io.sockets.sockets
          .get(id)
          ?.emit(WT_EVENTS.update, store.snapshot(code, b.token));
  };
  io.on("connection", (socket: Socket) => {
    const detach = () => {
      const b = bindings.get(socket.id);
      if (b) {
        bindings.delete(socket.id);
        if (b.playerId) store.connected(b.code, b.playerId, -1);
        broadcast(b.code);
      }
    };
    const attach = (code: string, token: string | null) => {
      const v = store.snapshot(code, token);
      detach();
      bindings.set(socket.id, { code, token, playerId: v.mySeat });
      if (v.mySeat) store.connected(code, v.mySeat, 1);
      broadcast(code);
      return store.snapshot(code, token);
    };
    const on = (event: string, handle: (r: any) => unknown) =>
      socket.on(event, (r: unknown, ack: unknown) => {
        if (typeof ack !== "function") return;
        try {
          if (!r || typeof r !== "object") fail("BAD_REQUEST");
          ack({ ok: true, data: handle(r) });
        } catch (e) {
          ack({
            ok: false,
            error: e instanceof Error ? e.message : "WT_ERROR",
          });
        }
      });
    on(WT_EVENTS.create, (r) => ({ code: store.create(r.capacity) }));
    on(WT_EVENTS.join, (r) => attach(r.code, r.token ?? null));
    on(WT_EVENTS.claim, (r) => {
      const seat = store.claim(r.code, r.name);
      attach(r.code, seat.token);
      return { ...seat, snapshot: store.snapshot(r.code, seat.token) };
    });
    on(WT_EVENTS.action, (r) => {
      // Bound authenticated identity, never a client-supplied actor ID or token.
      const b = bindings.get(socket.id);
      if (!b?.token) fail("BAD_CREDENTIAL");
      if (r.code !== b.code) fail("BAD_CREDENTIAL");
      const before = JSON.stringify(store.snapshot(b.code, null));
      store.action(b.code, b.token, r.request);
      const publicChanged =
        before !== JSON.stringify(store.snapshot(b.code, null));
      broadcast(b.code, !publicChanged);
      return store.snapshot(b.code, b.token);
    });
    socket.on("disconnect", detach);
  });
  return store;
}
