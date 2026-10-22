import React, { useEffect, useRef, useState } from "react";
import {
  emptyDrawing,
  type GameView,
  type Mode,
  type Player,
} from "../../../../packages/drawing-party/src/index.ts";
import { Board } from "./Board.tsx";
import { Portrait, PaintBrush, Easel } from "./StudioArt.tsx";
import "./studio.css";
type Props = {
  mode: Mode;
  v: GameView;
  me: string | null;
  host: boolean;
  connected: boolean;
  busy: boolean;
  inkBusy: boolean;
  seconds: number;
  code: string;
  error: string;
  input: string;
  setInput: (s: string) => void;
  submit: (a: any) => Promise<void>;
  send: any;
  edit: any;
  onBusy: (b: boolean) => void;
  invite: () => void;
  exportAlbum: (a: any) => void;
  takeHost?: () => void;
  clearError: () => void;
};
export function Studio(p: Props) {
  const { v, mode, me, host, connected } = p;
  const [menu, setMenu] = useState(false),
    [focused, setFocused] = useState(false),
    [rules, setRules] = useState(false),
    [secret, setSecret] = useState(false),
    [vote, setVote] = useState(""),
    [book, setBook] = useState(0),
    [page, setPage] = useState(0),
    [sound, setSound] = useState(localStorage.getItem("dp-sound") === "1"),
    [notice, setNotice] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const play = (kind = "tap") => {
    if (!sound) return;
    try {
      const ctx = (audio.current ??= new AudioContext());
      void ctx.resume();
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(kind === "turn" ? 440 : 660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(
        kind === "turn" ? 880 : 520,
        ctx.currentTime + 0.12,
      );
      g.gain.setValueAtTime(0.045, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      o.start();
      o.stop(ctx.currentTime + 0.17);
    } catch {}
  };
  useEffect(() => {
    setSecret(false);
    setVote("");
    setFocused(false);
    play("turn");
    if (mode === "tp" && v.albums) {
      setBook(
        Math.min(v.albums.length - 1, Math.floor(v.cursor / (v.steps + 1))),
      );
      setPage(v.cursor % (v.steps + 1));
    }
  }, [v.phase, v.turn, v.step, v.cursor]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 1800);
    return () => clearTimeout(t);
  }, [notice]);
  const act = (a: any) => {
    play();
    void p.submit(a);
  };
  const locked = !connected || p.busy;
  const title = mode === "fa" ? "纽约伪画家" : "传情画意";
  const labels: Record<string, string> = {
    CATEGORY: "主题投票",
    PROMPT: "写下一个有趣的句子",
    TASK: v.task?.kind === "drawing" ? "把这句话画出来" : "这幅画画的是什么？",
    DRAW: "共同创作",
    DISCUSS: "讨论时间",
    VOTE: "找出伪画家",
    OBSERVE: "最后一次观察",
    GUESS: "猜出这幅画",
    REVEAL: "揭晓时刻",
    RESULT: "本局结束",
  };
  const player = (x: Player, i: number) => (
    <div
      className={
        "st-player " +
        (v.currentId === x.id ? "is-current " : "") +
        (x.id === me ? "is-me" : "")
      }
      key={x.id}
      data-current={v.currentId === x.id}
    >
      <div className="st-player-avatar">
        <Portrait index={i} />
        {x.id === me && <i>我</i>}
      </div>
      <PaintBrush index={i} number={i + 1} mirrored={i % 2 === 1} />
      <span>{x.name}</span>
      {v.currentId === x.id && <b className="st-player-turn">正在作画</b>}
    </div>
  );
  const board = (read = false, d = v.drawing, key = "shared") => (
    <Board
      key={v.id + ":" + (read ? key : (v.task?.id ?? v.turn))}
      drawing={d ?? emptyDrawing()}
      docKey={v.id + ":" + (read ? key : (v.task?.id ?? v.turn)) + ":" + me}
      canDraw={
        !read &&
        !v.submitted &&
        (mode === "tp" || (v.currentId === me && connected))
      }
      connected={connected}
      single={mode === "fa"}
      color={
        mode === "fa" ? v.players.findIndex((x) => x.id === me) : undefined
      }
      strokeId={mode === "fa" ? v.id + "-turn-" + v.turn : undefined}
      send={p.send}
      edit={mode === "tp" ? p.edit : undefined}
      onFocus={() => setFocused(!focused)}
      focused={focused}
      onBusy={p.onBusy}
    />
  );
  const form = (label: string) => (
    <form
      className="st-writing"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.input.trim() && Array.from(p.input).length <= 40)
          act({ type: "TEXT", text: p.input });
      }}
    >
      <label>
        {label}
        <textarea
          autoComplete="off"
          aria-label={label}
          maxLength={80}
          placeholder={
            v.phase === "PROMPT" ? "例如：骑着恐龙去上班" : "大胆猜，跑偏才好玩"
          }
          value={p.input}
          onChange={(e) => p.setInput(e.target.value)}
        />
      </label>
      <span>{Array.from(p.input).length}/40</span>
      <button
        className="st-action"
        disabled={locked || !p.input.trim() || Array.from(p.input).length > 40}
      >
        写好了 <b>✓</b>
      </button>
    </form>
  );
  const album = v.albums?.[book],
    entry = album?.entries[Math.min(page, album.entries.length - 1)];
  const canPaper =
    mode === "fa"
      ? ["DRAW", "DISCUSS", "VOTE", "OBSERVE", "RESULT"].includes(v.phase)
      : v.phase === "TASK" || v.phase === "REVEAL" || v.phase === "RESULT";
  const fullscreen = async () => {
    try {
      if (
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      )
        await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
      else setNotice("请横放手机，画布已适配浏览器可用区域");
    } catch {
      setNotice("请横放手机，使用浏览器可用区域作画");
    }
    setMenu(false);
  };
  return (
    <main
      className={
        "st-world st-" +
        mode +
        (focused ? " is-focused " : " ") +
        " st-phase-" +
        v.phase.toLowerCase()
      }
      data-testid="drawing-studio"
    >
      <div className="st-texture" aria-hidden="true" />
      <header className="st-top">
        <div
          className={
            "st-timer " + (p.seconds <= 10 && v.deadline ? "is-urgent" : "")
          }
          aria-label={"剩余" + p.seconds + "秒"}
        >
          <small>{v.deadline ? "时间" : "绘画派对"}</small>
          <b>{v.deadline ? String(p.seconds) : "✦"}</b>
        </div>
        <div className="st-phase-label">{labels[v.phase]}</div>
        {(v.phase === "DRAW" ||
          (v.phase === "TASK" && v.task?.kind === "drawing")) && (
          <button
            className="st-enlarge"
            aria-label="放大画布"
            title="放大画布"
            onClick={() => setFocused(true)}
          >
            ⛶
          </button>
        )}
        <button
          className="st-menu-toggle"
          aria-label="打开游戏菜单"
          onClick={() => {
            play();
            setMenu(!menu);
          }}
          aria-expanded={menu}
        >
          <i />
          <i />
          <i />
        </button>
      </header>
      <aside className="st-players st-left" aria-label="左侧玩家">
        {v.players.map((x, i) => (i % 2 === 0 ? player(x, i) : null))}
      </aside>
      <aside className="st-players st-right" aria-label="右侧玩家">
        {v.players.map((x, i) => (i % 2 === 1 ? player(x, i) : null))}
      </aside>
      <section
        className={"st-center " + (canPaper ? "has-paper" : "")}
        key={v.id + ":" + v.phase}
      >
        {mode === "fa" && v.phase === "CATEGORY" && (
          <div className="st-ballot">
            <div className="st-category-grid">
              {v.categories?.map((c, i) => (
                <button
                  aria-pressed={v.myCategoryVote === (i === 5 ? -1 : i)}
                  disabled={locked || v.myCategoryVote !== undefined}
                  key={c}
                  onClick={() =>
                    act({ type: "CATEGORY_VOTE", category: i === 5 ? -1 : i })
                  }
                >
                  {c}
                  <span>
                    {v.myCategoryVote === (i === 5 ? -1 : i) ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
            <p className="st-black-pill">
              {v.myCategoryVote === undefined
                ? "请投票选择此次的主题"
                : "主题已选好 · 等待其他画家"}
              <small>
                {v.completed}/{v.players.length}
              </small>
            </p>
          </div>
        )}
        {mode === "tp" &&
          v.phase === "PROMPT" &&
          (v.submitted ? (
            <div className="st-waiting">
              <b className="st-stamp">✓ 已收好</b>
              <h2>等朋友们写下脑洞</h2>
              <p>
                {v.completed}/{v.players.length} 人已完成
              </p>
            </div>
          ) : (
            <div className="st-notepad">
              <div className="st-notepad-rings" aria-hidden="true" />
              <h1>故事，从你这句话开始</h1>
              {form("给朋友写个题目")}
            </div>
          ))}
        {mode === "tp" && v.phase === "TASK" && v.task && (
          <>
            <div className="st-prompt-strip">
              <span>{v.task.kind === "drawing" ? "✎ 请画出" : "? 请猜猜"}</span>
              <b>
                {v.task.kind === "drawing"
                  ? v.task.source.text
                  : "朋友画的是什么？"}
              </b>
              <small>
                {v.step}/{v.steps}
              </small>
            </div>
            <div className="st-drawing-workspace">
              {v.task.kind === "drawing"
                ? board()
                : board(true, v.task.source.drawing, "source:" + v.task.id)}
              {v.submitted && (
                <div className="st-submit-stamp">
                  <b>✓ 已完成</b>
                  <span>等待其他画家</span>
                </div>
              )}
            </div>
            <div className="st-task-bottom">
              {v.task.kind === "drawing" ? (
                <button
                  className="st-action"
                  disabled={locked || p.inkBusy || v.submitted}
                  onClick={() => act({ type: "SUBMIT" })}
                >
                  {v.submitted ? "已提交 · 等待其他人" : "画好了 →"}
                </button>
              ) : !v.submitted ? (
                form("写下你的猜测")
              ) : (
                <p className="st-black-pill">猜测已收好，等待朋友们</p>
              )}
              <span className="st-completion">
                {v.completed}/{v.players.length} 人完成
                {p.inkBusy ? " · 保存中" : ""}
              </span>
            </div>
          </>
        )}
        {mode === "tp" && (v.phase === "REVEAL" || v.phase === "RESULT") && (
          <div className="st-album">
            <div className="st-album-tabs">
              {v.albums?.map((a, i) => (
                <button
                  aria-pressed={book === i}
                  disabled={!a.entries.length}
                  key={a.owner.id}
                  onClick={() => {
                    play();
                    setBook(i);
                    setPage(a.entries.length - 1);
                  }}
                >
                  <Portrait index={i} />
                  <span>{a.owner.name}</span>
                </button>
              ))}
            </div>
            <div className="st-album-title">
              <h2>{album?.owner.name}的传话本</h2>
              <span>
                {page === 0
                  ? "初始题目"
                  : page % 2
                    ? "第" + Math.ceil(page / 2) + "幅画"
                    : "第" + page / 2 + "次猜测"}{" "}
                · {v.players.find((x) => x.id === entry?.author)?.name}
              </span>
            </div>
            <div className="st-album-page" key={book + ":" + page}>
              {entry?.kind === "drawing" ? (
                board(true, entry.drawing, "album:" + book + ":" + page)
              ) : (
                <div className="st-quote">
                  <span>“</span>
                  <h1>{entry?.text}</h1>
                  <p>{entry?.missing ? "到时封存" : "脑洞正在传递"}</p>
                </div>
              )}
            </div>
            <div className="st-page-dots">
              {album?.entries.map((e, i) => (
                <button
                  aria-label={"查看第" + (i + 1) + "页"}
                  aria-pressed={page === i}
                  onClick={() => {
                    play();
                    setPage(i);
                  }}
                  key={i}
                >
                  {e.kind === "drawing" ? "✎" : "Aa"}
                  <small>{i + 1}</small>
                </button>
              ))}
            </div>
            <div className="st-album-actions">
              {album?.entries.length === v.steps + 1 && (
                <button onClick={() => p.exportAlbum(album)}>
                  保存整条传话链 ↓
                </button>
              )}
              {v.phase === "REVEAL" &&
                (host ? (
                  <button
                    className="st-action"
                    disabled={locked}
                    onClick={() => act({ type: "NEXT" })}
                  >
                    {v.cursor >= v.players.length * (v.steps + 1) - 1
                      ? "看完了 · 本局结束"
                      : "翻开下一页 →"}
                  </button>
                ) : (
                  <p>等房主翻开下一页…</p>
                ))}
              {v.phase === "RESULT" && host && (
                <button
                  className="st-action"
                  onClick={() => act({ type: "RESTART" })}
                >
                  再来一局 →
                </button>
              )}
            </div>
          </div>
        )}
        {mode === "fa" && canPaper && (
          <>
            <div className="st-room-message" key={v.phase + ":" + v.turn}>
              {v.phase === "DRAW"
                ? v.currentId === me
                  ? "轮到你了！请用一笔完成创作。"
                  : "你们之中有一个不知道题目的伪画家。"
                : v.phase === "DISCUSS"
                  ? "仔细看看每一笔，谁在假装知道？"
                  : v.phase === "VOTE"
                    ? "谁的画笔露出了破绽？"
                    : v.phase === "OBSERVE"
                      ? "最后一次机会，记住这幅画。"
                      : v.winner === "fake"
                        ? "伪画家，成功蒙混过关！"
                        : "真画家，识破了伪装！"}
            </div>
            <div className="st-fa-paper">
              <Easel />
              {board(v.phase !== "DRAW", v.drawing, v.phase)}
              {v.phase === "DRAW" && (
                <p className="st-canvas-hint">
                  {v.currentId === me
                    ? "请一笔作画"
                    : "正在观看 " +
                      v.players.find((x) => x.id === v.currentId)?.name +
                      " 作画"}
                </p>
              )}
            </div>
            {v.phase === "DRAW" && (
              <div className="st-under-paper">
                <span>
                  回合 <b>{Math.floor(v.turn / v.players.length) + 1}/2</b>
                </span>
                {v.currentId === me && (
                  <button
                    disabled={locked || p.inkBusy}
                    onClick={() => act({ type: "SUBMIT" })}
                  >
                    本回合跳过 ›
                  </button>
                )}
              </div>
            )}
            {v.phase === "DISCUSS" && (
              <div className="st-stage-action">
                {host ? (
                  <button
                    className="st-black-pill"
                    disabled={locked}
                    onClick={() => act({ type: "FINISH_DISCUSSION" })}
                  >
                    开始投票 →
                  </button>
                ) : (
                  <p className="st-black-pill">和朋友讨论，等待房主开始投票</p>
                )}
              </div>
            )}
            {v.phase === "VOTE" && (
              <div className="st-vote-overlay">
                {v.myVote ? (
                  <p className="st-black-pill">
                    已投票 · {v.completed}/{v.players.length}
                  </p>
                ) : (
                  <>
                    <div className="st-voter-grid">
                      {v.players
                        .filter((x) => x.id !== me)
                        .map((x) => (
                          <button
                            aria-pressed={vote === x.id}
                            key={x.id}
                            onClick={() => {
                              setVote(x.id);
                              play();
                            }}
                          >
                            <Portrait
                              index={v.players.findIndex((a) => a.id === x.id)}
                            />
                            <span>{x.name}</span>
                            <b>{vote === x.id ? "✓" : ""}</b>
                          </button>
                        ))}
                    </div>
                    <button
                      className="st-black-pill"
                      disabled={locked || !vote}
                      onClick={() => act({ type: "VOTE", target: vote })}
                    >
                      确认投票
                    </button>
                  </>
                )}
              </div>
            )}
            {v.phase === "OBSERVE" && (
              <div className="st-stage-action">
                {v.role === "fake" ? (
                  <button
                    className="st-black-pill"
                    disabled={locked}
                    onClick={() => act({ type: "BEGIN_GUESS" })}
                  >
                    我想好了 · 开始猜题 →
                  </button>
                ) : (
                  <p className="st-black-pill">卧底正在准备最后猜题…</p>
                )}
              </div>
            )}
            {v.phase === "RESULT" && (
              <div className="st-result-bar">
                <h2>{v.word}</h2>
                <p>
                  伪画家：{v.players.find((x) => x.id === v.fakeId)?.name}
                  {v.guess ? " · 猜了「" + v.guess + "」" : ""}
                </p>
                {host && (
                  <button
                    className="st-black-pill"
                    onClick={() => act({ type: "RESTART" })}
                  >
                    再来一局 →
                  </button>
                )}
                <details>
                  <summary>查看投票</summary>
                  {v.players.map((x) => (
                    <p key={x.id}>
                      {x.name} →{" "}
                      {v.players.find((a) => a.id === v.votes?.[x.id])?.name ??
                        "未投票"}
                    </p>
                  ))}
                </details>
              </div>
            )}
          </>
        )}
        {mode === "fa" &&
          v.phase === "GUESS" &&
          (v.role === "fake" ? (
            <div className="st-ballot st-guess-ballot">
              <h1>这幅画的题目是什么？</h1>
              <div className="st-guess-grid">
                {v.options?.map((w) => (
                  <button
                    key={w}
                    disabled={locked}
                    onClick={() => act({ type: "GUESS", answer: w })}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <p className="st-black-pill">只能选一次 · 相信你的直觉</p>
            </div>
          ) : (
            <div className="st-waiting">
              <span className="st-thinking">?</span>
              <h2>卧底正在最后猜题</h2>
              <p>谜底，马上揭晓。</p>
            </div>
          ))}
      </section>
      {mode === "fa" && v.phase !== "CATEGORY" && (
        <>
          <button
            className={"st-placard st-secret " + (secret ? "is-revealed" : "")}
            aria-label="查看秘密题目"
            onClick={() => {
              setSecret(!secret);
              play();
            }}
          >
            <small>此次的题目</small>
            <strong>
              {v.phase === "RESULT"
                ? v.word
                : secret
                  ? v.role === "fake"
                    ? "?"
                    : v.word
                  : "?"}
            </strong>
            <span>
              {v.role === "fake"
                ? "你是伪画家"
                : secret
                  ? "再点隐藏"
                  : "点此秘密查看"}
            </span>
          </button>
          <div className="st-placard st-category">
            <small>此次的主题</small>
            <strong>{v.category}</strong>
          </div>
        </>
      )}
      {focused && (
        <button className="st-exit-focus" onClick={() => setFocused(false)}>
          返回画室 ↙
        </button>
      )}
      <div className="st-bottom-status">
        <span className="st-rotation-tip">▱ 横放手机，画布更大</span>
        <span>
          {!connected
            ? "断线重连中 · 私人草稿保存在本机"
            : p.busy
              ? "正在确认…"
              : notice || ""}
        </span>
        {p.takeHost && <button onClick={p.takeHost}>接任房主</button>}
      </div>
      {(p.error || notice) && (
        <div className="st-toast" role="status">
          {p.error || notice}
          <button
            aria-label="关闭提示"
            onClick={() => {
              p.clearError();
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
      {menu && (
        <div className="st-menu-backdrop" onClick={() => setMenu(false)}>
          <nav className="st-menu" onClick={(e) => e.stopPropagation()}>
            <h2>{title}</h2>
            <p>房间 {p.code}</p>
            <button
              onClick={() => {
                p.invite();
                setMenu(false);
              }}
            >
              复制邀请链接 ↗
            </button>
            <button
              onClick={() => {
                setRules(!rules);
              }}
            >
              怎么玩
            </button>
            {rules && (
              <p className="st-menu-rules">
                {mode === "fa"
                  ? "选主题 → 每人每圈画一笔，共两圈 → 讨论投票 → 卧底被抓可猜题翻盘。平票未抓到。线上自动主持改编。"
                  : "写题 → 同时画画 → 猜朋友的画 → 交替传递 → 一起揭晓。提交后锁定，离线到时封存。"}
              </p>
            )}
            <button
              onClick={() => {
                const next = !sound;
                setSound(next);
                localStorage.setItem("dp-sound", next ? "1" : "0");
              }}
            >
              音效 {sound ? "开启 ♪" : "关闭"}
            </button>
            <button onClick={() => void fullscreen()}>全屏画室 ⛶</button>
            {host && v.phase !== "RESULT" && (
              <button
                className="st-danger"
                onClick={() => {
                  if (confirm("结束本局并返回准备？请先下载需要的作品。"))
                    act({ type: "ABORT" });
                }}
              >
                结束本局
              </button>
            )}
            <a href="/">返回游戏合集</a>
            <button onClick={() => setMenu(false)}>返回画室 ×</button>
          </nav>
        </div>
      )}
    </main>
  );
}
