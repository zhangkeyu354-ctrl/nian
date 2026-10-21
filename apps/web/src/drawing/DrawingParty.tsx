import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  appendChunk,
  emptyDrawing,
  COLORS,
  type Mode,
  type GameView,
  type Chunk,
  type Drawing,
} from "../../../../packages/drawing-party/src/index.ts";
import { Board } from "./Board.tsx";
import { drawingId } from "./id.ts";
import { paint } from "./render.ts";
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
        const d = old.view.drawing ?? emptyDrawing();
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
    scope = v ? [v.id, v.phase, v.step, v.turn].join(":") : "lobby",
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
        coordinateSystem: "1024×1024; origin top-left; x right y down",
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
    ? Math.max(0, Math.ceil((v.deadline - (now + offset.current)) / 1000))
    : 0;
  return (
    <main className={"dp-app dp-" + mode}>
      <header className="dp-top">
        <a href="/">‹ 合集</a>
        <span className="dp-series">绘画派对</span>
        <button onClick={() => setRules(!rules)}>怎么玩</button>
      </header>
      {rules && (
        <aside className="dp-rules">
          <button onClick={() => setRules(false)}>关闭 ×</button>
          <h2>{title}</h2>
          <p>
            {mode === "tp"
              ? "每人写题，画画与猜词交替，只看上一页。最后一起翻开所有传话链，看看跑偏了多远。3人是短链改编。"
              : "系统出题，只有一位不知道答案。每人轮流画一笔，共两圈，再投票。卧底若未被唯一最高票抓住便获胜；被抓后可猜题翻盘。3–8人线上自动主持改编。"}{" "}
          </p>
          <p>
            {mode === "fa"
              ? "抬起手指即结束这一笔，不能撤销。建议先与朋友开语音。"
              : "提前提交后不能修改，等大家都好或到时一起传下一页。"}
          </p>
        </aside>
      )}
      {error && (
        <div className="dp-notice" role="status">
          {error}
          <button aria-label="关闭提示" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {!connected && (
        <p className="dp-offline" role="status">
          连接中断，正在恢复原座位…
        </p>
      )}
      {!snap ? (
        <section className="dp-entry">
          <div className="dp-entry-mark">{mode === "tp" ? "✎" : "?"}</div>
          <p className="dp-eyebrow">
            {mode === "tp" ? "画一句 · 猜一画" : "同一张画 · 一位伪画家"}
          </p>
          <h1>{title}</h1>
          <p>3–8位朋友，各拿一部手机，就能开始。</p>
          <label>
            这次几个人
            <select
              aria-label="游戏人数"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} 人
                </option>
              ))}
            </select>
          </label>
          <button
            className="dp-primary"
            disabled={!canAct}
            onClick={() => void create()}
          >
            创建房间 →
          </button>
          <form
            className="dp-join"
            onSubmit={(e) => {
              e.preventDefault();
              void go(code.trim().toUpperCase()).catch((e) =>
                setError(e.message),
              );
            }}
          >
            <input
              aria-label="房间号"
              placeholder="输入房间号"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button disabled={!canAct || !code.trim()}>加入</button>
          </form>
        </section>
      ) : !snap.me ? (
        <section className="dp-entry">
          <h1>{title}</h1>
          <p>
            房间 {code} · {snap.players.length}/{snap.count}人
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void claim();
            }}
          >
            <label>
              你的昵称
              <input
                autoComplete="nickname"
                aria-label="你的昵称"
                maxLength={12}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="dp-primary" disabled={!canAct || !name.trim()}>
              加入这局 →
            </button>
          </form>
        </section>
      ) : !v ? (
        <section className="dp-lobby">
          <div className="dp-room-title">
            <div>
              <p className="dp-eyebrow">邀请朋友一起玩</p>
              <h1>{title}</h1>
            </div>
            <button onClick={() => void invite()}>
              <small>房间号</small>
              <strong>{code}</strong>复制邀请
            </button>
          </div>
          <div className="dp-player-list">
            {snap.players.map((p, i) => (
              <div key={p.id}>
                <span className="dp-avatar" style={{ background: COLORS[i] }}>
                  {i + 1}
                </span>
                <b>
                  {p.name}
                  {p.id === snap.me ? "（我）" : ""}
                </b>
                <span>
                  {p.connected ? (p.ready ? "已准备" : "等待准备") : "离线"}
                </span>
              </div>
            ))}
          </div>
          {host && (
            <label>
              人数
              <select
                aria-label="房间人数"
                value={snap.count}
                onChange={(e) =>
                  void submit({ type: "COUNT", count: Number(e.target.value) })
                }
              >
                {[3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} disabled={n < snap.players.length} value={n}>
                    {n}人
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="dp-primary"
            disabled={!canAct}
            onClick={() => void submit({ type: "READY" })}
          >
            {my?.ready ? "取消准备" : "我准备好了"}
          </button>
          {host ? (
            <button
              className="dp-primary dp-start"
              disabled={
                !canAct ||
                snap.players.length !== snap.count ||
                snap.players.some((p) => !p.ready)
              }
              onClick={() => void submit({ type: "START" })}
            >
              开始游戏 →
            </button>
          ) : (
            <p>人齐并准备后，由房主开始。</p>
          )}
          <button
            onClick={() =>
              void submit({ type: "LEAVE" }).then(() => {
                localStorage.removeItem("dp-token-" + code);
                void join(code);
              })
            }
          >
            离开座位
          </button>
        </section>
      ) : (
        <section className="dp-game">
          <div className="dp-phase">
            <div>
              <p className="dp-eyebrow">
                {title}{" "}
                {mode === "tp" && v.phase === "TASK"
                  ? "· 第 " + v.step + "/" + v.steps + " 步"
                  : mode === "fa" && v.phase === "DRAW"
                    ? "· 第 " +
                      (Math.floor(v.turn / v.players.length) + 1) +
                      "/2 圈"
                    : ""}
              </p>
              <h1>{phaseNames[v.phase]}</h1>
            </div>
            {v.deadline > 0 && (
              <span
                className={"dp-clock " + (seconds <= 10 ? "dp-urgent" : "")}
                aria-label={"剩余" + seconds + "秒"}
              >
                {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </span>
            )}
          </div>
          {mode === "tp" && (
            <>
              {v.phase === "PROMPT" &&
                (v.submitted ? (
                  <div className="dp-wait">
                    <h2>题目收好了</h2>
                    <p>
                      {v.completed}/{v.players.length}人已完成，稍后一起传题。
                    </p>
                  </div>
                ) : (
                  textForm("给朋友写个题目")
                ))}
              {v.phase === "TASK" && v.task && (
                <>
                  <p className="dp-instruction">
                    {v.task.kind === "drawing"
                      ? "把这句话画出来"
                      : "这幅画画的是什么？"}
                  </p>
                  {v.task.kind === "drawing" ? (
                    <>
                      <h2 className="dp-prompt">{v.task.source.text}</h2>
                      {drawBoard()}
                      <button
                        className="dp-primary"
                        disabled={!canAct || inkBusy || v.submitted}
                        onClick={() => void submit({ type: "SUBMIT" })}
                      >
                        {v.submitted ? "已提交 · 等待其他人" : "画好了 →"}
                      </button>
                    </>
                  ) : (
                    <>
                      {display(
                        v.task.source.drawing,
                        v.id + ":source:" + v.task.id,
                      )}
                      {!v.submitted && textForm("写下你的猜测")}
                    </>
                  )}
                  <p className="dp-progress">
                    {v.completed}/{v.players.length}人已完成{" "}
                    {inkBusy ? "· 正在保存笔画" : ""}
                  </p>
                </>
              )}
              {(v.phase === "REVEAL" || v.phase === "RESULT") &&
                v.albums?.map((a, i) => (
                  <article className="dp-album" key={a.owner.id}>
                    <h2>
                      <span>{i + 1}</span> {a.owner.name}的传话本
                    </h2>
                    {!a.entries.length ? (
                      <p>还没翻到这一本</p>
                    ) : (
                      a.entries.map((e, j) => (
                        <div className="dp-album-page" key={j}>
                          <p className="dp-eyebrow">
                            {j === 0
                              ? "初始题目"
                              : j % 2
                                ? "第" + Math.ceil(j / 2) + "幅画"
                                : "第" + j / 2 + "次猜测"}{" "}
                            · {v.players.find((p) => p.id === e.author)?.name}
                            {e.missing ? " · 到时封存" : ""}
                          </p>
                          {e.kind === "text" ? (
                            <h3>{e.text}</h3>
                          ) : (
                            display(e.drawing, v.id + ":album:" + i + ":" + j)
                          )}
                        </div>
                      ))
                    )}
                    {a.entries.length === v.steps + 1 && (
                      <button onClick={() => exportAlbum(a)}>
                        保存整条传话链
                      </button>
                    )}
                  </article>
                ))}
              {v.phase === "REVEAL" &&
                (host ? (
                  <button
                    className="dp-primary dp-next"
                    disabled={!canAct}
                    onClick={() => void submit({ type: "NEXT" })}
                  >
                    {v.cursor >= v.players.length * (v.steps + 1) - 1
                      ? "看完了 · 本局结束"
                      : "翻开下一页 →"}
                  </button>
                ) : (
                  <p className="dp-wait">等房主翻开下一页…</p>
                ))}
            </>
          )}
          {mode === "fa" && (
            <>
              <div className="dp-secret">
                <span>类别：{v.category}</span>
                {v.phase === "RESULT" ? (
                  <button onClick={() => setHideWord(!hideWord)}>
                    {hideWord ? "显示题目" : "隐藏题目"}
                  </button>
                ) : v.role === "artist" ? (
                  <button onClick={() => setSecret(!secret)}>
                    {secret ? v.word : "点此查看你的题目"}
                  </button>
                ) : (
                  <b>你是伪画家 · 只知道类别</b>
                )}
              </div>
              {v.phase === "DRAW" && (
                <>
                  <div
                    className="dp-turn"
                    style={{ borderColor: COLORS[v.turn % v.players.length] }}
                  >
                    <b>{v.players.find((p) => p.id === v.currentId)?.name}</b>
                    {v.currentId === snap.me
                      ? "，轮到你画一笔，抬手即提交"
                      : "正在画，仔细观察这一笔"}
                  </div>
                  {drawBoard(true)}
                  {v.currentId === snap.me && (
                    <button
                      disabled={!canAct || inkBusy}
                      onClick={() => void submit({ type: "SUBMIT" })}
                    >
                      本回合跳过
                    </button>
                  )}
                  <div className="dp-turn-order">
                    {v.players.map((p, i) => (
                      <span
                        key={p.id}
                        className={v.currentId === p.id ? "active" : ""}
                        style={{ borderColor: COLORS[i] }}
                      >
                        {i + 1} {p.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {["DISCUSS", "VOTE", "OBSERVE"].includes(v.phase) &&
                display(v.drawing, v.id + ":" + v.phase)}
              {v.phase === "DISCUSS" && (
                <>
                  <p className="dp-instruction">
                    每一笔都是线索。和朋友聊聊，谁在假装知道？
                  </p>
                  {host && (
                    <button
                      className="dp-primary"
                      disabled={!canAct}
                      onClick={() => void submit({ type: "FINISH_DISCUSSION" })}
                    >
                      开始投票 →
                    </button>
                  )}
                </>
              )}
              {v.phase === "VOTE" &&
                (v.myVote ? (
                  <div className="dp-wait">
                    已投票，等待其他人（{v.completed}/{v.players.length}）
                  </div>
                ) : (
                  <>
                    <p>选出你怀疑的人，确认后不能修改。</p>
                    <div className="dp-voters">
                      {v.players
                        .filter((p) => p.id !== snap.me)
                        .map((p) => (
                          <button
                            aria-pressed={vote === p.id}
                            key={p.id}
                            onClick={() => setVote(p.id)}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                    <button
                      className="dp-primary"
                      disabled={!canAct || !vote}
                      onClick={() =>
                        void submit({ type: "VOTE", target: vote })
                      }
                    >
                      确认投票
                    </button>
                  </>
                ))}
              {v.phase === "OBSERVE" &&
                (v.role === "fake" ? (
                  <>
                    <p>你被找到了！记住这幅画，开始选择后画作会隐藏。</p>
                    <button
                      className="dp-primary"
                      disabled={!canAct}
                      onClick={() => void submit({ type: "BEGIN_GUESS" })}
                    >
                      我想好了 · 开始猜题 →
                    </button>
                  </>
                ) : (
                  <p className="dp-wait">卧底正在观察作品，准备最后猜题…</p>
                ))}
              {v.phase === "GUESS" &&
                (v.role === "fake" ? (
                  <>
                    <p className="dp-instruction">
                      这幅画的题目是什么？只能选一次。
                    </p>
                    <div className="dp-options">
                      {v.options?.map((w) => (
                        <button
                          key={w}
                          disabled={!canAct}
                          onClick={() =>
                            void submit({ type: "GUESS", answer: w })
                          }
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="dp-wait">正在等待卧底最后猜题…</p>
                ))}
              {v.phase === "RESULT" && (
                <div className="dp-exhibition">
                  <p className="dp-eyebrow">
                    {v.winner === "fake"
                      ? "伪画家成功蒙混过关"
                      : "真画家识破了伪装"}
                  </p>
                  <h2>{hideWord ? "这幅作品画的是什么？" : v.word}</h2>
                  {display(v.drawing, v.id + ":exhibition")}
                  <p>
                    伪画家是{" "}
                    <b>{v.players.find((p) => p.id === v.fakeId)?.name}</b>
                    {v.guess ? " · 最后猜了：" + v.guess : ""}
                  </p>
                  <div className="dp-vote-result">
                    {v.players.map((p) => (
                      <p key={p.id}>
                        {p.name} →{" "}
                        {v.players.find((t) => t.id === v.votes?.[p.id])
                          ?.name ?? "未投票"}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {v.phase === "RESULT" &&
            (host ? (
              <button
                className="dp-primary"
                disabled={!canAct}
                onClick={() => void submit({ type: "RESTART" })}
              >
                再来一局 →
              </button>
            ) : (
              <p>等待房主开始下一局</p>
            ))}
          {host && v.phase !== "RESULT" && (
            <button
              className="dp-abort"
              onClick={() => {
                if (
                  confirm(
                    "结束本局并返回准备？本局作品不再在房间展示，请先保存需要的图片。",
                  )
                )
                  void submit({ type: "ABORT" });
              }}
            >
              结束本局
            </button>
          )}
        </section>
      )}
      {snap?.me && !snap.players.find((p) => p.id === snap.host)?.connected && (
        <button onClick={() => void submit({ type: "TAKE_HOST" })}>
          房主离线 · 接任房主
        </button>
      )}
      <footer className="dp-footer">
        {snap?.ephemeral
          ? "当前云端为临时存储：部署或服务重启可能清除对局，请及时下载作品。"
          : "3–8人 · 建议同时开启语音 · 作品可自行下载"}
      </footer>
    </main>
  );
}
function exportAlbum(a: { owner: { name: string }; entries: any[] }) {
  const c = document.createElement("canvas");
  c.width = 1000;
  c.height =
    120 + a.entries.reduce((n, e) => n + (e.kind === "drawing" ? 940 : 180), 0);
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
      p.width = p.height = 860;
      paint(p, e.drawing ?? emptyDrawing());
      g.drawImage(p, 70, y + 50);
      y += 940;
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
