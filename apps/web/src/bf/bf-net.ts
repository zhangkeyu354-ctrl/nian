import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  BF_EVENTS,
  type BFClientCommand,
  type BFLobbyAction,
  type BFRoomSnapshot,
} from "../../../../packages/shared/src/bf-protocol.ts";
import type { Ack } from "../../../../packages/shared/src/protocol.ts";

const tokenKey = (code: string) => "bf-seat-" + code;
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 隐私模式：刷新后需重新加入 */
    }
  },
};
export const savedName = () => store.get("bf-name") ?? store.get("kb-name") ?? store.get("rr-name") ?? "";

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

export const createBFRoom = () => call<{ code: string }>(BF_EVENTS.create, {});

/** 客户端命令：去掉 version 字段的写法，version 由 hook 自动填 */
export type BFIntent = BFClientCommand extends infer C ? (C extends { version: number } ? Omit<C, "version"> : never) : never;

export function useBFRoom(code: string) {
  const [snap, setSnap] = useState<BFRoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const latest = useRef<BFRoomSnapshot | null>(null);
  useEffect(() => {
    const s = socket();
    const accept = (v: BFRoomSnapshot) => {
      const cur = latest.current;
      if (cur && v.round === cur.round && v.stage === cur.stage && v.version < cur.version) return;
      latest.current = v;
      setSnap(v);
    };
    const join = async () => {
      const res = await call<{ snapshot: BFRoomSnapshot }>(BF_EVENTS.join, { code, token: store.get(tokenKey(code)) });
      if (!res.ok) return setError(res.error);
      setError("");
      accept(res.snapshot);
    };
    const onUpdate = (v: BFRoomSnapshot) => v.code === code && accept(v);
    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    s.on(BF_EVENTS.update, onUpdate);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) onConnect();
    return () => {
      s.off(BF_EVENTS.update, onUpdate);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [code]);

  async function claim(name: string) {
    const res = await call<{ token: string }>(BF_EVENTS.claim, { code, name });
    if (!res.ok) return res.error;
    store.set(tokenKey(code), res.token);
    store.set("bf-name", name);
    const again = await call<{ snapshot: BFRoomSnapshot }>(BF_EVENTS.join, { code, token: res.token });
    if (again.ok) {
      latest.current = again.snapshot;
      setSnap(again.snapshot);
    }
    return null;
  }
  async function lobby(action: BFLobbyAction) {
    const token = store.get(tokenKey(code));
    if (!token) return "请先加入房间";
    const res = await call(BF_EVENTS.lobby, { code, token, action });
    return res.ok ? null : res.error;
  }
  async function send(intent: BFIntent) {
    const token = store.get(tokenKey(code));
    if (!token) return "请先加入房间";
    const command = { ...intent, version: latest.current?.version ?? 0 };
    const res = await call(BF_EVENTS.command, { code, token, command });
    return res.ok ? null : res.error;
  }
  return { snap, error, connected, claim, lobby, send };
}
