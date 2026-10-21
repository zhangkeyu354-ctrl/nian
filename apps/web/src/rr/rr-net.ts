import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  RR_EVENTS,
  type RRClientCommand,
  type RRLobbyAction,
  type RRRoomSnapshot,
} from "../../../../packages/shared/src/rr-protocol.ts";
import type { RRTap } from "../../../../packages/reflex-race/src/engine.ts";
import type { Ack } from "../../../../packages/shared/src/protocol.ts";

const tokenKey = (code: string) => "rr-seat-" + code;
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
      /* 隐私模式：刷新后需要重新加入 */
    }
  },
};
export const savedName = () =>
  store.get("rr-name") ?? store.get("cn-name") ?? store.get("ma-name") ?? "";

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

export const createRRRoom = () => call<{ code: string }>(RR_EVENTS.create, {});

/** 加入房间并持续接收更新；断线重连后自动带凭证回到原座位 */
export function useRRRoom(code: string) {
  const [snap, setSnap] = useState<RRRoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  /**
   * 服务器时间 − 本机时间。用往返时间的一半校正，取往返最短的一次测量，
   * 这样每台手机都在同一时刻显示新图。
   */
  const offset = useRef(0);
  const bestRtt = useRef(Infinity);
  const latest = useRef<RRRoomSnapshot | null>(null);
  useEffect(() => {
    const s = socket();
    /** 测一次往返：offset = 服务器时间 − 本机在往返中点的时间；保留往返最短的那次 */
    const ping = async () => {
      const t0 = Date.now();
      const res = await call<{ now: number }>(RR_EVENTS.ping, {});
      const t1 = Date.now();
      if (!res.ok || typeof (res as { now?: number }).now !== "number") return;
      const rtt = t1 - t0;
      if (rtt <= bestRtt.current + 30) {
        bestRtt.current = Math.min(bestRtt.current, rtt);
        offset.current = (res as { now: number }).now - (t0 + t1) / 2;
      }
    };
    const join = async () => {
      const res = await call<{ snapshot: RRRoomSnapshot }>(RR_EVENTS.join, {
        code,
        token: store.get(tokenKey(code)),
      });
      if (!res.ok) return setError(res.error);
      setError("");
      accept(res.snapshot);
      for (let i = 0; i < 4; i++) await ping();
    };
    const accept = (v: RRRoomSnapshot) => {
      const cur = latest.current;
      if (
        cur &&
        v.round === cur.round &&
        v.stage === cur.stage &&
        v.version < cur.version
      )
        return;
      latest.current = v;
      setSnap(v);
    };
    const onUpdate = (v: RRRoomSnapshot) => {
      if (v.code === code) accept(v);
    };
    const onConnect = () => {
      setConnected(true);
      bestRtt.current = Infinity;
      void join();
    };
    const onDisconnect = () => setConnected(false);
    s.on(RR_EVENTS.update, onUpdate);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) onConnect();
    // 每 15 秒再校准一次时钟
    const timer = setInterval(() => s.connected && void ping(), 15_000);
    return () => {
      clearInterval(timer);
      s.off(RR_EVENTS.update, onUpdate);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [code]);

  async function claim(name: string) {
    const res = await call<{ token: string }>(RR_EVENTS.claim, { code, name });
    if (!res.ok) return res.error;
    store.set(tokenKey(code), res.token);
    store.set("rr-name", name);
    const again = await call<{ snapshot: RRRoomSnapshot }>(RR_EVENTS.join, {
      code,
      token: res.token,
    });
    if (again.ok) {
      latest.current = again.snapshot;
      setSnap(again.snapshot);
    }
    return null;
  }
  async function lobby(action: RRLobbyAction) {
    const token = store.get(tokenKey(code));
    if (!token) return "请先加入房间";
    const res = await call(RR_EVENTS.lobby, { code, token, action });
    return res.ok ? null : res.error;
  }
  async function tap(command: RRClientCommand, cardNo: number) {
    const token = store.get(tokenKey(code));
    if (!token) return { error: "请先加入房间", tap: null };
    const res = await call<{ tap: RRTap | null }>(RR_EVENTS.command, {
      code,
      token,
      command: { ...command, cardNo },
    });
    return res.ok
      ? { error: null, tap: res.tap }
      : { error: res.error, tap: null };
  }
  const now = () => Date.now() + offset.current;
  return { snap, error, connected, now, claim, lobby, tap };
}
