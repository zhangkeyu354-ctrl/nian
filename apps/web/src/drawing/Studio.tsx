import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  emptyDrawing,
  COLORS,
  type GameView,
  type Mode,
  type Player,
} from "../../../../packages/drawing-party/src/index.ts";
import { Board } from "./Board.tsx";
import {
  Portrait,
  PaintBrush,
  Easel,
  TimerRing,
  CategoryIcon,
  ThemeIcon,
} from "./StudioArt.tsx";
import { TaleVerdict } from "./TaleVerdict.tsx";
import { TaleAwards } from "./TaleAwards.tsx";
import { FakeResult, TaleResult } from "./Results.tsx";
import { feel, soundOn, setSoundOn } from "./feel.ts";
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
  total: number;
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
type Banner = { key: string; text: string; sub?: string; tone?: string };

export function Studio(p: Props) {
  const { v, mode, me, host, connected } = p;
  const [menu, setMenu] = useState(false),
    [focused, setFocused] = useState(false),
    [rules, setRules] = useState(false),
    [secret, setSecret] = useState(false),
    [vote, setVote] = useState(""),
    [book, setBook] = useState(0),
    [page, setPage] = useState(0),
    [sound, setSound] = useState(soundOn()),
    [notice, setNotice] = useState(""),
    [banner, setBanner] = useState<Banner | null>(null),
    [resultOpen, setResultOpen] = useState(true);
  const myIndex = v.players.findIndex((x) => x.id === me);
  const myTurn = mode === "fa" && v.phase === "DRAW" && v.currentId === me;
  const indexOf = (id?: string) => v.players.findIndex((x) => x.id === id);
  const nameOf = (id?: string) => v.players.find((x) => x.id === id)?.name;

  // Phase / turn transitions: a short centred banner plus sound and haptics.
  const first = useRef(true);
  useEffect(() => {
    setSecret(false);
    setVote("");
    setFocused(false);
    setResultOpen(true);
    if (mode === "tp" && v.albums) {
      setBook(
        Math.min(v.albums.length - 1, Math.floor(v.cursor / (v.steps + 1))),
      );
      setPage(v.cursor % (v.steps + 1));
    }
    const b = bannerFor(v, mode, me);
    const isFirst = first.current;
    first.current = false;
    if (v.phase === "REVEAL" && v.cursor > 0) {
      feel("page");
      return;
    }
    if (v.phase === "RESULT") return; // result screens play their own cues
    if (b && !isFirst) {
      setBanner({ ...b, key: v.phase + v.turn + v.step + v.cursor });
      feel(b.tone === "me" ? "turn" : "select");
    }
  }, [v.phase, v.turn, v.step, v.cursor]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1700);
    return () => clearTimeout(t);
  }, [banner]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 1800);
    return () => clearTimeout(t);
  }, [notice]);
  // Last five seconds tick (only while there is something left to do).
  useEffect(() => {
    if (!v.deadline || p.seconds > 5 || p.seconds <= 0) return;
    if (v.submitted || (mode === "fa" && v.phase === "DRAW" && !myTurn)) return;
    feel("tick");
  }, [p.seconds]);

  const act = (a: any, cue: Parameters<typeof feel>[0] = "submit") => {
    feel(cue);
    void p.submit(a);
  };
  const locked = !connected || p.busy;
  const title = mode === "fa" ? "纽约伪画家" : "传情画意";
  const labels: Record<string, string> = {
    THEME: "主题投票",
    THEME_RESULT: "本局主题",
    VERDICT: "这题传成功了吗？",
    VERDICT_RESULT: "大家的判断",
    AWARD: "这一笔，谁最出彩？",
    AWARD_RESULT: "本轮奖项",
    CATEGORY: "主题投票",
    PROMPT: "写下一个有趣的句子",
    TASK: v.task?.kind === "drawing" ? "把这句话画出来" : "朋友画的是什么？",
    DRAW: "共同创作",
    DISCUSS: "讨论时间",
    VOTE: "找出伪画家",
    OBSERVE: "最后一次观察",
    GUESS: "猜出这幅画",
    REVEAL: "揭晓时刻",
    RESULT: "本局结束",
  };
  const subline =
    mode === "fa"
      ? v.phase === "CATEGORY"
        ? "大家一起选这局画什么"
        : v.phase === "DRAW"
          ? myTurn
            ? "轮到你了！请用一笔完成创作。"
            : "你们之中有一个不知道题目的伪画家。"
          : v.phase === "DISCUSS"
            ? "仔细看看每一笔，谁在假装知道？"
            : v.phase === "VOTE"
              ? "谁的画笔露出了破绽？"
              : v.phase === "OBSERVE"
                ? "最后一次机会，记住这幅画。"
                : v.phase === "GUESS"
                  ? "卧底的最后翻盘机会"
                  : v.winner === "fake"
                    ? "伪画家，成功蒙混过关！"
                    : "真画家，识破了伪装！"
      : v.phase === "THEME"
        ? "选个方向，写下你自己的脑洞"
        : v.phase === "PROMPT"
          ? "故事，从你这句话开始"
          : v.phase === "TASK"
            ? "第 " + v.step + " / " + v.steps + " 步"
            : "一页一页翻开传话本";

  const seat = (x: Player, i: number) => {
    const current = v.currentId === x.id;
    return (
      <div
        className={
          "st-player " +
          (current ? "is-current " : "") +
          (x.id === me ? "is-me" : "")
        }
        key={x.id}
        data-current={current}
        style={{ "--seat": COLORS[i % COLORS.length] } as React.CSSProperties}
      >
        <div className="st-player-avatar">
          <Portrait index={i} tale={mode === "tp"} />
          {x.id === me && <i>我</i>}
        </div>
        <div className="st-player-brush">
          <PaintBrush index={i} number={i + 1} mirrored={i % 2 === 1} />
        </div>
        <span className="st-player-name">{x.name}</span>
        {current && <b className="st-player-turn">作画中</b>}
      </div>
    );
  };
  const board = (read = false, d = v.drawing, key = "shared") => (
    <Board
      key={v.id + ":" + (read ? key : (v.task?.id ?? v.turn))}
      drawing={d ?? emptyDrawing(v.paperAspect)}
      docKey={v.id + ":" + (read ? key : (v.task?.id ?? v.turn)) + ":" + me}
      canDraw={
        !read &&
        !v.submitted &&
        (mode === "tp" || (v.currentId === me && connected))
      }
      connected={connected}
      single={mode === "fa"}
      color={mode === "fa" ? myIndex : undefined}
      strokeId={mode === "fa" ? v.id + "-turn-" + v.turn : undefined}
      send={p.send}
      edit={mode === "tp" ? p.edit : undefined}
      onFocus={() => setFocused(!focused)}
      focused={focused}
      onBusy={p.onBusy}
    />
  );
  const form = (label: string, big = false) => (
    <form
      className={"st-writing " + (big ? "is-big" : "")}
      onSubmit={(e) => {
        e.preventDefault();
        if (p.input.trim() && Array.from(p.input).length <= 40)
          act({ type: "TEXT", text: p.input });
      }}
    >
      <label>
        <span className="st-writing-label">{label}</span>
        <textarea
          autoComplete="off"
          aria-label={label}
          maxLength={80}
          placeholder={
            v.phase === "PROMPT"
              ? v.theme
                ? ({
                    影视: "写一个你想到的影视作品或情节",
                    成语: "写一个成语",
                    童话故事: "写一个你想到的童话故事",
                    动漫: "写一个你想到的动漫作品或情节",
                    歌词: "写一句你想到的歌词",
                  }[v.theme] ?? "按主题写一句题目")
                : "例如：骑着恐龙去上班"
              : "大胆猜，跑偏才好玩"
          }
          value={p.input}
          onChange={(e) => p.setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <span
          className={
            "st-count " + (Array.from(p.input).length > 40 ? "is-over" : "")
          }
        >
          {Array.from(p.input).length}/40
        </span>
      </label>
      <button
        className="st-btn st-primary"
        disabled={locked || !p.input.trim() || Array.from(p.input).length > 40}
      >
        写好了 <b aria-hidden="true">✓</b>
      </button>
    </form>
  );
  const album = v.albums?.[book],
    entry = album?.entries[Math.min(page, album.entries.length - 1)];
  const canPaper =
    mode === "fa"
      ? ["DRAW", "DISCUSS", "VOTE", "OBSERVE", "RESULT"].includes(v.phase)
      : [
          "TASK",
          "REVEAL",
          "VERDICT",
          "VERDICT_RESULT",
          "AWARD",
          "AWARD_RESULT",
          "RESULT",
        ].includes(v.phase);
  const drawingTask =
    v.phase === "DRAW" || (v.phase === "TASK" && v.task?.kind === "drawing");
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
  const tpReveal =
    mode === "tp" &&
    [
      "REVEAL",
      "VERDICT",
      "VERDICT_RESULT",
      "AWARD",
      "AWARD_RESULT",
      "RESULT",
    ].includes(v.phase);
  const revealedCount = useMemo(
    () => (v.albums ?? []).reduce((n, a) => n + a.entries.length, 0),
    [v.albums],
  );
  return (
    <main
      className={
        "st-world st-" +
        mode +
        (focused ? " is-focused" : "") +
        (myTurn ? " is-my-turn" : "") +
        (tpReveal ? " is-album" : "") +
        (["AWARD", "AWARD_RESULT"].includes(v.phase) ? " has-award" : "") +
        " st-phase-" +
        v.phase.toLowerCase()
      }
      style={{ "--paper-ratio": v.paperAspect ?? 2 } as React.CSSProperties}
      data-testid="drawing-studio"
    >
      <div className="st-backdrop" aria-hidden="true">
        <i className="st-light" />
        <i className="st-texture" />
        <i className="st-vignette" />
      </div>
      <header className="st-top">
        <div
          className={
            "st-timer " +
            (p.seconds <= 10 && v.deadline ? "is-urgent " : "") +
            (v.deadline ? "" : "is-idle")
          }
          aria-label={"剩余" + p.seconds + "秒"}
        >
          <TimerRing
            fraction={v.deadline ? p.seconds / Math.max(1, p.total) : 1}
          />
          <b>{v.deadline ? String(p.seconds) : "✦"}</b>
        </div>
        <div className="st-title" key={v.phase + (myTurn ? "m" : "")}>
          {mode === "tp" && v.phase === "TASK" && v.task?.kind === "drawing" ? (
            <>
              <small>✎ 请画出</small>
              <b className="st-prompt-text">{v.task.source.text}</b>
            </>
          ) : (
            <>
              <b className="st-phase-label">{labels[v.phase]}</b>
              <small>
                {tpReveal && v.theme ? "本局主题：" + v.theme : subline}
              </small>
            </>
          )}
        </div>
        <div className="st-top-actions">
          {drawingTask && (
            <button
              className="st-icon-btn st-enlarge"
              aria-label="放大画布"
              title="放大画布"
              onClick={() => {
                feel("tap");
                setFocused(true);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
          )}
          <button
            className="st-icon-btn st-menu-toggle"
            aria-label="打开游戏菜单"
            onClick={() => {
              feel("tap");
              setMenu(!menu);
            }}
            aria-expanded={menu}
          >
            <i />
            <i />
            <i />
          </button>
        </div>
      </header>
      <aside className="st-players st-left" aria-label="左侧玩家">
        {v.players.map((x, i) => (i % 2 === 0 ? seat(x, i) : null))}
        {mode === "fa" && v.phase !== "CATEGORY" && (
          <button
            className={"st-placard st-secret " + (secret ? "is-revealed" : "")}
            aria-label="查看秘密题目"
            onClick={() => {
              setSecret(!secret);
              feel("tap");
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
        )}
      </aside>
      <aside className="st-players st-right" aria-label="右侧玩家">
        {v.players.map((x, i) => (i % 2 === 1 ? seat(x, i) : null))}
        {mode === "fa" && v.phase !== "CATEGORY" && (
          <div className="st-placard st-category">
            <small>此次的主题</small>
            <strong>{v.category}</strong>
          </div>
        )}
      </aside>
      <section
        className={"st-center " + (canPaper ? "has-paper" : "")}
        key={v.id + ":" + v.phase}
      >
        {mode === "tp" && v.phase === "THEME" && (
          <div className="st-ballot tp-theme-ballot">
            <div className="st-category-grid tp-theme-grid">
              {v.themes?.map((theme, i) => (
                <button
                  key={theme}
                  className={v.myThemeVote === i ? "is-mine" : ""}
                  aria-pressed={v.myThemeVote === i}
                  disabled={locked || v.myThemeVote !== undefined || !me}
                  onClick={() =>
                    act({ type: "THEME_VOTE", theme: i }, "select")
                  }
                >
                  <ThemeIcon index={i} />
                  {theme}
                  <span className="st-check" aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="st-pill">
              {v.myThemeVote === undefined
                ? "请投票选择主题"
                : "已投票 · 等朋友们选择"}{" "}
              <small>
                {v.completed}/{v.players.length}
              </small>
            </p>
          </div>
        )}
        {mode === "tp" && v.phase === "THEME_RESULT" && (
          <div className="tp-theme-result">
            <ThemeIcon
              index={
                v.theme
                  ? ["影视", "成语", "童话故事", "动漫", "歌词"].indexOf(
                      v.theme,
                    )
                  : 6
              }
            />
            <h1>本局主题：{v.theme ?? "自定义"}</h1>
            <p>题目由你来写，脑洞由大家接力</p>
          </div>
        )}
        {mode === "fa" && v.phase === "CATEGORY" && (
          <div className="st-ballot">
            <div className="st-category-grid">
              {v.categories?.map((c, i) => {
                const val = i === 5 ? -1 : i,
                  mine = v.myCategoryVote === val;
                return (
                  <button
                    aria-pressed={mine}
                    disabled={locked || v.myCategoryVote !== undefined}
                    className={mine ? "is-mine" : ""}
                    key={c}
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={() =>
                      act({ type: "CATEGORY_VOTE", category: val }, "select")
                    }
                  >
                    <CategoryIcon index={i} />
                    {c}
                    <span className="st-check" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <p className="st-pill">
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
            <Waiting
              stamp="✓ 已收好"
              title="等朋友们写下脑洞"
              done={v.completed}
              all={v.players.length}
            />
          ) : (
            <div className="st-notepad">
              <div className="st-notepad-rings" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
              {v.theme && (
                <span className="st-chip tp-theme-tag">
                  本局主题 · {v.theme}
                </span>
              )}
              <h1>
                {v.theme
                  ? `写一句「${v.theme}」类的题目`
                  : "故事，从你这句话开始"}
              </h1>
              {form("给朋友写个题目", true)}
            </div>
          ))}
        {mode === "tp" && v.phase === "TASK" && v.task && (
          <>
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
                  className="st-btn st-primary"
                  disabled={locked || p.inkBusy || v.submitted}
                  onClick={() => act({ type: "SUBMIT" }, "stamp")}
                >
                  {v.submitted ? "已提交 · 等待其他人" : "画好了 →"}
                </button>
              ) : !v.submitted ? (
                form("写下你的猜测")
              ) : (
                <p className="st-pill">猜测已收好，等待朋友们</p>
              )}
              <Progress
                done={v.completed}
                all={v.players.length}
                busy={p.inkBusy}
              />
            </div>
          </>
        )}
        {["VERDICT", "VERDICT_RESULT"].includes(v.phase) && (
          <TaleVerdict
            v={v}
            me={me}
            host={host}
            locked={locked}
            onVote={p.submit}
            onNext={() => act({ type: "NEXT" }, "page")}
          />
        )}
        {tpReveal && !v.phase.startsWith("VERDICT") && (
          <div className="st-album">
            <nav className="st-album-tabs" aria-label="传话本">
              {v.albums?.map((a, i) => (
                <button
                  aria-pressed={book === i}
                  disabled={
                    !a.entries.length ||
                    (["AWARD", "AWARD_RESULT"].includes(v.phase) &&
                      i !== v.awardChain)
                  }
                  key={a.owner.id}
                  onClick={() => {
                    feel("page");
                    setBook(i);
                    setPage(a.entries.length - 1);
                  }}
                >
                  <Portrait index={indexOf(a.owner.id)} tale={mode === "tp"} />
                  <span>{a.owner.name}</span>
                  <small>
                    {a.entries.length}/{v.steps + 1}
                  </small>
                </button>
              ))}
            </nav>
            <div className="st-album-main">
              <div className="st-album-page" key={book + ":" + page}>
                {entry?.kind === "drawing" ? (
                  board(true, entry.drawing, "album:" + book + ":" + page)
                ) : (
                  <div className="st-quote">
                    <span aria-hidden="true">“</span>
                    <h1>{entry?.text}</h1>
                    <p>{entry?.missing ? "到时封存" : "脑洞正在传递"}</p>
                  </div>
                )}
                <div
                  className={
                    "st-album-caption is-" +
                    (page === 0 ? "prompt" : page % 2 ? "drawing" : "guess")
                  }
                  style={
                    {
                      "--seat": COLORS[Math.max(0, indexOf(entry?.author)) % COLORS.length],
                    } as React.CSSProperties
                  }
                >
                  <Portrait
                    index={indexOf(entry?.author)}
                    tale={mode === "tp"}
                  />
                  <div>
                    <b>
                      {nameOf(entry?.author) ?? "未出题"}
                      <em>
                        {page === 0
                          ? " 出的题"
                          : page % 2
                            ? " 画的"
                            : " 猜的"}
                      </em>
                    </b>
                    <span>
                      {album?.owner.name}的传话本 ·{" "}
                      {page === 0
                        ? "初始题目"
                        : page % 2
                          ? "第" + Math.ceil(page / 2) + "幅画"
                          : "第" + page / 2 + "次猜测"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="st-album-bar">
                <div className="st-page-dots">
                  {album?.entries.map((e, i) => (
                    <button
                      aria-label={"查看第" + (i + 1) + "页"}
                      aria-pressed={page === i}
                      onClick={() => {
                        feel("tap");
                        setPage(i);
                      }}
                      key={i}
                    >
                      {e.kind === "drawing" ? "✎" : "Aa"}
                      <small>{i + 1}</small>
                    </button>
                  ))}
                  {album &&
                    Array.from(
                      {
                        length: Math.max(0, v.steps + 1 - album.entries.length),
                      },
                      (_, i) => <i className="st-page-ghost" key={"g" + i} />,
                    )}
                </div>
                <div className="st-album-actions">
                  {album?.entries.length === v.steps + 1 && (
                    <button
                      className="st-btn st-ghost"
                      onClick={() => {
                        feel("tap");
                        p.exportAlbum(album);
                      }}
                    >
                      保存整条传话链 ↓
                    </button>
                  )}
                  {v.phase === "REVEAL" &&
                    (host ? (
                      <button
                        className="st-btn st-primary"
                        disabled={locked}
                        onClick={() => act({ type: "NEXT" }, "page")}
                      >
                        {v.cursor >= v.players.length * (v.steps + 1) - 1
                          ? "看完了 · 本局结束"
                          : "翻开下一页 →"}
                      </button>
                    ) : (
                      <p className="st-pill is-soft">等房主翻开下一页…</p>
                    ))}
                  {v.phase === "RESULT" && !resultOpen && (
                    <button
                      className="st-btn st-primary"
                      onClick={() => setResultOpen(true)}
                    >
                      查看结算
                    </button>
                  )}
                </div>
              </div>
            </div>
            {["AWARD", "AWARD_RESULT"].includes(v.phase) && (
              <TaleAwards
                v={v}
                me={me}
                locked={locked}
                host={host}
                onVote={p.submit}
                onNext={() => act({ type: "NEXT" }, "page")}
              />
            )}
            <div className="st-reveal-progress" aria-hidden="true">
              <i
                style={{
                  width:
                    (100 * revealedCount) /
                      Math.max(1, v.players.length * (v.steps + 1)) +
                    "%",
                }}
              />
            </div>
          </div>
        )}
        {mode === "fa" && canPaper && (
          <>
            <div className="st-fa-paper">
              <Easel />
              {board(v.phase !== "DRAW", v.drawing, v.phase)}
            </div>
            {v.phase === "DRAW" && (
              <div className="st-under-paper">
                <span className="st-chip">
                  第 <b>{Math.floor(v.turn / v.players.length) + 1}/2</b> 圈
                </span>
                <p className={"st-pill " + (myTurn ? "is-hot" : "is-soft")}>
                  {myTurn ? (
                    "请一笔作画"
                  ) : (
                    <>
                      <Portrait index={indexOf(v.currentId)} />
                      {"正在观看 " + nameOf(v.currentId) + " 作画"}
                    </>
                  )}
                </p>
                {myTurn ? (
                  <button
                    className="st-btn st-ghost st-skip"
                    disabled={locked || p.inkBusy}
                    onClick={() => act({ type: "SUBMIT" }, "tap")}
                  >
                    本回合跳过 ›
                  </button>
                ) : (
                  <span className="st-chip st-skip-space" />
                )}
              </div>
            )}
            {v.phase === "DISCUSS" && (
              <div className="st-under-paper">
                {host ? (
                  <button
                    className="st-btn st-dark"
                    disabled={locked}
                    onClick={() => act({ type: "FINISH_DISCUSSION" })}
                  >
                    开始投票 →
                  </button>
                ) : (
                  <p className="st-pill is-soft">
                    和朋友讨论，等待房主开始投票
                  </p>
                )}
              </div>
            )}
            {v.phase === "VOTE" && (
              <div className="st-vote-sheet">
                {v.myVote ? (
                  <div className="st-voted">
                    <b className="st-stamp is-small">✓ 已投票</b>
                    <p>
                      投给了 {nameOf(v.myVote)} · {v.completed}/
                      {v.players.length} 人已投
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="st-voter-grid">
                      {v.players
                        .filter((x) => x.id !== me)
                        .map((x) => (
                          <button
                            aria-pressed={vote === x.id}
                            key={x.id}
                            style={
                              {
                                "--seat": COLORS[indexOf(x.id) % COLORS.length],
                              } as React.CSSProperties
                            }
                            onClick={() => {
                              setVote(x.id);
                              feel("select");
                            }}
                          >
                            <Portrait index={indexOf(x.id)} />
                            <span>{x.name}</span>
                            <b className="st-check" aria-hidden="true" />
                          </button>
                        ))}
                    </div>
                    <button
                      className="st-btn st-dark"
                      disabled={locked || !vote}
                      onClick={() =>
                        act({ type: "VOTE", target: vote }, "stamp")
                      }
                    >
                      确认投票
                    </button>
                  </>
                )}
              </div>
            )}
            {v.phase === "OBSERVE" && (
              <div className="st-under-paper">
                {v.role === "fake" ? (
                  <button
                    className="st-btn st-dark"
                    disabled={locked}
                    onClick={() => act({ type: "BEGIN_GUESS" })}
                  >
                    我想好了 · 开始猜题 →
                  </button>
                ) : (
                  <p className="st-pill is-soft">卧底正在准备最后猜题…</p>
                )}
              </div>
            )}
            {v.phase === "RESULT" && !resultOpen && (
              <div className="st-under-paper">
                <button
                  className="st-btn st-dark"
                  onClick={() => setResultOpen(true)}
                >
                  查看结算
                </button>
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
                {v.options?.map((w, i) => (
                  <button
                    key={w}
                    disabled={locked}
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={() => act({ type: "GUESS", answer: w }, "stamp")}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <p className="st-pill">只能选一次 · 相信你的直觉</p>
            </div>
          ) : (
            <div className="st-waiting">
              <span className="st-thinking" aria-hidden="true">
                <i>?</i>
              </span>
              <h2>卧底正在最后猜题</h2>
              <p>谜底，马上揭晓。</p>
            </div>
          ))}
      </section>
      {mode === "fa" && v.phase === "RESULT" && resultOpen && (
        <FakeResult
          v={v}
          me={me}
          host={host}
          onRestart={() => act({ type: "RESTART" })}
          onClose={() => setResultOpen(false)}
        />
      )}
      {mode === "tp" && v.phase === "RESULT" && resultOpen && (
        <TaleResult
          v={v}
          host={host}
          onRestart={() => act({ type: "RESTART" })}
          onOpen={(i) => {
            setBook(i);
            setPage(0);
            setResultOpen(false);
          }}
          onClose={() => setResultOpen(false)}
          exportAlbum={p.exportAlbum}
        />
      )}
      {banner && (
        <div
          className={"st-banner " + (banner.tone ? "is-" + banner.tone : "")}
          key={banner.key}
          aria-hidden="true"
        >
          <b>{banner.text}</b>
          {banner.sub && <span>{banner.sub}</span>}
        </div>
      )}
      {focused && (
        <button
          className="st-exit-focus"
          onClick={() => {
            feel("tap");
            setFocused(false);
          }}
        >
          返回画室 ↙
        </button>
      )}
      <div className="st-bottom-status">
        <span className="st-rotation-tip">横放手机，画布更大</span>
        {!connected && (
          <span className="st-offline">断线重连中 · 私人草稿保存在本机</span>
        )}
        {connected && p.busy && <span>正在确认…</span>}
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
            <header>
              <h2>{title}</h2>
              <p>
                房间 <b>{p.code}</b>
              </p>
            </header>
            <button
              onClick={() => {
                p.invite();
                setMenu(false);
              }}
            >
              复制邀请链接 <i aria-hidden="true">↗</i>
            </button>
            <button
              onClick={() => {
                feel("tap");
                setRules(!rules);
              }}
            >
              怎么玩 <i aria-hidden="true">{rules ? "−" : "+"}</i>
            </button>
            {rules && (
              <p className="st-menu-rules">
                {mode === "fa"
                  ? "选主题 → 每人每圈画一笔，共两圈 → 讨论投票 → 卧底被抓可猜题翻盘。平票未抓到。线上自动主持改编。"
                  : "选主题 → 每人自己写题 → 同时画画与猜测 → 逐本揭晓先公开判断是否传成功，再公开投MVP／坑货。主题仅供参考，提交后锁定，掉线到时按未完成或弃权处理。"}
              </p>
            )}
            <button
              className="st-switch"
              aria-pressed={sound}
              onClick={() => {
                const next = !sound;
                setSound(next);
                setSoundOn(next);
                if (next) feel("select");
              }}
            >
              {"音效 " + (sound ? "开启" : "关闭")}
              <i aria-hidden="true" />
            </button>
            <button onClick={() => void fullscreen()}>
              全屏画室 <i aria-hidden="true">⛶</i>
            </button>
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
            <button className="st-menu-close" onClick={() => setMenu(false)}>
              返回画室 ×
            </button>
          </nav>
        </div>
      )}
    </main>
  );
}

function Waiting(p: {
  stamp?: string;
  title: string;
  done: number;
  all: number;
}) {
  return (
    <div className="st-waiting">
      {p.stamp && <b className="st-stamp">{p.stamp}</b>}
      <h2>{p.title}</h2>
      <Progress done={p.done} all={p.all} />
    </div>
  );
}

function Progress(p: { done: number; all: number; busy?: boolean }) {
  return (
    <span className="st-completion">
      <span className="st-dots" aria-hidden="true">
        {Array.from({ length: p.all }, (_, i) => (
          <i key={i} className={i < p.done ? "is-done" : ""} />
        ))}
      </span>
      {p.done}/{p.all} 人完成
      {p.busy ? " · 保存中" : ""}
    </span>
  );
}

function bannerFor(
  v: GameView,
  mode: Mode,
  me: string | null,
): Omit<Banner, "key"> | null {
  if (mode === "fa") {
    if (v.phase === "CATEGORY")
      return { text: "选个主题", sub: "最高票决定这局画什么" };
    if (v.phase === "DRAW") {
      if (v.turn === 0)
        return v.role === "fake"
          ? {
              text: "你是伪画家",
              sub: "看别人怎么画，假装你知道",
              tone: "fake",
            }
          : { text: "你是真画家", sub: "题目藏在左下角题牌里" };
      if (v.currentId === me)
        return { text: "轮到你了", sub: "一笔画完，抬笔即提交", tone: "me" };
      return null;
    }
    if (v.phase === "DISCUSS")
      return { text: "讨论时间", sub: "谁在假装知道？" };
    if (v.phase === "VOTE") return { text: "投票", sub: "找出伪画家" };
    if (v.phase === "OBSERVE")
      return v.role === "fake"
        ? { text: "你被抓到了", sub: "还有翻盘机会：猜中题目", tone: "fake" }
        : { text: "抓到了！", sub: "卧底还能猜题翻盘" };
    if (v.phase === "GUESS") return null;
    return null;
  }
  if (v.phase === "THEME_RESULT")
    return { text: "本局主题：" + (v.theme ?? "自定义"), tone: "me" };
  if (v.phase === "THEME")
    return { text: "选个主题", sub: "每个人写一句，再让脑洞接力" };
  if (v.phase === "PROMPT") return { text: "写一个题目", sub: "越离谱越好玩" };
  if (v.phase === "TASK")
    return v.task?.kind === "drawing"
      ? { text: "开始画！", sub: v.task.source.text, tone: "me" }
      : { text: "猜猜看", sub: "朋友画的是什么？", tone: "me" };
  if (v.phase === "REVEAL")
    return { text: "揭晓时刻", sub: "一页一页翻开传话本" };
  return null;
}
