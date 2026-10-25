import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  RK_EVENTS as E,
  type RKAction,
  type RKSnapshot,
  type RKAck,
} from "../../../../packages/shared/src/rk-protocol.ts";
const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};
export function useRKRoom() {
  const [snapshot, setSnapshot] = useState<RKSnapshot | null>(null),
    [online, setOnline] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const socket = useRef<Socket | null>(null),
    latest = useRef<RKSnapshot | null>(null),
    busy = useRef(false),
    code = useRef(
      new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "",
    ),
    token = useRef(storage.get("rk:" + code.current) ?? "");
  const offset = useRef(0);
  const apply = (s: RKSnapshot) => {
    latest.current = s;
    offset.current = s.serverNow - Date.now();
    setSnapshot(s);
  };
  const request = (event: string, data: unknown): Promise<RKAck> =>
    new Promise((resolve) => {
      if (!socket.current?.connected)
        return resolve({ ok: false, error: "连接已断开，正在重连…" });
      socket.current
        .timeout(8000)
        .emit(event, data, (err: Error | null, ack: RKAck) => {
          if (ack?.snapshot) apply(ack.snapshot);
          resolve(err ? { ok: false, error: "连接超时，请重试" } : ack);
        });
    });
  const sync = async () => {
    if (!code.current) return;
    const a = await request(E.join, {
      code: code.current,
      ...(token.current ? { token: token.current } : {}),
    });
    if (!a.ok) setError(a.error ?? "无法加入房间");
  };
  useEffect(() => {
    const s = io({ transports: ["websocket", "polling"] });
    socket.current = s;
    s.on("connect", () => {
      setOnline(true);
      void sync();
    });
    s.on("disconnect", () => setOnline(false));
    s.on("connect_error", () => setOnline(false));
    s.on(E.update, apply);
    window.render_game_to_text = () => JSON.stringify(latest.current);
    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, []);
  const lock = async (fn: () => Promise<boolean>) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      return await fn();
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const claim = async (name: string) => {
    const a = await request(E.claim, { code: code.current, name });
    if (a.ok && a.token) {
      token.current = a.token;
      storage.set("rk:" + code.current, a.token);
      return true;
    }
    setError(a.error ?? "无法入座");
    return false;
  };
  return {
    snapshot,
    online,
    pending,
    error,
    setError,
    offset,
    create: (name: string) =>
      lock(async () => {
        if (!name.trim()) {
          setError("请填写昵称");
          return false;
        }
        const a = await request(E.create, {});
        if (!a.ok || !a.code) {
          setError(a.error ?? "创建失败");
          return false;
        }
        code.current = a.code;
        token.current = "";
        history.replaceState(null, "", "/?game=rk&room=" + a.code);
        return claim(name);
      }),
    join: (room: string, name: string) =>
      lock(async () => {
        code.current = room.trim().toUpperCase();
        token.current = storage.get("rk:" + code.current) ?? "";
        const a = await request(E.join, {
          code: code.current,
          ...(token.current ? { token: token.current } : {}),
        });
        if (!a.ok) {
          setError(a.error ?? "房间不存在");
          return false;
        }
        history.replaceState(null, "", "/?game=rk&room=" + code.current);
        return a.snapshot?.mySeat ? true : claim(name);
      }),
    claim: (name: string) => lock(() => claim(name)),
    act: (action: RKAction) =>
      lock(async () => {
        const s = latest.current;
        if (!s || !token.current) return false;
        const a = await request(E.action, {
          code: s.code,
          token: token.current,
          version: s.version,
          seq: s.nextSeq,
          action,
        });
        if (!a.ok) {
          setError(a.error ?? "操作失败");
          if (!a.snapshot) await sync();
        }
        return a.ok;
      }),
  };
}
