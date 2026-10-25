import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  appendChunk,
  emptyDrawing,
  gameScope,
  COLORS,
  type Mode,
  type GameView,
  type Chunk,
  type Drawing,
} from "../../../../packages/drawing-party/src/index.ts";
import { Studio } from "./Studio.tsx";
import { Board } from "./Board.tsx";
import { drawingId } from "./id.ts";
import { paint } from "./render.ts";
import { feel } from "./feel.ts";
import { Portrait } from "./StudioArt.tsx";
import { FakeArtistCover, TelephoneCover } from "./Covers.tsx";
import "./studio.css";
import "./drawing-party.css";
interface Snapshot {
  code: string;
  mode: Mode;
  count: number;
  host: string;
  me: string | null;
  players: { id: string; name: string; ready: boolean; connected: boolean }[];
  view: GameView | null;
  serverNow: number;
  ephemeral: boolean;
}
const op = drawingId;
const phaseNames: Record<string, string> = {
  PROMPT: "写下初始题目",
  TASK: "传情画意",
  DRAW: "共同创作",
  DISCUSS: "讨论时间",
  VOTE: "找出伪画家",
  OBSERVE: "最后一次观察",
  GUESS: "猜出这幅画",
  REVEAL: "揭晓时刻",
  RESULT: "本局结束",
};
export function DrawingParty({ mode }: { mode: Mode }) {
  const socket = useMemo(() => io({ autoConnect: false }), []),
    [snap, setSnap] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("room") ?? "",
    ),
    [name, setName] = useState(localStorage.getItem("dp-name") ?? ""),
    [count, setCount] = useState(3),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [inkBusy, setInkBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [secret, setSecret] = useState(false),
    [rules, setRules] = useState(false),
    [vote, setVote] = useState(""),
    [hideWord, setHideWord] = useState(false);
  const state = useRef({ snap, code });
  state.current = { snap, code };
  const title = mode === "tp" ? "传情画意" : "纽约伪画家",
    token = () => localStorage.getItem("dp-token-" + state.current.code) ?? "";
  const request = (event: string, payload: object) =>
    new Promise<any>((resolve, reject) => {
      socket.timeout(8000).emit(event, payload, (err: any, res: any) => {
        if (err) return reject(Error("连接暂未确认，请重试"));
        if (!res?.ok) return reject(Error(res?.error ?? "操作失败"));
        resolve(res);
      });
    });
  async function join(next: string) {
    const r = await request("dp:join", {
      code: next,
      token: localStorage.getItem("dp-token-" + next) ?? "",
    });
    if (r.snapshot.mode !== mode) {
      location.replace("/?game=" + r.snapshot.mode + "&room=" + next);
      return;
    }
    setSnap(r.snapshot);
    setError("");
  }
  useEffect(() => {
    document.title = title + " · 绘画派对";
    const onConnect = () => {
      setConnected(true);
      if (state.current.code)
        void join(state.current.code).catch((e) => setError(e.message));
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", () => setConnected(false));
    socket.on("dp:update", (s: Snapshot) => {
      if (s.mode !== mode) return;
      setSnap(s);
      setError("");
    });
    socket.on("dp:ink", (e: any) =>
      setSnap((old) => {
        if (!old?.view || old.view.id !== e.game) return old;
        const id = old.view.mode === "fa" ? "shared" : old.view.task?.id;
        if (id !== e.doc) return old;
        const d = old.view.drawing ?? emptyDrawing(old.view.paperAspect);
        if (e.revision <= d.revision) return old;
        if (e.revision !== d.revision + 1) {
          void join(old.code).catch(() => {});
          return old;
        }
        try {
          const drawing = structuredClone(d);
          appendChunk(drawing, e.chunk);
          return { ...old, view: { ...old.view, drawing } };
        } catch {
          void join(old.code).catch(() => {});
          return old;
        }
      }),
    );
    socket.connect();
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      socket.off();
      socket.disconnect();
      clearInterval(timer);
    };
  }, []);
  const v = snap?.view,
    scope = v ? gameScope(v) : "lobby",
    host = !!snap?.me && snap.host === snap.me,
    my = snap?.players.find((p) => p.id === snap.me),
    canAct = connected && !busy;
  useEffect(() => {
    setInput("");
    setVote("");
    setSecret(false);
    setInkBusy(false);
  }, [v?.id, v?.phase, v?.step, v?.turn]);
  useEffect(() => {
    (window as any).render_game_to_text = () =>
      JSON.stringify({
        game: mode,
        code: state.current.code,
        connected,
        me: snap?.me,
        phase: v?.phase,
        view: v,
        coordinateSystem: `1024×1024 normalized; paper aspect ${v?.paperAspect ?? 2}; origin top-left; x right y down`,
      });
    return () => {
      delete (window as any).render_game_to_text;
    };
  }, [snap, connected]);
  const submit = async (action: object) => {
    if (!snap) return;
    setBusy(true);
    try {
      const r = await request("dp:action", {
        code,
        token: token(),
        op: op(),
        scope,
        action,
      });
      setSnap(r.snapshot);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const go = async (next: string) => {
    state.current.code = next;
    setCode(next);
    history.replaceState(null, "", "/?game=" + mode + "&room=" + next);
    await join(next);
  };
  const create = async () => {
    setBusy(true);
    try {
      const r = await request("dp:create", { mode, count });
      await go(r.code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const claim = async () => {
    setBusy(true);
    try {
      const r = await request("dp:claim", { code, name });
      localStorage.setItem("dp-token-" + code, r.token);
      localStorage.setItem("dp-name", name);
      setSnap(r.snapshot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const invite = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setError("邀请链接已复制");
    } catch {
      setError("请复制地址栏链接，或分享房间号 " + code);
    }
  };
  const send = async (chunk: Chunk) => {
    await request("dp:stroke", { code, token: token(), scope, chunk });
  };
  const edit = async (kind: string, revision: number) => {
    const r = await request("dp:edit", {
      code,
      token: token(),
      scope,
      kind,
      revision,
    });
    setSnap(r.snapshot);
  };
  const textForm = (label: string) => (
    <form
      className="dp-text-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim() && canAct) void submit({ type: "TEXT", text: input });
      }}
    >
      <label>
        {label}
        <textarea
          aria-label={label}
          maxLength={80}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            v?.phase === "PROMPT"
              ? "例如：戴着墨镜吃西瓜的企鹅"
              : "看起来像什么？大胆写下来"
          }
        />
      </label>
      <span>{Array.from(input).length}/40</span>
      <button
        className="dp-primary"
        disabled={!canAct || !input.trim() || Array.from(input).length > 40}
      >
        写好了 →
      </button>
    </form>
  );
  const display = (d: Drawing | undefined, key: string) => (
    <Board
      drawing={d ?? emptyDrawing()}
      docKey={key}
      canDraw={false}
      connected={connected}
    />
  );
  const drawBoard = (single = false) => (
    <Board
      key={v!.id + ":" + (v!.task?.id ?? v!.turn)}
      drawing={v!.drawing ?? emptyDrawing()}
      docKey={v!.id + ":" + (v!.task?.id ?? v!.turn) + ":" + snap!.me}
      canDraw={
        !v!.submitted &&
        (!single || v!.currentId === snap!.me) &&
        (!single || connected)
      }
      connected={connected}
      single={single}
      color={
        single ? v!.players.findIndex((p) => p.id === snap!.me) : undefined
      }
      strokeId={single ? v!.id + "-turn-" + v!.turn : undefined}
      send={send}
      edit={single ? undefined : edit}
      onBusy={setInkBusy}
    />
  );
  const offset = useRef(0);
  useEffect(() => {
    if (snap) offset.current = snap.serverNow - Date.now();
  }, [snap?.serverNow]);
  const seconds = v?.deadline
    ? Math.min(
        v.phase === "TASK"
          ? v.step % 2
            ? 90
            : 40
          : v.phase === "PROMPT"
            ? 60
            : v.phase === "DISCUSS"
              ? 90
              : v.phase === "OBSERVE"
                ? 15
                : 30,
        Math.max(0, Math.ceil((v.deadline - (now + offset.current)) / 1000)),
      )
    : 0;
  if (v && snap)
    return (
      <Studio
        mode={mode}
        v={v}
        me={snap.me}
        host={host}
        connected={connected}
        busy={busy}
        inkBusy={inkBusy}
        seconds={seconds}
        total={
          v.phase === "TASK"
            ? v.step % 2
              ? 90
              : 40
            : v.phase === "PROMPT"
              ? 60
              : v.phase === "DISCUSS"
                ? 90
                : v.phase === "OBSERVE"
                  ? 15
                  : 30
        }
        code={code}
        error={error}
        input={input}
        setInput={setInput}
        submit={submit}
        send={send}
        edit={edit}
        onBusy={setInkBusy}
        invite={() => void invite()}
        exportAlbum={exportAlbum}
        clearError={() => setError("")}
        takeHost={
          !snap.players.find((p) => p.id === snap.host)?.connected
            ? () => void submit({ type: "TAKE_HOST" })
            : undefined
        }
      />
    );
  const seats = snap
    ? Array.from({ length: snap.count }, (_, i) => snap.players[i])
    : [];
  return (
    <main className={"lb-world lb-" + mode}>
      <div className="st-backdrop" aria-hidden="true">
        <i className="st-light" />
        <i className="st-texture" />
        <i className="st-vignette" />
      </div>
      <header className="lb-top">
        <a className="lb-back" href="/" onClick={() => feel("tap")}>
          ‹ 合集
        </a>
        <span className="lb-series">绘画派对</span>
        <button
          className="lb-rules-btn"
          aria-expanded={rules}
          onClick={() => {
            feel("tap");
            setRules(!rules);
          }}
        >
          怎么玩
        </button>
      </header>
      {rules && (
        <div className="lb-sheet-backdrop" onClick={() => setRules(false)}>
          <aside className="lb-rules" onClick={(e) => e.stopPropagation()}>
            <h2>{title} · 怎么玩</h2>
            <ol>
              {(mode === "tp"
                ? [
                    "每人先写一句题目。",
                    "拿到别人的题目，把它画出来。",
                    "再拿到别人的画，猜它画的是什么。",
                    "画、猜交替传下去，每人只看得到上一页。",
                    "最后一起翻开所有传话本，看看跑偏了多远。",
                  ]
                : [
                    "大家先投票选主题，系统出题。",
                    "只有一个人不知道题目——他是伪画家。",
                    "每人轮流在同一张纸上画一笔，共两圈。",
                    "讨论后投票，找出伪画家。",
                    "伪画家没被抓到就赢；被抓到还能猜题翻盘。",
                  ]
              ).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p>
              {mode === "fa"
                ? "抬起手指即结束这一笔，不能撤销。建议先和朋友开语音。3–10 人线上自动主持改编。"
                : "提前提交后不能修改，等大家都好或到时一起传下一页。3 人是短链改编。"}
            </p>
            <button
              className="st-btn st-primary"
              onClick={() => setRules(false)}
            >
              知道了
            </button>
          </aside>
        </div>
      )}
      {error && (
        <div className="st-toast" role="status">
          {error}
          <button aria-label="关闭提示" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {!connected && (
        <p className="lb-offline" role="status">
          连接中断，正在恢复原座位…
        </p>
      )}
      <div className="lb-body">
        <div className="lb-cover">
          {mode === "fa" ? <FakeArtistCover /> : <TelephoneCover />}
        </div>
        <section
          className="lb-card"
          key={!snap ? "entry" : !snap.me ? "claim" : "room"}
        >
          {!snap ? (
            <>
              <p className="lb-eyebrow">
                {mode === "tp" ? "画一句 · 猜一画" : "同一张画 · 一位伪画家"}
              </p>
              <h1>{title}</h1>
              <p className="lb-lead">3–10 位朋友，各拿一部手机，就能开始。</p>
              <div className="lb-field">
                <span>这次几个人</span>
                <div className="lb-seg" role="group" aria-label="游戏人数">
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      aria-pressed={count === n}
                      onClick={() => {
                        feel("tap");
                        setCount(n);
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="st-btn st-primary lb-main"
                disabled={!canAct}
                onClick={() => {
                  feel("submit");
                  void create();
                }}
              >
                创建房间 →
              </button>
              <div className="lb-or">
                <span>或加入朋友的房间</span>
              </div>
              <form
                className="lb-join"
                onSubmit={(e) => {
                  e.preventDefault();
                  feel("tap");
                  void go(code.trim().toUpperCase()).catch((e) =>
                    setError(e.message),
                  );
                }}
              >
                <input
                  aria-label="房间号"
                  placeholder="输入房间号"
                  maxLength={6}
                  inputMode="text"
                  autoCapitalize="characters"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <button
                  className="st-btn st-ghost"
                  disabled={!canAct || !code.trim()}
                >
                  加入
                </button>
              </form>
            </>
          ) : !snap.me ? (
            <>
              <p className="lb-eyebrow">
                房间 {code} · {snap.players.length}/{snap.count}人
              </p>
              <h1>{title}</h1>
              <p className="lb-lead">起个名字，朋友们会在画室里看到它。</p>
              <form
                className="lb-claim"
                onSubmit={(e) => {
                  e.preventDefault();
                  feel("submit");
                  void claim();
                }}
              >
                <label className="lb-field">
                  <span>你的昵称</span>
                  <input
                    autoComplete="nickname"
                    aria-label="你的昵称"
                    maxLength={12}
                    placeholder="最多 12 个字"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button
                  className="st-btn st-primary lb-main"
                  disabled={!canAct || !name.trim()}
                >
                  加入这局 →
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="lb-room-head">
                <div>
                  <p className="lb-eyebrow">邀请朋友一起玩</p>
                  <h1>{title}</h1>
                </div>
                <button
                  className="lb-code"
                  onClick={() => {
                    feel("tap");
                    void invite();
                  }}
                >
                  <small>房间号</small>
                  <strong>{code}</strong>
                  <span>复制邀请</span>
                </button>
              </div>
              <ul className="lb-seats">
                {seats.map((p, i) => (
                  <li
                    key={p?.id ?? "empty" + i}
                    className={
                      !p
                        ? "is-empty"
                        : (p.ready ? "is-ready " : "") +
                          (p.connected ? "" : "is-off ") +
                          (p.id === snap.me ? "is-me" : "")
                    }
                    style={
                      {
                        "--seat": COLORS[i % COLORS.length],
                      } as React.CSSProperties
                    }
                  >
                    {p ? (
                      <>
                        <span className="lb-face">
                          <Portrait index={i} />
                        </span>
                        <b>
                          {p.name}
                          {p.id === snap.me ? "（我）" : ""}
                          {p.id === snap.host && <em>房主</em>}
                        </b>
                        <span className="lb-state">
                          {p.connected
                            ? p.ready
                              ? "已准备"
                              : "等待准备"
                            : "离线"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="lb-face is-empty">{i + 1}</span>
                        <b>等待加入…</b>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {host && (
                <div className="lb-field is-inline">
                  <span>人数</span>
                  <div
                    className="lb-seg is-small"
                    role="group"
                    aria-label="房间人数"
                  >
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        aria-pressed={snap.count === n}
                        disabled={n < snap.players.length || !canAct}
                        onClick={() => {
                          feel("tap");
                          void submit({ type: "COUNT", count: n });
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="lb-room-actions">
                <button
                  className={
                    "st-btn " + (my?.ready ? "st-ghost" : "st-primary")
                  }
                  disabled={!canAct}
                  onClick={() => {
                    feel(my?.ready ? "tap" : "select");
                    void submit({ type: "READY" });
                  }}
                >
                  {my?.ready ? "取消准备" : "我准备好了"}
                </button>
                {host ? (
                  <button
                    className="st-btn st-gold"
                    disabled={
                      !canAct ||
                      snap.players.length !== snap.count ||
                      snap.players.some((p) => !p.ready)
                    }
                    onClick={() => {
                      feel("turn");
                      void submit({ type: "START" });
                    }}
                  >
                    开始游戏 →
                  </button>
                ) : (
                  <p className="lb-hint">人齐并准备后，由房主开始。</p>
                )}
              </div>
              {host &&
                (snap.players.length !== snap.count ||
                  snap.players.some((p) => !p.ready)) && (
                  <p className="lb-hint">
                    {snap.players.length !== snap.count
                      ? `还差 ${snap.count - snap.players.length} 人入座`
                      : "等所有人点「我准备好了」"}
                  </p>
                )}
              <div className="lb-room-foot">
                <button
                  className="lb-link"
                  onClick={() =>
                    void submit({ type: "LEAVE" }).then(() => {
                      localStorage.removeItem("dp-token-" + code);
                      void join(code);
                    })
                  }
                >
                  离开座位
                </button>
                {snap.me &&
                  !snap.players.find((p) => p.id === snap.host)?.connected && (
                    <button
                      className="lb-link"
                      onClick={() => void submit({ type: "TAKE_HOST" })}
                    >
                      房主离线 · 接任房主
                    </button>
                  )}
              </div>
            </>
          )}
          <footer className="lb-footnote">
            {snap?.ephemeral
              ? "云端为临时存储：部署或服务重启可能清除对局，请及时下载作品。"
              : "3–10 人 · 建议同时开启语音 · 作品可自行下载"}
          </footer>
        </section>
      </div>
    </main>
  );
}
function exportAlbum(a: { owner: { name: string }; entries: any[] }) {
  const c = document.createElement("canvas");
  c.width = 1000;
  c.height =
    120 +
    a.entries.reduce(
      (n, e) =>
        n +
        (e.kind === "drawing"
          ? Math.round(860 / (e.drawing?.aspect ?? 2)) + 90
          : 180),
      0,
    );
  const g = c.getContext("2d")!;
  g.fillStyle = "#f8f5ef";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#272336";
  g.font = "bold 36px sans-serif";
  g.fillText(a.owner.name + "的传话本", 40, 65);
  let y = 120;
  for (const [i, e] of a.entries.entries()) {
    g.fillStyle = "#675c7c";
    g.font = "22px sans-serif";
    g.fillText(i === 0 ? "初始题目" : "第" + i + "步", 40, y + 30);
    if (e.kind === "drawing") {
      const p = document.createElement("canvas");
      p.width = 860;
      p.height = Math.round(p.width / (e.drawing?.aspect ?? 2));
      paint(p, e.drawing ?? emptyDrawing());
      g.drawImage(p, 70, y + 50);
      y += p.height + 90;
    } else {
      g.fillStyle = "#272336";
      g.font = "bold 30px sans-serif";
      const text = String(e.text ?? "");
      for (let j = 0; j < text.length; j += 24)
        g.fillText(text.slice(j, j + 24), 40, y + 85 + (j / 24) * 42);
      y += 180;
    }
  }
  c.toBlob((blob) => {
    if (!blob) return;
    const u = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = u;
    link.download = "传话本.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  });
}
