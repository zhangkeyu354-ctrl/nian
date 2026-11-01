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
  ANSWER: "开麦回答",
  ORDER: "队长排个序",
  REVEAL: "答案揭晓",
  EXPERT: "猜中秘密数字",
  CAPTAIN_GUESS: "一起猜队长",
  ROUND_END: "这一轮，接住了",
  FINISHED: "全队大结算",
};
const label = (v: View, n: number) =>
  `${n + 1}号 ${v.players[n]?.name ?? "队友"}`;
function Question({ q }: { q: NDQuestion }) {
  return (
    <article className="nd-question">
      <small>本轮题目 {q.spicy ? "· 放开聊" : ""}</small>
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
              <span key={e.id}>
                {label(v, e.seat!)} <b>{e.number}</b> {e.correct ? "✓" : "✗"}
              </span>
            ))}
          </div>
          {r.reveals.length === 0 && <p>本轮还没有翻开数字</p>}
        </section>
      ))}
    </div>
  );
}
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
    revealStart = useRef(0);
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
    setOrder(
      v.players
        .map((_, i) => i)
        .filter((i) => v.players.length !== 9 || i !== v.captain),
    );
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
    if (v?.phase !== "ANSWER" || v.myNumber === null) return;
    setSecret(true);
    const t = setTimeout(() => setSecret(false), 3000);
    return () => clearTimeout(t);
  }, [v?.round, v?.phase]);
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
    ? v.players
        .map((_, i) => i)
        .filter((i) => v.players.length !== 9 || i !== v.captain)
    : [];
  const canReady =
    !!v &&
    me !== null &&
    members.includes(me) &&
    !v.players[me].ready &&
    (v.players.length === 9 || v.players[v.captain].ready || captain);
  const left = s?.deadline
    ? Math.max(0, Math.ceil((s.deadline - now - net.offset.current) / 1000))
    : null;
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
        primary = captain ? "就选这道题" : `等待 ${label(v, v.captain)} 选题`;
        disabled = !captain || !topic;
        action = () => void send({ type: "CHOOSE_TOPIC", topicId: topic! });
        break;
      case "ANSWER":
        primary = canReady
          ? "我说完了，锁定回答"
          : v.players[me ?? -1]?.ready
            ? "已锁定，听听大家怎么说"
            : v.players.length === 9 && captain
              ? "等待队友回答"
              : `等待 ${label(v, v.captain)} 先回答`;
        disabled = !canReady;
        action = () => {
          setSecret(false);
          void send({ type: "READY" });
        };
        break;
      case "ORDER":
        primary = captain
          ? "确认排序，准备揭晓"
          : `等待 ${label(v, v.captain)} 排序`;
        disabled = !captain;
        action = () => void send({ type: "LOCK_ORDER", order });
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
          ? `确认：${guess}`
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
  const reorder = (seat: number) => {
    if (selected === null) setSelected(seat);
    else {
      setOrder(swapSeats(order, selected, seat));
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
        setOrder(
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
      className={`nd-world ${skipped ? "nd-skip" : ""}`}
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
          <div className="nd-reminder">时间到了，聊完仍可继续</div>
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
                一个数字，一句回答。
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
                      <p>拿到 1–10 的秘密数字，按题目开麦回答。</p>
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
                          {v.choices.map((q) => (
                            <button
                              key={q.id}
                              className={topic === q.id ? "selected" : ""}
                              aria-pressed={topic === q.id}
                              onClick={() => setTopic(q.id)}
                            >
                              <Question q={q} />
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
                      <div className="nd-finale">
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
                        {v.phase === "ANSWER" && (
                          <div className="nd-answer">
                            <h1>开麦回答</h1>
                            <p>
                              {v.players.length === 9 && captain
                                ? "这轮你只负责听和排序"
                                : canReady
                                  ? "按秘密数字的程度，一句话说完"
                                  : v.players[me!]?.ready
                                    ? "回答已锁定，听听队友怎么说"
                                    : `先听 ${label(v, v.captain)} 回答`}
                            </p>
                            {v.myNumber !== null && (
                              <button
                                className="nd-secret-tag"
                                onClick={() => setSecret(true)}
                              >
                                我的秘密数字 · 点击查看
                              </button>
                            )}
                          </div>
                        )}
                        {v.topic &&
                          (v.phase === "ANSWER" ? (
                            <Question q={v.topic} />
                          ) : (
                            <TopicSummary q={v.topic} />
                          ))}
                        {v.phase === "ORDER" &&
                          (captain ? (
                            <div className="nd-sort">
                              <p>从 1 到 10 排序 · 拖动，或点两个人交换</p>
                              <div className="nd-order" aria-label="队长排序">
                                {order.map((n, i) => (
                                  <button
                                    key={n}
                                    data-order-seat={n}
                                    className={selected === n ? "selected" : ""}
                                    aria-pressed={selected === n}
                                    onClick={() => {
                                      if (!dragged.current) reorder(n);
                                      dragged.current = false;
                                    }}
                                    onPointerDown={(e) => {
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
                                        e.currentTarget.classList.add(
                                          "dragging",
                                        );
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
                                    <span>{label(v, n)}</span>
                                    <i>⠿</i>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="nd-answer">
                              <h1>队长在排了</h1>
                              <p>从最小的数字，到最大的数字。</p>
                            </div>
                          ))}
                        {(v.phase === "REVEAL" || v.phase === "ROUND_END") && (
                          <div className="nd-reveal">
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
                                      <small>{i + 1}</small>
                                      <b key={r?.number ?? "hidden"}>
                                        {r?.number ?? "?"}
                                      </b>
                                      <span>{v.players[n].name}</span>
                                      <strong>
                                        {r
                                          ? r.correct
                                            ? "✓ 排对"
                                            : "✗ 失误"
                                          : "待揭晓"}
                                      </strong>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                            {v.phase === "REVEAL" && (
                              <button
                                className="nd-secondary"
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
                                : "队友开麦商量，选一人提交共同猜测"}
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
                                      aria-pressed={target === n}
                                      className={target === n ? "selected" : ""}
                                      onClick={() => setTarget(n)}
                                    >
                                      {label(v, n)}
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
              <aside className="nd-sidebar">
                <div className="nd-team">
                  <span>{v ? "全队独角兽" : "全队进度"}</span>
                  <b>{v ? `${v.unicorns} / ${v.tokenTotal}` : "一起赢"}</b>
                  <small>{v ? `失误 ${v.poops}` : "五轮一起赢"}</small>
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
                          ? "已锁定"
                          : v?.phase === "ANSWER"
                            ? "回答中"
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
                        <span className="nd-seat-name">
                          {Array.from(p.name).slice(0, 2).join("")}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
                      className="nd-primary"
                      disabled={disabled || net.pending || !net.online}
                      onClick={action}
                    >
                      {net.pending ? (
                        <span className="nd-spinner">◌</span>
                      ) : null}
                      {net.pending ? "正在确认…" : primary}
                    </button>
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
            <span>按这个程度开麦回答</span>
            <small>点击收起 · 3 秒后自动收起</small>
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
                          ? "已锁定"
                          : "等待中"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : menu === "rules" ? (
          <div>
            <p>
              1. 每人收到不同的秘密数字
              1–10，按题目和数字的程度开麦回答。不要说出数字。
            </p>
            <p>
              2. 4–8 人队长先回答；9
              人队长不参与回答。大家说完后，队长从小到大排好顺序并确认。
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
            <p>计时默认关闭，开启后只作提醒。尺度普通会排除 spicy 题。</p>
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
