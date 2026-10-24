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
import { Loudmouth, CutePoop, HostPortrait } from "./Art.tsx";
import { ranking, titles, settlement } from "./ui-model.ts";
import {
  XB_RULES,
  HOUSE_RULES,
  topicPoints,
  type Cycles,
} from "../../../../packages/xiabaiwang/src/rules.ts";
import { coalesceEffects } from "./effect-queue.ts";
import { safeGet, safeSet, claimOnce, revealAge } from "./storage.ts";
import { FirstGame, EyesWindow } from "./FirstGame.tsx";
import { VoiceAid, SpeechBar } from "./VoiceAid.tsx";
import { TruthRecap } from "./TruthRecap.tsx";
import { setFeedbackVolume } from "./feel.ts";
import "./xb.css";
import "./v3.css";
import { StudioScene, OnAir } from "./StudioScene.tsx";
import "./art-v4.css";
const ROLES: Record<string, string> = XB_RULES.roles;
const JOBS: Record<string, string> = {
  guesser: "耳朵借你，别把脑子也借出去。追问大家，找出真正的老实人。",
  truth: "你知道真答案。讲得像真的就行——虽然本来就是真的。",
  bluffer: `别慌，脸不红就算赢一半。现场编，让${XB_RULES.roles.guesser}相信你。`,
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
  safeGet("local", "xb-" + name) === "off"
    ? false
    : safeGet("local", "xb-" + name) === "on"
      ? true
      : d;
export function Xiabaiwang() {
  const code =
    new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const net = useXB(code),
    snap = net.snapshot,
    view = snap?.view,
    me = snap?.me;
  const [active, setActive] = useState(
    () => document.visibilityState !== "hidden",
  );
  const [tutorialRequest, setTutorialRequest] = useState(0);
  const [volume, setVolume] = useState(() =>
    Math.max(
      0,
      Math.min(1, Number(safeGet("local", "xb-volume") ?? "0.7") || 0),
    ),
  );
  const clockOffset = useRef(0);
  useEffect(() => {
    if (snap?.serverNow) clockOffset.current = snap.serverNow - Date.now();
  }, [snap?.serverNow]);
  useEffect(() => setFeedbackVolume(volume), [volume]);
  const [name, setName] = useState(() => safeGet("local", "xb-name") ?? ""),
    [roomInput, setRoomInput] = useState(
      () => safeGet("session", "xb-room-input") ?? "",
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
    previousReadWindow = useRef<string | null>(null),
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
      snap?.players.length ?? XB_RULES.minPlayers,
    ),
    last = view?.history.at(-1),
    scoreSteps = view ? settlement(view) : [];
  const serverNow = now + clockOffset.current;
  const cueKey = `${code}:${snap?.gameId ?? "legacy"}:${view?.round ?? 0}`;
  const currentRef = useRef({
    phase: view?.phase,
    cueKey,
    readUntil: snap?.readUntil ?? 0,
  });
  currentRef.current = {
    phase: view?.phase,
    cueKey,
    readUntil: snap?.readUntil ?? 0,
  };
  const [calloutText, setCalloutText] = useState("");
  useEffect(() => {
    const change = () => {
      const visible = document.visibilityState !== "hidden";
      setActive(visible);
      setNow(Date.now());
      setFlights([]);
      setPointFlights([]);
      setHit({});
      setCombo({});
      setCalloutText("");
      hitTimers.current.forEach(clearTimeout);
      hitTimers.current.clear();
      if (!visible && currentRef.current.phase === "reveal") {
        safeSet("session", "xb-reveal-done:" + currentRef.current.cueKey, "1");
        setSkipped(true);
      }
      if (
        visible &&
        currentRef.current.readUntil <= Date.now() + clockOffset.current
      )
        setIntro(null);
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    const call = snap?.callout;
    if (!call) {
      setCalloutText("");
      return;
    }
    if (!call || !claimOnce("xb-callout:" + call.id)) return;
    if (!active || serverNow - call.at >= 4000) return;
    setCalloutText("轮到你说 · 想想点到你了");
    feedback("turn", feedbackPrefs.current);
    const timer = setTimeout(
      () => setCalloutText(""),
      Math.max(0, 4000 - (serverNow - call.at)),
    );
    return () => clearTimeout(timer);
  }, [snap?.callout?.id]);
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
    if (!view) return;
    const readKey = `${view.round}:${snap?.readUntil ?? 0}`;
    if (previousReadWindow.current === readKey) return;
    previousReadWindow.current = readKey;
    setPanel(null);
    setSkipped(false);
    setElapsed(0);
    let draft: any = null;
    try {
      draft = JSON.parse(safeGet("session", "xb-draft:" + code) ?? "null");
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
    if (isGuesser && claimOnce("xb-round-turn:" + cueKey)) {
      feedback("turn", feedbackPrefs.current);
    }
    const remaining =
      (snap?.readUntil ?? 0) - (Date.now() + clockOffset.current);
    setIntro(remaining > 0 ? "deal" : null);
    const timer = setTimeout(() => setIntro(null), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [view?.round, snap?.readUntil]);
  useEffect(() => {
    if (view && !restore.current)
      safeSet(
        "session",
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
      const age = revealAge(
        snap?.revealAt ?? 0,
        Date.now() + clockOffset.current,
      );
      setElapsed(age);
      setSkipped(
        !!safeGet("session", "xb-reveal-done:" + cueKey) || age >= 12000,
      );
      revealStart.current = snap?.revealAt ?? 0;
      if (animate && age < 1200 && claimOnce("xb-warmup:" + cueKey)) {
        [0, 420, 730, 950, 1100]
          .filter((ms) => ms >= age)
          .forEach((ms) => {
            const t = setTimeout(() => {
              sfx("stamp");
              hitTimers.current.delete(t);
            }, ms - age);
            hitTimers.current.add(t);
          });
      }
      const t = setInterval(
        () =>
          setElapsed(
            revealAge(revealStart.current, Date.now() + clockOffset.current),
          ),
        80,
      );
      return () => clearInterval(t);
    }
  }, [view?.phase, view?.round]);
  useEffect(() => () => hitTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (
      revealed &&
      frame.scores &&
      view &&
      claimOnce("xb-score-cue:" + cueKey)
    ) {
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
    safeSet("local", "xb-" + key, value ? "on" : "off");
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
    if (
      view?.phase === "discussion" &&
      secs <= 3 &&
      secs > 0 &&
      claimOnce(`xb-tick:${cueKey}:${secs}`)
    )
      sfx("tick");
    if (
      view?.phase === "discussion" &&
      secs === 0 &&
      claimOnce("xb-clock-end:" + cueKey)
    ) {
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
    if (
      frame.visible > priorVisible.current &&
      !skipped &&
      animate &&
      active &&
      claimOnce(`xb-flip:${cueKey}:${frame.visible}`)
    )
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
  const lastCoin = useRef(-1);
  useEffect(() => {
    if (!revealed) {
      lastCoin.current = -1;
      return;
    }
    if (
      !animate ||
      !active ||
      skipped ||
      frame.settlementIndex < 0 ||
      frame.settlementIndex <= lastCoin.current
    )
      return;
    lastCoin.current = frame.settlementIndex;
    const step = scoreSteps[frame.settlementIndex];
    if (!claimOnce(`xb-coins:${cueKey}:${frame.settlementIndex}`)) return;
    if (!step) return;
    const timers = view!.players.map((p, i) => {
      const delta = step.delta[p.id] ?? 0;
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
      }, 0);
      hitTimers.current.add(t);
      return t;
    });
    return () =>
      timers.forEach((t) => {
        clearTimeout(t);
        hitTimers.current.delete(t);
      });
  }, [revealed, frame.settlementIndex, animate, skipped]);
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
        explainer: view?.explainer,
        speaker: view?.speaker,
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
      className={`xb-world ${!active ? "xb-suspended" : ""} ${animate ? "" : "xb-power-save"} ${net.error ? "xb-rejected" : ""} ${revealed && animate && !skipped && view?.players[frame.visible - 1]?.role === "truth" ? "xb-truth-impact" : ""}`}
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
                        : `${ROLES.guesser}不能指认自己`
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
      <StudioScene powerSave={!animate} />
      <header className="xb-topbar">
        <a href="/" aria-label="返回桌游合集">
          <Loudmouth small />
        </a>
        <div>
          <strong>{code ? "FM · " + code : "瞎掰王"}</strong>
          <span>
            <OnAir phase={stage} />{" "}
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
                    safeSet(
                      "session",
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
            <small>
              {XB_RULES.minPlayers}～{XB_RULES.maxPlayers}人 ·
              语音自己开，胡扯我们管
            </small>
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
                safeSet("local", "xb-name", e.target.value);
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
              {snap.players.length < XB_RULES.minPlayers
                ? `还差 ${XB_RULES.minPlayers - snap.players.length} 人`
                : "人齐了，嘴准备好没？"}
            </h1>
            <p>
              已到 {snap.players.length} / {XB_RULES.maxPlayers} 人。
              {snap.players.length < XB_RULES.minPlayers
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
                disabled={!host || disabled}
                aria-label="本局圈数"
                data-testid="xb-cycles"
                value={snap.cycles ?? XB_RULES.defaultCycles}
                onChange={(e) =>
                  command({
                    type: "SET_CYCLES",
                    cycles: Number(e.target.value) as Cycles,
                  })
                }
              >
                {XB_RULES.cycleOptions.map((cycles) => (
                  <option key={cycles} value={cycles}>
                    {cycles}圈 · {snap.players.length * cycles}轮 · 每人任
                    {cycles}次{ROLES.guesser}
                  </option>
                ))}
              </select>
              <small>按座位向左依次轮换；仅房主可改。</small>
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
            <label className="xb-speech-setting">
              每人发言计时
              <select
                data-testid="xb-speech-setting"
                aria-label="每人发言计时"
                value={snap.speechSeconds ?? 0}
                disabled={!host || disabled}
                onChange={(e) =>
                  command({
                    type: "SET_SPEECH",
                    seconds: Number(e.target.value) as 0 | 30 | 60,
                  })
                }
              >
                <option value={0}>不限 · 自由聊</option>
                <option value={30}>30秒 · 只提醒</option>
                <option value={60}>60秒 · 只提醒</option>
              </select>
              <small>本轮累计每人发言时间，到时不禁言、不扣分。</small>
            </label>
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
            data-settlement={frame.settlementIndex}
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
                        <span>
                          <HostPortrait seat={i} />
                        </span>
                        <b>
                          {p.name.replace(/^[一二三四五六七八九十\d]+号/, "") ||
                            p.name}
                        </b>
                        <strong>{ROLES[p.role ?? ""]}</strong>
                        {open && (
                          <em>
                            {p.role === "truth"
                              ? "✓ 真的！"
                              : p.role === "bluffer"
                                ? "〰 瞎掰！"
                                : `🎙 ${ROLES.guesser}`}
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
            {frame.settlementIndex >= 0 && (
              <ol className="xb-settlement" data-testid="xb-settlement">
                {scoreSteps
                  .slice(0, frame.settlementIndex + 1)
                  .map((step, index) => (
                    <li
                      key={step.kind}
                      data-testid={`xb-settlement-${step.kind}`}
                      className={
                        index === frame.settlementIndex ? "is-current" : ""
                      }
                    >
                      <b>{step.label}</b>
                      <div>
                        {view.players
                          .filter((p) => step.delta[p.id] !== 0)
                          .map((p) => (
                            <span
                              key={p.id}
                              className={
                                (step.delta[p.id] ?? 0) < 0 ? "xb-negative" : ""
                              }
                            >
                              {p.name} {(step.delta[p.id] ?? 0) > 0 ? "+" : ""}
                              {step.delta[p.id]}
                            </span>
                          ))}
                        {Object.values(step.delta).every((d) => d === 0) && (
                          <span>无人加减分</span>
                        )}
                      </div>
                    </li>
                  ))}
              </ol>
            )}
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
                          <HostPortrait seat={i} /> {p.name}
                        </span>
                        <strong className={p.score < 0 ? "xb-negative" : ""}>
                          {p.score < 0 ? "💸 " : ""}
                          {p.score}分
                        </strong>
                        <i
                          style={{
                            width: `${Math.max(4, ((p.score - Math.min(...view.players.map((x) => x.score))) / (Math.max(...view.players.map((x) => x.score)) - Math.min(...view.players.map((x) => x.score)) + 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                {frame.done && (
                  <TruthRecap snap={snap} command={command} busy={disabled} />
                )}
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
            <p data-testid="xb-winners">
              {view.winners.map((id) => label(id)).join("、")}
              {view.winners.length > 1 ? " · 共同获胜！" : " · 获胜！"}
            </p>
            <div className="xb-podium">
              {[1, 0, 2].map((rank) => {
                const group = view.standings.filter((p) => p.rank === rank + 1);
                return group.length ? (
                  <div
                    key={rank}
                    className={"place-" + rank}
                    data-testid={`xb-podium-level-${rank + 1}`}
                  >
                    <div className="xb-podium-occupants">
                      {group.map((person) => {
                        const p = ranking(view).find(
                          (p) => p.id === person.id,
                        )!;
                        return (
                          <div
                            className="xb-podium-player"
                            key={p.id}
                            data-rank={person.rank}
                          >
                            <span>
                              <HostPortrait seat={p.seat} />
                            </span>
                            <b title={p.name}>{p.name}</b>
                            <strong
                              className={p.score < 0 ? "xb-negative" : ""}
                            >
                              {p.score < 0 ? "💸 " : ""}
                              {p.score}分
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                    <i>{rank === 0 ? "👑" : rank + 1}</i>
                  </div>
                ) : null;
              })}
            </div>
            <div className="xb-titles">
              {titles(view, snap.funHits ?? {}, snap.crownTotals ?? {}).map(
                (t) => (
                  <div key={t.title}>
                    <span>{t.icon}</span>
                    <p>
                      <strong>{t.title}</strong>
                      <b>{t.names}</b>
                    </p>
                  </div>
                ),
              )}
            </div>
            <button onClick={() => setPanel("recap")}>
              每轮回顾 · 把嘴硬留个档
            </button>
            <p>称号仅供乐，不另加分。并列玩家共享称号。</p>
            <TruthRecap snap={snap} command={command} busy={disabled} />
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
                这是什么？ · {"★".repeat(view.difficulty)} · 本题{" "}
                {topicPoints(view.difficulty)} 分
              </span>
              <h1>{view.question}</h1>
              <span
                className="xb-topic-category"
                data-testid="xb-topic-category"
              >
                {(
                  {
                    冷门汉字或词语: "词语",
                    奇怪的动植物: "自然",
                    世界各地的怪习俗: "习俗",
                    历史冷知识: "历史",
                    奇葩发明或专利: "科技",
                    方言和俗语: "方言",
                    体育或游戏规则的冷知识: "体育游戏",
                    身体与心理学小现象: "身心",
                    职业黑话: "职业",
                    自然现象与地貌: "自然",
                    食物的由来: "饮食",
                  } as Record<string, string>
                )[view.theme ?? ""] ??
                  view.theme ??
                  "冷知识"}
              </span>

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
            <div className="xb-word-tools">
              <button
                data-testid="xb-request-word"
                disabled={
                  disabled || !!view.muted || snap.wordRequests?.includes(me!)
                }
                onClick={() =>
                  command({ type: "REQUEST_WORD", round: view.round })
                }
              >
                {snap.wordRequests?.includes(me!)
                  ? "已申请换词 · 等待房主"
                  : "这个词我认识，申请换词"}
              </button>
              {!!snap.wordRequests?.length && (
                <p role="status">
                  {snap.wordRequests.map(label).join("、")} 申请换词
                  {me === snap.host ? "" : " · 等待房主确认"}
                </p>
              )}
              {me === snap.host && !!snap.wordRequests?.length && (
                <button
                  data-testid="xb-swap-word"
                  disabled={disabled || !!view.muted}
                  onClick={() =>
                    command({ type: "SWAP_TOPIC", round: view.round })
                  }
                >
                  同意换词 · 重新闭眼9秒
                </button>
              )}
            </div>
            <div
              className="xb-explanation-order"
              data-testid="xb-explanation-order"
              role="status"
            >
              {view.explainer
                ? `轮到 ${label(view.explainer)} 解释 · 按座位顺序`
                : "解释完毕 · 自由追问"}
              {view.explainer && (isGuesser || me === view.explainer) && (
                <button
                  data-testid="xb-explain-next"
                  disabled={disabled}
                  onClick={() =>
                    command({ type: "EXPLAIN_NEXT", round: view.round })
                  }
                >
                  解释完了，下一位
                </button>
              )}
            </div>
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
                  : "自由追问 · 大家都解释过了"}
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
              <p className="xb-kicker">语音约定 · 本轮禁言仍然有效</p>
            )}
            <VoiceAid snap={snap} command={command} busy={disabled} />
            {isGuesser && <p className="xb-kicker">点玩家头像，邀请他开麦。</p>}
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
              pendingDelta =
                revealed && !frame.scores ? (last?.delta[p.id] ?? 0) : 0,
              playedDelta =
                !revealed || frame.scores || frame.settlementIndex < 0
                  ? 0
                  : scoreSteps
                      .slice(0, frame.settlementIndex + 1)
                      .reduce((sum, step) => sum + (step.delta[p.id] ?? 0), 0),
              displayScore = (vp?.score ?? 0) - pendingDelta + playedDelta,
              hitNow =
                now - (hit[p.id] ?? 0) < 3650 &&
                (hit[p.id] ?? 0) > (shaken[p.id] ?? 0);
            return (
              <button
                type="button"
                id={"xb-avatar-" + p.id}
                key={p.id}
                data-testid={"xb-seat-" + i}
                aria-label={`${!mode && isGuesser ? "点名" : "选择"} ${p.name}${mode === "POOP" && p.id === me ? "，不能扔自己" : ""}`}
                title={p.name}
                className={`xb-seat ${selected === p.id ? "is-selected" : ""} ${view?.speaker === p.id ? "is-speaking" : ""} ${hitNow ? "is-hit" : ""} ${p.id === view?.guesser ? "is-guesser" : ""}`}
                disabled={
                  disabled ||
                  (!mode &&
                    !(isGuesser && view?.phase === "discussion" && !intro)) ||
                  (!mode && view?.muted === p.id) ||
                  (mode === "POOP" ? p.id === me : p.id === view?.guesser)
                }
                onClick={() => {
                  if (!mode && isGuesser && view?.phase === "discussion") {
                    void command({
                      type: "CALL",
                      target: p.id,
                      round: view.round,
                    });
                    return;
                  }
                  setSelected(p.id);
                  setArmed(false);
                  sfx("select");
                }}
              >
                <span className="xb-seat-face" key={hit[p.id] ?? 0}>
                  <HostPortrait seat={i} />
                  <span className="xb-seat-number">{i + 1}号</span>
                  <i className="xb-badge-state" aria-hidden="true">
                    {view?.muted === p.id
                      ? "禁"
                      : selected === p.id
                        ? "选"
                        : revealed && last?.selected === p.id
                          ? "投"
                          : view?.speaker === p.id
                            ? "麦"
                            : p.id === view?.guesser
                              ? "想"
                              : !p.connected
                                ? "离"
                                : ""}
                  </i>
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
                <b>
                  {p.name.replace(/^[一二三四五六七八九十\d]+号/, "") || p.name}
                </b>
                {vp && displayScore < 0 && (
                  <span className="xb-debt" aria-label="负分">
                    💸
                  </span>
                )}
                <strong className={vp && displayScore < 0 ? "xb-negative" : ""}>
                  {vp ? (
                    <RollingScore value={displayScore} powerSave={!animate} />
                  ) : p.connected ? (
                    "在线"
                  ) : (
                    "离线"
                  )}
                </strong>
                <small className="xb-seat-accessible-status">
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
                              ? ROLES.guesser
                              : p.id === me
                                ? "你"
                                : p.connected
                                  ? "在听"
                                  : "离线"}
                </small>
                {view?.phase === "discussion" && (
                  <>
                    {view.explainer === p.id && (
                      <span className="xb-explainer-label">轮到解释</span>
                    )}
                    <SpeechBar snap={snap} id={p.id} now={serverNow} />
                  </>
                )}
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
              (!view && (!host || snap.players.length < XB_RULES.minPlayers)) ||
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
                  safeSet("session", "xb-reveal-done:" + cueKey, "1");
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
          记得开语音通话一起玩。
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
                  词条带分类提示。已认识词条可申请换词，由房主确认；身份、轮次和分数不变，重新闭眼9秒。旧词不再抽到；已使用「你在放屁！」后不能换词。
                </p>
                <p>
                  每轮一位{ROLES.guesser}公开主持，一位{ROLES.truth}
                  秘密看答案，其余为{ROLES.bluffer}
                  。题卡只有一个冷门词。同步闭眼9秒，只有老实人看到真实解释；之后按座位轮流解释，跳过想想。老实人照实说，瞎掰人现编，想想可点头像追问，不用交文字稿。指认后按座位揭晓身份。
                </p>
                <article
                  className="xb-score-reference"
                  data-testid="xb-scoring-reference"
                >
                  <h3>计分速查 · 台湾繁体版，用户已裁定</h3>
                  <p>
                    每人初始 {XB_RULES.initialScore} 分。本题分值 D ={" "}
                    {Object.entries(XB_RULES.difficultyPoints)
                      .map(
                        ([level, points]) =>
                          `${XB_RULES.difficultyNames[Number(level) as 1 | 2 | 3]} ${points} 分`,
                      )
                      .join("／")}
                    。
                  </p>
                  <p>
                    指中老实人：{ROLES.guesser} +D、老实人
                    +D。指中瞎掰人：只有被指中的瞎掰人 +D。
                  </p>
                  <p>
                    「你在放屁！」：每轮最多 {XB_RULES.challengesPerRound}{" "}
                    次。命中瞎掰人，
                    {ROLES.guesser} +{XB_RULES.challengeBlufferReward}、目标 −
                    {XB_RULES.challengeBlufferPenalty}；误中老实人，
                    {ROLES.guesser} −{XB_RULES.challengeTruthPenalty}
                    。质疑与指认分叠加。
                  </p>
                  <p>
                    质疑在讨论阶段使用，不揭身份；被禁言者仍可被指认、仍可扔粑粑。使用后不可撤销。
                  </p>
                  <p>
                    默认 {XB_RULES.defaultCycles} 圈，房主可选{" "}
                    {XB_RULES.cycleOptions.join("／")}{" "}
                    圈；按座位向左依次传给下一位{ROLES.guesser}
                    。最高分获胜，同分共同获胜、共享同一级领奖台。
                  </p>
                  <ul>
                    {HOUSE_RULES.map((rule) => (
                      <li key={rule.id}>
                        <b>{rule.id}</b>：{rule.text}
                      </li>
                    ))}
                  </ul>
                </article>
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
                  总音量 <output>{Math.round(volume * 100)}%</output>
                  <input
                    data-testid="xb-volume"
                    aria-label="总音量"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      safeSet("local", "xb-volume", String(v));
                    }}
                  />
                </label>
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
                <button
                  data-testid="xb-reopen-tutorial"
                  onClick={() => {
                    setPanel(null);
                    setTutorialRequest((v) => v + 1);
                  }}
                >
                  再看一次新手教学
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
      {calloutText && active && (
        <aside className="xb-callout" data-testid="xb-callout" role="status">
          🎙 {calloutText}
        </aside>
      )}
      {view?.phase === "discussion" && (
        <EyesWindow
          key={cueKey + ":" + snap?.readUntil}
          until={snap?.readUntil ?? 0}
          now={serverNow}
          role={myRole}
          answer={view.answer}
          round={view.round}
        />
      )}
      <FirstGame
        joined={!!snap?.me}
        role={myRole}
        job={JOBS[myRole] ?? ""}
        ready={view?.phase === "discussion" && !intro}
        request={tutorialRequest}
        active={active}
      />
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
        cueKey={cueKey}
        active={active}
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
          <b className="xb-coin" aria-hidden="true" /> {f.delta > 0 ? "+" : ""}
          {f.delta}
          <i className="xb-coin-tail">
            <b className="xb-coin" />
            <b className="xb-coin" />
          </i>
        </span>
      ))}
    </main>
  );
}
