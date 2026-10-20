import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  MA_EVENTS,
  type MAClientCommand,
  type MALobbyAction,
  type MARoomSnapshot,
} from "../../../../packages/shared/src/ma-protocol.ts";
import type { Ack } from "../../../../packages/shared/src/protocol.ts";

const tokenKey = (code: string) => "ma-seat-" + code;
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
    return localStorage.getItem("ma-name") ?? "";
  } catch {
    return "";
  }
};
const saveName = (n: string) => {
  try {
    localStorage.setItem("ma-name", n);
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

export const createMARoom = () => call<{ code: string }>(MA_EVENTS.create, {});

/** 加入房间并持续接收更新；断线重连后自动带凭证回到原座位 */
export function useMARoom(code: string) {
  const [snap, setSnap] = useState<MARoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const latest = useRef<MARoomSnapshot | null>(null);
  useEffect(() => {
    const s = socket();
    const join = async () => {
      const res = await call<{ snapshot: MARoomSnapshot }>(MA_EVENTS.join, {
        code,
        token: loadToken(code),
      });
      if (res.ok) {
        latest.current = res.snapshot;
        setSnap(res.snapshot);
        setError("");
      } else setError(res.error);
    };
    const onUpdate = (v: MARoomSnapshot) => {
      if (v.code !== code) return;
      if (latest.current && v.version < latest.current.version && v.stage === latest.current.stage)
        return;
      latest.current = v;
      setSnap(v);
    };
    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    s.on(MA_EVENTS.update, onUpdate);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) onConnect();
    return () => {
      s.off(MA_EVENTS.update, onUpdate);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [code]);

  async function claim(name: string) {
    const res = await call<{ token: string }>(MA_EVENTS.claim, { code, name });
    if (!res.ok) return res.error;
    saveToken(code, res.token);
    saveName(name);
    const again = await call<{ snapshot: MARoomSnapshot }>(MA_EVENTS.join, { code, token: res.token });
    if (again.ok) {
      latest.current = again.snapshot;
      setSnap(again.snapshot);
    }
    return null;
  }
  async function lobby(action: MALobbyAction) {
    const token = loadToken(code);
    if (!token) return "请先加入房间";
    const res = await call(MA_EVENTS.lobby, { code, token, action });
    return res.ok ? null : res.error;
  }
  async function send(command: MAClientCommand) {
    const token = loadToken(code);
    if (!token || !latest.current) return "请先加入房间";
    const res = await call(MA_EVENTS.command, {
      code,
      token,
      version: latest.current.version,
      command,
    });
    return res.ok ? null : res.error;
  }
  return { snap, error, connected, claim, lobby, send };
}
