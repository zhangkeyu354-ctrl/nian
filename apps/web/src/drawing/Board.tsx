import React, { useEffect, useRef, useState } from "react";
import {
  emptyDrawing,
  COLORS,
  type Drawing,
  type Chunk,
  type Point,
  type Stroke,
} from "../../../../packages/drawing-party/src/index.ts";
import { PaintBrush } from "./StudioArt.tsx";
import { drawingId } from "./id.ts";
import { paint, downloadDrawing } from "./render.ts";
import { readDraft, saveDraft } from "./drafts.ts";
interface Props {
  drawing: Drawing;
  docKey: string;
  canDraw: boolean;
  connected: boolean;
  single?: boolean;
  strokeId?: string;
  color?: number;
  send?: (c: Chunk) => Promise<void>;
  edit?: (kind: string, revision: number) => Promise<void>;
  onBusy?: (busy: boolean) => void;
  onFocus?: () => void;
  focused?: boolean;
}
export function Board(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    model = useRef<Drawing>(structuredClone(p.drawing)),
    pending = useRef<Chunk[]>([]),
    active = useRef<{
      pointer: number;
      stroke: Stroke;
      sent: number;
      seq: number;
      start: number;
    } | null>(null),
    props = useRef(p),
    alive = useRef(true),
    sending = useRef(false),
    ready = useRef(false),
    storage = useRef(Promise.resolve());
  props.current = p;
  const [status, setStatus] = useState("正在读取画布"),
    [color, setColor] = useState(p.color ?? 0),
    [width, setWidth] = useState(8),
    [replay, setReplay] = useState(false),
    [focus, setFocus] = useState(false),
    [toolsOpen, setToolsOpen] = useState(false),
    [brush, setBrush] = useState({ x: 0, y: 0, color: 0, visible: false });
  const redraw = () => {
    if (canvas.current) paint(canvas.current, model.current);
  };
  const busy = () =>
    props.current.onBusy?.(!!active.current || pending.current.length > 0);
  function persist() {
    const copy = {
      drawing: structuredClone(model.current),
      pending: structuredClone(pending.current),
    };
    storage.current = storage.current
      .catch(() => {})
      .then(() => saveDraft(p.docKey, copy))
      .catch(() => {
        if (alive.current) setStatus("本机保存失败，请保持页面开启");
      });
  }
  async function flush() {
    if (
      sending.current ||
      !ready.current ||
      !props.current.connected ||
      !props.current.send
    )
      return;
    sending.current = true;
    try {
      while (
        alive.current &&
        pending.current.length &&
        props.current.connected
      ) {
        const c = pending.current[0];
        await props.current.send(c);
        pending.current.shift();
        persist();
        if (alive.current)
          setStatus(
            pending.current.length ? "正在同步…" : "服务器已收到并存档",
          );
      }
    } catch (e) {
      if (alive.current)
        setStatus(e instanceof Error ? e.message : "暂未同步，正在重试");
    } finally {
      sending.current = false;
      if (alive.current) busy();
    }
  }
  function packet(end: boolean) {
    const a = active.current;
    if (!a) return;
    const pts = a.stroke.points.slice(a.sent);
    if (!pts.length && !end) return;
    const chunk: Chunk = {
      id: a.stroke.id,
      seq: a.seq++,
      points: structuredClone(pts),
      color: a.stroke.color,
      width: a.stroke.width,
      end,
    };
    a.stroke.chunks.push({ from: a.sent, count: pts.length, end });
    a.sent = a.stroke.points.length;
    a.stroke.closed = end;
    model.current.revision++;
    pending.current.push(chunk);
    persist();
    setStatus("草稿保存在本机，正在同步");
    busy();
    void flush();
  }
  const finish = () => {
    if (active.current) {
      packet(true);
      active.current = null;
      setBrush((b) => ({ ...b, visible: false }));
      busy();
    }
  };
  useEffect(() => {
    alive.current = true;
    ready.current = false;
    void readDraft(p.docKey)
      .then((d) => {
        if (!alive.current) return;
        if (
          d &&
          (d.pending.length || d.drawing.revision >= model.current.revision)
        ) {
          model.current = d.drawing;
          pending.current = d.pending;
          for (const s of model.current.strokes)
            if (!s.closed) {
              const seq = s.chunks.length;
              const from = s.chunks.at(-1);
              const sent = from ? from.from + from.count : 0;
              pending.current.push({
                id: s.id,
                seq,
                points: s.points.slice(sent),
                color: s.color,
                width: s.width,
                end: true,
              });
              s.closed = true;
              s.chunks.push({
                from: sent,
                count: s.points.length - sent,
                end: true,
              });
              model.current.revision++;
            }
        }
        setStatus(
          pending.current.length ? "恢复本机草稿，正在补传" : "画布已就绪",
        );
      })
      .catch(() => {
        if (alive.current) setStatus("本机存储不可用，请勿关闭页面");
      })
      .finally(() => {
        if (alive.current) {
          ready.current = true;
          redraw();
          busy();
          void flush();
        }
      });
    const obs = new ResizeObserver(() => {
      const c = canvas.current;
      if (!c) return;
      const r = c.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      redraw();
    });
    if (canvas.current) obs.observe(canvas.current);
    const timer = setInterval(() => {
      packet(false);
      void flush();
    }, 200);
    const hide = () => finish();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    return () => {
      finish();
      alive.current = false;
      ready.current = false;
      obs.disconnect();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", hide);
    };
  }, [p.docKey]);
  useEffect(() => {
    if (!active.current && !pending.current.length) {
      model.current = structuredClone(p.drawing);
      redraw();
    }
    if (!active.current) {
      const last = p.drawing.strokes.at(-1),
        pt = last?.points.at(-1);
      if (pt)
        setBrush({
          x: pt[0] / 10.24,
          y: pt[1] / 10.24,
          color: last!.color,
          visible: !last!.closed,
        });
    }
  }, [p.drawing]);
  useEffect(() => {
    if (!p.canDraw) finish();
    void flush();
  }, [p.connected, p.canDraw]);
  useEffect(() => {
    if (!replay) return;
    const count = model.current.strokes.reduce(
        (n, s) => n + s.points.length,
        0,
      ),
      start = performance.now();
    let raf = 0;
    const frame = () => {
      if (!canvas.current) return;
      const t = Math.min(1, (performance.now() - start) / 3000);
      paint(canvas.current, model.current, Math.ceil(count * t));
      if (t < 1) raf = requestAnimationFrame(frame);
      else setReplay(false);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [replay]);
  const point = (
    e: { clientX: number; clientY: number },
    elapsed: number,
  ): Point => {
    const r = canvas.current!.getBoundingClientRect();
    return [
      Math.round(
        Math.max(0, Math.min(1024, ((e.clientX - r.left) * 1024) / r.width)),
      ),
      Math.round(
        Math.max(0, Math.min(1024, ((e.clientY - r.top) * 1024) / r.height)),
      ),
      Math.min(180000, Math.max(0, Math.round(elapsed))),
    ];
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      !ready.current ||
      !props.current.canDraw ||
      active.current ||
      replay ||
      e.button !== 0
    )
      return;
    const stroke: Stroke = {
      id: p.strokeId ?? drawingId(),
      color: p.color ?? color,
      width: p.single ? 8 : width,
      points: [point(e, 0)],
      closed: false,
      chunks: [],
    };
    if (model.current.strokes.length >= 150) return;
    model.current.strokes.push(stroke);
    active.current = {
      pointer: e.pointerId,
      stroke,
      sent: 0,
      seq: 0,
      start: performance.now(),
    };
    setBrush({
      x: stroke.points[0][0] / 10.24,
      y: stroke.points[0][1] / 10.24,
      color: stroke.color,
      visible: true,
    });
    e.currentTarget.setPointerCapture(e.pointerId);
    redraw();
    busy();
    persist();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.pointer !== e.pointerId) return;
    const last = a.stroke.points.at(-1)!;
    const t = performance.now() - a.start;
    if (t - last[2] < 16) return;
    const pt = point(e, t);
    if (a.stroke.points.length >= 1800 && p.single) return;
    if (model.current.strokes.reduce((n, s) => n + s.points.length, 0) >= 12000)
      return;
    if (pt[0] === last[0] && pt[1] === last[1]) return;
    a.stroke.points.push(pt);
    setBrush({
      x: pt[0] / 10.24,
      y: pt[1] / 10.24,
      color: a.stroke.color,
      visible: true,
    });
    redraw();
  };
  const edit = async (kind: string) => {
    if (active.current || pending.current.length || !p.edit) return;
    if (kind === "clear" && !confirm("清空这张画？")) return;
    try {
      await p.edit(kind, model.current.revision);
      setStatus("画作已更新");
    } catch (e) {
      setStatus(String(e));
    }
  };
  return (
    <section className={"dp-board " + (focus ? "dp-focus" : "")}>
      <div className="dp-paper">
        <canvas
          ref={canvas}
          aria-label={p.canDraw ? "绘画画布" : "作品画布"}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={(e) => {
            if (active.current?.pointer === e.pointerId) finish();
          }}
          onPointerCancel={(e) => {
            if (active.current?.pointer === e.pointerId) finish();
          }}
          onLostPointerCapture={finish}
        />
        <div
          className={"st-brush-cursor " + (!p.canDraw ? "is-remote" : "")}
          aria-hidden="true"
          style={{
            left: brush.x + "%",
            top: brush.y + "%",
            opacity: brush.visible ? 1 : 0,
          }}
        >
          <PaintBrush cursor index={brush.color} />
        </div>
        {!p.canDraw && <span className="dp-readonly">观看作品</span>}
      </div>
      {p.canDraw && !p.single && toolsOpen && (
        <div className="dp-tools">
          <div className="dp-palette">
            {COLORS.map((c, i) => (
              <button
                key={c}
                aria-label={"颜色" + (i + 1)}
                aria-pressed={color === i}
                style={{ background: c }}
                onClick={() => {
                  setColor(i);
                  setToolsOpen(false);
                }}
              />
            ))}
          </div>
          <div className="dp-pen">
            {[4, 8, 16, 28].map((w) => (
              <button
                key={w}
                aria-label={"粗细" + w}
                aria-pressed={width === w}
                onClick={() => setWidth(w)}
              >
                <i
                  style={{
                    width: Math.max(3, w / 2),
                    height: Math.max(3, w / 2),
                  }}
                />
              </button>
            ))}
            <button onClick={() => void edit("undo")}>撤销</button>
            <button onClick={() => void edit("clear")}>清空</button>
          </div>
        </div>
      )}
      <div className="dp-board-footer">
        {p.canDraw && !p.single && (
          <button
            className="st-tool-toggle"
            aria-label="画笔工具"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen(!toolsOpen)}
          >
            画笔 ▾
          </button>
        )}
        <span role="status">{p.canDraw ? status : "只读画作"}</span>
        <button
          className="st-local-focus"
          onClick={() => (p.onFocus ? p.onFocus() : setFocus(!focus))}
        >
          {(p.onFocus ? p.focused : focus) ? "退出专注" : "专注"}
        </button>
        {!p.canDraw && (
          <>
            <button onClick={() => setReplay(true)}>逐笔回放</button>
            <button onClick={() => downloadDrawing(model.current)}>
              保存图
            </button>
          </>
        )}
      </div>
    </section>
  );
}
