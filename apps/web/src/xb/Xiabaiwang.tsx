import React, { useEffect, useRef, useState } from "react";
import {
  XB_EVENTS as E,
  type XBCommand,
} from "../../../../packages/shared/src/xb-protocol.ts";
import {
  feedback,
  motionPolicy,
  revealTimeline,
  reveal as revealSound,
  type Feedback,
} from "./feel.ts";
import { RollingScore, HoldRing, FeelLayer } from "./FeelV2.tsx";
import { TOPIC_THEMES } from "../../../../packages/xiabaiwang/src/topic-themes.ts";
import { useXB } from "./xb-net.ts";
import { Loudmouth, CutePoop, AVATARS } from "./Art.tsx";
import { ranking, titles } from "./ui-model.ts";
import { coalesceEffects } from "./effect-queue.ts";
import "./xb.css";
const ROLES: Record<string, string> = {
  guesser: "猜测者",
  truth: "老实人",
  bluffer: "瞎掰人",
};
const JOBS: Record<string, string> = {
  guesser: "耳朵借你，别把脑子也借出去。追问大家，找出真正的老实人。",
  truth: "你知道真答案。讲得像真的就行——虽然本来就是真的。",
  bluffer: "别慌，脸不红就算赢一半。现场编，让猜测者相信你。",
};
type Mode = "POOP" | "CHALLENGE" | "GUESS" | null;
type Flight = {
  id: number;
  target: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
};
const pref = (name: string, d = true) =>
  localStorage.getItem("xb-" + name) === "off"
    ? false
    : localStorage.getItem("xb-" + name) === "on"
      ? true
      : d;
export function Xiabaiwang() {
  const code =
    new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const net = useXB(code),
    snap = net.snapshot,
    view = snap?.view,
    me = snap?.me;
  const [name, setName] = useState(() => localStorage.getItem("xb-name") ?? ""),
    [roomInput, setRoomInput] = useState(
      () => sessionStorage.getItem("xb-room-input") ?? "",
    );
  const [panel, setPanel] = useState<
      "menu" | "rules" | "recap" | "role" | null
    >(null),
    panelRef = useRef<HTMLElement | null>(null);
  const [sound, setSound] = useState(() => pref("sound")),
    [vibration, setVibration] = useState(() => pref("vibration")),
    [animations, setAnimations] = useState(() => pref("animation"));
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [powerSave, setPowerSave] = useState(() => pref("power-save", false));
  const policy = motionPolicy(powerSave, reduced);
  const animate = animations && !policy.powerSave;
  const [holding, setHolding] = useState(false),
    [slow, setSlow] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    holdFired = useRef(false);
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    tx: number;
    ty: number;
  } | null>(null);
  const dragRef = useRef<typeof drag>(null),
    dragFired = useRef(false);
  const [combo, setCombo] = useState<
    Record<string, { count: number; at: number }>
  >({});
  const [shaken, setShaken] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode>(null),
    [selected, setSelected] = useState(""),
    [armed, setArmed] = useState(false);
  const [intro, setIntro] = useState<"rotation" | "deal" | null>(null),
    [elapsed, setElapsed] = useState(0),
    [skipped, setSkipped] = useState(false),
    [now, setNow] = useState(Date.now());
  const [cooldown, setCooldown] = useState(0),
    [notice, setNotice] = useState(""),
    [flights, setFlights] = useState<Flight[]>([]),
    [hit, setHit] = useState<Record<string, number>>({});
  const [pointFlights, setPointFlights] = useState<
    (Flight & { delta: number })[]
  >([]);
  const hitTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const seq = useRef(0),
    previousRound = useRef<number | null>(null),
    restore = useRef(true),
    revealStart = useRef(0);
  const feedbackPrefs = useRef({ sound, vibration });
  feedbackPrefs.current = { sound, vibration };
  const sfx = (cue: string) => {
    const map: Record<string, Feedback> = {
      tap: "tap",
      select: "tap",
      submit: "confirm",
      stamp: "hit",
      win: "score",
      page: "reveal",
      turn: "turn",
      tick: "tick",
    };
    feedback(map[cue] ?? "tap", {
      sound: feedbackPrefs.current.sound,
      vibration: false,
    });
  };
  const label = (id: string | null | undefined) =>
    snap?.players.find((p) => p.id === id)?.name ?? "朋友";
  const seat = (id: string | null | undefined) =>
    (snap?.players.findIndex((p) => p.id === id) ?? -1) + 1;
  const myRole = view?.players.find((p) => p.id === me)?.role ?? "",
    isGuesser = !!me && me === view?.guesser,
    host = !!me && me === snap?.host;
  const frame = revealTimeline(
      skipped || !animate ? 12000 : elapsed,
      snap?.players.length ?? 3,
    ),
    last = view?.history.at(-1);
  const revealed = view?.phase === "reveal",
    over = view?.phase === "over";
  const stage = !code
    ? "home"
    : !snap
      ? "join"
      : !view
        ? "lobby"
        : (intro ??
          (revealed
            ? "reveal"
            : over
              ? "over"
              : mode === "CHALLENGE"
                ? "challenge"
                : mode === "GUESS"
                  ? "guess"
                  : "discussion"));
  const waiting =
    view?.phase === "discussion"
      ? isGuesser
        ? "轮到你了，电台听你的"
        : `等待 ${seat(view.guesser)}号 ${label(view.guesser)} 追问或指认…`
      : revealed
        ? host
          ? "看完这一轮，你来开下一轮"
          : `等待 ${seat(snap?.host)}号 ${label(snap?.host)} 开下一轮…`
        : !view
          ? host
            ? "人到齐，咱就开麦"
            : `等待房主 ${label(snap?.host)} 开场…`
          : "本场收工，嘴还在硬。";
  useEffect(() => {
    document.title = "瞎掰王 · 深夜胡扯电台";
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!view || previousRound.current === view.round) return;
    const was = previousRound.current;
    previousRound.current = view.round;
    setPanel(null);
    setSkipped(false);
    setElapsed(0);
    let draft: any = null;
    try {
      draft = JSON.parse(sessionStorage.getItem("xb-draft:" + code) ?? "null");
    } catch {}
    if (
      restore.current &&
      draft?.round === view.round &&
      view.phase === "discussion"
    ) {
      setMode(draft.mode);
      setSelected(draft.selected ?? "");
      setArmed(false);
    } else {
      setMode(null);
      setSelected("");
      setArmed(false);
    }
    restore.current = false;
    if (view.phase !== "discussion") return;
    if (isGuesser) {
      feedback("turn", feedbackPrefs.current);
    }
    setIntro(was === null ? "deal" : "rotation");
    const timers = [
      setTimeout(() => setIntro("deal"), was === null ? 0 : 2000),
      setTimeout(() => setIntro(null), was === null ? 3000 : 5000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [view?.round]);
  useEffect(() => {
    if (view && !restore.current)
      sessionStorage.setItem(
        "xb-draft:" + code,
        JSON.stringify({ round: view.round, mode, selected }),
      );
  }, [mode, selected, view?.round, code]);
  useEffect(() => {
    setArmed(false);
    if (view?.phase !== "discussion") {
      setMode(null);
      setSelected("");
      setIntro(null);
      setPanel(null);
    }
    if (view?.phase === "reveal") {
      setElapsed(0);
      setSkipped(false);
      revealStart.current = performance.now();
      if (animate && !skipped) {
        [0, 420, 730, 950, 1100].forEach((ms) => {
          const t = setTimeout(() => {
            sfx("stamp");
            hitTimers.current.delete(t);
          }, ms);
          hitTimers.current.add(t);
        });
      }
      const t = setInterval(
        () => setElapsed(performance.now() - revealStart.current),
        80,
      );
      return () => clearInterval(t);
    }
  }, [view?.phase, view?.round]);
  useEffect(() => () => hitTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (revealed && frame.scores && view) {
      sfx("win");
      if ((last?.delta[me ?? ""] ?? 0) !== 0)
        feedback("score", {
          sound: false,
          vibration: feedbackPrefs.current.vibration,
        });
    }
  }, [revealed, frame.scores]);
  useEffect(() => {
    if (!net.batches.length || !snap) return;
    const batch = coalesceEffects(net.batches);
    net.consumeEffects(net.batches.at(-1)!.id);
    setNotice(
      batch
        .map((e) => `${label(e.from)}给${label(e.target)}送来一坨💩`)
        .join("；"),
    );
    setHit((old) => ({
      ...old,
      ...Object.fromEntries(batch.map((e) => [e.target, Date.now()])),
    }));
    const timer = setTimeout(
      () => {
        sfx("stamp");
        feedback(
          "hit",
          { sound: false, vibration: feedbackPrefs.current.vibration },
          batch.some((e) => e.target === me),
        );
        setCombo((old) => {
          const next = { ...old };
          for (const e of batch) {
            const prev = next[e.target];
            next[e.target] = {
              count:
                prev && Date.now() - prev.at < 6000
                  ? prev.count + e.count
                  : e.count,
              at: Date.now(),
            };
          }
          return next;
        });
        hitTimers.current.delete(timer);
      },
      animate ? 650 : 0,
    );
    hitTimers.current.add(timer);
    if (animate) {
      const next = batch.slice(0, 10).flatMap((e) => {
        const a = document
            .getElementById("xb-avatar-" + e.from)
            ?.getBoundingClientRect(),
          b = document
            .getElementById("xb-avatar-" + e.target)
            ?.getBoundingClientRect();
        if (!a || !b) return [];
        return [
          {
            id: ++seq.current,
            target: e.target,
            x: a.x + a.width / 2,
            y: a.y + a.height / 2,
            dx: b.x - a.x + (b.width - a.width) / 2,
            dy: b.y - a.y + (b.height - a.height) / 2,
          },
        ];
      });
      setFlights((old) => [...old, ...next].slice(-20));
    }
  }, [net.batches]);
  useEffect(() => {
    if (!panel) return;
    const prev = document.activeElement as HTMLElement | null,
      root = panelRef.current;
    root?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
      if (e.key === "Tab" && root) {
        const items = root.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,a,summary",
        );
        if (!items.length) return;
        const a = items[0],
          b = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [panel]);
  const command = (c: XBCommand) => net.run(E.command, { command: c });
  const choose = (m: Mode) => {
    setMode(m);
    setSelected("");
    setArmed(false);
    sfx("select");
  };
  async function commit() {
    if (!selected || !view || !mode) return;
    if (mode !== "POOP" && !armed) {
      setArmed(true);
      sfx("select");
      return;
    }
    const r =
      mode === "POOP"
        ? await net.run(E.poop, { target: selected })
        : await command({ type: mode, target: selected, round: view.round });
    if (r) {
      sfx("submit");
      if (mode === "POOP") setCooldown(Date.now() + 2000);
      choose(null);
    }
  }
  const disabled = net.busy || !net.connected,
    secs = Math.max(
      0,
      Math.ceil((180000 - (now - (snap?.discussionAt || now))) / 1000),
    ),
    cooldownSecs = Math.max(0, Math.ceil((cooldown - now) / 1000));
  const timerColor = secs <= 10 ? "red" : secs <= 60 ? "yellow" : "green",
    tickText = secs
      ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
      : "自由聊";
  const primary = mode
    ? selected
      ? armed
        ? `再点确认 · ${mode === "GUESS" ? "指认" : mode === "CHALLENGE" ? "质疑" : "扔向"}${label(selected)}`
        : `${mode === "GUESS" ? "指认" : mode === "CHALLENGE" ? "质疑" : "扔向"} ${label(selected)}`
      : "先选一个头像"
    : revealed
      ? frame.done
        ? view!.round === view!.totalRounds
          ? "查看最终排名"
          : "下一轮，接着掰"
        : "揭晓中… 随时可跳过"
      : over
        ? host
          ? "再来一局"
          : "等房主再开一局"
        : !view
          ? "开始游戏"
          : isGuesser
            ? "🎯 指认真正的老实人"
            : `💩 扔粑粑 · ${cooldownSecs ? cooldownSecs + "s" : "∞"}`;
  async function primaryAction() {
    if (mode) return commit();
    if (revealed) {
      if (host && frame.done)
        await command({ type: "NEXT", round: view!.round });
      return;
    }
    if (over) {
      if (host) await command({ type: "REMATCH" });
      return;
    }
    if (!view) {
      await command({ type: "START" });
      return;
    }
    choose(isGuesser ? "GUESS" : "POOP");
  }
  const setting = (
    key: string,
    value: boolean,
    setter: (v: boolean) => void,
  ) => {
    setter(value);
    localStorage.setItem("xb-" + key, value ? "on" : "off");
  };
  useEffect(() => {
    document.querySelector(".xb-world .xb-stage")?.scrollTo({ top: 0 });
  }, [stage]);
  useEffect(() => {
    if (!net.busy) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, [net.busy]);
  useEffect(() => {
    if (view?.phase === "discussion" && secs <= 3 && secs > 0) sfx("tick");
    if (view?.phase === "discussion" && secs === 0) {
      document.querySelector(".xb-world")?.classList.add("xb-time-up");
      const t = setTimeout(
        () =>
          document.querySelector(".xb-world")?.classList.remove("xb-time-up"),
        600,
      );
      return () => clearTimeout(t);
    }
  }, [secs, view?.phase]);
  const priorVisible = useRef(0);
  useEffect(() => {
    if (!revealed) {
      priorVisible.current = 0;
      return;
    }
    let cancel: undefined | (() => void);
    if (frame.visible > priorVisible.current && !skipped && animate)
      cancel = revealSound(
        feedbackPrefs.current,
        view?.players[frame.visible - 1]?.role,
        document.querySelector(
          `[data-testid="xb-reveal-card-${frame.visible - 1}"] .xb-idcard-inner`,
        ),
      );
    priorVisible.current = frame.visible;
    return cancel;
  }, [frame.visible, revealed, skipped, animate]);
  const lastCoin = useRef(0);
  useEffect(() => {
    if (!revealed) {
      lastCoin.current = 0;
      return;
    }
    if (!animate || skipped || frame.visible <= lastCoin.current) return;
    const i = frame.visible - 1;
    lastCoin.current = frame.visible;
    const p = view!.players[i],
      delta = last?.delta[p.id] ?? 0;
    const t = setTimeout(() => {
      const a = document
          .querySelector(`[data-testid="xb-reveal-card-${i}"]`)
          ?.getBoundingClientRect(),
        b = document
          .getElementById("xb-avatar-" + p.id)
          ?.getBoundingClientRect();
      if (a && b && delta)
        setPointFlights((old) =>
          [
            ...old,
            {
              id: ++seq.current,
              target: p.id,
              delta,
              x: a.x + a.width / 2,
              y: a.y + a.height / 2,
              dx: b.x - a.x + (b.width - a.width) / 2,
              dy: b.y - a.y + (b.height - a.height) / 2,
            },
          ].slice(-10),
        );
      hitTimers.current.delete(t);
    }, 600);
    hitTimers.current.add(t);
  }, [revealed, frame.visible, animate, skipped]);
  useEffect(() => {
    if (skipped) {
      setPointFlights([]);
      hitTimers.current.forEach(clearTimeout);
      hitTimers.current.clear();
    }
  }, [skipped]);
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  };
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );
  useEffect(() => {
    const w = window as any;
    w.render_game_to_text = () =>
      JSON.stringify({
        game: "xb",
        stage,
        round: view?.round,
        question: view?.question,
        myRole,
        answer: view?.answer,
        players: snap?.players.map((p) => ({ id: p.id, name: p.name })),
        selected,
        waiting,
        coordinates: "viewport origin top-left; x right, y down",
      });
    return () => {
      delete w.render_game_to_text;
    };
  }, [stage, view, snap, selected, waiting, myRole]);
  return (
    <main
      className={`xb-world ${animate ? "" : "xb-power-save"} ${net.error ? "xb-rejected" : ""} ${revealed && animate && !skipped && view?.players[frame.visible - 1]?.role === "truth" ? "xb-truth-impact" : ""}`}
      data-stage={stage}
      onPointerDownCapture={(e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
          "button,input,select,summary,a",
        );
        if (!b) return;
        sfx("tap");
        if (b.disabled) {
          if (animate)
            b.animate(
              [
                { transform: "translateX(0)" },
                { transform: "translateX(-6px)" },
                { transform: "translateX(6px)" },
                { transform: "translateX(-6px)" },
                { transform: "translateX(6px)" },
                { transform: "translateX(0)" },
              ],
              { duration: 360, easing: "ease-out" },
            );
          const id = b.dataset.testid ?? "";
          setNotice(
            !net.connected
              ? "正在重连，请稍等"
              : net.busy
                ? "操作已发送，正在等服务器确认"
                : id === "xb-challenge"
                  ? "本轮质疑已经使用，不能再来一次"
                  : id.startsWith("xb-seat")
                    ? mode === "POOP"
                      ? "不能扔自己，请选其他朋友"
                      : !mode
                        ? "先在底部选择指认、质疑或扔粑粑"
                        : "猜测者不能指认自己"
                    : id === "xb-speak"
                      ? "本轮已被禁止发言，仍然可以扔粑粑"
                      : !view
                        ? "仅房主可以开局，且需要至少3人"
                        : !host && revealed
                          ? "正在等待房主继续"
                          : cooldownSecs
                            ? `再等${cooldownSecs}秒就能扔了`
                            : "当前阶段暂时不能操作",
          );
        }
      }}
      onPointerUpCapture={(e) => {
        const b = (e.target as HTMLElement).closest("button:not(:disabled)");
        if (b && animate)
          b.animate(
            [
              { transform: "scale(.94)" },
              { transform: "scale(1.02)" },
              { transform: "scale(1)" },
            ],
            { duration: 180, easing: "ease-out" },
          );
      }}
      onPointerMove={(e) => {
        if (dragRef.current) {
          const next = { ...dragRef.current, tx: e.clientX, ty: e.clientY };
          dragRef.current = next;
          setDrag(next);
        }
      }}
      onPointerUp={async (e) => {
        const d = dragRef.current;
        if (!d) return;
        dragRef.current = null;
        setDrag(null);
        if (Math.hypot(d.tx - d.x, d.ty - d.y) < 12) return;
        dragFired.current = true;
        setTimeout(() => {
          dragFired.current = false;
        }, 0);
        const b = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>("[id^='xb-avatar-']");
        const target = b?.id.replace("xb-avatar-", "");
        if (target && target !== me && cooldownSecs === 0) {
          if (await net.run(E.poop, { target })) setCooldown(Date.now() + 2000);
        } else setNotice("拖到其他朋友头像上再松手，不能扔自己。");
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        setDrag(null);
        endHold();
      }}
    >
      <header className="xb-topbar">
        <a href="/" aria-label="返回桌游合集">
          <Loudmouth small />
        </a>
        <div>
          <strong>{code ? "FM · " + code : "瞎掰王"}</strong>
          <span>
            {view ? `第 ${view.round}/${view.totalRounds} 轮` : "深夜胡扯电台"}
          </span>
        </div>
        {view?.phase === "discussion" && (
          <div
            className={
              "xb-clock " +
              timerColor +
              (secs > 0 && secs <= 3 ? " xb-clock-final" : "") +
              (secs > 0 && secs <= 10 ? " xb-clock-urgent" : "")
            }
            role="timer"
            aria-label={`讨论参考计时 ${tickText}，不会自动结束`}
            style={
              { "--progress": `${(secs / 180) * 100}%` } as React.CSSProperties
            }
          >
            <span>{tickText}</span>
          </div>
        )}
        <button
          className="xb-menu-button"
          aria-label="菜单"
          data-testid="xb-menu"
          onClick={() => setPanel("menu")}
        >
          ☰
        </button>
      </header>
      {!net.connected && (
        <div className="xb-offline" role="status" data-testid="xb-offline">
          重连中… 你的输入留着呢。
        </div>
      )}
      <section className="xb-stage" aria-label="当前游戏舞台">
        {net.error && (
          <p className="xb-error" role="alert">
            {net.error}
          </p>
        )}
        {!code ? (
          <div className="xb-landing">
            <span className="xb-kicker">ON AIR · 朋友局专属频道</span>
            <Loudmouth />
            <h1>
              瞎掰王<span>深夜胡扯电台</span>
            </h1>
            <p>
              真话就一句。
              <br />
              剩下的，全靠你这张嘴。
            </p>
            <button
              className="xb-primary"
              data-testid="xb-create"
              disabled={disabled}
              onClick={async () => {
                const r = await net.run(E.create, {});
                if (r?.code) location.href = "/?game=xb&room=" + r.code;
              }}
            >
              开个频道，叫朋友来
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (/^[A-Z0-9]{6}$/.test(roomInput))
                  location.href = "/?game=xb&room=" + roomInput;
              }}
            >
              <label htmlFor="xb-room-input">已有频道？输入房间号</label>
              <div>
                <input
                  id="xb-room-input"
                  maxLength={6}
                  placeholder="6 位房间号"
                  value={roomInput}
                  onChange={(e) => {
                    setRoomInput(e.target.value.toUpperCase());
                    sessionStorage.setItem(
                      "xb-room-input",
                      e.target.value.toUpperCase(),
                    );
                  }}
                />
                <button disabled={!/^[A-Z0-9]{6}$/.test(roomInput)}>
                  进去听听
                </button>
              </div>
            </form>
            <small>3～10人 · 语音自己开，胡扯我们管</small>
          </div>
        ) : !snap ? (
          <div className="xb-entry">
            <Loudmouth />
            <span className="xb-kicker">频道 {code}</span>
            <h1>
              报个名字，
              <br />
              今晚就叫这个。
            </h1>
            <label htmlFor="xb-name">你的昵称</label>
            <input
              id="xb-name"
              autoComplete="nickname"
              maxLength={16}
              value={name}
              placeholder="最多16字，嘴硬不限量"
              onChange={(e) => {
                setName(e.target.value);
                localStorage.setItem("xb-name", e.target.value);
              }}
            />
            <button
              className="xb-primary"
              data-testid="xb-join"
              disabled={disabled || !name.trim()}
              onClick={() => net.run(E.join, { code, name })}
            >
              就位，准备开麦
            </button>
            <p>刷新不换人。用本设备回来就能接着聊。</p>
          </div>
        ) : !view ? (
          <div className="xb-lobby">
            <Loudmouth />
            <span className="xb-kicker">朋友正在调频</span>
            <h1>
              {snap.players.length < 3
                ? `还差 ${3 - snap.players.length} 人`
                : "人齐了，嘴准备好没？"}
            </h1>
            <p>
              已到 {snap.players.length} / 10 人。
              {snap.players.length < 3
                ? "至少3人才能开场。"
                : "更多朋友也可以加入。"}
            </p>
            <button
              data-testid="xb-invite"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  setNotice("邀请链接复制好了，快去摇人。");
                } catch {
                  net.setError("暂时无法复制，请复制浏览器中的房间链接");
                }
              }}
            >
              ↗ 一键复制邀请链接
            </button>
            <label className="xb-round-setting">
              本局轮数
              <select
                disabled
                aria-label="本局轮数，规则待裁定"
                value={snap.players.length}
              >
                <option value={snap.players.length}>
                  {snap.players.length}轮 · 每人任一次猜测者
                </option>
              </select>
              <small>轮数设置待规则裁定，暂不修改。</small>
            </label>
            <fieldset
              className="xb-topic-picker"
              disabled={!host || disabled}
              data-testid="xb-topic-picker"
            >
              <legend>今晚掰什么 · 可多选</legend>
              <label>
                <input
                  type="checkbox"
                  checked={!snap.topicThemes?.length}
                  onChange={() => command({ type: "SET_TOPICS", themes: [] })}
                />
                全部随机（含原题库）
              </label>
              {TOPIC_THEMES.map((t) => (
                <label key={t}>
                  <input
                    type="checkbox"
                    checked={snap.topicThemes?.includes(t) ?? false}
                    onChange={(e) =>
                      command({
                        type: "SET_TOPICS",
                        themes: e.target.checked
                          ? [...(snap.topicThemes ?? []), t]
                          : (snap.topicThemes ?? []).filter((x) => x !== t),
                      })
                    }
                  />
                  {t}
                </label>
              ))}
              <small>
                剩余 {snap.topicRemaining ?? 64} 题 ·
                本房已出题不重抽；题不足时请增加主题。
              </small>
            </fieldset>
            <p className="xb-wait">{waiting}</p>
          </div>
        ) : stage === "rotation" ? (
          <div className="xb-rotation" data-testid="xb-rotation">
            <span className="xb-kicker">话筒换人啦</span>
            <Loudmouth />
            <h1>下一位：{label(view.guesser)}</h1>
            <p>轮到你了，接住这场胡扯。</p>
          </div>
        ) : stage === "deal" ? (
          <div className={"xb-role-deal " + myRole} data-testid="xb-role-deal">
            <span className="xb-kicker">仅你可见 · 看完收好</span>
            <div className="xb-role-emblem">
              {myRole === "guesser" ? "🎙" : myRole === "truth" ? "✓" : "〰"}
            </div>
            <h1>{ROLES[myRole]}</h1>
            <p>{JOBS[myRole]}</p>
            {myRole === "truth" && (
              <div className="xb-private">
                <h2>你的真实答案</h2>
                <p>{view.answer}</p>
              </div>
            )}
            <button onClick={() => setIntro(null)}>记住了，收好身份</button>
          </div>
        ) : revealed ? (
          <div
            className={
              "xb-reveal " +
              (frame.scores ? "xb-scoring" : "") +
              (skipped ? " xb-reveal-skipped" : "")
            }
            data-testid="xb-reveal"
            data-visible={frame.visible}
            data-scores={frame.scores}
            data-done={frame.done}
          >
            <span className="xb-kicker">真相时间 · 谁的嘴最硬</span>
            <h1>
              {frame.scores ? "分数到账，脸红了吗？" : "麦关一下，身份翻出来。"}
            </h1>
            <div className="xb-reveal-grid">
              {view.players.map((p, i) => {
                const open = i < frame.visible,
                  delta = last?.delta[p.id] ?? 0;
                return (
                  <article
                    className={`xb-idcard ${open ? "is-open" : ""} ${open ? p.role : ""} ${skipped ? "xb-skip-final" : ""}`}
                    key={p.id}
                    data-testid={"xb-reveal-card-" + i}
                  >
                    {open && animate && !skipped && p.role !== "guesser" && (
                      <span
                        className={"xb-role-burst " + p.role}
                        aria-hidden="true"
                      >
                        {Array.from({ length: 6 }, (_, k) => (
                          <i
                            key={k}
                            style={{ "--n": k } as React.CSSProperties}
                          >
                            ✦
                          </i>
                        ))}
                      </span>
                    )}
                    <div className="xb-idcard-inner">
                      <div className="xb-id-back">
                        <Loudmouth small />
                        <span>嘴还挺硬</span>
                      </div>
                      <div className="xb-id-front">
                        <span>{AVATARS[i]}</span>
                        <b>{p.name}</b>
                        <strong>{ROLES[p.role ?? ""]}</strong>
                        {open && (
                          <em>
                            {p.role === "truth"
                              ? "✓ 真的！"
                              : p.role === "bluffer"
                                ? "〰 瞎掰！"
                                : "🎙 猜测者"}
                          </em>
                        )}
                        {last?.selected === p.id && <small>✅ 已投</small>}
                      </div>
                    </div>
                    {frame.scores && (
                      <span
                        className={
                          "xb-score-pop " + (delta < 0 ? "negative" : "")
                        }
                      >
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    )}
                    {frame.scores &&
                      p.id === view.guesser &&
                      last?.selected !== last?.truth && (
                        <span className="xb-fooled">❔</span>
                      )}
                  </article>
                );
              })}
            </div>
            {frame.scores && (
              <>
                <div className="xb-answer">
                  <b>真解释在这儿</b>
                  <p>{view.answer}</p>
                  <a href={view.source} target="_blank" rel="noreferrer">
                    核对事实来源 ↗
                  </a>
                </div>
                <div
                  className="xb-rank-shuffle"
                  style={{ height: view.players.length * 46 }}
                  aria-label="本轮名次变化"
                >
                  {view.players.map((p, i) => {
                    const before = ranking(view, true).findIndex(
                        (x) => x.id === p.id,
                      ),
                      after = ranking(view).findIndex((x) => x.id === p.id);
                    return (
                      <div
                        key={p.id}
                        style={
                          {
                            "--before": `${before * 46}px`,
                            "--after": `${after * 46}px`,
                          } as React.CSSProperties
                        }
                      >
                        <span>
                          {AVATARS[i]} {p.name}
                        </span>
                        <strong>{p.score}分</strong>
                        <i
                          style={{
                            width: `${Math.max(4, ((p.score - Math.min(...view.players.map((x) => x.score))) / (Math.max(...view.players.map((x) => x.score)) - Math.min(...view.players.map((x) => x.score)) + 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : over ? (
          <div className="xb-finale" data-testid="xb-finale">
            <span className="xb-kicker">今晚收工 · 明天继续嘴硬</span>
            <h1>
              本场瞎掰王，
              <br />
              请上台。
            </h1>
            <div className="xb-podium">
              {[1, 0, 2].map((rank) => {
                const p = ranking(view)[rank];
                return p ? (
                  <div key={p.id} className={"place-" + rank}>
                    <span>{AVATARS[p.seat]}</span>
                    <b>{p.name}</b>
                    <strong>{p.score}分</strong>
                    <i>{rank === 0 ? "👑" : rank + 1}</i>
                  </div>
                ) : null;
              })}
            </div>
            <div className="xb-titles">
              {titles(view, snap.funHits ?? {}).map((t) => (
                <div key={t.title}>
                  <span>{t.icon}</span>
                  <p>
                    <strong>{t.title}</strong>
                    <b>{t.names}</b>
                  </p>
                </div>
              ))}
            </div>
            <button onClick={() => setPanel("recap")}>
              每轮回顾 · 把嘴硬留个档
            </button>
            <p>称号仅供乐，不另加分。并列玩家共享称号。</p>
          </div>
        ) : (
          <div className="xb-discussion">
            <div
              className={"xb-turn-banner " + (isGuesser ? "your-turn" : "")}
              role="status"
              data-testid="xb-turn"
            >
              {waiting}
            </div>
            <button
              className={"xb-role-tag " + myRole}
              data-testid="xb-role"
              onClick={() => setPanel("role")}
            >
              你的身份：{ROLES[myRole]} ↗
            </button>
            <article className="xb-paper">
              <span className="xb-kicker">
                今晚的胡扯主题 · {"★".repeat(view.difficulty)}
              </span>
              <h1>{view.question}</h1>
              <div className="xb-wave" aria-hidden="true">
                {Array.from({ length: 19 }, (_, i) => (
                  <i key={i} style={{ height: 8 + ((i * 17) % 31) }} />
                ))}
              </div>
              <p>
                {mode === "CHALLENGE"
                  ? "谁的话听着最离谱？点头像质疑。"
                  : mode === "GUESS"
                    ? "谁真的知道答案？点头像指认。"
                    : mode === "POOP"
                      ? "挑个朋友，送他一份“厚礼”。"
                      : "开麦说吧。一本正经，也可以胡说八道。"}
              </p>
            </article>
            {view.answer && (
              <details className="xb-private">
                <summary>✓ 老实人的答案 · 点击查看</summary>
                <p>{view.answer}</p>
              </details>
            )}
            <div className="xb-speaking">
              {!isGuesser && (
                <span className="xb-idle-mascot">
                  <Loudmouth small />
                </span>
              )}
              <span>
                🎙{" "}
                {view.speaker
                  ? `${label(view.speaker)} 正在发言`
                  : "自由讨论 · 话筒没排队"}
              </span>
              <button
                data-testid="xb-speak"
                disabled={disabled || view.muted === me}
                onClick={() =>
                  command({
                    type: "SPEAK",
                    target: view.speaker === me ? null : me!,
                    round: view.round,
                  })
                }
              >
                {view.speaker === me ? "收麦标记" : "我在发言"}
              </button>
            </div>
            {view.muted && (
              <p className="xb-mute" role="status" data-testid="xb-muted">
                📢 {label(view.muted)} 本轮禁止发言。仍可被指认、扔粑粑。
              </p>
            )}
            {mode && (
              <p className="xb-selection-note">
                {selected
                  ? `已选 ${label(selected)}${armed ? " · 再点主按钮确认，不能撤销。" : " · 检查目标后再确认。"}`
                  : "请点下面的头像选择目标。"}
                {mode === "POOP" ? " 不能扔自己，给自己留点面子。" : ""}
              </p>
            )}
          </div>
        )}
      </section>
      {snap && (
        <section
          className="xb-seats"
          aria-label="全体玩家"
          data-testid="xb-seats"
        >
          {snap.players.map((p, i) => {
            const vp = view?.players.find((v) => v.id === p.id),
              showRole = !revealed || i < frame.visible,
              delta = revealed && !frame.scores ? (last?.delta[p.id] ?? 0) : 0,
              hitNow =
                now - (hit[p.id] ?? 0) < 3650 &&
                (hit[p.id] ?? 0) > (shaken[p.id] ?? 0);
            return (
              <button
                type="button"
                id={"xb-avatar-" + p.id}
                key={p.id}
                data-testid={"xb-seat-" + i}
                aria-label={`选择 ${p.name}${mode === "POOP" && p.id === me ? "，不能扔自己" : ""}`}
                title={p.name}
                className={`xb-seat ${selected === p.id ? "is-selected" : ""} ${view?.speaker === p.id ? "is-speaking" : ""} ${hitNow ? "is-hit" : ""} ${p.id === view?.guesser ? "is-guesser" : ""}`}
                disabled={
                  disabled ||
                  !mode ||
                  (mode === "POOP" ? p.id === me : p.id === view?.guesser)
                }
                onClick={() => {
                  setSelected(p.id);
                  setArmed(false);
                  sfx("select");
                }}
              >
                <span className="xb-seat-face" key={hit[p.id] ?? 0}>
                  {AVATARS[i]}
                  {view?.muted === p.id && <i>🤔</i>}
                  {hitNow && animate && (
                    <span className="xb-hit-splashes" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, k) => (
                        <i key={k} style={{ "--n": k } as React.CSSProperties}>
                          ✦
                        </i>
                      ))}
                    </span>
                  )}
                  {hitNow && (
                    <i className="xb-hit-poop">
                      <CutePoop />
                    </i>
                  )}
                </span>
                <b>{p.name}</b>
                <strong>
                  {vp ? (
                    <RollingScore
                      value={vp.score - delta}
                      powerSave={!animate}
                    />
                  ) : p.connected ? (
                    "在线"
                  ) : (
                    "离线"
                  )}
                </strong>
                <small>
                  {selected === p.id
                    ? "✅ 已选"
                    : revealed && last?.selected === p.id
                      ? "✅ 已投"
                      : view?.muted === p.id
                        ? "🤔 被质疑"
                        : view?.speaker === p.id
                          ? "🎙 发言中"
                          : revealed && showRole
                            ? ROLES[vp?.role ?? ""]
                            : p.id === view?.guesser
                              ? "猜测者"
                              : p.id === me
                                ? "你"
                                : p.connected
                                  ? "在听"
                                  : "离线"}
                </small>
              </button>
            );
          })}
        </section>
      )}
      {snap && (
        <footer
          className={
            "xb-dock " +
            (isGuesser && view?.phase === "discussion"
              ? "xb-dock-your-turn"
              : "")
          }
          data-testid="xb-dock"
        >
          <p aria-live="polite">{slow ? "网络有点慢…" : notice || waiting}</p>
          {me &&
            now - (hit[me] ?? 0) < 3650 &&
            (hit[me] ?? 0) > (shaken[me] ?? 0) && (
              <button
                className="xb-shake-off"
                data-testid="xb-shake-off"
                onClick={() => {
                  const b = document.getElementById("xb-avatar-" + me);
                  if (animate)
                    b?.animate(
                      [
                        { transform: "rotate(-8deg)" },
                        { transform: "rotate(8deg)" },
                        { transform: "rotate(-8deg)" },
                        { transform: "rotate(0)" },
                      ],
                      { duration: 400, easing: "ease-out" },
                    );
                  setShaken((old) => ({ ...old, [me]: Date.now() }));
                  setNotice("抖掉啦，嘴还能继续硬。");
                }}
              >
                抖掉 💩
              </button>
            )}
          <button
            className="xb-primary"
            data-testid={
              mode === "GUESS"
                ? "xb-guess-confirm"
                : mode === "CHALLENGE"
                  ? "xb-challenge-confirm"
                  : mode === "POOP"
                    ? "xb-poop-confirm"
                    : !view
                      ? "xb-start"
                      : revealed
                        ? "xb-next"
                        : over
                          ? "xb-rematch"
                          : "xb-primary"
            }
            disabled={
              disabled ||
              !!intro ||
              (!view && (!host || snap.players.length < 3)) ||
              (!!mode && !selected) ||
              (revealed && (!host || !frame.done)) ||
              (over && !host) ||
              (!mode &&
                !isGuesser &&
                !!view &&
                !revealed &&
                !over &&
                cooldownSecs > 0)
            }
            aria-busy={net.busy}
            onPointerDown={(e) => {
              if (
                !mode &&
                !isGuesser &&
                view?.phase === "discussion" &&
                !disabled &&
                !cooldownSecs &&
                !intro
              ) {
                const d = {
                  x: e.clientX,
                  y: e.clientY,
                  tx: e.clientX,
                  ty: e.clientY,
                };
                dragRef.current = d;
                setDrag(d);
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
              }
              if (!selected || !mode || mode === "POOP" || disabled) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              holdFired.current = false;
              setHolding(true);
              holdTimer.current = setTimeout(() => {
                holdFired.current = true;
                setHolding(false);
                feedback("confirm", feedbackPrefs.current);
                void command({
                  type: mode,
                  target: selected,
                  round: view!.round,
                }).then((ok) => {
                  if (ok) choose(null);
                });
              }, 500);
            }}
            onPointerUp={() => {
              endHold();
              setTimeout(() => {
                holdFired.current = false;
              }, 0);
            }}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onClick={() => {
              if (dragFired.current) {
                dragFired.current = false;
                return;
              }
              if (holdFired.current) {
                holdFired.current = false;
                return;
              }
              void primaryAction();
            }}
          >
            <HoldRing holding={holding} />
            {net.busy ? (
              <>
                <span className="xb-wait-dots" aria-label="等待服务器">
                  <i />
                  <i />
                  <i />
                </span>
              </>
            ) : (
              primary
            )}
          </button>
          <div className="xb-secondary-actions">
            {revealed && !frame.done ? (
              <button
                data-testid="xb-skip"
                onClick={() => {
                  setSkipped(true);
                  sfx("page");
                }}
              >
                跳过揭晓 →
              </button>
            ) : mode ? (
              <button data-testid="xb-cancel" onClick={() => choose(null)}>
                取消选择
              </button>
            ) : view?.phase === "discussion" && isGuesser ? (
              <>
                <button
                  data-testid="xb-challenge"
                  disabled={disabled || !!view.muted || !!intro}
                  onClick={() => choose("CHALLENGE")}
                >
                  📢 {view.muted ? "质疑已用" : "你在放屁！"}
                </button>
                <button
                  data-testid="xb-poop"
                  onPointerDown={(e) => {
                    if (disabled || cooldownSecs > 0 || intro) return;
                    const d = {
                      x: e.clientX,
                      y: e.clientY,
                      tx: e.clientX,
                      ty: e.clientY,
                    };
                    dragRef.current = d;
                    setDrag(d);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onClickCapture={(e) => {
                    if (dragFired.current) {
                      dragFired.current = false;
                      e.stopPropagation();
                    }
                  }}
                  disabled={disabled || cooldownSecs > 0 || !!intro}
                  onClick={() => choose("POOP")}
                >
                  <CutePoop />
                  {cooldownSecs ? cooldownSecs + "s" : "扔粑粑 · ∞"}
                </button>
              </>
            ) : revealed || over ? (
              <button onClick={() => setPanel("recap")}>每轮回顾</button>
            ) : (
              <span>粑粑不限次数 · 每次歇2秒</span>
            )}
          </div>
        </footer>
      )}
      {!snap && (
        <div className="xb-entrance-footer">
          一句真话，十张嘴。记得用外部语音通话。
        </div>
      )}
      {panel && (
        <div className="xb-overlay">
          <section
            className="xb-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              panel === "rules"
                ? "规则与所选版本"
                : panel === "recap"
                  ? "每轮回顾"
                  : panel === "role"
                    ? "查看我的身份"
                    : "电台菜单"
            }
          >
            <button
              className="xb-close"
              aria-label="关闭面板"
              onClick={() => setPanel(null)}
            >
              ✕
            </button>
            {panel === "role" ? (
              <>
                <span className="xb-kicker">仅你可见</span>
                <h2>{ROLES[myRole]}</h2>
                <p>{JOBS[myRole]}</p>
                {myRole === "truth" && (
                  <div className="xb-answer">
                    <p>{view?.answer}</p>
                  </div>
                )}
              </>
            ) : panel === "recap" ? (
              <>
                <h2>本场回顾</h2>
                {view?.history.map((h) => (
                  <article key={h.round}>
                    <h3>
                      第{h.round}轮 · {h.question}
                    </h3>
                    <p>
                      {label(h.guesser)}指认{label(h.selected)}，老实人是
                      {label(h.truth)}。
                    </p>
                    <p>
                      {snap?.players
                        .map(
                          (p) =>
                            `${p.name} ${(h.delta[p.id] ?? 0) >= 0 ? "+" : ""}${h.delta[p.id] ?? 0}`,
                        )
                        .join(" / ")}
                    </p>
                    <p>{h.answer}</p>
                  </article>
                ))}
              </>
            ) : panel === "rules" ? (
              <>
                <h2>规则与所选版本</h2>
                <p>
                  一位猜测者公开主持，一位老实人秘密看答案，其余人现场瞎掰。保持自由语音，不用交文字解释。指认后按座位揭晓身份。
                </p>
                <p>
                  基础计分候选：猜中双方各得题目难度分，猜错被选中的瞎掰人得难度分。初始0分、允许负分、每人任一次猜测者。以上基础分与轮数仍待用户核对原版，尚非官方确认。
                </p>
                <p>
                  「你在放屁！」采用用户指定的地区版参考玩法：猜测者每轮一次，禁言但不揭身份，可继续指认。命中瞎掰人时猜测者+1、目标-1；误中老实人时猜测者-3；结算时叠加。
                </p>
                <p>
                  参考计时180秒，时间到仍能继续讨论，不自动结束或扣分。粑粑不限次数、2秒冷却、不能扔自己，只做娱乐。禁言依赖外部语音约定，网站不碰麦克风。
                </p>
                <p>
                  题目与释义原创编写，难度为编辑分级；事实来源在揭晓后可核对。
                </p>
              </>
            ) : (
              <>
                <span className="xb-kicker">频道设置 · 各管各的耳朵</span>
                <h2>小点声？都听你的。</h2>
                <label>
                  <input
                    type="checkbox"
                    checked={sound}
                    onChange={(e) =>
                      setting("sound", e.target.checked, setSound)
                    }
                  />
                  音效
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={vibration}
                    onChange={(e) =>
                      setting("vibration", e.target.checked, setVibration)
                    }
                  />
                  震动 <small>设备支持时生效</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={animations}
                    disabled={reduced}
                    onChange={(e) =>
                      setting("animation", e.target.checked, setAnimations)
                    }
                  />
                  互动动画 {reduced && <small>跟随系统减少动态</small>}
                </label>
                <label>
                  <input
                    data-testid="xb-power-save"
                    type="checkbox"
                    checked={policy.powerSave}
                    disabled={reduced}
                    onChange={(e) =>
                      setting("power-save", e.target.checked, setPowerSave)
                    }
                  />
                  省电模式 {reduced && <small>跟随系统减少动态</small>}
                </label>
                <button onClick={() => setPanel("rules")}>
                  规则与所选版本
                </button>
                {!!view?.history.length && (
                  <button onClick={() => setPanel("recap")}>每轮回顾</button>
                )}
                <a href="/">退出到桌游合集</a>
                <p>退出不删除身份，用原房间链接可回来。</p>
              </>
            )}
          </section>
        </div>
      )}
      {Object.entries(combo)
        .filter(([, v]) => v.count > 1 && now - v.at < 3500)
        .slice(-1)
        .map(([id, v]) => (
          <aside className="xb-combo" key={id} role="status">
            连击 ×{v.count} · {label(id)}
          </aside>
        ))}
      <FeelLayer
        selected={selected}
        speaker={view?.speaker}
        stage={stage}
        powerSave={!animate}
        sound={sound}
        warmup={revealed && frame.warmup}
        spotlight={revealed && frame.spotlight && !frame.done}
        winner={
          view
            ? label(
                [...view.players].sort(
                  (a, b) => (last?.delta[b.id] ?? 0) - (last?.delta[a.id] ?? 0),
                )[0]?.id,
              )
            : ""
        }
        skipped={skipped}
      />
      {drag && (
        <svg className="xb-drag-preview" aria-hidden="true">
          <path
            d={`M ${drag.x} ${drag.y} Q ${(drag.x + drag.tx) / 2} ${Math.min(drag.y, drag.ty) - 100} ${drag.tx} ${drag.ty}`}
            fill="none"
            stroke="#FFC83D"
            strokeWidth="3"
            strokeDasharray="6 8"
          />
        </svg>
      )}
      {flights.map((f) => (
        <span
          className="xb-poop-flight"
          key={f.id}
          aria-hidden="true"
          style={
            {
              left: f.x,
              top: f.y,
              "--dx": f.dx + "px",
              "--dy": f.dy + "px",
            } as React.CSSProperties
          }
          onAnimationEnd={() =>
            setFlights((old) => old.filter((x) => x.id !== f.id))
          }
        >
          <CutePoop />
          <i className="xb-flight-stars">✦ · ✦</i>
        </span>
      ))}
      {pointFlights.map((f) => (
        <span
          className={"xb-point-flight " + (f.delta < 0 ? "negative" : "")}
          key={f.id}
          aria-hidden="true"
          style={
            {
              left: f.x,
              top: f.y,
              "--dx": f.dx + "px",
              "--dy": f.dy + "px",
            } as React.CSSProperties
          }
          onAnimationEnd={() => {
            if (animate && !skipped)
              document
                .getElementById("xb-avatar-" + f.target)
                ?.querySelector(".xb-seat-face")
                ?.animate(
                  [
                    { transform: "scale(1)" },
                    { transform: "scale(1.12)" },
                    { transform: "scale(1)" },
                  ],
                  { duration: 600, easing: "cubic-bezier(.34,1.56,.64,1)" },
                );
            setPointFlights((old) => old.filter((x) => x.id !== f.id));
          }}
        >
          <b className="xb-coin" aria-hidden="true"/> {f.delta > 0 ? "+" : ""}
          {f.delta}
          <i className="xb-coin-tail"><b className="xb-coin"/><b className="xb-coin"/></i>
        </span>
      ))}
    </main>
  );
}
