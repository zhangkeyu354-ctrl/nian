import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  TA_EVENTS,
  type TALobbyAction,
  type TARoomSnapshot,
} from "../../../../packages/shared/src/ta-protocol.ts";
import { collectScenes, type Scene } from "./scenes.ts";
import type { Ack } from "../../../../packages/shared/src/protocol.ts";

const tokenKey = (code: string) => "ta-seat-" + code;
export const store = {
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
export const savedName = () => store.get("ta-name") ?? store.get("rr-name") ?? store.get("cn-name") ?? "";

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

export const createTARoom = () => call<{ code: string }>(TA_EVENTS.create, {});

export function useTARoom(code: string) {
  const [snap, setSnap] = useState<TARoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const latest = useRef<TARoomSnapshot | null>(null);
  const pending = useRef<Scene[]>([]);
  const accept = useCallback((value: TARoomSnapshot) => {
    const previous = latest.current;
    const sameGame = previous?.code === value.code && previous.round === value.round;
    if (sameGame && value.stage === previous.stage && value.version <= previous.version) return;
    if (!sameGame) pending.current = [];
    if (value.stage === "game" && value.view) {
      pending.current.push(...collectScenes(sameGame ? previous.view : null, value.view));
    }
    latest.current = value;
    setSnap(value);
  }, []);
  const takeScenes = useCallback(() => pending.current.splice(0), []);
  useEffect(() => {
    const s = socket();
    const join = async () => {
      const res = await call<{ snapshot: TARoomSnapshot }>(TA_EVENTS.join, { code, token: store.get(tokenKey(code)) });
      if (!res.ok) return setError(res.error);
      setError("");
      accept(res.snapshot);
    };
    const onUpdate = (v: TARoomSnapshot) => v.code === code && accept(v);
    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    s.on(TA_EVENTS.update, onUpdate);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) onConnect();
    return () => {
      s.off(TA_EVENTS.update, onUpdate);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [code, accept]);

  async function claim(name: string) {
    const res = await call<{ token: string }>(TA_EVENTS.claim, { code, name });
    if (!res.ok) return res.error;
    store.set(tokenKey(code), res.token);
    store.set("ta-name", name);
    const again = await call<{ snapshot: TARoomSnapshot }>(TA_EVENTS.join, { code, token: res.token });
    if (again.ok) accept(again.snapshot);
    return null;
  }
  async function lobby(action: TALobbyAction) {
    const token = store.get(tokenKey(code));
    if (!token) return "请先加入房间";
    const res = await call(TA_EVENTS.lobby, { code, token, action });
    return res.ok ? null : res.error;
  }
  async function command(command: Record<string, unknown>) {
    const token = store.get(tokenKey(code));
    if (!token) return "请先加入房间";
    const res = await call(TA_EVENTS.command, { code, token, command });
    return res.ok ? null : res.error;
  }
  const sceneDone = useCallback((version: number) => {
    socket().emit(TA_EVENTS.sceneDone, { code, version });
  }, [code]);
  return { snap, error, connected, claim, lobby, command, sceneDone, takeScenes };
}
