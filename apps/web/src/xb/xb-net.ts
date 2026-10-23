import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  enqueueEffects,
  ackEffects,
  type EffectBatch,
} from "./effect-queue.ts";
import {
  XB_EVENTS as E,
  type XBSnapshot,
  type XBEffect,
} from "../../../../packages/shared/src/xb-protocol.ts";
interface Reply {
  ok: boolean;
  error?: string;
  code?: string;
  token?: string;
  snapshot?: XBSnapshot;
}
export function useXB(code: string) {
  const [snapshot, setSnapshot] = useState<XBSnapshot | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [batches, setBatches] = useState<EffectBatch[]>([]);
  const effectSerial = useRef(0);
  const socket = useRef<Socket | null>(null),
    pending = useRef(false);
  const send = (event: string, data: object): Promise<Reply> =>
    new Promise((resolve, reject) => {
      const s = socket.current;
      if (!s?.connected) {
        reject(Error("连接已断开，输入已保留，正在重连"));
        return;
      }
      s.timeout(8000).emit(event, data, (err: Error | null, r: Reply) =>
        err
          ? reject(Error("服务器暂未回应，请重连后确认结果"))
          : r?.ok
            ? resolve(r)
            : reject(Error(r?.error ?? "操作未成功，请重试")),
      );
    });
  useEffect(() => {
    const s = io({ reconnection: true });
    socket.current = s;
    const key = "xb-token:" + code;
    const update = (v: XBSnapshot) =>
      setSnapshot((old) => (old && old.version > v.version ? old : v));
    s.on("connect", () => {
      const token = localStorage.getItem(key);
      setError("");
      if (code && token) {
        send(E.join, { code, token })
          .then((r) => {
            if (r.snapshot) update(r.snapshot);
            setConnected(true);
          })
          .catch((e) => {
            setError(e.message);
            setConnected(false);
          });
      } else setConnected(true);
    });
    s.on("disconnect", () => setConnected(false));
    s.on(E.update, update);
    s.on(E.effects, (items: XBEffect[]) => {
      const id = ++effectSerial.current;
      setBatches((old) => enqueueEffects(old, id, items));
    });
    s.on(E.fun, (funHits: Record<string, number>) =>
      setSnapshot((old) => (old ? { ...old, funHits } : old)),
    );
    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, [code]);
  async function run(event: string, data: object) {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await send(event, data);
      if (r.snapshot) setSnapshot(r.snapshot);
      if (r.token) localStorage.setItem("xb-token:" + code, r.token);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const consumeEffects = (through: number) =>
    setBatches((old) => ackEffects(old, through));
  return {
    snapshot,
    connected,
    error,
    busy,
    batches,
    consumeEffects,
    run,
    setError,
  };
}
