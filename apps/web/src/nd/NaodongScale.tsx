import React, { useEffect, useRef, useState } from "react";
import type {
  NDAction,
  NDSnapshot,
} from "../../../../packages/shared/src/nd-protocol.ts";
import type { NDQuestion } from "../../../../packages/naodong-scale/src/index.ts";
import { ActionDock, CountdownRing, PhaseBanner } from "../dm/Polish.tsx";
import { feel, soundOn, setSoundOn } from "../drawing/feel.ts";
import { revealTimeline } from "../xb/feel.ts";
import { useNDRoom } from "./nd-net.ts";
import {
  moveSeat,
  swapSeats,
  recapRounds,
  entertainmentTitles,
} from "./ui-model.ts";
import "@fontsource/zcool-kuaile/400.css";
import "./nd.css";
type View = NonNullable<NDSnapshot["view"]>;
const titles: Record<View["phase"], string> = {
  CHOOSE_TOPIC: "挑一道题",
  ANSWER: "写答题卡",
  ORDER: "队长排个序",
  REVEAL: "答案揭晓",
  EXPERT: "猜中秘密数字",
  CAPTAIN_GUESS: "一起猜队长",
  ROUND_END: "这一轮，接住了",
  FINISHED: "全队大结算",
};
const label = (v: View, n: number) =>
  `${n + 1}号 ${v.players[n]?.name ?? "队友"}`;
function Question({
  q,
  heading = "本轮题目",
  badge,
}: {
  q: NDQuestion;
  heading?: string;
  badge?: React.ReactNode;
}) {
  return (
    <article className="nd-question">
      <small>
        {heading} {q.spicy ? "· 放开聊" : ""}
      </small>
      {badge}
      <h2>{q.text}</h2>
      <div className="nd-ends">
        <span>
          <b>1</b>
          {q.low}
        </span>
        <span>
          <b>10</b>
          {q.high}
        </span>
      </div>
      <div className="nd-scale" aria-label="秘密数字范围 1 到 10">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
    </article>
  );
}
function ResultGauge({ success }: { success: boolean }) {
  return (
    <svg
      className={`nd-result-gauge ${success ? "success" : "empty"}`}
      viewBox="0 0 164 100"
      role="img"
      aria-label={success ? "全队守住的量表" : "归零的量表"}
    >
      <path
        className="gauge-track"
        d="M22 82a60 60 0 0 1 120 0"
        pathLength="10"
      />
      <path
        className="gauge-value"
        d="M22 82a60 60 0 0 1 120 0"
        pathLength="10"
      />
      <path
        className="gauge-needle"
        d={success ? "M82 82l43-37" : "M82 82L32 66"}
      />
      <circle cx="82" cy="82" r="7" />
      <path className="gauge-baseline" d="M16 96h132" />
    </svg>
  );
}
function Crown() {
  return (
    <svg className="nd-crown" viewBox="0 0 24 18" aria-hidden="true">
      <path d="m2 3 5 4 5-6 5 6 5-4-3 12H5Z" />
      <path d="M5 17h14" />
    </svg>
  );
}
function TopicSummary({ q }: { q: NDQuestion }) {
  return (
    <div className="nd-topic-summary">
      <strong>{q.text}</strong>
      <span>
        1 = {q.low} <i>／</i> 10 = {q.high}
      </span>
    </div>
  );
}
function Review({ v }: { v: View }) {
  return (
    <div className="nd-review">
      {recapRounds(v.history).map((r) => (
        <section key={r.round}>
          <h3>
            第 {r.round} 轮 · {r.mistakes} 次失误
          </h3>
          <div className="nd-review-row">
            {r.reveals.map((e) => (
              <span key={e.id} className={e.correct ? "correct" : "wrong"}>
                <b>{e.number}</b>
                <span>
                  <strong>{e.answer ?? ""}</strong>
                  <small>{label(v, e.seat!)}</small>
                </span>
                <strong>{e.correct ? "✓" : "✗"}</strong>
              </span>
            ))}
          </div>
          {r.reveals.length === 0 && <p>本轮还没有翻开数字</p>}
        </section>
      ))}
    </div>
  );
}
let lastTickAt = -Infinity;
export function NaodongScale() {
  const net = useNDRoom(),
    s = net.snapshot,
    v = s?.view,
    me = s?.mySeat ?? null;
  const [name, setName] = useState(""),
    [room, setRoom] = useState(
      new URLSearchParams(location.search).get("room") ?? "",
    ),
    [menu, setMenu] = useState<"menu" | "rules" | "review" | "players" | null>(
      null,
    ),
    [sound, setSound] = useState(soundOn),
    [secret, setSecret] = useState(false),
    [hiddenNumber, setHiddenNumber] = useState(false),
    [draft, setDraft] = useState(""),
    [draftLoaded, setDraftLoaded] = useState(""),
    [keyboard, setKeyboard] = useState(false),
    [viewport, setViewport] = useState({ height: window.innerHeight, top: 0 }),
    [celebrating, setCelebrating] = useState(false),
    [order, setOrder] = useState<number[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [topic, setTopic] = useState<string | null>(null),
    [auto, setAuto] = useState(false),
    [skipped, setSkipped] = useState(false),
    [guess, setGuess] = useState(1),
    [target, setTarget] = useState<number | null>(null),
    [now, setNow] = useState(Date.now()),
    [banner, setBanner] = useState<{
      key: string;
      title: string;
      sub?: string;
      tone: string;
    } | null>(null),
    [notice, setNotice] = useState("");
  const dragging = useRef<number | null>(null),
    origin = useRef<{ x: number; y: number } | null>(null),
    dragged = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    revealStart = useRef(0),
    lastTick = useRef(""),
    queuedOrder = useRef<number[] | null>(null),
    sendingOrder = useRef(false),
    latestOrder = useRef<number[] | null>(null),
    idleViewportHeight = useRef(window.innerHeight);
  const captain = !!v && me === v.captain,
    host = !!s && s.players.find((p) => p.seat === me)?.id === s.hostId;
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const send = (action: NDAction) => net.act(action);
  useEffect(() => {
    document.title = "脑洞量表 · Top Ten";
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (menu) {
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [menu]);
  useEffect(() => {
    if (!v) return;
    setTopic(null);
    setAuto(false);
    setSkipped(false);
    setSelected(null);
    setTarget(null);
    setOrder(v.players.map((_, i) => i).filter((i) => i !== v.captain));
  }, [v?.round]);
  useEffect(() => {
    if (!v) return;
    setBanner({
      key: `${v.round}:${v.phase}`,
      title: titles[v.phase],
      sub: `第 ${v.round} / 5 轮 · 队长 ${label(v, v.captain)}`,
      tone: "nd",
    });
    feel("turn");
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [v?.round, v?.phase]);
  useEffect(() => {
    setHiddenNumber(false);
  }, [v?.round, v?.phase]);
  useEffect(() => {
    if (v?.phase !== "FINISHED") return;
    setCelebrating(true);
    const t = setTimeout(() => setCelebrating(false), 1500);
    return () => clearTimeout(t);
  }, [v?.phase]);
  useEffect(() => {
    if (!v?.revealed.length) return;
    feel(v.revealed.at(-1)?.correct ? "stamp" : "lose");
  }, [v?.round, v?.revealed.length]);
  useEffect(() => {
    if (v?.phase === "FINISHED") feel(v.result?.success ? "win" : "lose");
  }, [v?.phase]);
  // Reuse XB's 1.2s warmup / 0.8s rhythm. Each next card is authorized by the server.
  useEffect(() => {
    if (
      !auto ||
      !captain ||
      v?.phase !== "REVEAL" ||
      net.pending ||
      !net.online
    )
      return;
    const warmup = revealTimeline(
      Date.now() - revealStart.current,
      v.order.length,
    ).warmup;
    const t = setTimeout(
      () => void send({ type: "REVEAL_NEXT" }),
      skipped || reduced ? 40 : warmup ? 1200 : 800,
    );
    return () => clearTimeout(t);
  }, [
    auto,
    captain,
    v?.phase,
    v?.revealed.length,
    net.pending,
    net.online,
    skipped,
  ]);
  useEffect(() => {
    setTarget(null);
  }, [v?.revealed.length, v?.round]);
  const [errorPulse, setErrorPulse] = useState(0);
  useEffect(() => {
    if (net.error) {
      setErrorPulse((n) => n + 1);
      feel("lose");
    }
  }, [net.error]);
  const members = v
    ? v.players.map((_, i) => i).filter((i) => i !== v.captain)
    : [];
  const draftKey =
    s?.code && me !== null && v
      ? `nd:draft:${s.code}:${s.players.find((p) => p.seat === me)?.id}:${v.round}:${v.topic?.id ?? ""}`
      : "";
  const draftText = draftLoaded === draftKey ? draft : "";
  const draftLength = Array.from(draftText.trim()).length;
  const submitted = !!v && me !== null && v.players[me]?.ready;
  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem(draftKey) ?? "";
    } catch {}
    setDraft(saved);
    setDraftLoaded(draftKey);
  }, [draftKey]);
  const editDraft = (text: string) => {
    setDraft(text);
    try {
      localStorage.setItem(draftKey, text);
    } catch {}
  };
  useEffect(() => {
    const vv = window.visualViewport;
    const resize = () => {
      const focused = document.activeElement?.tagName === "TEXTAREA";
      setViewport({
        height: vv?.height ?? innerHeight,
        top: vv?.offsetTop ?? 0,
      });
      setKeyboard(focused && (vv?.height ?? innerHeight) < innerHeight - 120);
    };
    vv?.addEventListener("resize", resize);
    vv?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    document.addEventListener("focusin", resize);
    document.addEventListener("focusout", resize);
    resize();
    return () => {
      vv?.removeEventListener("resize", resize);
      vv?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      document.removeEventListener("focusin", resize);
      document.removeEventListener("focusout", resize);
    };
  }, []);
  useEffect(() => {
    latestOrder.current = v?.order ? [...v.order] : null;
    // 自己正在排序、还有没发完的顺序时，不被服务器的旧顺序覆盖。
    if (v?.order.length && !sendingOrder.current) setOrder([...v.order]);
  }, [v?.order.join(","), v?.phase]);
  const left = s?.deadline
    ? Math.max(0, Math.ceil((s.deadline - now - net.offset.current) / 1000))
    : null;
  useEffect(() => {
    // 每个倒计时只在秒数第一次下降到某个值时响一声；时钟校准导致秒数回跳时不重复响。
    const key = `${s?.code}:${v?.round}:${v?.phase}`;
    const [prevKey, prevLeft] = (lastTick.current ?? "").split("|");
    const fresh = prevKey !== key;
    if (left === null || left <= 0 || left > 10) return;
    if (!fresh && Number(prevLeft) <= left) return;
    lastTick.current = `${key}|${left}`;
    const t = performance.now();
    if (sound && t - lastTickAt > 600) {
      lastTickAt = t;
      feel("tick", { vibration: false });
    }
  }, [left, sound, s?.deadline, v?.round, v?.phase]);
  let primary = "等待队友…",
    disabled = true,
    action: () => void = () => {};
  if (s && !v && me !== null) {
    const ready = !!s.players.find((p) => p.seat === me)?.ready;
    primary =
      host && ready
        ? `开始 · ${s.players.length}/${s.settings.count} 人`
        : ready
          ? "已准备，等待房主"
          : "准备好了";
    disabled =
      host && ready
        ? s.players.length !== s.settings.count ||
          s.players.some((p) => !p.ready)
        : ready;
    action = () =>
      void send(host && ready ? { type: "START" } : { type: "READY" });
  }
  if (v) {
    switch (v.phase) {
      case "CHOOSE_TOPIC":
        primary = captain
          ? topic
            ? `就选题目 ${v.choices.findIndex((q) => q.id === topic) === 0 ? "A" : "B"}`
            : "先选一道题"
          : `等待 ${label(v, v.captain)} 选题`;
        disabled = !captain || !topic;
        action = () => void send({ type: "CHOOSE_TOPIC", topicId: topic! });
        break;
      case "ANSWER":
        primary = captain
          ? "等大家写卡"
          : submitted
            ? "已提交 · 撤回修改"
            : "提交答题卡";
        disabled =
          captain || (!submitted && (draftLength < 1 || draftLength > 30));
        action = () =>
          void send(
            submitted
              ? { type: "WITHDRAW_ANSWER" }
              : { type: "SUBMIT_ANSWER", text: draftText.trim() },
          );
        break;
      case "ORDER":
        primary = captain
          ? "确认排序，准备揭晓"
          : `等待 ${label(v, v.captain)} 排序`;
        disabled = !captain;
        action = () => void send({ type: "LOCK_ORDER", order: v.order });
        break;
      case "REVEAL":
        primary = captain
          ? auto
            ? "正在逐个翻牌…"
            : "开始揭晓"
          : `等待 ${label(v, v.captain)} 揭晓`;
        disabled = !captain || auto;
        action = () => {
          revealStart.current = Date.now();
          feel("stamp");
          setAuto(true);
        };
        break;
      case "EXPERT":
        primary = captain
          ? target === null
            ? "先选一位队友"
            : `确认：${target + 1}号 猜 ${guess}`
          : `等待 ${label(v, v.captain)} 猜数字`;
        disabled = !captain || target === null;
        action = () =>
          void send({ type: "GUESS_EXACT", target: target!, guess });
        break;
      case "CAPTAIN_GUESS":
        primary = captain ? "等待队友共同猜数字" : `共同确认：${guess}`;
        disabled = captain || me === null;
        action = () => void send({ type: "GUESS_CAPTAIN", guess });
        break;
      case "ROUND_END":
        primary = captain ? "下一轮" : `等待 ${label(v, v.captain)} 开启下一轮`;
        disabled = !captain;
        action = () => void send({ type: "NEXT_ROUND" });
        break;
      case "FINISHED":
        primary = host ? "再来一局" : "等待房主再来一局";
        disabled = !host;
        action = () => void send({ type: "REMATCH" });
        break;
    }
  }
  const persistOrder = (next: number[]) => {
    // 先在本地立刻换位，手感不等网络；服务器拒绝时退回服务器上的顺序。
    // 连续快速换位时只排队发送最新顺序，不丢操作。
    setOrder(next);
    queuedOrder.current = next;
    if (sendingOrder.current) return;
    sendingOrder.current = true;
    void (async () => {
      try {
        while (queuedOrder.current) {
          const o = queuedOrder.current;
          queuedOrder.current = null;
          let ok = await send({ type: "UPDATE_ORDER", order: o });
          for (let i = 0; !ok && !queuedOrder.current && i < 5; i++) {
            await new Promise((r) => setTimeout(r, 100));
            ok = await send({ type: "UPDATE_ORDER", order: o });
          }
          if (!ok && !queuedOrder.current && latestOrder.current)
            setOrder([...latestOrder.current]);
        }
      } finally {
        sendingOrder.current = false;
      }
    })();
  };
  const reorder = (seat: number) => {
    if (selected === null) setSelected(seat);
    else {
      persistOrder(swapSeats(order, selected, seat));
      setSelected(null);
      feel("select");
    }
  };
  const pointerEnd = (e: React.PointerEvent) => {
    if (dragging.current !== null && dragged.current) {
      const hit = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-order-seat]");
      if (hit) {
        persistOrder(
          moveSeat(order, dragging.current, Number(hit.dataset.orderSeat)),
        );
        feel("select");
      }
    }
    dragging.current = null;
    origin.current = null;
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        location.origin + "/?game=nd&room=" + s!.code,
      );
      setNotice("邀请链接已复制");
    } catch {
      setNotice("请复制地址栏链接邀请朋友");
    }
  };
  return (
    <main
      className={`nd-world nd-answer-cards ${keyboard ? "nd-keyboard" : ""} ${skipped ? "nd-skip" : ""}`}
      style={
        {
          "--nd-viewport-height": `${viewport.height}px`,
          "--nd-viewport-top": `${viewport.top}px`,
        } as React.CSSProperties
      }
      onClickCapture={() => feel("tap")}
    >
      <div className="nd-shell">
        <header className="nd-top">
          <a href="/?game=nd" aria-label="脑洞量表首页">
            脑洞量表<small>TOP TEN</small>
          </a>
          <span>
            {s?.code ? `房间 ${s.code}` : "一起动脑"}
            <small>
              {v
                ? `第 ${v.round} / 5 轮 · 失误 ${v.poops}`
                : "4–9 人 · 合作游戏"}
            </small>
          </span>
          {left !== null ? (
            <div
              className={`nd-timer ${left <= 10 ? "urgent" : ""}`}
              aria-label={`剩余 ${left} 秒`}
            >
              <CountdownRing left={left} total={s?.settings.seconds ?? 60} />
              <b>{left}</b>
            </div>
          ) : (
            <span className="nd-untimed">不限时</span>
          )}
          <button
            className="nd-icon"
            aria-label="菜单"
            onClick={() => setMenu("menu")}
          >
            ☰
          </button>
        </header>
        {!net.online && (
          <div className="nd-disconnected" role="status">
            重连中… 已提交内容会保留
          </div>
        )}
        {s?.expired && (
          <div className="nd-reminder">时间到了，仍可继续操作</div>
        )}
        <PhaseBanner banner={banner} />
        {net.error && (
          <div key={errorPulse} className="nd-error" role="alert">
            {net.error}
          </div>
        )}
        {notice && (
          <button className="nd-notice" onClick={() => setNotice("")}>
            {notice} ✕
          </button>
        )}
        {!s || me === null ? (
          <section className="nd-entry">
            <div className="nd-brand">
              <img
                src="/assets/naodong-scale/box.webp"
                alt="Top Ten 官方包装"
              />
              <h1>脑洞量表</h1>
              <p>
                一个数字，一张答题卡。
                <br />
                你们能把彼此排明白吗？
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void (s
                  ? net.claim(name)
                  : room
                    ? net.join(room, name)
                    : net.create(name));
              }}
            >
              <label>
                你的昵称
                <input
                  value={name}
                  maxLength={10}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="朋友怎么称呼你"
                  required
                />
              </label>
              {!s && (
                <label>
                  房间号（加入朋友时填写）
                  <input
                    value={room}
                    maxLength={4}
                    onChange={(e) => setRoom(e.target.value.toUpperCase())}
                    placeholder="留空创建新房间"
                  />
                </label>
              )}
              <button
                className="nd-primary"
                disabled={net.pending || !net.online}
              >
                {net.pending
                  ? "连接中…"
                  : s
                    ? "加入这桌"
                    : room
                      ? "加入房间"
                      : "创建房间"}
              </button>
              <a href="/">返回游戏大厅</a>
            </form>
          </section>
        ) : (
          <>
            <div className="nd-layout">
              <section
                className={`nd-stage nd-phase-${v?.phase ?? "LOBBY"}`}
                aria-label="当前舞台"
              >
                {!v ? (
                  <>
                    <div className="nd-lobby-brand">
                      <img
                        src="/assets/naodong-scale/box.webp"
                        alt="Top Ten 官方包装"
                      />
                      <div>
                        <small>TOP TEN</small>
                        <h1>脑洞量表</h1>
                        <p>
                          {s.players.length >= s.settings.count
                            ? "人齐了，等房主开始"
                            : `还差 ${s.settings.count - s.players.length} 人`}
                        </p>
                      </div>
                    </div>
                    <div className="nd-quick">
                      <p>队长来猜，其他人按秘密数字写答题卡。</p>
                      <p>队长把所有回答从小到大排序。</p>
                      <p>一起闯过 5 轮，保住全队的独角兽。</p>
                    </div>
                    {host ? (
                      <fieldset className="nd-settings" disabled={net.pending}>
                        <legend>房主设置</legend>
                        <label>
                          人数
                          <select
                            aria-label="人数"
                            value={s.settings.count}
                            onChange={(e) =>
                              void send({
                                type: "SET_SETTINGS",
                                count: Number(e.target.value),
                                ...(Number(e.target.value) === 9
                                  ? { expert: false }
                                  : {}),
                              })
                            }
                          >
                            {[4, 5, 6, 7, 8, 9].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          计时
                          <select
                            aria-label="计时"
                            value={s.settings.seconds}
                            onChange={(e) =>
                              void send({
                                type: "SET_SETTINGS",
                                seconds: Number(e.target.value) as 0 | 60 | 120,
                              })
                            }
                          >
                            <option value={0}>不限时</option>
                            <option value={60}>60 秒提醒</option>
                            <option value={120}>120 秒提醒</option>
                          </select>
                        </label>
                        <label>
                          尺度
                          <select
                            aria-label="尺度"
                            value={s.settings.scale}
                            onChange={(e) =>
                              void send({
                                type: "SET_SETTINGS",
                                scale: e.target.value as "open" | "normal",
                              })
                            }
                          >
                            <option value="open">放开</option>
                            <option value="normal">普通</option>
                          </select>
                        </label>
                        <label>
                          玩法
                          <select
                            aria-label="玩法"
                            value={String(s.settings.expert)}
                            onChange={(e) =>
                              void send({
                                type: "SET_SETTINGS",
                                expert: e.target.value === "true",
                              })
                            }
                          >
                            <option value="false">基础</option>
                            {s.settings.count < 9 && (
                              <option value="true">专家变体</option>
                            )}
                          </select>
                        </label>
                      </fieldset>
                    ) : (
                      <p className="nd-wait">
                        {s.settings.scale === "open" ? "放开聊" : "普通尺度"} ·{" "}
                        {s.settings.expert ? "专家变体" : "基础玩法"} ·{" "}
                        {s.settings.seconds
                          ? s.settings.seconds + " 秒提醒"
                          : "不限时"}
                      </p>
                    )}
                    <button
                      className="nd-secondary"
                      onClick={() => void copy()}
                    >
                      复制邀请链接
                    </button>
                  </>
                ) : (
                  <>
                    {v.phase !== "FINISHED" && (
                      <div className="nd-phase-line">
                        <span>{titles[v.phase]}</span>
                        {v.myNumber !== null && v.phase !== "ANSWER" && (
                          <button
                            className="nd-peek"
                            onClick={() => setSecret(true)}
                          >
                            我的数字
                          </button>
                        )}
                        <span>队长 · {v.players[v.captain].name}</span>
                      </div>
                    )}
                    {v.phase === "CHOOSE_TOPIC" ? (
                      captain ? (
                        <div className="nd-choices">
                          {v.choices.map((q, index) => (
                            <button
                              key={q.id}
                              className={topic === q.id ? "selected" : ""}
                              aria-pressed={topic === q.id}
                              onClick={() => setTopic(q.id)}
                            >
                              <Question
                                q={q}
                                heading={`题目 ${index === 0 ? "A" : "B"}${topic === q.id ? " ✓" : ""}`}
                              />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="nd-wait-art">
                          <span>?</span>
                          <h1>队长正在挑题</h1>
                          <p>这轮会聊点什么呢？</p>
                        </div>
                      )
                    ) : v.phase === "FINISHED" ? (
                      <div
                        className={`nd-finale ${celebrating ? (v.result?.success ? "celebrate" : "sink") : ""}`}
                      >
                        {celebrating && !reduced && v.result?.success && (
                          <div className="nd-confetti" aria-hidden="true">
                            {Array.from({ length: 24 }, (_, i) => (
                              <i
                                key={i}
                                style={{ "--i": i } as React.CSSProperties}
                              />
                            ))}
                          </div>
                        )}
                        {celebrating && !reduced && (
                          <button
                            className="nd-skip-finale"
                            onClick={() => setCelebrating(false)}
                          >
                            跳过动画
                          </button>
                        )}
                        <ResultGauge success={!!v.result?.success} />
                        <small>第 {v.round} / 5 轮</small>
                        <h1>{v.result?.success ? "全队成功" : "全队失败"}</h1>
                        <p>
                          留下 {v.unicorns} 枚独角兽 · {v.poops} 次失误
                        </p>
                        <div className="nd-titles">
                          {entertainmentTitles(v.history).map((t) => (
                            <p key={t.seat}>
                              <b>
                                {t.title} · {v.players[t.seat].name}
                              </b>
                              <small>{t.detail}</small>
                            </p>
                          ))}
                        </div>
                        <button
                          className="nd-secondary"
                          onClick={() => setMenu("review")}
                        >
                          查看本局回顾
                        </button>
                      </div>
                    ) : (
                      <>
                        {v.topic && <TopicSummary q={v.topic} />}
                        {v.phase === "ANSWER" && (
                          <>
                            {captain ? (
                              <div className="nd-wait-cards">
                                <h1>等大家写卡</h1>
                                <p>大家交齐后，答题卡会一起亮相。</p>
                                <div className="nd-wait-card-grid">
                                  {v.players.map((p, n) =>
                                    n === v.captain ? null : (
                                      <div key={n}>
                                        <b>{p.ready ? "✓" : "…"}</b>
                                        <span>{p.name}</span>
                                        <small>
                                          {p.ready ? "已提交" : "正在写卡"}
                                        </small>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            ) : (
                              <article
                                className={`nd-writing-card ${submitted ? "submitted" : ""}`}
                              >
                                <small>
                                  {submitted ? "已提交答题卡" : "写答题卡"}
                                </small>
                                {v.myNumber !== null && (
                                  <button
                                    className="nd-number-badge"
                                    aria-label={
                                      hiddenNumber
                                        ? "显示我的数字"
                                        : "遮住我的数字"
                                    }
                                    onClick={() =>
                                      setHiddenNumber(!hiddenNumber)
                                    }
                                  >
                                    <small>我的数字</small>
                                    <b>{hiddenNumber ? "●" : v.myNumber}</b>
                                  </button>
                                )}
                                {submitted ? (
                                  <div className="nd-submitted-answer">
                                    {v.answers[me!]}
                                  </div>
                                ) : (
                                  <textarea
                                    aria-label="答题卡回答"
                                    rows={3}
                                    value={draftText}
                                    placeholder="写下你的回答…"
                                    onChange={(e) => editDraft(e.target.value)}
                                    aria-invalid={draftLength > 30}
                                  />
                                )}
                                <div className="nd-writing-meta">
                                  <span role="status">
                                    {draftLength > 30
                                      ? "最多 30 字"
                                      : submitted
                                        ? "排序前可以撤回修改"
                                        : "一句话，别写出秘密数字"}
                                  </span>
                                  <span>
                                    {
                                      Array.from(
                                        (submitted
                                          ? (v.answers[me!] ?? "")
                                          : draftText
                                        ).trim(),
                                      ).length
                                    }
                                    /30
                                  </span>
                                </div>
                              </article>
                            )}
                            <div className="nd-answer-progress">
                              <p>
                                已提交{" "}
                                {
                                  members.filter(
                                    (n) =>
                                      n !== v.captain && v.players[n].ready,
                                  ).length
                                }{" "}
                                / {v.players.length - 1} 人
                              </p>
                              <div aria-label="答题卡提交进度">
                                {v.players.map((p, n) =>
                                  n === v.captain ? null : (
                                    <span
                                      key={n}
                                      className={p.ready ? "locked" : ""}
                                      aria-label={`${p.name} ${p.ready ? "已提交" : "未提交"}`}
                                    />
                                  ),
                                )}
                              </div>
                            </div>
                          </>
                        )}
                        {v.phase === "ORDER" && (
                          <div className="nd-sort">
                            <p>
                              {captain
                                ? "从 1 到 10 排序 · 拖动，或点两个人交换"
                                : `队长 ${v.players[v.captain].name} 正在排序…`}
                            </p>
                            <div className="nd-order" aria-label="队长排序">
                              {order.map((n, i) => (
                                <button
                                  key={n}
                                  data-order-seat={n}
                                  disabled={
                                    !captain || net.pending || !net.online
                                  }
                                  className={`${selected === n ? "selected" : ""} ${captain ? "" : "readonly"}`}
                                  aria-pressed={selected === n}
                                  onClick={() => {
                                    if (!dragged.current) reorder(n);
                                    dragged.current = false;
                                  }}
                                  onPointerDown={(e) => {
                                    if (
                                      e.pointerType === "touch" &&
                                      !(e.target as Element).closest(
                                        "[data-nd-drag-handle]",
                                      )
                                    )
                                      return;
                                    dragging.current = n;
                                    origin.current = {
                                      x: e.clientX,
                                      y: e.clientY,
                                    };
                                    dragged.current = false;
                                    e.currentTarget.setPointerCapture(
                                      e.pointerId,
                                    );
                                  }}
                                  onPointerMove={(e) => {
                                    if (
                                      origin.current &&
                                      Math.hypot(
                                        e.clientX - origin.current.x,
                                        e.clientY - origin.current.y,
                                      ) > 8
                                    ) {
                                      dragged.current = true;
                                      e.currentTarget.classList.add("dragging");
                                    }
                                  }}
                                  onPointerUp={(e) => {
                                    e.currentTarget.classList.remove(
                                      "dragging",
                                    );
                                    pointerEnd(e);
                                  }}
                                  onPointerCancel={(e) => {
                                    e.currentTarget.classList.remove(
                                      "dragging",
                                    );
                                    dragging.current = null;
                                    origin.current = null;
                                  }}
                                >
                                  <b>{i + 1}</b>
                                  <span>
                                    <strong className="nd-order-answer">
                                      {v.answers[n] ?? "（没写）"}
                                    </strong>
                                    <small>{v.players[n].name}</small>
                                  </span>
                                  <i data-nd-drag-handle aria-label="拖动排序">
                                    ≡
                                  </i>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {(v.phase === "REVEAL" || v.phase === "ROUND_END") && (
                          <div className="nd-reveal">
                            <p className="nd-reveal-intro">
                              按队长的顺序，逐张翻开答题卡
                            </p>
                            <div className="nd-flip-row">
                              {(v.order.length ? v.order : members).map(
                                (n, i) => {
                                  const r = v.revealed.find(
                                    (r) => r.seat === n,
                                  );
                                  return (
                                    <div
                                      key={n}
                                      className={`nd-flip ${r ? (r.correct ? "correct" : "wrong") : "hidden"}`}
                                      data-reveal-seat={n}
                                    >
                                      <div
                                        className={`nd-flip-inner ${r ? "turned" : ""}`}
                                      >
                                        <div className="nd-card-front">
                                          <small>{i + 1}</small>
                                          <p>{v.answers[n] ?? "（没写）"}</p>
                                          <span>{v.players[n].name}</span>
                                        </div>
                                        <div className="nd-card-back">
                                          <b>{r?.number ?? "?"}</b>
                                          <p>{v.answers[n] ?? "（没写）"}</p>
                                          <span>{v.players[n].name}</span>
                                          <strong>
                                            {r
                                              ? r.correct
                                                ? "✓ 排对"
                                                : "✗ 失误"
                                              : "待揭晓"}
                                          </strong>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                            <p className="nd-reveal-progress">
                              已翻开 {v.revealed.length} / {members.length} 张
                            </p>
                            {v.phase === "ROUND_END" && (
                              <p className="nd-next">
                                下一位队长：
                                {label(v, (v.captain + 1) % v.players.length)}
                              </p>
                            )}
                          </div>
                        )}
                        {(v.phase === "EXPERT" ||
                          v.phase === "CAPTAIN_GUESS") && (
                          <div className="nd-expert">
                            <p>
                              {v.phase === "EXPERT"
                                ? "队长选择一位队友，猜他的确切数字"
                                : "队友商量，选一人提交共同猜测"}
                            </p>
                            {v.phase === "EXPERT" && captain && (
                              <div className="nd-targets">
                                {members
                                  .filter(
                                    (n) =>
                                      n !== v.captain &&
                                      !v.revealed.some((r) => r.seat === n),
                                  )
                                  .map((n) => (
                                    <button
                                      key={n}
                                      data-target-seat={n}
                                      aria-pressed={target === n}
                                      className={target === n ? "selected" : ""}
                                      onClick={() => setTarget(n)}
                                    >
                                      <span>{v.answers[n] ?? "（没写）"}</span>
                                      <small>{label(v, n)}</small>
                                    </button>
                                  ))}
                              </div>
                            )}
                            {((captain && v.phase === "EXPERT") ||
                              (!captain && v.phase === "CAPTAIN_GUESS")) && (
                              <div className="nd-number-grid">
                                {Array.from({ length: 10 }, (_, i) => (
                                  <button
                                    key={i}
                                    aria-pressed={guess === i + 1}
                                    className={
                                      guess === i + 1 ? "selected" : ""
                                    }
                                    onClick={() => setGuess(i + 1)}
                                  >
                                    {i + 1}
                                  </button>
                                ))}
                              </div>
                            )}
                            <p>
                              {v.revealed
                                .map(
                                  (r) =>
                                    `${label(v, r.seat)}：${r.number} ${r.correct ? "✓" : "✗"}`,
                                )
                                .join(" · ")}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                <div data-nd-stage-end aria-hidden="true" />
              </section>
              <aside
                className={`nd-sidebar ${s.players.length === 9 ? "nd-nine" : ""}`}
              >
                <div className="nd-team">
                  <span>{v ? "全队独角兽" : "全队进度"}</span>
                  <b>{v ? `${v.unicorns} / ${v.tokenTotal}` : "一起赢"}</b>
                  <small>
                    {v ? `第 ${v.round}/5 轮 · 失误 ${v.poops}` : "五轮一起赢"}
                  </small>
                </div>
                <div
                  className="nd-seats"
                  aria-label="玩家座位，横向滑动查看更多"
                >
                  {s.players.map((p) => {
                    const isCaptain =
                        p.seat === (v?.captain ?? s.settings.firstCaptain),
                      ready = v ? v.players[p.seat]?.ready : p.ready;
                    const state = !p.connected
                      ? "断线"
                      : v?.phase === "FINISHED"
                        ? "已结束"
                        : ready
                          ? "已提交"
                          : v?.phase === "ANSWER"
                            ? isCaptain
                              ? "等大家写卡"
                              : "正在写卡"
                            : "等待中";
                    return (
                      <button
                        key={p.id}
                        className={`nd-seat ${p.seat === me ? "mine" : ""}`}
                        aria-label={`查看完整名单，${p.seat + 1}号 ${p.name}${p.seat === me ? "，我" : ""}${isCaptain ? "，队长" : ""}，${state}`}
                        onClick={() => setMenu("players")}
                      >
                        <span className="nd-avatar">
                          {p.seat + 1}
                          {isCaptain && <Crown />}
                          {p.seat === me && <small className="nd-me">我</small>}
                          <i
                            className={`nd-seat-status ${!p.connected ? "offline" : ready ? "ready" : ""}`}
                            aria-hidden="true"
                          >
                            {!p.connected ? "↯" : ready ? "✓" : "·"}
                          </i>
                        </span>
                        <span className="nd-seat-name">{p.name}</span>
                        <span className="nd-seat-detail">{state}</span>
                      </button>
                    );
                  })}
                </div>
                {s.players.length === 9 && (
                  <span className="nd-rail-more" aria-hidden="true">
                    ›
                  </span>
                )}
                <div className={disabled ? "nd-action" : "nd-action your-turn"}>
                  <ActionDock
                    hint={
                      net.pending
                        ? "正在确认…"
                        : v?.phase === "ORDER" && captain
                          ? "确认后不可更改"
                          : "和队友一起，慢慢来"
                    }
                  >
                    <button
                      className={
                        v?.phase === "ANSWER" && submitted
                          ? "nd-secondary nd-submitted-button"
                          : "nd-primary"
                      }
                      disabled={disabled || net.pending || !net.online}
                      onClick={action}
                    >
                      {net.pending ? (
                        <span className="nd-spinner">◌</span>
                      ) : null}
                      {net.pending ? "正在确认…" : primary}
                    </button>
                    {v?.phase === "REVEAL" && (
                      <button
                        className="nd-secondary nd-skip-reveal"
                        onClick={() => {
                          setSkipped(true);
                          setBanner(null);
                          if (captain) {
                            revealStart.current = 0;
                            setAuto(true);
                          }
                        }}
                      >
                        {skipped ? "已跳过动画" : "跳过"}
                      </button>
                    )}
                  </ActionDock>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
      {secret && v?.myNumber !== null && v?.myNumber !== undefined && (
        <div
          className="nd-secret-overlay"
          onClick={() => setSecret(false)}
          role="presentation"
        >
          <button aria-label="收起秘密数字" className="nd-secret-card">
            <small>只给你看</small>
            <b>{v.myNumber}</b>
            <span>按这个程度写答题卡</span>
            <small>点击收起</small>
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className="nd-modal"
        onCancel={() => setMenu(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setMenu(null);
        }}
      >
        <header>
          <h2>
            {menu === "players"
              ? "这桌的朋友"
              : menu === "review"
                ? "本局回顾"
                : menu === "rules"
                  ? "怎么玩"
                  : "菜单"}
          </h2>
          <button aria-label="关闭菜单" onClick={() => setMenu(null)}>
            ✕
          </button>
        </header>
        {menu === "menu" ? (
          <nav>
            <button
              onClick={() => {
                setSoundOn(!sound);
                setSound(!sound);
              }}
            >
              音效：{sound ? "开" : "关"}
            </button>
            <button onClick={() => setMenu("rules")}>规则速览</button>
            <button onClick={() => setMenu("review")}>本局回顾</button>
            <button
              onClick={() => {
                if (v) {
                  setMenu(null);
                  setNotice("对局中座位会保留；关闭网页后可用原链接回来");
                } else if (me !== null) {
                  void send({ type: "LEAVE" }).then(() => {
                    location.href = "/?game=nd";
                  });
                } else location.href = "/";
              }}
            >
              退出房间
            </button>
          </nav>
        ) : menu === "players" && s ? (
          <ul className="nd-full-players">
            {s.players.map((p) => (
              <li key={p.id}>
                <span className="nd-full-number">{p.seat + 1}</span>
                <div>
                  <strong>{p.name}</strong>
                  <p>
                    {p.seat === me ? "我 · " : ""}
                    {p.seat === (v?.captain ?? s.settings.firstCaptain)
                      ? "队长 · "
                      : ""}
                    {!p.connected
                      ? "断线"
                      : v?.phase === "FINISHED"
                        ? "已结束"
                        : (v ? v.players[p.seat]?.ready : p.ready)
                          ? "已提交"
                          : "等待中"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : menu === "rules" ? (
          <div>
            <p>
              1. 除队长外，每人收到不同的秘密数字
              1–10，按题目和数字的程度写一句回答，提交答题卡。不要写出数字。
            </p>
            <p>
              2.
              队长不写卡。大家提交后，队长根据卡片正面的回答，从小到大排好顺序并确认。
            </p>
            <p>
              3.
              逐个翻牌，比前一张小就把一枚独角兽翻成便便。独角兽用完立刻全队失败；闯过
              5 轮还有独角兽，全队成功。
            </p>
            <p>
              专家变体：队长猜队友确切数字，猜错失去一枚独角兽；最后队友共同猜队长数字，猜中可恢复一枚已有便便。默认关闭，仅
              4–8 人。
            </p>
            <p>
              计时默认关闭；写卡超时，未提交者显示「（没写）」并继续排序；其他阶段只作提醒。尺度普通会排除
              spicy 题。
            </p>
          </div>
        ) : v ? (
          <Review v={v} />
        ) : (
          <p>开局后，这里会留下每轮的翻牌记录。</p>
        )}
      </dialog>
    </main>
  );
}
