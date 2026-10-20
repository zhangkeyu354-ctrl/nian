import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Command, GameState } from "../../../packages/shared/src/types.ts";
import {
  EVENTS,
  type Ack,
  type CreateRoomRequest,
  type LobbyAction,
  type RoomSnapshot,
} from "../../../packages/shared/src/protocol.ts";

/** App 在联机模式下需要的全部接口 */
export interface NetBinding {
  code: string;
  seat: string;
  version: number;
  view: GameState;
  seats: RoomSnapshot["seats"];
  connected: boolean;
  /** 提交命令；成功返回 null，失败返回中文原因 */
  send: (c: Command) => Promise<string | null>;
  leave: () => void;
}

const tokenKey = (code: string) => "dbd-seat-" + code;
export const loadToken = (code: string) => {
  try {
    return localStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
};
const saveToken = (code: string, token: string) => {
  try {
    localStorage.setItem(tokenKey(code), token);
  } catch {
    /* 隐私模式下无法保存：刷新后需重新选座 */
  }
};

let shared: Socket | null = null;
function socket() {
  shared ??= io({ transports: ["websocket", "polling"] });
  return shared;
}
const call = <T>(ev: string, payload: unknown) =>
  new Promise<Ack<T>>((ok) =>
    socket()
      .timeout(8000)
      .emit(ev, payload, (err: unknown, res: Ack<T>) =>
        ok(err ? { ok: false, error: "连接服务器超时，请检查网络。" } : res),
      ),
  );

export async function createRoom(req: CreateRoomRequest) {
  return call<{ code: string }>(EVENTS.create, req);
}

/** 加入房间并持续接收更新；断线后自动带 token 重连回原座位 */
export function useRoom(code: string | null) {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const latest = useRef<RoomSnapshot | null>(null);
  useEffect(() => {
    if (!code) return;
    const s = socket();
    const join = async () => {
      const res = await call<{ snapshot: RoomSnapshot }>(EVENTS.join, {
        code,
        token: loadToken(code),
      });
      if (res.ok) {
        latest.current = res.snapshot;
        setSnap(res.snapshot);
        setError("");
      } else setError(res.error);
    };
    const onUpdate = (v: RoomSnapshot) => {
      if (v.code !== code) return;
      // 只接受更新的版本，避免乱序覆盖
      if (latest.current && v.version < latest.current.version) return;
      latest.current = v;
      setSnap(v);
    };
    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    s.on(EVENTS.update, onUpdate);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) onConnect();
    return () => {
      s.off(EVENTS.update, onUpdate);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [code]);

  /** preset 房间：认领座位；lobby 房间：不带 seatId，以昵称加入 */
  async function claim(seatId: string | undefined, name: string) {
    if (!code) return "缺少房间号";
    const res = await call<{ token: string }>(EVENTS.claim, {
      code,
      seatId,
      name,
    });
    if (!res.ok) return res.error;
    saveToken(code, res.token);
    const again = await call<{ snapshot: RoomSnapshot }>(EVENTS.join, {
      code,
      token: res.token,
    });
    if (again.ok) {
      latest.current = again.snapshot;
      setSnap(again.snapshot);
    }
    return null;
  }

  /** 房间内操作（选阵营、报名、改人数、开始、选角色）；成功返回 null */
  async function lobby(action: LobbyAction) {
    if (!code) return "缺少房间号";
    const token = loadToken(code);
    if (!token) return "请先加入房间";
    const res = await call(EVENTS.lobby, { code, token, action });
    return res.ok ? null : res.error;
  }

  async function send(c: Command) {
    if (!code || !latest.current) return "尚未连接房间";
    const token = loadToken(code);
    if (!token) return "请先选择座位";
    const res = await call(EVENTS.command, {
      code,
      token,
      version: latest.current.version,
      command: c,
    });
    return res.ok ? null : res.error;
  }
  return { snap, error, connected, claim, lobby, send };
}
