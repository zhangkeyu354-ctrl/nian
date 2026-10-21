import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  CN_EVENTS,
  type CNClientCommand,
  type CNLobbyAction,
  type CNRoomSnapshot,
} from "../../../../packages/shared/src/cn-protocol.ts";
import type { Ack } from "../../../../packages/shared/src/protocol.ts";

const tokenKey = (code: string) => "cn-seat-" + code;
const loadToken = (code: string) => {
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
    /* 隐私模式：刷新后需要重新加入 */
  }
};
export const savedName = () => {
  try {
    return localStorage.getItem("cn-name") ?? localStorage.getItem("ma-name") ?? "";
  } catch {
    return "";
  }
};
const saveName = (n: string) => {
  try {
    localStorage.setItem("cn-name", n);
  } catch {
    /* 忽略 */
  }
};

let shared: Socket | null = null;
const socket = () => (shared ??= io({ transports: ["websocket", "polling"] }));
const call = <T>(ev: string, payload: unknown) =>
  new Promise<Ack<T>>((ok) =>
    socket()
      .timeout(8000)
      .emit(ev, payload, (err: unknown, res: Ack<T>) =>
        ok(err ? { ok: false, error: "连接服务器超时，请检查网络。" } : res),
      ),
  );

export const createCNRoom = () => call<{ code: string }>(CN_EVENTS.create, {});

/** 加入房间并持续接收更新；断线重连后自动带凭证回到原座位 */
export function useCNRoom(code: string) {
  const [snap, setSnap] = useState<CNRoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  /** 服务器时间 − 本机时间，用来显示准确的倒计时 */
  const [offset, setOffset] = useState(0);
  const latest = useRef<CNRoomSnapshot | null>(null);
  useEffect(() => {
    const s = socket();
    const accept = (v: CNRoomSnapshot) => {
      latest.current = v;
      setOffset(v.serverNow - Date.now());
      setSnap(v);
    };
    const join = async () => {
      const res = await call<{ snapshot: CNRoomSnapshot }>(CN_EVENTS.join, { code, token: loadToken(code) });
      if (res.ok) {
        accept(res.snapshot);
        setError("");
      } else setError(res.error);
    };
    const onUpdate = (v: CNRoomSnapshot) => {
      if (v.code !== code) return;
      const cur = latest.current;
      if (cur && v.round === cur.round && v.stage === cur.stage && v.version < cur.version) return;
      accept(v);
    };
    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    s.on(CN_EVENTS.update, onUpdate);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) onConnect();
    return () => {
      s.off(CN_EVENTS.update, onUpdate);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [code]);

  async function claim(name: string) {
    const res = await call<{ token: string }>(CN_EVENTS.claim, { code, name });
    if (!res.ok) return res.error;
    saveToken(code, res.token);
    saveName(name);
    const again = await call<{ snapshot: CNRoomSnapshot }>(CN_EVENTS.join, { code, token: res.token });
    if (again.ok) {
      latest.current = again.snapshot;
      setSnap(again.snapshot);
    }
    return null;
  }
  async function lobby(action: CNLobbyAction) {
    const token = loadToken(code);
    if (!token) return "请先加入房间";
    const res = await call(CN_EVENTS.lobby, { code, token, action });
    return res.ok ? null : res.error;
  }
  async function send(command: CNClientCommand) {
    const token = loadToken(code);
    if (!token || !latest.current) return "请先加入房间";
    const res = await call(CN_EVENTS.command, { code, token, version: latest.current.version, command });
    return res.ok ? null : res.error;
  }
  return { snap, error, connected, offset, claim, lobby, send };
}
