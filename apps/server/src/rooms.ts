import { randomBytes, randomInt } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import {
  createGame,
  reduce,
  RuleError,
  viewFor,
} from "../../../packages/game-engine/src/index.ts";
import type {
  Command,
  CreateOptions,
  GameState,
} from "../../../packages/shared/src/types.ts";
import type {
  CreateRoomRequest,
  RoomSnapshot,
  SeatInfo,
} from "../../../packages/shared/src/protocol.ts";

interface Seat {
  seatId: string;
  actors: string[];
  side: "survivor" | "killer";
  token: string | null;
  name: string | null;
}

/** 房间存档：只保存创建参数和命令列表，状态通过确定性重放恢复 */
interface RoomFile {
  code: string;
  createdAt: string;
  options: CreateOptions;
  seats: Seat[];
  commands: Command[];
}

export class Room {
  state: GameState;
  connections = new Map<string, number>(); // seatId -> 在线连接数
  constructor(public file: RoomFile) {
    let s = createGame(file.options);
    for (const c of file.commands) s = reduce(s, c);
    this.state = s;
  }
  get code() {
    return this.file.code;
  }
  seatByToken(token: string | undefined | null) {
    return token
      ? (this.file.seats.find((s) => s.token === token) ?? null)
      : null;
  }
  seatInfo(): SeatInfo[] {
    return this.file.seats.map((s) => ({
      seatId: s.seatId,
      actors: s.actors,
      side: s.side,
      claimed: !!s.token,
      name: s.name,
      connected: (this.connections.get(s.seatId) ?? 0) > 0,
    }));
  }
  snapshot(seatId: string | null): RoomSnapshot {
    return {
      code: this.code,
      seats: this.seatInfo(),
      mySeat: seatId,
      version: this.file.commands.length,
      view: viewFor(this.state, seatId),
    };
  }
  claim(seatId: string, name: string): string {
    const seat = this.file.seats.find((s) => s.seatId === seatId);
    if (!seat) throw new Error("NO_SEAT");
    if (seat.token) throw new Error("SEAT_TAKEN");
    seat.token = randomBytes(18).toString("base64url");
    seat.name = name.trim().slice(0, 16) || null;
    return seat.token;
  }
  /** 校验身份、版本号和规则后执行命令；任何一步失败都不改变状态 */
  apply(token: string, version: number, command: Command) {
    const seat = this.seatByToken(token);
    if (!seat) throw new Error("NOT_SEATED");
    if (version !== this.file.commands.length) throw new Error("STALE");
    const actorId = command.actorId;
    if (
      typeof actorId !== "string" ||
      this.state.actors[actorId]?.ownerId !== seat.seatId
    )
      throw new Error("NOT_YOUR_ACTOR");
    const next = reduce(this.state, command);
    this.state = next;
    this.file.commands.push(command);
  }
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomStore {
  rooms = new Map<string, Room>();
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const room = new Room(JSON.parse(readFileSync(join(dir, f), "utf8")));
        this.rooms.set(room.code, room);
      } catch (e) {
        console.warn(
          "跳过无法恢复的房间存档",
          f,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
  newCode() {
    for (;;) {
      const code = Array.from(
        { length: 4 },
        () => CODE_CHARS[randomInt(CODE_CHARS.length)],
      ).join("");
      if (!this.rooms.has(code)) return code;
    }
  }
  create(req: CreateRoomRequest, allowFixedSeed: boolean): Room {
    const playerCount = [3, 4, 5].includes(req.playerCount)
      ? req.playerCount
      : 5;
    const owners: Record<string, string> = {};
    if (playerCount !== 5) {
      const n = playerCount - 1;
      req.survivors.forEach(
        (id, i) => (owners[id] = "survivor_player_" + (i % n)),
      );
      owners[req.killer] = "killer_player";
    }
    const seed =
      allowFixedSeed && Number.isInteger(req.seed)
        ? (req.seed as number)
        : randomInt(1, 2 ** 31 - 1);
    const options: CreateOptions = {
      seed,
      mapId: req.mapId,
      survivors: req.survivors,
      killer: req.killer,
      ...(playerCount !== 5 ? { owners } : {}),
    };
    const probe = createGame(options); // 不合法的配置会在这里抛出 RuleError
    const seats = new Map<string, Seat>();
    for (const a of Object.values(probe.actors)) {
      const seat = seats.get(a.ownerId) ?? {
        seatId: a.ownerId,
        actors: [],
        side: a.side,
        token: null,
        name: null,
      };
      seat.actors.push(a.id);
      seats.set(a.ownerId, seat);
    }
    const room = new Room({
      code: this.newCode(),
      createdAt: new Date().toISOString(),
      options,
      seats: [...seats.values()].sort((a, b) =>
        a.side === b.side ? 0 : a.side === "killer" ? 1 : -1,
      ),
      commands: [],
    });
    this.rooms.set(room.code, room);
    this.save(room);
    return room;
  }
  save(room: Room) {
    const target = join(this.dir, room.code + ".json");
    writeFileSync(target + ".tmp", JSON.stringify(room.file));
    renameSync(target + ".tmp", target);
  }
}

export function errorText(e: unknown): { error: string; code: string } {
  const code =
    e instanceof RuleError ? e.code : e instanceof Error ? e.message : "ERROR";
  const map: Record<string, string> = {
    NO_ROOM: "房间不存在，请检查房间号。",
    NO_SEAT: "座位不存在。",
    SEAT_TAKEN: "这个座位已经有人了。",
    NOT_SEATED: "请先选择座位。",
    STALE: "棋盘已经更新，请看清最新状态后再操作。",
    NOT_YOUR_ACTOR: "现在不是你的角色在行动。",
    CHECK_REQUIRED: "该功能尚未实现。",
  };
  return {
    code,
    error: map[code] ?? "当前操作不合法，请检查目标、费用或时机。",
  };
}
